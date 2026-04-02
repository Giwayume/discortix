import { storeToRefs } from 'pinia'
import { v4 as uuidv4 } from 'uuid'
import { Account, type InboundCreationResult, type Session } from 'vodozemac-wasm-bindings'

import { DecryptionError } from '@/utils/error'
import { fetchJson } from '@/utils/fetch'
import { snakeCaseApiRequest, camelizeApiResponse } from '@/utils/zod'

import { createLogger } from '@/composables/logger'
import { useBroadcast } from '@/composables/broadcast'

import { loadTableKey as loadDiscortixTableKey, saveTableKey as saveDiscortixTableKey } from '@/stores/database/discortix'
import { useCryptoKeysStore } from '@/stores/crypto-keys'
import { useMegolmStore } from '@/stores/megolm'
import { useOlmStore } from '@/stores/olm'
import { useRoomStore } from '@/stores/room'
import { useSessionStore } from '@/stores/session'

import {
    type ApiV3KeysClaimResponse, type ApiV3KeysClaimRequest, ApiV3KeysClaimResponseSchema,
    type OlmPayload, type ApiV3SendEventToDeviceRequest, type ApiV3SyncResponse,
    type ApiV3SyncToDeviceEvent, type EventRoomEncryptedContent,
    type ApiV3KeysQueryResponse, type ApiV3KeysQueryRequest, ApiV3KeysQueryResponseSchema,
    type EventForwardedRoomKeyContent,
    eventContentSchemaByType,
    type EventRoomKeyContent,
    type EventRoomKeyRequestContent,
    type OlmSessionWithUsage,
    type ToDeviceErroredEvent,
} from '@/types'

const log = createLogger(import.meta.url)

const olmAlgorithm = 'm.olm.v1.curve25519-aes-sha2'
const encryptedMessageTypes = ['m.dummy', 'm.room_key', 'm.forwarded_room_key', 'm.secret_send']
const toDeviceErroredEventRetainTimeout = 2.592e+9 // 30 days

export function useOlm() {
    const { isLeader } = useBroadcast()
    const cryptoKeysStore = useCryptoKeysStore()
    const {
        saveOlmAccount,
        populateKeysFromApiV3KeysQueryResponse,
    } = cryptoKeysStore
    const {
        deviceKeys,
        olmSecretKey,
        olmAccount,
        userDevicePickleKey,
    } = storeToRefs(cryptoKeysStore)
    const olmStore = useOlmStore()
    const { toDeviceErroredEvents } = storeToRefs(olmStore)
    const {
        saveToDeviceErroredEvents,
        saveOlmSession,
        getOlmSessions,
        addOlmSession,
        markInboundOlmSessionActivity,
    } = olmStore
    const {
        populateRoomKeysFromRoomKeyEvent,
        populateRoomKeysFromForwardedRoomKeyEvent,
    } = useMegolmStore()
    const {
        joined: joinedRooms,
    } = storeToRefs(useRoomStore())
    const {
        homeserverBaseUrl,
        userId: sessionUserId,
        deviceId: sessionDeviceId,
    } = storeToRefs(useSessionStore())

    async function sendMessageToDevice<T = any>(
        otherUserId: string,
        otherDeviceId: string,
        messageType: string,
        messageContent: T,
        overrideOlmSession?: Session,
    ) {
        if (
            !sessionDeviceId.value
            || !sessionUserId.value
            || !olmAccount.value
        ) throw new Error('Missing required state to send an OLM message.')

        const isEncryptedMessageType = encryptedMessageTypes.includes(messageType)
        let messageToSend: Partial<OlmPayload> = {
            type: messageType,
            content: snakeCaseApiRequest(messageContent),
            sender: sessionUserId.value,
        }
        let encryptedMessageToSend: Partial<OlmPayload> | undefined = undefined

        const myDeviceEd25519Key = deviceKeys.value[sessionUserId.value]?.[sessionDeviceId.value]?.keys[`ed25519:${sessionDeviceId.value}`] ?? ''
        const otherDeviceCurveKey = deviceKeys.value[otherUserId]?.[otherDeviceId]?.keys[`curve25519:${otherDeviceId}`] ?? ''
        const otherDeviceEd25519Key = deviceKeys.value[otherUserId]?.[otherDeviceId]?.keys[`ed25519:${otherDeviceId}`] ?? ''

        let olmSessions: OlmSessionWithUsage[] = overrideOlmSession
            ? [{
                lastInboundActivityTs: 0,
                isConfirmed: true,
                session: overrideOlmSession,
            }]
            : await getOlmSessions(otherUserId, otherDeviceCurveKey, olmAlgorithm)
        let mostReliableSession: OlmSessionWithUsage | undefined = undefined

        let needsPreKey = false
        if (olmSessions.length === 0) {
            needsPreKey = true
            const oneTimeKeysResponse = await fetchJson<ApiV3KeysClaimResponse>(
                `${homeserverBaseUrl.value}/_matrix/client/v3/keys/claim`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        one_time_keys: {
                            [otherUserId]: {
                                [otherDeviceId]: 'signed_curve25519',
                            },
                        },
                        timeout: 10000,
                    } satisfies ApiV3KeysClaimRequest),
                    useAuthorization: true,
                    jsonSchema: ApiV3KeysClaimResponseSchema,
                },
            )

            const oneTimeKeys = oneTimeKeysResponse.oneTimeKeys[otherUserId]?.[otherDeviceId] ?? {}
            const oneTimeKeyOrString = oneTimeKeys[Object.keys(oneTimeKeys)[0]!]
            const oneTimeKey: string
                = (Object.prototype.toString.call(oneTimeKeyOrString) === '[object Object]')
                    ? (oneTimeKeyOrString as any).key
                    : oneTimeKeyOrString as any
            
            await addOlmSession(
                otherUserId,
                otherDeviceCurveKey,
                olmAlgorithm,
                olmAccount.value.create_outbound_session(otherDeviceCurveKey, oneTimeKey),
                true,
            )
            olmSessions = await getOlmSessions(otherUserId, otherDeviceCurveKey, olmAlgorithm)
        }

        if (isEncryptedMessageType) {
            if (olmSessions.length === 0) throw new Error('No existing inbound sessions, and failed to create outbound session.')

            messageToSend.keys = {
                ed25519: myDeviceEd25519Key,
            }
            messageToSend.recipient = otherUserId
            messageToSend.recipientKeys = {
                ed25519: otherDeviceEd25519Key,
            }
            messageToSend.sender = sessionUserId.value

            mostReliableSession = olmSessions.sort((a, b) => {
                if (a.isConfirmed && !b.isConfirmed) return -1
                if (b.isConfirmed && !a.isConfirmed) return 1
                return a.lastInboundActivityTs > b.lastInboundActivityTs ? -1 : 1
            })[0]

            if (!mostReliableSession) throw new Error('Could not find an OLM session to use')

            const encryptedResult = mostReliableSession.session.encrypt(
                new TextEncoder().encode(
                    JSON.stringify(snakeCaseApiRequest(messageToSend))
                )
            )

            encryptedMessageToSend = {
                type: isEncryptedMessageType ? 'm.room.encrypted' : 'm.dummy',
                content: {
                    algorithm: olmAlgorithm,
                    sender_key: olmAccount.value?.curve25519_key,
                    ciphertext: {
                        [otherDeviceCurveKey]: {
                            type: needsPreKey ? 0 : 1,
                            body: encryptedResult.ciphertext,
                        }
                    }
                },
            }
        }

        await fetchJson(
            `${homeserverBaseUrl.value}/_matrix/client/v3/sendToDevice/${encryptedMessageToSend?.type ?? messageToSend.type}/${uuidv4()}`,
            {
                method: 'PUT',
                body: JSON.stringify({
                    messages: {
                        [otherUserId]: {
                            [otherDeviceId]: encryptedMessageToSend?.content ?? messageToSend.content,
                        },
                    },
                } satisfies ApiV3SendEventToDeviceRequest),
                useAuthorization: true,
            },
        )

        if (mostReliableSession) {
            await saveOlmSession(mostReliableSession)
        }
    }

    async function decryptAndStoreInboundDeviceMessage(event: ApiV3SyncToDeviceEvent) {
        if (!sessionUserId.value || !sessionDeviceId.value || !event.sender || !isLeader.value) return
        
        let otherDeviceCurveKey = ''
        let otherDeviceEd25519Key = ''

        if (event.type === 'm.room.encrypted') {
            if (!olmAccount.value) throw new Error('OLM account is missing for this device.')

            const eventContent = event.content as EventRoomEncryptedContent
            const otherUserId = event.sender
            const otherDeviceId = eventContent.deviceId

            const myDeviceCurveKey = olmAccount.value.curve25519_key

            let messageType: number | undefined = undefined
            let ciphertext: string | undefined = undefined
            if (typeof eventContent.ciphertext === 'string') {
                ciphertext = eventContent.ciphertext
            } else {
                ({
                    body: ciphertext,
                    type: messageType,
                } = eventContent.ciphertext[myDeviceCurveKey] ?? {})
            }

            if (ciphertext == null) throw new Error('Cipher text was not found.')

            otherDeviceCurveKey = eventContent.senderKey ?? deviceKeys.value[otherUserId]?.[otherDeviceId!]?.keys[`curve25519:${otherDeviceId}`] ?? ''
            otherDeviceEd25519Key = deviceKeys.value[otherUserId]?.[otherDeviceId!]?.keys[`ed25519:${otherDeviceId}`] ?? ''
            if (!otherDeviceCurveKey) {
                if (!otherDeviceId) throw new DecryptionError('Sender key was not provided and message is missing device ID, so curve key cannot be retrieved.')
                const queryResponse = await fetchJson<ApiV3KeysQueryResponse>(
                    `${homeserverBaseUrl.value}/_matrix/client/v3/keys/query`,
                    {
                        method: 'POST',
                        body: JSON.stringify({
                            device_keys: {
                                [otherUserId]: [],
                            },
                        } satisfies ApiV3KeysQueryRequest),
                        useAuthorization: true,
                        jsonSchema: ApiV3KeysQueryResponseSchema,
                    },
                )
                populateKeysFromApiV3KeysQueryResponse(queryResponse)
                otherDeviceCurveKey = deviceKeys.value[otherUserId]?.[otherDeviceId]?.keys[`curve25519:${otherDeviceId}`] ?? ''
            }
            if (!otherDeviceCurveKey) throw new DecryptionError('Could not find the curve key for the device that sent the message.')

            let olmSessions = await getOlmSessions(otherUserId, otherDeviceCurveKey, olmAlgorithm)
            let plaintext: Uint8Array | undefined = undefined
            let newInboundSessionInfo: InboundCreationResult | undefined = undefined
            if (olmSessions.length === 0 || messageType === 0) {
                newInboundSessionInfo = olmAccount.value.create_inbound_session(
                    otherDeviceCurveKey,
                    messageType ?? 0,
                    ciphertext,
                )
                plaintext = newInboundSessionInfo.plaintext
                await addOlmSession(otherUserId, otherDeviceCurveKey, olmAlgorithm, newInboundSessionInfo.session, false)
                await saveOlmAccount()
                olmSessions = await getOlmSessions(otherUserId, otherDeviceCurveKey, olmAlgorithm)
            }
            if (olmSessions.length > 0 && !plaintext) {
                for (const sessionWithUsage of olmSessions) {
                    try {
                        plaintext = sessionWithUsage.session.decrypt(messageType ?? 0, ciphertext)
                    } catch (error) { /* Ignore */ }
                    if (plaintext) {
                        markInboundOlmSessionActivity(sessionWithUsage)
                        break
                    }
                }
            }

            if (!plaintext) throw new DecryptionError('Plain text was not created from decrypted event.')

            const decryptedEvent: OlmPayload = camelizeApiResponse(JSON.parse(new TextDecoder().decode(plaintext)))
            const eventContentSchema = eventContentSchemaByType[decryptedEvent.type as keyof typeof eventContentSchemaByType]
            eventContentSchema?.parse(decryptedEvent.content)
            event = decryptedEvent

            // Send a new Olm session acknowledgement via m.dummy message
            if (newInboundSessionInfo) {
                const senderDeviceId = (event as OlmPayload).senderDeviceKeys?.deviceId ?? otherDeviceId
                if (senderDeviceId) {
                    console.log('sending confirmation dummy message')
                    sendMessageToDevice(otherUserId, senderDeviceId, 'm.dummy', {}, newInboundSessionInfo.session)
                }
            }
        } else {
            event = camelizeApiResponse(event)
        }

        console.log('received device event', event)

        switch (event.type) {
            case 'm.room_key_request':
                // if (isLeader.value) {
                //     const eventContent: EventRoomKeyRequestContent = event.content 
                //     const keyInfo = roomKeys.value[eventContent.body?.roomId!]?.[eventContent.body?.sessionId!]?.[eventContent.body?.senderKey!]
                //     const room = joinedRooms.value[eventContent.body?.roomId!]
                //     if (!room || !keyInfo) break
                //     const member = room.stateEventsByType['m.room.member']?.find(
                //         (member) => member.content?.membership === 'join' && member.sender === ''
                //     )
                // }
                // TODO - need a way to map from the device key back to the userId to check if we should send
                break
            case 'm.forwarded_room_key':
                populateRoomKeysFromForwardedRoomKeyEvent(event.content)
                break
            case 'm.room_key':
                populateRoomKeysFromRoomKeyEvent(event.content, otherDeviceCurveKey, otherDeviceEd25519Key)
                break
        }

    }

    async function manageDeviceMessagesFromApiV3SyncResponse(syncResponse: ApiV3SyncResponse) {
        if (syncResponse.toDevice?.events) {
            // The leader decrypts the messages, then broadcasts the state changes to other tabs.
            if (isLeader.value) {
                console.log('Received toDevice events', syncResponse.toDevice.events)

                // Sort so pre-key messages are processed first.
                const myDeviceCurveKey = olmAccount.value?.curve25519_key!
                syncResponse.toDevice.events.sort((a, b) => {
                    if (a.type === 'm.room.encrypted' && b.type === 'm.room.encrypted') {
                        const eventContentA = a.content as EventRoomEncryptedContent
                        const eventContentB = b.content as EventRoomEncryptedContent
                        let messageTypeA: number = ((typeof eventContentA.ciphertext === 'object') ? eventContentA.ciphertext[myDeviceCurveKey]?.type : 1) ?? 1
                        let messageTypeB: number = ((typeof eventContentB.ciphertext === 'object') ? eventContentB.ciphertext[myDeviceCurveKey]?.type : 1) ?? 1
                        return messageTypeA < messageTypeB ? -1 : 1
                    }
                    return 0
                })

                toDeviceErroredEvents.value = toDeviceErroredEvents.value.filter(
                    (event) => Date.now() - event.receivedTs < toDeviceErroredEventRetainTimeout
                )
                const newToDeviceErroredEvents: ToDeviceErroredEvent[] = []

                for (const event of syncResponse.toDevice.events) {
                    try {
                        await decryptAndStoreInboundDeviceMessage(event)
                    } catch (error) {
                        if (error instanceof DecryptionError) {
                            log.warn('Could not decrypt an inbound device message. Storing it for later processing.', error)
                            newToDeviceErroredEvents.push({
                                receivedTs: Date.now(),
                                event,
                            })
                        }
                    }
                }

                for (let i = toDeviceErroredEvents.value.length - 1; i >= 0; i--) {
                    const { event } = toDeviceErroredEvents.value[i]!
                    try {
                        await decryptAndStoreInboundDeviceMessage(event)
                        toDeviceErroredEvents.value.splice(i, 1)
                    } catch (error) {
                        // It's already in the errored event list. Ignore.
                    }
                }

                for (const event of newToDeviceErroredEvents) {
                    toDeviceErroredEvents.value.push(event)
                }

                saveToDeviceErroredEvents()
            }
        }
    }

    return {
        sendMessageToDevice,
        manageDeviceMessagesFromApiV3SyncResponse,
    }

}
