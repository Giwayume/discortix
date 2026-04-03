import { storeToRefs } from 'pinia'
import { GroupSession, InboundGroupSession } from 'vodozemac-wasm-bindings'

import { ConcurrencyLimiter } from '@/utils/timing'

import { useCryptoKeys } from '@/composables/crypto-keys'
import { useOlm } from '@/composables/olm'

import { useCryptoKeysStore } from '@/stores/crypto-keys'
import { useMegolmStore } from '@/stores/megolm'
import { useRoomStore } from '@/stores/room'
import { useSessionStore } from '@/stores/session'

import type { EventRoomKeyContent } from '@/types'

export function useMegolm() {
    const { fetchUserKeys } = useCryptoKeys()
    const { sendMessageToDevices } = useOlm()
    
    const cryptoKeysStore = useCryptoKeysStore()
    const { deviceKeys, olmAccount } = storeToRefs(cryptoKeysStore)
    const {
        addInboundMegolmSession,
        getOutboundMegolmSession,
        addOutboundMegolmSession,
        getRoomMegolmMetadata,
        saveRoomMegolmMetadata,
    } = useMegolmStore()
    const {
        joined: joinedRooms,
    } = storeToRefs(useRoomStore())
    const {
        userId: sessionUserId,
        deviceId: sessionDeviceId,
    } = storeToRefs(useSessionStore())

    async function createGroupSession(roomId: string, otherUserIds: string[]): Promise<GroupSession> {
        const myDeviceCurveKey = olmAccount.value?.curve25519_key
        if (!myDeviceCurveKey) throw new Error('Can\'t find my own device curve key.')

        const session = new GroupSession()
        const initialSessionKey = session.session_key
        await addInboundMegolmSession(roomId, myDeviceCurveKey, new InboundGroupSession(initialSessionKey))
        await addOutboundMegolmSession(roomId, session)
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

    return {
        createGroupSession,
        getOutboundGroupSession,
    }
}
