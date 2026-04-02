import { storeToRefs } from 'pinia'
import { GroupSession, InboundGroupSession } from 'vodozemac-wasm-bindings'

import { ConcurrencyLimiter } from '@/utils/timing'

import { useCryptoKeys } from '@/composables/crypto-keys'
import { useOlm } from '@/composables/olm'

import { useCryptoKeysStore } from '@/stores/crypto-keys'
import { useMegolmStore } from '@/stores/megolm'

import type { EventRoomKeyContent } from '@/types'

export function useMegolm() {
    const { fetchUserKeys } = useCryptoKeys()
    const { sendMessageToDevice } = useOlm()
    
    const cryptoKeysStore = useCryptoKeysStore()
    const { deviceKeys } = storeToRefs(cryptoKeysStore)
    const { addOutboundMegolmSession } = useMegolmStore()

    async function createGroupSession(roomId: string, otherUserIds: string[]): Promise<GroupSession> {
        const session = new GroupSession()
        await addOutboundMegolmSession(roomId, session)

        // const inboundGroupSession = new InboundGroupSession(session.session_key)
        // const sessionKey = inboundGroupSession.export_at(inboundGroupSession.first_known_index)

        // if (sessionKey) {
        await fetchUserKeys(otherUserIds)

        const limiter = new ConcurrencyLimiter(10)
        for (const userId of otherUserIds) {
            for (const deviceId in deviceKeys.value[userId]) {
                await limiter.available()
                limiter.add(
                    sendMessageToDevice<EventRoomKeyContent>(userId, deviceId, 'm.room_key', {
                        algorithm: 'm.megolm.v1.aes-sha2',
                        roomId,
                        sessionId: session.session_id,
                        sessionKey: session.session_key,
                    })
                )
            }
        }
        await limiter.waitForIdle()
        // }

        return session
    }

    return {
        createGroupSession,
    }
}
