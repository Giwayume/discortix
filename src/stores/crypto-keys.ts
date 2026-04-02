import { computed, ref, toRaw, watch } from 'vue'
import { defineStore, storeToRefs } from 'pinia'
import { Account, GroupSession, InboundGroupSession } from 'vodozemac-wasm-bindings'

import { useBroadcast } from '@/composables/broadcast'
import { onLogout } from '@/composables/logout'

import {
    getAllTableKeys as getAllDiscortixTableKeys,
    loadTableKey as loadDiscortixTableKey,
    saveTableKey as saveDiscortixTableKey,
} from '@/stores/database/discortix'

import { encryptSecret } from '@/utils/secret-storage'

import type {
    ApiV3DeviceInformation,
    ApiV3KeysQueryResponse,
    ApiV3CrossSigningKey,
    EventForwardedRoomKeyContent,
} from '@/types'

export const useCryptoKeysStore = defineStore('cryptoKeys', () => {
    const { isLeader, onTabMessage, broadcastMessageFromTab } = useBroadcast({ permanent: true })

    const userId = ref<string | undefined>()
    const deviceId = ref<string | undefined>()

    /*-----------------------------------*\
    |                                     |
    |   Encryption Initialization State   |
    |                                     |
    \*-----------------------------------*/

    // TODO - prompt user action based on these error scenarios
    const encryptionNotSupported = ref<boolean>(false)
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

    /*-------------------*\
    |                     |
    |   My Signing Keys   |
    |                     |
    \*-------------------*/

    // Used to encrypt the secret storage key. @/composables/crypto-keys.ts populates this field on initialization.
    const userDevicePickleKey = ref<Uint8Array | undefined>()
    const crossSigningMasterKey = ref<Uint8Array | undefined>()
    const crossSigningUserSigningKey = ref<Uint8Array | undefined>()
    const crossSigningSelfSigningKey = ref<Uint8Array | undefined>()

    /*---------------------------*\
    |                             |
    |   Other User Signing Keys   |
    |                             |
    \*---------------------------*/

    // User ID -> Key Info
    const userSigningKeys = ref<Record<
        string,
        { masterKeys?: ApiV3CrossSigningKey, selfSigningKeys?: ApiV3CrossSigningKey, userSigningKeys?: ApiV3CrossSigningKey }
    >>({})

    /*---------------*\
    |                 |
    |   OLM Account   |
    |                 |
    \*---------------*/

    const olmSecretKey = ref<Uint8Array | undefined>()
    const olmAccount = ref<Account | undefined>()

    async function saveOlmAccount() {
        if (!deviceId.value || !olmAccount.value || !olmSecretKey.value) return
        await saveDiscortixTableKey('olm', ['account', deviceId.value], olmAccount.value.pickle(olmSecretKey.value))
        broadcastMessageFromTab({
            type: 'updateOlmAccount',
        })
    }

    async function loadOlmAccount() {
        if (!deviceId.value || !olmSecretKey.value) return
        const value = await loadDiscortixTableKey('olm', ['account', deviceId.value])
        olmAccount.value = Account.from_pickle(value, olmSecretKey.value)
    }

    /*-----------------------------------*\
    |                                     |
    |   Signing Keys for Users' Devices   |
    |                                     |
    \*-----------------------------------*/

    // User ID -> Device ID -> Key Info
    const deviceKeys = ref<Record<string, Record<string, ApiV3DeviceInformation>>>({})

    /*---------------------------------*\
    |                                   |
    |   Inferred State Based On Above   |
    |                                   |
    \*---------------------------------*/

    const identityVerificationRequired = computed<boolean>(() => {
        return (
            secretKeyIdsMissing.value.length > 0
            && (!crossSigningMasterKey.value || !crossSigningUserSigningKey.value || !crossSigningSelfSigningKey.value)
        )
    })

    /*---------------------------------*\
    |                                   |
    |   Populate State From API Calls   |
    |                                   |
    \*---------------------------------*/

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

    /*-------------*\
    |               |
    |   Lifecycle   |
    |               |
    \*-------------*/

    onTabMessage((message) => {
        if (message.type === 'updateOlmAccount') {
            loadOlmAccount()
        }
    })

    onLogout(() => {
        encryptionNotSupported.value = false
        signingKeysValidationFailed.value = false
        signingKeysUploadFailed.value = false
        secretKeyIdsMissing.value = []
        vodozemacInitFailed.value = false
        deviceKeyUploadFailed.value = false
        deviceNeedsDeletion.value = false

        userDevicePickleKey.value = undefined
        crossSigningMasterKey.value = undefined
        crossSigningUserSigningKey.value = undefined
        crossSigningSelfSigningKey.value = undefined

        olmSecretKey.value = undefined
        olmAccount.value = undefined
    }, { permanent: true })

    return {
        encryptionNotSupported,
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
        olmSecretKey,
        olmAccount,
        saveOlmAccount,
        deviceKeys: computed(() => deviceKeys.value),
        userSigningKeys: computed(() => userSigningKeys.value),
        identityVerificationRequired,
        populateKeysFromApiV3KeysQueryResponse,
    }
})