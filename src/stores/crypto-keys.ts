import { computed, nextTick, ref, watch } from 'vue'
import { defineStore, storeToRefs } from 'pinia'
import { Account } from 'vodozemac-wasm-bindings'

import { encodeUnpaddedBase64 } from '@/utils/base64'
import {
    decryptSecret, encryptSecret,
} from '@/utils/secret-storage'

import { useBroadcast } from '@/composables/broadcast'
import { onLogout } from '@/composables/logout'

import {
    loadTableKey as loadDiscortixTableKey,
    saveTableKey as saveDiscortixTableKey,
    deleteTableKey as deleteDiscortixTableKey,
    getAllTableKeys as getAllDiscortixTableKeys,
} from '@/stores/database/discortix'

import type {
    ApiV3DeviceInformation,
    ApiV3KeysQueryResponse,
    ApiV3CrossSigningKey,
} from '@/types'

export const useCryptoKeysStore = defineStore('cryptoKeys', () => {
    const { onTabMessage, broadcastMessageFromTab } = useBroadcast({ permanent: true })

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
    const sasVerificationLoadFailed = ref<boolean>(false)
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
    const crossSigningMasterPublicKey = ref<string | undefined>()
    const crossSigningMasterKey = ref<Uint8Array | undefined>()
    const crossSigningUserSigningPublicKey = ref<string | undefined>()
    const crossSigningUserSigningKey = ref<Uint8Array | undefined>()
    const crossSigningSelfSigningPublicKey = ref<string | undefined>()
    const crossSigningSelfSigningKey = ref<Uint8Array | undefined>()
    const megolmBackupV1Key = ref<Uint8Array | undefined>()

    watch(() => crossSigningMasterKey.value, async () => {
        if (!userId.value) return
        if (crossSigningMasterKey.value && userDevicePickleKey.value) {
            saveDiscortixTableKey('4s', [userId.value, 'm.cross_signing.master'], await encryptSecret(
                userDevicePickleKey.value,
                encodeUnpaddedBase64(crossSigningMasterKey.value),
                'm.cross_signing.master'
            ))
        } else {
            deleteDiscortixTableKey('4s', [userId.value, 'm.cross_signing.master'])
        }
    })

    watch(() => crossSigningUserSigningKey.value, async () => {
        if (!userId.value) return
        if (crossSigningUserSigningKey.value && userDevicePickleKey.value) {
            saveDiscortixTableKey('4s', [userId.value, 'm.cross_signing.user_signing'], await encryptSecret(
                userDevicePickleKey.value,
                encodeUnpaddedBase64(crossSigningUserSigningKey.value),
                'm.cross_signing.user_signing'
            ))
        } else {
            deleteDiscortixTableKey('4s', [userId.value, 'm.cross_signing.user_signing'])
        }
    })

    watch(() => crossSigningSelfSigningKey.value, async () => {
        if (!userId.value) return
        if (crossSigningSelfSigningKey.value && userDevicePickleKey.value) {
            saveDiscortixTableKey('4s', [userId.value, 'm.cross_signing.self_signing'], await encryptSecret(
                userDevicePickleKey.value,
                encodeUnpaddedBase64(crossSigningSelfSigningKey.value),
                'm.cross_signing.self_signing'
            ))
        } else {
            deleteDiscortixTableKey('4s', [userId.value, 'm.cross_signing.self_signing'])
        }
    })

    watch(() => megolmBackupV1Key.value, async () => {
        if (!userId.value) return
        if (megolmBackupV1Key.value && userDevicePickleKey.value) {
            saveDiscortixTableKey('4s', [userId.value, 'm.megolm_backup.v1'], await encryptSecret(
                userDevicePickleKey.value,
                encodeUnpaddedBase64(megolmBackupV1Key.value),
                'm.megolm_backup.v1'
            ))
        } else {
            deleteDiscortixTableKey('4s', [userId.value, 'm.megolm_backup.v1'])
        }
    })

    /*--------------------------------------*\
    |                                        |
    |   Devices Directly Verified with SAS   |
    |                                        |
    \*--------------------------------------*/

    // `${otherUserId},${otherDeviceId}`
    const sasVerifiedDevices = ref<string[]>([])
    let isLoadingSasVerifiedDevices = ref<boolean>(false)

    watch(() => sasVerifiedDevices.value, () => {
        for (const sasVerifiedDevice of sasVerifiedDevices.value) {
            const [otherUserId, otherDeviceId] = sasVerifiedDevice.split(',')
            if (!userId.value || !otherUserId || !otherDeviceId) continue
            saveDiscortixTableKey('sas', ['verified', userId.value, otherUserId, otherDeviceId], true)
        }
        if (!isLoadingSasVerifiedDevices.value) {
            broadcastMessageFromTab({
                type: 'updateSasVerifiedDevices',
            })
        }
    })

    async function addSasVerifiedDevice(otherUserId: string, otherDeviceId: string) {
        const combinedKey = `${otherUserId},${otherDeviceId}`
        if (!sasVerifiedDevices.value.includes(combinedKey)) {
            sasVerifiedDevices.value.push(combinedKey)
        }
    }

    async function loadSasVerifiedDevices() {
        isLoadingSasVerifiedDevices.value = true
        const keys: [[string, string, string, string]] = await getAllDiscortixTableKeys('sas')
        for (const [sasType, myUserId, otherUserId, otherDeviceId] of keys) {
            const combinedKey = `${otherUserId},${otherDeviceId}`
            if (sasType === 'verified' && myUserId === userId.value && !sasVerifiedDevices.value.includes(combinedKey)) {
                sasVerifiedDevices.value.push(combinedKey)
            }
        }
        await nextTick()
        await nextTick()
        isLoadingSasVerifiedDevices.value = false
    }

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
        await saveDiscortixTableKey('olm', ['account', deviceId.value], olmAccount.value.pickle(olmSecretKey.value), { durability: 'strict' })
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
        } else if (message.type === 'updateSasVerifiedDevices') {
            loadSasVerifiedDevices()
        }
    })

    onLogout(() => {
        encryptionNotSupported.value = false
        signingKeysValidationFailed.value = false
        signingKeysUploadFailed.value = false
        secretKeyIdsMissing.value = []
        sasVerificationLoadFailed.value = false
        vodozemacInitFailed.value = false
        deviceKeyUploadFailed.value = false
        deviceNeedsDeletion.value = false

        sasVerifiedDevices.value = []
        userDevicePickleKey.value = undefined
        crossSigningMasterPublicKey.value = undefined
        crossSigningMasterKey.value = undefined
        crossSigningUserSigningPublicKey.value = undefined
        crossSigningUserSigningKey.value = undefined
        crossSigningSelfSigningPublicKey.value = undefined
        crossSigningSelfSigningKey.value = undefined
        megolmBackupV1Key.value = undefined

        olmSecretKey.value = undefined
        olmAccount.value = undefined
    }, { permanent: true })

    return {
        encryptionNotSupported,
        signingKeysValidationFailed,
        signingKeysUploadFailed,
        secretKeyIdsMissing,
        sasVerificationLoadFailed,
        vodozemacInitFailed,
        deviceKeyUploadFailed,
        deviceNeedsDeletion,
        identityVerificationRequired,

        userDevicePickleKey,

        crossSigningMasterPublicKey,
        crossSigningMasterKey,
        crossSigningUserSigningPublicKey,
        crossSigningUserSigningKey,
        crossSigningSelfSigningPublicKey,
        crossSigningSelfSigningKey,
        megolmBackupV1Key,

        addSasVerifiedDevice,
        loadSasVerifiedDevices,

        olmSecretKey,
        olmAccount,
        saveOlmAccount,

        deviceKeys: computed(() => deviceKeys.value),
        userSigningKeys: computed(() => userSigningKeys.value),
        
        populateKeysFromApiV3KeysQueryResponse,
    }
})