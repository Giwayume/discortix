import { storeToRefs } from 'pinia'
import { GroupSession, PkDecryption } from 'vodozemac-wasm-bindings'

import { decodeBase64 } from '@/utils/base64'
import { fetchJson } from '@/utils/fetch'
import { ConcurrencyLimiter } from '@/utils/timing'

import { useCryptoKeys } from '@/composables/crypto-keys'
import { createLogger } from '@/composables/logger'
import { useOlm } from '@/composables/olm'

import { useCryptoKeysStore } from '@/stores/crypto-keys'
import { useMegolmStore } from '@/stores/megolm'
import { useRoomStore } from '@/stores/room'
import { useSessionStore } from '@/stores/session'

import {
    type ApiV3RoomKeyBackedUpSessionData,
    type ApiV3RoomKeyBackupVersionResponse, ApiV3RoomKeyBackupVersionResponseSchema,
    type ApiV3RoomKeyBackupKeysForRoomResponse, ApiV3RoomKeyBackupKeysForRoomResponseSchema,
    type EventRoomKeyContent,
    type EventForwardedRoomKeyContent,
    type MegolmBackupV1Curve25519AesSha2SessionDataEncrypted,
} from '@/types'

const log = createLogger(import.meta.url)

const backupRestoreInterval = 1.296e+9 // 15 days

export function useMegolm() {
    const { fetchUserKeys } = useCryptoKeys()
    const { sendMessageToDevices } = useOlm()
    
    const cryptoKeysStore = useCryptoKeysStore()
    const {
        deviceKeys,
        megolmBackupV1Key,
        olmAccount,
    } = storeToRefs(cryptoKeysStore)
    const {
        getForwardedRoomKeysForRoom,
        getOutboundMegolmSession,
        addOutboundMegolmSession,
        getRoomMegolmMetadata,
        saveRoomMegolmMetadata,
        populateRoomKeysFromMegolmBackup,
    } = useMegolmStore()
    const roomStore = useRoomStore()
    const {
        joined: joinedRooms,
    } = storeToRefs(roomStore)
    const {
        updateJoinedRoomDatabase,
    } = roomStore
    const {
        homeserverBaseUrl,
        userId: sessionUserId,
        deviceId: sessionDeviceId,
    } = storeToRefs(useSessionStore())

    async function createGroupSession(roomId: string, otherUserIds: string[]): Promise<GroupSession> {
        const myDeviceCurveKey = olmAccount.value?.curve25519_key
        if (!myDeviceCurveKey) throw new Error('Can\'t find my own device curve key.')

        const session = new GroupSession()
        const initialSessionKey = session.session_key
        await addOutboundMegolmSession(roomId, session, initialSessionKey)
        await saveRoomMegolmMetadata(roomId, {
            outboundSessionId: session.session_id,
        })

        // TODO - This could take a log time, and if the user closes the window, it will be interrupted.
        // Maybe move key sharing requests to its own utility that can store state in indexdb.
        ;(async () => {
            if (sessionUserId.value && !otherUserIds.includes(sessionUserId.value)) {
                otherUserIds.unshift(sessionUserId.value)
            }

            await fetchUserKeys(otherUserIds)

            const limiter = new ConcurrencyLimiter(10)
            for (const userId of otherUserIds) {
                const userDeviceIds: Array<[string, string]> = []
                for (const deviceId in deviceKeys.value[userId]) {
                    if (userId === sessionUserId.value && deviceId === sessionDeviceId.value) continue
                    userDeviceIds.push([userId, deviceId])
                }
                await limiter.available()
                limiter.add(
                    sendMessageToDevices<EventRoomKeyContent>(userDeviceIds, 'm.room_key', {
                        algorithm: 'm.megolm.v1.aes-sha2',
                        roomId,
                        sessionId: session.session_id,
                        sessionKey: initialSessionKey,
                    })
                )
            }
            await limiter.waitForIdle()
        })()

        return session
    }

    async function getOutboundGroupSession(roomId: string): Promise<GroupSession | undefined> {
        const metadata = await getRoomMegolmMetadata(roomId)

        const room = joinedRooms.value[roomId]
        if (!room) return undefined

        const roomEncryptionEventContent = room.stateEventsByType['m.room.encryption']?.[0]?.content
        if (!roomEncryptionEventContent) return undefined

        const roomUserIds: string[] = room.stateEventsByType['m.room.member']?.filter((event) => {
            return event.content.membership === 'join' || event.content.membership === 'invite'
        }).map((event) => {
            return event.content.membership === 'join' ? event.sender : event.stateKey ?? ''
        }).filter((userId) => {
            return !!userId
        }) ?? []

        if (!metadata?.outboundSessionId) {
            return await createGroupSession(roomId, roomUserIds)
        }

        const sessionInfo = await getOutboundMegolmSession(roomId, metadata?.outboundSessionId)
        const { rotationPeriodMs, rotationPeriodMsgs } = roomEncryptionEventContent

        if (
            !sessionInfo
            || sessionInfo.session.message_index >= (rotationPeriodMsgs ?? 100)
            || sessionInfo.createdTs < Date.now() - (rotationPeriodMs ?? 604800000)
        ) {
            return await createGroupSession(roomId, roomUserIds)
        }

        return sessionInfo.session
    }

    async function sendRoomKeysToUsers(roomId: string, userIds: string[]) {
        const room = joinedRooms.value[roomId]
        if (!room) return

        await fetchUserKeys(userIds)

        const forwardedRoomKeys = await getForwardedRoomKeysForRoom(roomId)

        const limiter = new ConcurrencyLimiter(10)
        for (const userId of userIds) {
            const userDeviceIds: Array<[string, string]> = []
            for (const deviceId in deviceKeys.value[userId]) {
                if (userId === sessionUserId.value && deviceId === sessionDeviceId.value) continue
                userDeviceIds.push([userId, deviceId])
            }
            for (const forwardedRoomKey of forwardedRoomKeys) {
                await limiter.available()
                if ((forwardedRoomKey as EventForwardedRoomKeyContent).forwardingCurve25519KeyChain) {
                    limiter.add(
                        sendMessageToDevices<EventForwardedRoomKeyContent>(userDeviceIds, 'm.forwarded_room_key', forwardedRoomKey as EventForwardedRoomKeyContent)
                    )
                } else {
                    limiter.add(
                        sendMessageToDevices<EventRoomKeyContent>(userDeviceIds, 'm.room_key', forwardedRoomKey as EventRoomKeyContent)
                    )
                }
            }
        }
        await limiter.waitForIdle()
    }

    async function restoreRoomKeysFromBackup(roomId: string) {
        if (!megolmBackupV1Key.value) return
        const room = joinedRooms.value[roomId]
        if (!room || ((room.lastBackupKeyRestoreTs ?? 0) > Date.now() - backupRestoreInterval)) return
        try {
            const version = await fetchJson<ApiV3RoomKeyBackupVersionResponse>(
                `${homeserverBaseUrl.value}/_matrix/client/v3/room_keys/version`, {
                    useAuthorization: true,
                    jsonSchema: ApiV3RoomKeyBackupVersionResponseSchema,
                }
            )
            if (version.algorithm !== 'm.megolm_backup.v1.curve25519-aes-sha2') return

            const queryParams = {
                version: version.version,
            }
            const roomKeys = await fetchJson<ApiV3RoomKeyBackupKeysForRoomResponse>(
                `${homeserverBaseUrl.value}/_matrix/client/v3/room_keys/keys/${encodeURIComponent(roomId)}?${new URLSearchParams(queryParams)}`, {
                    useAuthorization: true,
                    jsonSchema: ApiV3RoomKeyBackupKeysForRoomResponseSchema,
                }
            )

            const pkDecryption = PkDecryption.from_key(megolmBackupV1Key.value)

            const decryptedSessionData: ApiV3RoomKeyBackedUpSessionData[] = []

            try {
                for (const sessionId in roomKeys.sessions) {
                    const encryptedSessionKey = roomKeys.sessions[sessionId]
                    if (!encryptedSessionKey) continue
                    const sessionData = encryptedSessionKey.sessionData as MegolmBackupV1Curve25519AesSha2SessionDataEncrypted
                    const decryptedBuffer = pkDecryption.decrypt(
                        decodeBase64(sessionData.ciphertext),
                        decodeBase64(sessionData.mac),
                        decodeBase64(sessionData.ephemeral),
                    )
                    const decryptedObject = JSON.parse(new TextDecoder().decode(decryptedBuffer))
                    decryptedObject.room_id = roomId
                    decryptedObject.session_id = sessionId
                    decryptedSessionData.push(decryptedObject)
                }
            } finally {
                pkDecryption.free()
            }

            populateRoomKeysFromMegolmBackup(decryptedSessionData)

            room.lastBackupKeyRestoreTs = Date.now()
            updateJoinedRoomDatabase(roomId)
        } catch (error) {
            log.error('Error restoring megolm keys from backup.', error)
        }
    }

    return {
        createGroupSession,
        getOutboundGroupSession,
        sendRoomKeysToUsers,
        restoreRoomKeysFromBackup,
    }
}
