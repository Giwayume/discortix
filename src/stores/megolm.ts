import { ref, toRaw } from 'vue'
import { defineStore, storeToRefs } from 'pinia'
import { GroupSession, InboundGroupSession } from 'vodozemac-wasm-bindings'

import { MissingEncryptionKeyError } from '@/utils/error'
import { deepToRaw } from '@/utils/vue'
import { camelizeApiResponse } from '@/utils/zod'

import { useBroadcast } from '@/composables/broadcast'
import { createLogger } from '@/composables/logger'
import { onLogout } from '@/composables/logout'

import {
    getAllTableKeys as getAllDiscortixTableKeys,
    deleteTableKey as deleteDiscortixTableKey,
    loadTableKey as loadDiscortixTableKey,
    saveTableKey as saveDiscortixTableKey,
} from '@/stores/database/discortix'
import { useCryptoKeysStore } from '@/stores/crypto-keys'
import { useSessionStore } from '@/stores/session'

import {
    eventContentSchemaByType,
    type EventRoomKeyContent,
    type EventRoomEncryptedContent,
    type EventForwardedRoomKeyContent,
    type InboundMegolmSessionWithUsage,
    type OutboundMegolmSessionWithUsage,
    type RoomMegolmMetadata,
} from '@/types'

const log = createLogger(import.meta.url)

export const useMegolmStore = defineStore('megolm', () => {
    const { broadcastMessageFromTab, onTabMessage } = useBroadcast()
    const { deviceKeys, olmSecretKey } = storeToRefs(useCryptoKeysStore())
    const { userId: sessionUserId, deviceId: sessionDeviceId } = storeToRefs(useSessionStore())

    /*--------------------*\
    |                      |
    |   Inbound Sessions   |
    |                      |
    \*--------------------*/

    const inboundMegolmSessions = ref<
        Record<
            string, // `${roomId}:${sessionId}:${senderKey}`
            InboundMegolmSessionWithUsage
        >
    >({})

    async function loadInboundMegolmSession(roomId: string, sessionId: string, senderKey: string) {
        const sessionKey = `${roomId}:${sessionId}:${senderKey}`
        const value = await loadDiscortixTableKey('megolm', ['inboundSessions', sessionKey])
        if (!value || !olmSecretKey.value) return
        inboundMegolmSessions.value[sessionKey] = {
            forwardingCurve25519KeyChain: value.forwardingCurve25519KeyChain,
            senderClaimedEd25519Key: value.senderClaimedEd25519Key,
            session: InboundGroupSession.from_pickle(value.pickle, olmSecretKey.value)
        }
    }

    async function getInboundMegolmSession(roomId: string, sessionId: string, senderKey: string) {
        await loadInboundMegolmSession(roomId, sessionId, senderKey)
        return inboundMegolmSessions.value[`${roomId}:${sessionId}:${senderKey}`]
    }

    async function addInboundMegolmSession(
        roomId: string,
        senderKey: string,
        session: InboundGroupSession,
        forwardingCurve25519KeyChain?: string[],
    ) {
        if (!olmSecretKey.value) return

        const sessionKey = `${roomId}:${session.session_id}:${senderKey}`
        inboundMegolmSessions.value[sessionKey] = {
            forwardingCurve25519KeyChain: forwardingCurve25519KeyChain ?? [],
            senderClaimedEd25519Key: senderKey,
            session,
        }

        await saveDiscortixTableKey('megolm', ['inboundSessions', sessionKey], deepToRaw({
            pickle: session.pickle(olmSecretKey.value)
        }))
        broadcastMessageFromTab({
            type: 'updateInboundMegolmSession',
            data: {
                roomId,
                sessionId: session.session_id,
                senderKey,
            }
        })
    }

    async function saveInboundMegolmSession(roomId: string, senderKey: string, session: InboundGroupSession) {
        if (!olmSecretKey.value) return
        const sessionKey = `${roomId}:${session.session_id}:${senderKey}`
        await saveDiscortixTableKey('megolm', ['inboundSessions', sessionKey], deepToRaw({
            pickle: session.pickle(olmSecretKey.value)
        }))
        broadcastMessageFromTab({
            type: 'updateInboundMegolmSession',
            data: {
                roomId,
                sessionId: session.session_id,
                senderKey,
            }
        })
    }

    /*---------------------*\
    |                       |
    |   Outbound Sessions   |
    |                       |
    \*---------------------*/

    const outboundMegolmSessions = ref<
        Record<
            string, // `${roomId}:${sessionId}`
            OutboundMegolmSessionWithUsage
        >
    >({})

    async function loadOutboundMegolmSession(roomId: string, sessionId: string) {
        const sessionKey = `${roomId}:${sessionId}`
        const value = await loadDiscortixTableKey('megolm', ['outboundSessions', sessionKey])
        if (!value || !olmSecretKey.value) return
        outboundMegolmSessions.value[sessionKey] = {
            createdTs: value.createdTs ?? Date.now(),
            session: GroupSession.from_pickle(value.pickle, olmSecretKey.value)
        }
    }

    async function getOutboundMegolmSession(roomId: string, sessionId: string) {
        await loadOutboundMegolmSession(roomId, sessionId)
        return outboundMegolmSessions.value[`${roomId}:${sessionId}`]
    }

    async function addOutboundMegolmSession(roomId: string, session: GroupSession) {
        if (!olmSecretKey.value) return

        const sessionKey = `${roomId}:${session.session_id}`
        outboundMegolmSessions.value[sessionKey] = {
            createdTs: Date.now(),
            session,
        }

        await saveDiscortixTableKey('megolm', ['outboundSessions', sessionKey], deepToRaw({
            pickle: session.pickle(olmSecretKey.value)
        }))
        broadcastMessageFromTab({
            type: 'updateOutboundMegolmSession',
            data: {
                roomId,
                sessionId: session.session_id,
            }
        })
    }

    async function saveOutboundMegolmSession(roomId: string, session: GroupSession) {
        if (!olmSecretKey.value) return
        const sessionKey = `${roomId}:${session.session_id}`
        await saveDiscortixTableKey('megolm', ['outboundSessions', sessionKey], deepToRaw({
            pickle: session.pickle(olmSecretKey.value)
        }))
        broadcastMessageFromTab({
            type: 'updateOutboundMegolmSession',
            data: {
                roomId,
                sessionId: session.session_id,
            }
        })
    }

    /*-------------------------------*\
    |                                 |
    |   Room Session Usage Metadata   |
    |                                 |
    \*-------------------------------*/

    const roomMegolmMetadata = ref<
        Record<
            string, // roomId
            RoomMegolmMetadata
        >
    >({})

    async function loadRoomMegolmMetadata(roomId: string) {
        const value: RoomMegolmMetadata | undefined = await loadDiscortixTableKey('megolm', ['roomMetadata', roomId])
        if (!value) return
        roomMegolmMetadata.value[roomId] = {
            outboundSessionId: value.outboundSessionId,
        }
    }

    async function getRoomMegolmMetadata(roomId: string): Promise<RoomMegolmMetadata | undefined> {
        await loadRoomMegolmMetadata(roomId)
        return roomMegolmMetadata.value[roomId]
    }

    async function saveRoomMegolmMetadata(roomId: string, metadata: RoomMegolmMetadata | undefined) {
        if (metadata) {
            roomMegolmMetadata.value[roomId] = metadata
        }
        if (roomMegolmMetadata.value[roomId]) {
            await saveDiscortixTableKey('megolm', ['roomMetadata', roomId], deepToRaw(roomMegolmMetadata.value[roomId]))
        } else {
            await deleteDiscortixTableKey('megolm', ['roomMetadata', roomId])
        }
        broadcastMessageFromTab({
            type: 'updateRoomMegolmMetadata',
            data: {
                roomId,
            }
        })
    }

    /*----------------*\
    |                  |
    |   All Sessions   |
    |                  |
    \*----------------*/

    async function loadAllMegolmSessions() {
        inboundMegolmSessions.value = {}
        const keys: [[string, string]] = await getAllDiscortixTableKeys('megolm')
        for (const [megolmType, megolmId] of keys) {
            if (megolmType === 'inboundSessions') {
                const value = await loadDiscortixTableKey('megolm', [megolmType, megolmId])
                if (!value || !olmSecretKey.value) continue
                inboundMegolmSessions.value[megolmId] = {
                    forwardingCurve25519KeyChain: value.forwardingCurve25519KeyChain,
                    senderClaimedEd25519Key: value.senderClaimedEd25519Key,
                    session: InboundGroupSession.from_pickle(value.pickle, olmSecretKey.value)
                }
            } else if (megolmType === 'outboundSessions') {
                const value = await loadDiscortixTableKey('megolm', [megolmType, megolmId])
                if (!value || !olmSecretKey.value) continue
                outboundMegolmSessions.value[megolmId] = {
                    createdTs: value.createdTs ?? Date.now(),
                    session: GroupSession.from_pickle(value.pickle, olmSecretKey.value)
                }
            } else if (megolmType === 'roomMetadata') {
                const value: RoomMegolmMetadata = await loadDiscortixTableKey('megolm', [megolmType, megolmId])
                if (!value) continue
                roomMegolmMetadata.value[megolmId] = {
                    outboundSessionId: value.outboundSessionId,
                }
            }
        }
    }

    function megolmSessionExists(roomId: string, sessionId: string, senderKey: string): boolean {
        const myDeviceCurveKey = deviceKeys.value[sessionUserId.value!]?.[sessionDeviceId.value!]?.keys[`curve25519:${sessionDeviceId.value!}`] ?? ''
        return !!(
            inboundMegolmSessions.value[`${roomId}:${sessionId}:${senderKey}`]
            || (senderKey === myDeviceCurveKey && outboundMegolmSessions.value[`${roomId}:${sessionId}`])
        )
    }

    /*------------------------*\
    |                          |
    |   Populate From Events   |
    |                          |
    \*------------------------*/

    function populateRoomKeysFromRoomKeyEvent(content: EventRoomKeyContent, otherDeviceCurveKey: string, otherDeviceEd25519Key: string) {
        const roomId: string = content.roomId
        const sessionId: string = content.sessionId
        if (!roomId || !sessionId || !otherDeviceCurveKey) return
        const sessionKey = `${roomId}:${sessionId}:${otherDeviceCurveKey}`
        if (inboundMegolmSessions.value[sessionKey]) return
        inboundMegolmSessions.value[sessionKey] = {
            forwardingCurve25519KeyChain: [],
            senderClaimedEd25519Key: otherDeviceEd25519Key,
            session: new InboundGroupSession(content.sessionKey),
        }
    }

    function populateRoomKeysFromForwardedRoomKeyEvent(content: EventForwardedRoomKeyContent) {
        const roomId: string = content.roomId
        const sessionId: string = content.sessionId
        const senderKey: string = content.senderKey
        if (!roomId || !sessionId || !senderKey) return
        const sessionKey = `${roomId}:${sessionId}:${senderKey}`
        if (inboundMegolmSessions.value[sessionKey]) return
        inboundMegolmSessions.value[sessionKey] = {
            forwardingCurve25519KeyChain: content.forwardingCurve25519KeyChain,
            senderClaimedEd25519Key: content.senderClaimedEd25519Key,
            session: InboundGroupSession.import(content.sessionKey),
        }
        saveInboundMegolmSession(roomId, senderKey, inboundMegolmSessions.value[sessionKey].session)
    }

    function populateRoomKeysFromMegolmBackupDirect(megolmBackup: any[], isBroadcaster: boolean = false) {
        for (const backupEvent of megolmBackup) {
            try {
                const roomId: string = backupEvent.room_id
                const sessionId: string = backupEvent.session_id
                const senderKey: string = backupEvent.sender_key
                if (!roomId || !sessionId || !senderKey) continue
                const sessionKey = `${roomId}:${sessionId}:${senderKey}`
                if (inboundMegolmSessions.value[sessionKey]) continue

                inboundMegolmSessions.value[sessionKey] = {
                    forwardingCurve25519KeyChain: backupEvent.forwarding_curve25519_key_chain ?? [],
                    senderClaimedEd25519Key: backupEvent.sender_claimed_keys?.ed25519 ?? '',
                    session: InboundGroupSession.import(backupEvent.session_key),
                }

                if (isBroadcaster) {
                    saveInboundMegolmSession(roomId, senderKey, inboundMegolmSessions.value[sessionKey].session)
                }
            } catch (error) {
                log.error('Error importing megolm key from backup: ', error)
            }
        }
    }

    function populateRoomKeysFromMegolmBackup(megolmBackup: any[]) {
        populateRoomKeysFromMegolmBackupDirect(megolmBackup, true)

        broadcastMessageFromTab({
            type: 'populateRoomKeysFromMegolmBackup',
            data: megolmBackup,
        })
    }

    function generateMegolmBackup() {
        const megolmBackup: any[] = []
        for (const sessionKey in inboundMegolmSessions.value) {
            const [roomId, sessionId, senderKey] = sessionKey.split(':')
            const sessionInfo = inboundMegolmSessions.value[sessionKey]!
            megolmBackup.push({
                room_id: roomId,
                session_id: sessionId,
                sender_key: senderKey,
                algorithm: 'm.megolm.v1.aes-sha2',
                forwarding_curve25519_key_chain: sessionInfo.forwardingCurve25519KeyChain,
                sender_claimed_keys: {
                    ed25519: sessionInfo.senderClaimedEd25519Key,
                },
                session_key: sessionInfo.session.export_at(sessionInfo.session.first_known_index)
            })
        }
        const myDeviceCurveKey = deviceKeys.value[sessionUserId.value!]?.[sessionDeviceId.value!]?.keys[`curve25519:${sessionDeviceId.value!}`] ?? ''
        const myDeviceEd25519Key = deviceKeys.value[sessionUserId.value!]?.[sessionDeviceId.value!]?.keys[`ed25519:${sessionDeviceId.value!}`] ?? ''
        for (const sessionKey in outboundMegolmSessions.value) {
            const [roomId, sessionId] = sessionKey.split(':')
            const sessionInfo = outboundMegolmSessions.value[sessionKey]!
            const inboundGroupSession = new InboundGroupSession(sessionInfo.session.session_key)
            megolmBackup.push({
                room_id: roomId,
                session_id: sessionId,
                sender_key: myDeviceCurveKey,
                algorithm: 'm.megolm.v1.aes-sha2',
                forwarding_curve25519_key_chain: [],
                sender_claimed_keys: {
                    ed25519: myDeviceEd25519Key,
                },
                session_key: inboundGroupSession.export_at(inboundGroupSession.first_known_index)
            })
            inboundGroupSession.free()
        }
        return megolmBackup
    }

    /*---------------------------*\
    |                             |
    |   Encryption & Decryption   |
    |                             |
    \*---------------------------*/

    async function decryptEvent(
        roomId: string,
        sessionId: string,
        senderKey: string,
        eventContent: EventRoomEncryptedContent,
    ) {
        if (eventContent.algorithm !== 'm.megolm.v1.aes-sha2') {
            throw new Error('Unsupported algorithm.');
        }
        if (typeof eventContent.ciphertext !== 'string') {
            throw new Error('Megolm ciphertext must be a base64 string.');
        }
        const myDeviceCurveKey = deviceKeys.value[sessionUserId.value!]?.[sessionDeviceId.value!]?.keys[`curve25519:${sessionDeviceId.value!}`] ?? ''
        let inboundGroupSession = inboundMegolmSessions.value[`${roomId}:${sessionId}:${senderKey}`]?.session
        if (!inboundGroupSession && myDeviceCurveKey === senderKey) {
            const outboundGroupSession = outboundMegolmSessions.value[`${roomId}:${sessionId}`]
            if (outboundGroupSession) {
                inboundGroupSession = new InboundGroupSession(outboundGroupSession.session.session_key)
            }
        }

        if (!inboundGroupSession) {
            throw new MissingEncryptionKeyError(`The inbound group session was not found for roomId: ${roomId}, sessionId: ${sessionId}, senderKey: ${senderKey}`)
        }

        let decryptedMessage = ''
        const decrypted = inboundGroupSession?.decrypt(
            eventContent.ciphertext
        )
        const plaintextBytes = decrypted?.plaintext
        decryptedMessage = new TextDecoder().decode(plaintextBytes)

        if (decryptedMessage === '') {
            throw new Error('Decryption did not write a message.')
        }

        const decryptedMessageObject = camelizeApiResponse(JSON.parse(decryptedMessage))
        const schema = eventContentSchemaByType[decryptedMessageObject.type as keyof typeof eventContentSchemaByType]
        schema?.parse(decryptedMessageObject.content)
    
        return decryptedMessageObject
    }

    /*-------------*\
    |               |
    |   Lifecycle   |
    |               |
    \*-------------*/

    onTabMessage((message) => {
        if (message.type === 'populateRoomKeysFromMegolmBackup') {
            populateRoomKeysFromMegolmBackupDirect(message.data)
        } else if (message.type === 'updateInboundMegolmSession') {
            loadInboundMegolmSession(message.data.roomId, message.data.sessionId, message.data.senderKey)
        } else if (message.type === 'updateOutboundMegolmSession') {
            loadOutboundMegolmSession(message.data.roomId, message.data.sessionId)
        } else if (message.type === 'updateRoomMegolmMetadata') {
            loadRoomMegolmMetadata(message.data.roomId)
        }
    })

    onLogout(() => {
        inboundMegolmSessions.value = {}
        outboundMegolmSessions.value = {}
        roomMegolmMetadata.value = {}
    }, { permanent: true })
    
    return {        
        loadAllMegolmSessions,
        megolmSessionExists,

        loadInboundMegolmSession,
        getInboundMegolmSession,
        addInboundMegolmSession,
        saveInboundMegolmSession,

        loadOutboundMegolmSession,
        getOutboundMegolmSession,
        addOutboundMegolmSession,
        saveOutboundMegolmSession,

        getRoomMegolmMetadata,
        saveRoomMegolmMetadata,

        populateRoomKeysFromRoomKeyEvent,
        populateRoomKeysFromForwardedRoomKeyEvent,
        populateRoomKeysFromMegolmBackup,
        generateMegolmBackup,

        decryptEvent,
    }

})
