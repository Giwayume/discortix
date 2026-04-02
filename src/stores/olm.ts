import { ref, toRaw } from 'vue'
import { defineStore, storeToRefs } from 'pinia'
import { Session } from 'vodozemac-wasm-bindings'

import { useBroadcast } from '@/composables/broadcast'
import { createLogger } from '@/composables/logger'
import { onLogout } from '@/composables/logout'

import { useCryptoKeysStore } from '@/stores/crypto-keys'
import {
    getAllTableKeys as getAllDiscortixTableKeys,
    loadTableKey as loadDiscortixTableKey,
    saveTableKey as saveDiscortixTableKey,
} from '@/stores/database/discortix'

import type { OlmSessionWithUsage, PickledOlmSessionWithUsage, ToDeviceErroredEvent } from '@/types'

const log = createLogger(import.meta.url)

export const useOlmStore = defineStore('olm', () => {
    const { isLeader, broadcastMessageFromTab, onTabMessage } = useBroadcast({ permanent: true })

    const { userDevicePickleKey } = storeToRefs(useCryptoKeysStore())

    /*--------------------*\
    |                      |
    |   To-Device Events   |
    |                      |
    \*--------------------*/

    // Events we couldn't decrypt for whatever reason, queued to try again.
    const toDeviceErroredEvents = ref<ToDeviceErroredEvent[]>([])

    async function loadToDeviceErroredEvents() {
        toDeviceErroredEvents.value = await loadDiscortixTableKey('olm', ['toDevice', 'errors'])
    }

    async function saveToDeviceErroredEvents() {
        if (!isLeader.value) return
        await saveDiscortixTableKey('olm', ['toDevice', 'errors'], toRaw(toDeviceErroredEvents.value))
        broadcastMessageFromTab({
            type: 'updateToDeviceErroredEvents',
        })
    }

    /*--------------------------*\
    |                            |
    |   Olm Session Management   |
    |                            |
    \*--------------------------*/

    // `${otherUserId}:${otherDeviceCurveKey}:${algorithm}` -> OlmSessionWithUsage[]
    const olmSessions = ref<Record<string, OlmSessionWithUsage[]>>({})

    async function loadAllOlmSessions() {
        olmSessions.value = {}
        const keys: [[string, string]] = await getAllDiscortixTableKeys('olm')
        for (const [olmType, olmId] of keys) {
            if (olmType === 'sessions') {
                try {
                    const value: PickledOlmSessionWithUsage[] = (await loadDiscortixTableKey('olm', [olmType, olmId])) ?? []
                    if (!userDevicePickleKey.value) continue
                    olmSessions.value[olmId] = []
                    for (const pickledSession of value) {
                        olmSessions.value[olmId].push({
                            lastInboundActivityTs: pickledSession.lastInboundActivityTs ?? 0,
                            isConfirmed: pickledSession.isConfirmed ?? false,
                            session: Session.from_pickle(pickledSession.pickle, userDevicePickleKey.value),
                        })
                    }
                } catch (error) {
                    log.error('Error loading an OLM session from IndexedDB:', error)
                }
            }
        }
    }

    async function loadOlmSessions(sessionKey: string) {
        const value: PickledOlmSessionWithUsage[] = await loadDiscortixTableKey('olm', ['sessions', sessionKey])
        if (!userDevicePickleKey.value) return
        olmSessions.value[sessionKey] = []
        for (const pickledSession of value) {
            olmSessions.value[sessionKey].push({
                lastInboundActivityTs: pickledSession.lastInboundActivityTs ?? 0,
                isConfirmed: pickledSession.isConfirmed ?? false,
                session: Session.from_pickle(pickledSession.pickle, userDevicePickleKey.value),
            })
        }
    }

    async function getOlmSessions(otherUserId: string, otherDeviceCurveKey: string, algorithm: string) {
        await loadOlmSessions(`${otherUserId}:${otherDeviceCurveKey}:${algorithm}`)
        return olmSessions.value[`${otherUserId}:${otherDeviceCurveKey}:${algorithm}`] ?? []
    }

    async function addOlmSession(
        otherUserId: string,
        otherDeviceCurveKey: string,
        algorithm: string,
        session: Session,
        isOutbound: boolean,
    ) {
        const sessionKey = `${otherUserId}:${otherDeviceCurveKey}:${algorithm}`
        if (!olmSessions.value[sessionKey]) {
            olmSessions.value[sessionKey] = []
        }
        olmSessions.value[sessionKey]?.push({
            lastInboundActivityTs: isOutbound ? 0 : Date.now(),
            isConfirmed: !isOutbound,
            session,
        })
        const sessionPickles: PickledOlmSessionWithUsage[] = olmSessions.value[sessionKey].map((sessionWithUsage) => {
            return {
                lastInboundActivityTs: sessionWithUsage.lastInboundActivityTs,
                isConfirmed: sessionWithUsage.isConfirmed,
                pickle: sessionWithUsage.session.pickle(userDevicePickleKey.value!)
            }
        })
        try {
            await saveDiscortixTableKey('olm', ['sessions', sessionKey], toRaw(sessionPickles))
            broadcastMessageFromTab({
                type: 'updateOlmSessions',
                data: {
                    sessionKey,
                }
            })
        } catch (error) { /* Ignore */ }
    }

    async function saveOlmSession(olmSessionWithUsage: OlmSessionWithUsage) {
        if (!userDevicePickleKey.value) return
        for (const sessionKey in olmSessions.value) {
            const sessions = olmSessions.value[sessionKey] ?? []
            for (const session of sessions) {
                if (session.session === olmSessionWithUsage.session) {
                    const sessionPickles: PickledOlmSessionWithUsage[] = sessions.map((sessionWithUsage) => {
                        return {
                            lastInboundActivityTs: sessionWithUsage.lastInboundActivityTs,
                            isConfirmed: sessionWithUsage.isConfirmed,
                            pickle: sessionWithUsage.session.pickle(userDevicePickleKey.value!)
                        }
                    })
                    await saveDiscortixTableKey('olm', ['sessions', sessionKey], toRaw(sessionPickles))
                    broadcastMessageFromTab({
                        type: 'updateOlmSessions',
                        data: {
                            sessionKey,
                        }
                    })
                    return
                }
            }
        }
    }

    async function markInboundOlmSessionActivity(olmSessionWithUsage: OlmSessionWithUsage) {
        olmSessionWithUsage.lastInboundActivityTs = Date.now()
        olmSessionWithUsage.isConfirmed = true
        await saveOlmSession(olmSessionWithUsage)
    }

    /*-------------*\
    |               |
    |   Lifecycle   |
    |               |
    \*-------------*/

    onTabMessage((message) => {
        switch (message.type) {
            case 'updateOlmSessions':
                loadOlmSessions(message.data.sessionKey)
                break
            case 'updateToDeviceErroredEvents':
                loadToDeviceErroredEvents()
                break
        }
    })

    onLogout(() => {
        toDeviceErroredEvents.value = []
        olmSessions.value = {}
    }, { permanent: true })

    return {
        toDeviceErroredEvents,
        loadToDeviceErroredEvents,
        saveToDeviceErroredEvents,
        loadAllOlmSessions,
        getOlmSessions,
        addOlmSession,
        saveOlmSession,
        markInboundOlmSessionActivity,
    }

})
