import { storeToRefs } from 'pinia'
import { v4 as uuidv4 } from 'uuid'
import { Account, type Session } from 'vodozemac-wasm-bindings'

import { fetchJson } from '@/utils/fetch'
import { snakeCaseApiRequest, camelizeApiResponse } from '@/utils/zod'

import { createLogger } from '@/composables/logger'
import { useBroadcast } from '@/composables/broadcast'

import { loadTableKey as loadDiscortixTableKey, saveTableKey as saveDiscortixTableKey } from '@/stores/database/discortix'
import { useCryptoKeysStore } from '@/stores/crypto-keys'
import { useSessionStore } from '@/stores/session'

import {
    type ApiV3KeysClaimResponse, type ApiV3KeysClaimRequest, ApiV3KeysClaimResponseSchema,
    type OlmPayload, type ApiV3SendEventToDeviceRequest, type ApiV3SyncResponse,
    type ApiV3SyncToDeviceEvent, type EventRoomEncryptedContent,
    type ApiV3KeysQueryResponse, type ApiV3KeysQueryRequest, ApiV3KeysQueryResponseSchema,
    type EventForwardedRoomKeyContent,
    eventContentSchemaByType,
    type EventRoomKeyContent,
} from '@/types'

const log = createLogger(import.meta.url)

const olmAlgorithm = 'm.olm.v1.curve25519-aes-sha2'
const encryptedMessageTypes = ['m.room_key', 'm.forwarded_room_key', 'm.secret_send']

export function useOlm() {
    const { isLeader } = useBroadcast()
    const cryptoKeysStore = useCryptoKeysStore()
    const {
        getOutboundSessions,
        addOutboundSession,
        markOutboundSessionAsSent,
        getInboundSessions,
        addInboundSession,
        markInboundSessionActivity,
        populateKeysFromApiV3KeysQueryResponse,
        populateRoomKeysFromForwardedRoomKeyEvent,
    } = cryptoKeysStore
    const {
        roomKeys,
        deviceKeys,
        olmAccount,
        userDevicePickleKey,
    } = storeToRefs(cryptoKeysStore)
    const {
        homeserverBaseUrl,
        userId: sessionUserId,
        deviceId: sessionDeviceId,
    } = storeToRefs(useSessionStore())

    async function sendMessageToDevice<T = any>(
        otherUserId: string,
        otherDeviceId: string,
        messageType: string,
        messageContent: T
    ) {
        if (
            !sessionDeviceId.value
            || !sessionUserId.value
            || !isLeader.value
            
        ) throw new Error('Missing required state to send an OLM message.')

        const isEncryptedMessageType = encryptedMessageTypes.includes(messageType)
        let messageToSend: Partial<OlmPayload> = {
            type: messageType,
            content: snakeCaseApiRequest(messageContent),
            sender: sessionUserId.value,
        }
        let encryptedMessageToSend: OlmPayload | undefined = undefined

        if (
            !olmAccount.value
            || !userDevicePickleKey.value
        ) throw new Error('Missing necessary OLM variables.')

        const myDeviceEd25519Key = deviceKeys.value[sessionUserId.value]?.[sessionDeviceId.value]?.keys[`ed25519:${sessionDeviceId.value}`] ?? ''
        const otherDeviceCurveKey = deviceKeys.value[otherUserId]?.[otherDeviceId]?.keys[`curve25519:${otherDeviceId}`] ?? ''
        const otherDeviceEd25519Key = deviceKeys.value[otherUserId]?.[otherDeviceId]?.keys[`ed25519:${otherDeviceId}`] ?? ''

        let outboundOlmSessions = await getOutboundSessions(otherUserId, otherDeviceCurveKey, olmAlgorithm)
        if (outboundOlmSessions.length === 0 && isLeader.value) {
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

            if (!isLeader.value) throw new Error('Leadership lost before we could create the OLM account.')

            const oneTimeKeys = oneTimeKeysResponse.oneTimeKeys[otherUserId]?.[otherDeviceId] ?? {}
            const oneTimeKeyOrString = oneTimeKeys[Object.keys(oneTimeKeys)[0]!]
            const oneTimeKey: string
                = (Object.prototype.toString.call(oneTimeKeyOrString) === '[object Object]')
                    ? (oneTimeKeyOrString as any).key
                    : oneTimeKeyOrString as any
            
            await addOutboundSession(otherUserId, otherDeviceCurveKey, olmAlgorithm, olmAccount.value.create_outbound_session(otherDeviceCurveKey, oneTimeKey))
            outboundOlmSessions = await getOutboundSessions(otherUserId, otherDeviceCurveKey, olmAlgorithm)
        }

        if (isEncryptedMessageType) {
            if (outboundOlmSessions.length === 0) throw new Error('Failed to create outbound session.')

            if (olmAccount.value) {
                saveDiscortixTableKey('olm', ['account', sessionDeviceId.value], olmAccount.value.pickle(userDevicePickleKey.value))
            }

            const mostActiveOutboundSession = outboundOlmSessions.sort((a, b) => a.lastActivityTs > b.lastActivityTs ? -1 : 1)[0]!

            const encryptedResult = mostActiveOutboundSession.session.encrypt(
                new TextEncoder().encode(
                    JSON.stringify(snakeCaseApiRequest(messageToSend))
                )
            )

            encryptedMessageToSend = {
                type: isEncryptedMessageType ? 'm.room.encrypted' : 'm.dummy',
                keys: {
                    ed25519: myDeviceEd25519Key,
                },
                recipient: otherUserId,
                recipientKeys: {
                    ed25519: otherDeviceEd25519Key,
                },
                content: {
                    algorithm: olmAlgorithm,
                    sender_key: olmAccount.value?.curve25519_key,
                    ciphertext: {
                        [otherDeviceCurveKey]: {
                            type: mostActiveOutboundSession.isPreKey ? 0 : 1,
                            body: encryptedResult.ciphertext,
                        }
                    }
                },
                sender: sessionUserId.value,
            }

            markOutboundSessionAsSent(mostActiveOutboundSession)
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
    }

    async function decryptAndStoreInboundDeviceMessage(event: ApiV3SyncToDeviceEvent) {
        if (!sessionUserId.value || !sessionDeviceId.value || !userDevicePickleKey.value || !event.sender) return
        if (!isLeader.value) {
            const accountPickle: string | undefined = await loadDiscortixTableKey('olm', ['account', sessionDeviceId.value])
            if (accountPickle) {
                try {
                    olmAccount.value = Account.from_pickle(accountPickle, userDevicePickleKey.value)
                } catch (error) { /* Ignore */ }
            }
        }
        
        let otherDeviceCurveKey = ''
        let otherDeviceEd25519Key = ''

        if (event.type === 'm.room.encrypted') {
            if (!olmAccount.value) throw new Error('OLM account is missing for this device.')

            const eventContent = event.content as EventRoomEncryptedContent
            const otherUserId = event.sender
            const otherDeviceId = eventContent.deviceId

            const myDeviceCurveKey = deviceKeys.value[sessionUserId.value]?.[sessionDeviceId.value]?.keys[`curve25519:${sessionDeviceId.value}`] ?? ''
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
                if (!otherDeviceId) throw new Error('Sender key was not provided and message is missing device ID, so curve key cannot be retrieved.')
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
            if (!otherDeviceCurveKey) throw new Error('Could not find the curve key for the device that sent the message.')

            let inboundOlmSessions = await getInboundSessions(otherUserId, otherDeviceCurveKey, olmAlgorithm)
            let plaintext: Uint8Array | undefined = undefined
            if (inboundOlmSessions.length === 0 || messageType === 0 && isLeader.value) {
                let newInboundSession: Session
                ({ session: newInboundSession, plaintext } = olmAccount.value.create_inbound_session(
                    otherDeviceCurveKey,
                    messageType ?? 0,
                    ciphertext,
                ))
                await addInboundSession(otherUserId, otherDeviceCurveKey, olmAlgorithm, newInboundSession)
                if (isLeader.value) {
                    saveDiscortixTableKey('olm', ['account', sessionDeviceId.value], olmAccount.value.pickle(userDevicePickleKey.value))
                }
                inboundOlmSessions = await getInboundSessions(otherUserId, otherDeviceCurveKey, olmAlgorithm)
            }
            if (inboundOlmSessions.length > 0 && !plaintext) {
                for (const sessionWithUsage of inboundOlmSessions) {
                    try {
                        plaintext = sessionWithUsage.session.decrypt(messageType ?? 0, ciphertext)
                    } catch (error) { /* Ignore */ }
                    if (plaintext) {
                        markInboundSessionActivity(sessionWithUsage)
                        break
                    }
                }
            }

            if (!plaintext) throw new Error('Plain text was not created from decrypted event.')

            const decryptedEvent: OlmPayload = camelizeApiResponse(JSON.parse(new TextDecoder().decode(plaintext)))
            const eventContentSchema = eventContentSchemaByType[decryptedEvent.type as keyof typeof eventContentSchemaByType]
            eventContentSchema?.parse(decryptedEvent.content)
            event = decryptedEvent
        }

        console.log('received device event', event)

        switch (event.type) {
            case 'm.forwarded_room_key':
                populateRoomKeysFromForwardedRoomKeyEvent(event.content)
                break
            case 'm.room_key':
                const eventContent: EventRoomKeyContent = event.content
                populateRoomKeysFromForwardedRoomKeyEvent({
                    algorithm: eventContent.algorithm,
                    forwardingCurve25519KeyChain: [],
                    roomId: eventContent.roomId,
                    senderClaimedEd25519Key: otherDeviceEd25519Key,
                    senderKey: otherDeviceCurveKey,
                    sessionId: eventContent.sessionId,
                    sessionKey: eventContent.sessionKey,
                })
                break
        }

    }

    async function manageDeviceMessagesFromApiV3SyncResponse(syncResponse: ApiV3SyncResponse) {
        if (syncResponse.toDevice?.events) {
            console.log('Received toDevice events', syncResponse.toDevice.events)
            for (const event of syncResponse.toDevice.events) {
                try {
                    await decryptAndStoreInboundDeviceMessage(event)
                } catch (error) {
                    log.warn('Could not decrypt an inbound device message.', error)
                }
            }
        }
    }

    return {
        sendMessageToDevice,
        manageDeviceMessagesFromApiV3SyncResponse,
    }

}
