import { computed, ref, toRaw, watch } from 'vue'
import { defineStore, storeToRefs } from 'pinia'
import { type Account, Session } from 'vodozemac-wasm-bindings'

import { useBroadcast } from '@/composables/broadcast'

import {
    getAllTableKeys as getAllDiscortixTableKeys,
    loadTableKey as loadDiscortixTableKey,
    saveTableKey as saveDiscortixTableKey,
} from '@/stores/database/discortix'

import { encryptSecret } from '@/utils/secret-storage'

import { onLogout } from '@/composables/logout'

import type {
    ApiV3DeviceInformation,
    ApiV3KeysQueryResponse,
    ApiV3CrossSigningKey,
    EventForwardedRoomKeyContent,
    OlmSessionWithUsage,
} from '@/types'

export const useCryptoKeysStore = defineStore('cryptoKeys', () => {
    const { isLeader, onTabMessage, broadcastMessageFromTab } = useBroadcast({ permanent: true })

    const userId = ref<string | undefined>()
    const deviceId = ref<string | undefined>()

    // TODO - prompt user action based on these error scenarios
    const encryptionNotSupported = ref<boolean>(false)
    const roomKeyLoadFailed = ref<boolean>(false)
    const signingKeysValidationFailed = ref<boolean>(false)
    const signingKeysUploadFailed = ref<boolean>(false)
    const secretKeyIdsMissing = ref<string[]>([])
    const vodozemacInitFailed = ref<boolean>(false)
    const deviceKeyUploadFailed = ref<boolean>(false)
    const deviceNeedsDeletion = ref<boolean>(false)

    // Session store relies on crypto keys. Since we have a circular dependency, dynamic import needed fields.
    async function initialize() {
        const { useSessionStore } = await import('@/stores/session')
        const { userId: sessionUserId, deviceId: sessionDeviceId } = storeToRefs(useSessionStore())
        watch(() => sessionUserId, () => userId.value = sessionUserId.value, { immediate: true })
        watch(() => sessionDeviceId, () => deviceId.value = sessionDeviceId.value, { immediate: true })
    }
    initialize()

    // Used to encrypt the secret storage key. @/composables/crypto-keys.ts populates this field on initialization.
    const userDevicePickleKey = ref<Uint8Array | undefined>()
    const crossSigningMasterKey = ref<Uint8Array | undefined>()
    const crossSigningUserSigningKey = ref<Uint8Array | undefined>()
    const crossSigningSelfSigningKey = ref<Uint8Array | undefined>()

    const olmAccount = ref<Account | undefined>()

    // User ID -> Device ID -> Key Info
    const deviceKeys = ref<Record<string, Record<string, ApiV3DeviceInformation>>>({})

    // User ID -> Key Info
    const userSigningKeys = ref<Record<
        string,
        { masterKeys?: ApiV3CrossSigningKey, selfSigningKeys?: ApiV3CrossSigningKey, userSigningKeys?: ApiV3CrossSigningKey }
    >>({})

    // Room ID -> Session ID -> Sender Key -> Key Info
    const roomKeys = ref<Record<string, Record<string, Record<string, EventForwardedRoomKeyContent>>>>({})

    // `${userId}:${receiverDeviceCurveKey}:${algorithm}` -> OlmSessionWithUsage[]
    const outboundOlmSessions = ref<Record<string, OlmSessionWithUsage[]>>({})

    async function loadAllOutboundSessions() {
        outboundOlmSessions.value = {}
        const keys: [[string, string]] = await getAllDiscortixTableKeys('olm')
        for (const [olmType, olmId] of keys) {
            if (olmType === 'outboundSessions') {
                const value = await loadDiscortixTableKey('olm', [olmType, olmId])
                if (!userDevicePickleKey.value) continue
                outboundOlmSessions.value[olmId]?.push({
                    lastActivityTs: value.lastActivityTs ?? 0,
                    isPreKey: value.isPreKey ?? false,
                    session: Session.from_pickle(value.pickle, userDevicePickleKey.value),
                })
            }
        }
    }

    async function getOutboundSessions(userId: string, receiverDeviceCurveKey: string, algorithm: string) {
        if (!isLeader.value) {
            await loadAllOutboundSessions()
        }
        return outboundOlmSessions.value[`${userId}:${receiverDeviceCurveKey}:${algorithm}`] ?? []
    }

    async function addOutboundSession(userId: string, receiverDeviceCurveKey: string, algorithm: string, session: Session) {
        const sessionKey = `${userId}:${receiverDeviceCurveKey}:${algorithm}`
        if (!outboundOlmSessions.value[sessionKey]) {
            outboundOlmSessions.value[sessionKey] = []
        }
        outboundOlmSessions.value[sessionKey]?.push({
            lastActivityTs: Date.now(),
            isPreKey: true,
            session,
        })
        if (isLeader.value && userDevicePickleKey.value) {
            const sessionPickles = outboundOlmSessions.value[sessionKey].map((sessionWithUsage) => {
                return {
                    lastActivityTs: sessionWithUsage.lastActivityTs,
                    isPreKey: sessionWithUsage.isPreKey,
                    pickle: sessionWithUsage.session.pickle(userDevicePickleKey.value!)
                }
            })
            try {
                await saveDiscortixTableKey('olm', ['outboundSessions', sessionKey], toRaw(sessionPickles))
            } catch (error) { /* Ignore */ }
        }
    }

    function markOutboundSessionAsSent(olmSessionWithUsage: OlmSessionWithUsage) {
        for (const sessionKey in outboundOlmSessions.value) {
            const sessions = outboundOlmSessions.value[sessionKey] ?? []
            for (const session of sessions) {
                if (session === olmSessionWithUsage) {
                    olmSessionWithUsage.isPreKey = false
                    olmSessionWithUsage.lastActivityTs = Date.now()
                    if (isLeader.value && userDevicePickleKey.value) {
                        const sessionPickles = sessions.map((sessionWithUsage) => {
                            return {
                                lastActivityTs: sessionWithUsage.lastActivityTs,
                                isPreKey: sessionWithUsage.isPreKey,
                                pickle: sessionWithUsage.session.pickle(userDevicePickleKey.value!)
                            }
                        })
                        saveDiscortixTableKey('olm', ['outboundSessions', sessionKey], toRaw(sessionPickles))
                    }
                    return
                }
            }
        }
    }

    // `${userId}:${senderDeviceCurveKey}:${algorithm}` -> OlmSessionWithUsage[]
    const inboundOlmSessions = ref<Record<string, OlmSessionWithUsage[]>>({})

    async function loadAllInboundSessions() {
        inboundOlmSessions.value = {}
        const keys: [[string, string]] = await getAllDiscortixTableKeys('olm')
        for (const [olmType, olmId] of keys) {
            if (olmType === 'inboundSessions') {
                const value = await loadDiscortixTableKey('olm', [olmType, olmId])
                if (!userDevicePickleKey.value) continue
                inboundOlmSessions.value[olmId]?.push({
                    lastActivityTs: value.lastActivityTs ?? 0,
                    session: Session.from_pickle(value.pickle, userDevicePickleKey.value),
                })
            }
        }
    }

    async function getInboundSessions(userId: string, receiverDeviceCurveKey: string, algorithm: string) {
        if (!isLeader.value) {
            await loadAllInboundSessions()
        }
        return inboundOlmSessions.value[`${userId}:${receiverDeviceCurveKey}:${algorithm}`] ?? []
    }

    async function addInboundSession(userId: string, receiverDeviceCurveKey: string, algorithm: string, session: Session) {
        const sessionKey = `${userId}:${receiverDeviceCurveKey}:${algorithm}`
        if (!inboundOlmSessions.value[sessionKey]) {
            inboundOlmSessions.value[sessionKey] = []
        }
        inboundOlmSessions.value[sessionKey]?.push({
            lastActivityTs: Date.now(),
            isPreKey: true,
            session,
        })
        if (isLeader.value && userDevicePickleKey.value) {
            const sessionPickles = inboundOlmSessions.value[sessionKey].map((sessionWithUsage) => {
                return {
                    lastActivityTs: sessionWithUsage.lastActivityTs,
                    pickle: sessionWithUsage.session.pickle(userDevicePickleKey.value!)
                }
            })
            try {
                await saveDiscortixTableKey('olm', ['inboundSessions', sessionKey], toRaw(sessionPickles))
            } catch (error) { /* Ignore */ }
        }
    }

    function markInboundSessionActivity(olmSessionWithUsage: OlmSessionWithUsage) {
        for (const sessionKey in inboundOlmSessions.value) {
            const sessions = inboundOlmSessions.value[sessionKey] ?? []
            for (const session of sessions) {
                if (session === olmSessionWithUsage) {
                    olmSessionWithUsage.lastActivityTs = Date.now()
                    if (isLeader.value && userDevicePickleKey.value) {
                        const sessionPickles = sessions.map((sessionWithUsage) => {
                            return {
                                lastActivityTs: sessionWithUsage.lastActivityTs,
                                pickle: sessionWithUsage.session.pickle(userDevicePickleKey.value!)
                            }
                        })
                        saveDiscortixTableKey('olm', ['inboundSessions', sessionKey], toRaw(sessionPickles))
                    }
                    return
                }
            }
        }
    }

    const identityVerificationRequired = computed<boolean>(() => {
        return (
            secretKeyIdsMissing.value.length > 0
            && (!crossSigningMasterKey.value || !crossSigningUserSigningKey.value || !crossSigningSelfSigningKey.value)
        )
    })

    onTabMessage((message) => {
        if (message.type === 'populateRoomKeysFromMegolmBackup') {
            populateRoomKeysFromMegolmBackupDirect(message.data)
        }
    })

    function populateKeysFromApiV3KeysQueryResponse(query: ApiV3KeysQueryResponse) {
        if (query.deviceKeys) {
            for (const otherUserId in query.deviceKeys) {
                if (!deviceKeys.value[otherUserId]) {
                    deviceKeys.value[otherUserId] = {}
                }
                for (const otherDeviceId in query.deviceKeys[otherUserId]) {
                    deviceKeys.value[otherUserId][otherDeviceId] = query.deviceKeys[otherUserId][otherDeviceId]!
                }
            }
        }
        if (query.masterKeys) {
            for (const otherUserId in query.masterKeys) {
                if (!userSigningKeys.value[otherUserId]) {
                    userSigningKeys.value[otherUserId] = {}
                }
                userSigningKeys.value[otherUserId].masterKeys = query.masterKeys[otherUserId]
            }
        }
        if (query.selfSigningKeys) {
            for (const otherUserId in query.selfSigningKeys) {
                if (!userSigningKeys.value[otherUserId]) {
                    userSigningKeys.value[otherUserId] = {}
                }
                userSigningKeys.value[otherUserId].selfSigningKeys = query.selfSigningKeys[otherUserId]
            }
        }
        if (query.userSigningKeys) {
            for (const otherUserId in query.userSigningKeys) {
                if (!userSigningKeys.value[otherUserId]) {
                    userSigningKeys.value[otherUserId] = {}
                }
                userSigningKeys.value[otherUserId].userSigningKeys = query.userSigningKeys[otherUserId]
            }
        }
    }

    function populateRoomKeysFromForwardedRoomKeyEvent(content: EventForwardedRoomKeyContent) {
        const roomId: string = content.roomId
        if (!roomId) return
        if (!roomKeys.value[roomId]) {
            roomKeys.value[roomId] = {}
        }

        const sessionId: string = content.sessionId
        if (!sessionId) return
        if (!roomKeys.value[roomId][sessionId]) {
            roomKeys.value[roomId][sessionId] = {}
        }

        const senderKey: string = content.senderKey
        if (!senderKey) return

        roomKeys.value[roomId][sessionId][senderKey] = content
    }

    function populateRoomKeysFromMegolmBackupDirect(megolmBackup: any[], isBroadcaster: boolean = false) {
        for (const backupEvent of megolmBackup) {
            const roomId: string = backupEvent.room_id
            if (!roomId) continue
            if (!roomKeys.value[roomId]) {
                roomKeys.value[roomId] = {}
            }

            const sessionId: string = backupEvent.session_id
            if (!sessionId) continue
            if (!roomKeys.value[roomId][sessionId]) {
                roomKeys.value[roomId][sessionId] = {}
            }

            const senderKey: string = backupEvent.sender_key
            if (!senderKey) continue
            const event: EventForwardedRoomKeyContent = {
                algorithm: backupEvent.algorithm ?? '',
                forwardingCurve25519KeyChain: backupEvent.forwarding_curve25519_key_chain ?? [],
                roomId,
                senderClaimedEd25519Key: backupEvent.sender_claimed_keys?.ed25519 ?? '',
                senderKey,
                sessionId,
                sessionKey: backupEvent.session_key,
            }
            roomKeys.value[roomId][sessionId][senderKey] = event

            if (isBroadcaster) {
                try {
                    encryptSecret(
                        userDevicePickleKey.value!,
                        JSON.stringify(event),
                        `${roomId},${sessionId},${senderKey}`,
                    ).then((encryptedData) => {
                        saveDiscortixTableKey('roomKeys', [roomId, sessionId, senderKey], encryptedData)
                    })
                } catch (error) { /* Ignore */ }
            }
        }
    }

    function generateMegolmBackup() {
        const megolmBackup: any[] = []
        for (const roomId in roomKeys.value) {
            const room = roomKeys.value[roomId]
            if (!room) continue
            for (const sessionId in room) {
                const session = room[sessionId]
                if (!session) continue
                for (const senderKey in session) {
                    const event = session[senderKey]
                    megolmBackup.push({
                        room_id: roomId,
                        session_id: sessionId,
                        sender_key: senderKey,
                        algorithm: event?.algorithm,
                        forwarding_curve25519_key_chain: event?.forwardingCurve25519KeyChain,
                        sender_claimed_keys: {
                            ed25519: event?.senderClaimedEd25519Key,
                        },
                        session_key: event?.sessionKey
                    })
                }
            }
        }
        return megolmBackup
    }

    function populateRoomKeysFromMegolmBackup(megolmBackup: any[]) {
        populateRoomKeysFromMegolmBackupDirect(megolmBackup, true)

        broadcastMessageFromTab({
            type: 'populateRoomKeysFromMegolmBackup',
            data: megolmBackup,
        })
    }

    function addRoomKeyInMemory(eventContent: EventForwardedRoomKeyContent) {
        const roomId: string = eventContent.roomId
        if (!roomId) return
        if (!roomKeys.value[roomId]) {
            roomKeys.value[roomId] = {}
        }

        const sessionId: string = eventContent.sessionId
        if (!sessionId) return
        if (!roomKeys.value[roomId][sessionId]) {
            roomKeys.value[roomId][sessionId] = {}
        }

        const senderKey: string = eventContent.senderKey
        if (!senderKey) return
        roomKeys.value[roomId][sessionId][senderKey] = eventContent
    }

    onLogout(() => {
        encryptionNotSupported.value = false
        roomKeyLoadFailed.value = false
        signingKeysValidationFailed.value = false
        signingKeysUploadFailed.value = false
        secretKeyIdsMissing.value = []
        vodozemacInitFailed.value = false
        deviceKeyUploadFailed.value = false

        userDevicePickleKey.value = undefined
        crossSigningMasterKey.value = undefined
        crossSigningUserSigningKey.value = undefined
        crossSigningSelfSigningKey.value = undefined

        olmAccount.value = undefined
        outboundOlmSessions.value = {}
        inboundOlmSessions.value = {}
    }, { permanent: true })

    return {
        encryptionNotSupported,
        roomKeyLoadFailed,
        signingKeysValidationFailed,
        signingKeysUploadFailed,
        secretKeyIdsMissing,
        vodozemacInitFailed,
        deviceKeyUploadFailed,
        deviceNeedsDeletion,
        userDevicePickleKey,
        crossSigningMasterKey,
        crossSigningUserSigningKey,
        crossSigningSelfSigningKey,
        olmAccount,
        loadAllOutboundSessions,
        getOutboundSessions,
        addOutboundSession,
        markOutboundSessionAsSent,
        loadAllInboundSessions,
        getInboundSessions,
        addInboundSession,
        markInboundSessionActivity,
        deviceKeys: computed(() => deviceKeys.value),
        userSigningKeys: computed(() => userSigningKeys.value),
        roomKeys: computed(() => roomKeys.value),
        addRoomKeyInMemory,
        identityVerificationRequired,
        populateKeysFromApiV3KeysQueryResponse,
        populateRoomKeysFromForwardedRoomKeyEvent,
        populateRoomKeysFromMegolmBackup,
        generateMegolmBackup,
    }
})