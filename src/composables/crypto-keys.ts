import { watch } from 'vue'
import { useI18n, type ComposerTranslation } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import initVodozemacAsync, { verify_signature as verifyAccountSignature, Account } from 'vodozemac-wasm-bindings'
import * as z from 'zod'

import { createLogger } from '@/composables/logger'

import { decodeBase64, encodeUnpaddedBase64 } from '@/utils/base64'
import { stringify as canonicalJsonStringify } from '@/utils/canonical-json'
import { generateEd25519Key, createSigningJson } from '@/utils/crypto'
import { HttpError, EncryptionNotSupportedError, EncryptionVerificationError, NetworkConnectionError } from '@/utils/error'
import { fetchJson } from '@/utils/fetch'
import { createPickleKey, getPickleKey } from '@/utils/pickle-key'
import { allSettledValues } from '@/utils/promise'
import {
    recoveryKeyStringToRawKey,
    decryptSecret, encryptSecret,
    generateSecretKeyId, createSecretKeyDescription, validateSecretKeyDescription,
    generateSecretKey, pickleKeyToAesKey,
} from '@/utils/secret-storage'
import { snakeCaseApiRequest } from '@/utils/zod'

import { useAccountData } from './account-data'
import { useBroadcast } from './broadcast'

import { loadTableKey as loadDiscortixTableKey, saveTableKey as saveDiscortixTableKey } from '@/stores/database/discortix'
import { useAccountDataStore } from '@/stores/account-data'
import { useCryptoKeysStore } from '@/stores/crypto-keys'
import { useMegolmStore } from '@/stores/megolm'
import { useOlmStore } from '@/stores/olm'
import { useSessionStore } from '@/stores/session'

import {
    type AesHmacSha2KeyDescription, AesHmacSha2KeyDescriptionSchema,
    type SecretStorageAccountData, SecretStorageAccountDataSchema,
    type ApiV3KeysQueryRequest, type ApiV3KeysQueryResponse, ApiV3KeysQueryResponseSchema,
    type ApiV3KeysUploadRequest, type ApiV3KeysUploadResponse, ApiV3KeysUploadResponseSchema,
    type ApiV3KeysDeviceSigningUploadRequest,
    type ApiV3SyncResponse,
    type ApiV3KeysSignaturesUploadRequest,
} from '@/types'

const log = createLogger(import.meta.url)

function getFriendlyErrorMessage(t: ComposerTranslation, error: Error | unknown) {
    if (error instanceof EncryptionNotSupportedError) {
        return t('errors.cryptoKeys.encryptionNotSupported')
    } else if (error instanceof EncryptionVerificationError) {
        return t('errors.cryptoKeys.encryptionVerificationFailed')
    } else if (error instanceof HttpError) {
        return t('errors.cryptoKeys.httpError')
    } else if (error instanceof z.ZodError) {
        return t('errors.cryptoKeys.schemaValidation')
    } else if (error instanceof NetworkConnectionError) {
        return t('errors.cryptoKeys.serverDown')
    }
    return t('errors.unexpected')
}

export function useCryptoKeys() {
    const { t } = useI18n()
    const route = useRoute()
    const { getAccountDataByType, setAccountDataByType } = useAccountData()
    const { isLeader } = useBroadcast()
    const {
        homeserverBaseUrl,
        userId: sessionUserId,
        deviceId: sessionDeviceId,
        accessToken,
        decryptedAccessToken,
        refreshToken,
        decryptedRefreshToken,
    } = storeToRefs(useSessionStore())
    const { accountData } = storeToRefs(useAccountDataStore())
    const cryptoKeysStore = useCryptoKeysStore()
    const {
        encryptionNotSupported,
        signingKeysValidationFailed,
        signingKeysUploadFailed,
        secretKeyIdsMissing,
        sasVerificationLoadFailed,
        vodozemacInitFailed,
        deviceKeyUploadFailed,
        deviceNeedsDeletion,
        userDevicePickleKey,
        crossSigningMasterPublicKey,
        crossSigningMasterKey,
        crossSigningUserSigningPublicKey,
        crossSigningUserSigningKey,
        crossSigningSelfSigningPublicKey,
        crossSigningSelfSigningKey,
        megolmBackupV1Key,
        olmSecretKey,
        olmAccount,
    } = storeToRefs(cryptoKeysStore)
    const {
        populateKeysFromApiV3KeysQueryResponse,
        loadSasVerifiedDevices,
    } = cryptoKeysStore
    const {
        loadToDeviceErroredEvents,
        loadAllOlmSessions,
    } = useOlmStore()
    const {
        loadAllMegolmSessions,
    } = useMegolmStore()

    watch(() => isLeader.value, async (isLeader, wasLeader) => {
        if (isLeader && !wasLeader && olmSecretKey.value && sessionDeviceId.value) {
            const accountPickle: string | undefined = (await loadDiscortixTableKey('olm', ['account', sessionDeviceId.value])) ?? undefined
            if (accountPickle) {
                try {
                    olmAccount.value = Account.from_pickle(accountPickle, olmSecretKey.value)
                } catch (error) { /* Ignore */ }
            }
        }
    })

    async function queryAuthenticatedUserKeys() {
        if (!sessionUserId.value) throw new DOMException('User ID not found. Cannot proceed.', 'NotFoundError')
        return fetchJson<ApiV3KeysQueryResponse>(
            `${homeserverBaseUrl.value}/_matrix/client/v3/keys/query`,
            {
                method: 'POST',
                body: JSON.stringify({
                    device_keys: {
                        [sessionUserId.value]: [],
                    },
                } satisfies ApiV3KeysQueryRequest),
                useAuthorization: true,
                jsonSchema: ApiV3KeysQueryResponseSchema,
            },
        )
    }

    async function uploadAuthenticatedUserDeviceSigningKeys(
        keys: {
            crossSigningMaster: {
                publicKey: Uint8Array,
                privateKey: Uint8Array,
            },
            crossSigningSelfSigning: {
                publicKey: Uint8Array,
                privateKey: Uint8Array,
            },
            crossSigningUserSigning: {
                publicKey: Uint8Array,
                privateKey: Uint8Array,
            },
        }
    ) {
        if (!sessionUserId.value) throw new DOMException('User ID not found. Cannot proceed.', 'NotFoundError')

        const publicMasterKeyEncoded = encodeUnpaddedBase64(new Uint8Array(keys.crossSigningMaster.publicKey))
        crossSigningMasterPublicKey.value = publicMasterKeyEncoded
        const masterKey: ApiV3KeysDeviceSigningUploadRequest['master_key'] = {
            keys: {
                [`ed25519:${publicMasterKeyEncoded}`]: publicMasterKeyEncoded,
            },
            signatures: {
                [sessionUserId.value]: {}
            },
            usage: ['master'],
            user_id: sessionUserId.value,
        }
        masterKey.signatures[sessionUserId.value][`ed25519:${publicMasterKeyEncoded}`] = await createSigningJson(masterKey, keys.crossSigningMaster.privateKey)

        const publicSelfSigningKeyEncoded = encodeUnpaddedBase64(new Uint8Array(keys.crossSigningSelfSigning.publicKey))
        crossSigningSelfSigningPublicKey.value = publicSelfSigningKeyEncoded
        const selfSigningKey: ApiV3KeysDeviceSigningUploadRequest['self_signing_key'] = {
            keys: {
                [`ed25519:${publicSelfSigningKeyEncoded}`]: publicSelfSigningKeyEncoded,
            },
            signatures: {
                [sessionUserId.value]: {}
            },
            usage: ['self_signing'],
            user_id: sessionUserId.value,
        }
        selfSigningKey.signatures[sessionUserId.value][`ed25519:${publicSelfSigningKeyEncoded}`] = await createSigningJson(selfSigningKey, keys.crossSigningMaster.privateKey)

        const publicUserSigningKeyEncoded = encodeUnpaddedBase64(new Uint8Array(keys.crossSigningUserSigning.publicKey))
        crossSigningUserSigningPublicKey.value = publicUserSigningKeyEncoded
        const userSigningKey: ApiV3KeysDeviceSigningUploadRequest['user_signing_key'] = {
            keys: {
                [`ed25519:${publicUserSigningKeyEncoded}`]: publicUserSigningKeyEncoded,
            },
            signatures: {
                [sessionUserId.value]: {}
            },
            usage: ['user_signing'],
            user_id: sessionUserId.value,
        }
        userSigningKey.signatures[sessionUserId.value][`ed25519:${publicUserSigningKeyEncoded}`] = await createSigningJson(userSigningKey, keys.crossSigningMaster.privateKey)

        return fetchJson<ApiV3KeysUploadResponse>(
            `${homeserverBaseUrl.value}/_matrix/client/v3/keys/device_signing/upload`,
            {
                method: 'POST',
                body: JSON.stringify({
                    master_key: masterKey,
                    self_signing_key: selfSigningKey,
                    user_signing_key: userSigningKey,
                } satisfies ApiV3KeysDeviceSigningUploadRequest),
                useAuthorization: true,
            },
        )
    }

    async function uploadAuthenticatedUserDeviceKeys(
        uploadedKeys: ApiV3KeysQueryResponse,
        olmAccount: Account,
        crossSigningSelfSigningKey?: Uint8Array,
    ) {
        if (!sessionUserId.value || !sessionDeviceId.value /*|| !isLeader.value*/) return
        let deviceKeys: ApiV3KeysUploadRequest['device_keys'] | undefined = undefined
        let fallbackKeys: ApiV3KeysUploadRequest['fallback_keys'] | undefined = undefined
        let oneTimeKeys: ApiV3KeysUploadRequest['one_time_keys'] | undefined = undefined

        const uploadedEd25519Key = uploadedKeys.deviceKeys?.[sessionUserId.value]?.[sessionDeviceId.value]?.keys[`ed25519:${sessionDeviceId.value}`]
        const uploadedCurve25519Key = uploadedKeys.deviceKeys?.[sessionUserId.value]?.[sessionDeviceId.value]?.keys[`curve25519:${sessionDeviceId.value}`]

        if (
            (uploadedEd25519Key && uploadedEd25519Key !== olmAccount.ed25519_key)
            || (uploadedCurve25519Key && uploadedCurve25519Key !== olmAccount.curve25519_key)
        ) {
            deviceNeedsDeletion.value = true
            return
        } else if (!uploadedEd25519Key && !uploadedCurve25519Key) {
            deviceKeys = {
                user_id: sessionUserId.value,
                device_id: sessionDeviceId.value,
                algorithms: [
                    'm.olm.v1.curve25519-aes-sha2',
                    'm.megolm.v1.aes-sha2'
                ],
                keys: {
                    [`ed25519:${sessionDeviceId.value}`]: olmAccount.ed25519_key,
                    [`curve25519:${sessionDeviceId.value}`]: olmAccount.curve25519_key,
                },
                signatures: {
                    [sessionUserId.value]: {},
                },
            }
            const deviceKeysMessage = canonicalJsonStringify(deviceKeys, ['signatures', 'unsigned'])
            deviceKeys.signatures[sessionUserId.value]![`ed25519:${sessionDeviceId.value}`] = olmAccount.sign(deviceKeysMessage)

            try {
                verifyAccountSignature(
                    deviceKeys.keys[`ed25519:${sessionDeviceId.value}`]!,
                    new TextEncoder().encode(deviceKeysMessage),
                    deviceKeys.signatures[sessionUserId.value]![`ed25519:${sessionDeviceId.value}`]!
                )
            } catch (error) {
                throw new Error('Device key signature verification failed.')
            }

            // Generate fallback key
            olmAccount.generate_fallback_key()
            const keyId = olmAccount.fallback_key.keys().next().value
            const fallbackPublicKey = olmAccount.fallback_key.get(keyId)
            const fallbackKeyToSign = {
                fallback: true,
                key: fallbackPublicKey,
                signatures: {
                    [sessionUserId.value]: {
                        [`ed25519:${sessionDeviceId.value}`]: '',
                    },
                },
            }
            const fallbackKeysMessage = canonicalJsonStringify(fallbackKeyToSign, ['signatures', 'unsigned'])
            fallbackKeyToSign.signatures[sessionUserId.value]![`ed25519:${sessionDeviceId.value}`] = olmAccount.sign(fallbackKeysMessage)
            fallbackKeys = {
                [`signed_curve25519:${keyId}`]: fallbackKeyToSign,
            }

            try {
                verifyAccountSignature(
                    deviceKeys.keys[`ed25519:${sessionDeviceId.value}`]!,
                    new TextEncoder().encode(fallbackKeysMessage),
                    fallbackKeyToSign.signatures[sessionUserId.value]![`ed25519:${sessionDeviceId.value}`]!
                )
            } catch (error) {
                throw new Error('Fallback key signature verification failed.')
            }
            
            // Generate one-time keys.
            olmAccount.generate_one_time_keys(olmAccount.max_number_of_one_time_keys)
            oneTimeKeys = {}
            for (const [keyId, oneTimeKey] of olmAccount.one_time_keys) {
                const oneTimeKeyToSign = {
                    key: oneTimeKey,
                    signatures: {
                        [sessionUserId.value]: {
                            [`ed25519:${sessionDeviceId.value}`]: '',
                        },
                    },
                }
                const oneTimeKeyMessage = canonicalJsonStringify(oneTimeKeyToSign, ['signatures', 'unsigned'])
                oneTimeKeyToSign.signatures[sessionUserId.value]![`ed25519:${sessionDeviceId.value}`] = olmAccount.sign(oneTimeKeyMessage)
                oneTimeKeys[`signed_curve25519:${keyId}`] = oneTimeKeyToSign

                try {
                    verifyAccountSignature(
                        deviceKeys.keys[`ed25519:${sessionDeviceId.value}`]!,
                        new TextEncoder().encode(oneTimeKeyMessage),
                        oneTimeKeyToSign.signatures[sessionUserId.value]![`ed25519:${sessionDeviceId.value}`]!
                    )
                } catch (error) {
                    throw new Error('One-time key signature verification failed.')
                }
            }
        }

        // Upload all the keys
        const response = await fetchJson<ApiV3KeysUploadResponse>(
            `${homeserverBaseUrl.value}/_matrix/client/v3/keys/upload`,
            {
                method: 'POST',
                body: JSON.stringify({
                    device_keys: deviceKeys,
                    fallback_keys: fallbackKeys,
                    one_time_keys: oneTimeKeys,
                } satisfies ApiV3KeysUploadRequest),
                useAuthorization: true,
                jsonSchema: ApiV3KeysUploadResponseSchema,
            },
        )

        olmAccount.mark_keys_as_published()
        if (olmSecretKey.value) {
            await saveDiscortixTableKey('olm', ['account', sessionDeviceId.value], olmAccount.pickle(olmSecretKey.value), { durability: 'strict' })
        }

        if (
            response.oneTimeKeyCounts?.signedCurve25519 != null
            && response.oneTimeKeyCounts.signedCurve25519 < 50
        ) {
            uploadAuthenticatedUserDeviceOneTimeKeys(
                olmAccount,
                olmAccount.max_number_of_one_time_keys - response.oneTimeKeyCounts.signedCurve25519,
                crossSigningSelfSigningKey,
            )
        }

        // Upload cross-signing signature of device key
        const myDeviceKey: ApiV3KeysUploadRequest['device_keys'] = (deviceKeys ? snakeCaseApiRequest(deviceKeys) : undefined) ?? uploadedKeys.deviceKeys?.[sessionUserId.value]?.[sessionDeviceId.value]
        if (
            myDeviceKey
            && crossSigningSelfSigningPublicKey.value
            && crossSigningSelfSigningKey
            && !myDeviceKey.signatures[sessionUserId.value]?.[`ed25519:${crossSigningSelfSigningPublicKey.value}`]
        ) {
            const deviceKeysMessage = canonicalJsonStringify(myDeviceKey, ['signatures', 'unsigned'])
            myDeviceKey.signatures[sessionUserId.value]![`ed25519:${crossSigningSelfSigningPublicKey.value}`] = await createSigningJson(
                deviceKeysMessage, crossSigningSelfSigningKey,
            )
            fetchJson(
                `${homeserverBaseUrl.value}/_matrix/client/v3/keys/signatures/upload`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        [sessionUserId.value]: {
                            [sessionDeviceId.value]: myDeviceKey,
                        }
                    } satisfies ApiV3KeysSignaturesUploadRequest),
                    useAuthorization: true,
                }
            )
        }
    }

    async function uploadAuthenticatedUserDeviceOneTimeKeys(
        olmAccount: Account,
        keyCount: number,
        crossSigningSelfSigningKey?: Uint8Array,
    ) {
        if (!sessionUserId.value || !sessionDeviceId.value) return

        const oneTimeKeys: ApiV3KeysUploadRequest['one_time_keys'] = {}
        olmAccount.generate_one_time_keys(keyCount)
        for (const [keyId, oneTimeKey] of olmAccount.one_time_keys) {
            const oneTimeKeyToSign = {
                key: oneTimeKey,
                signatures: {
                    [sessionUserId.value]: {
                        [`ed25519:${sessionDeviceId.value}`]: '',
                    },
                },
            }
            const oneTimeKeyMessage = canonicalJsonStringify(oneTimeKeyToSign, ['signatures', 'unsigned'])
            oneTimeKeyToSign.signatures[sessionUserId.value]![`ed25519:${sessionDeviceId.value}`] = olmAccount.sign(oneTimeKeyMessage)
            if (crossSigningSelfSigningKey && crossSigningSelfSigningPublicKey.value) {
                oneTimeKeyToSign.signatures[sessionUserId.value]![`ed25519:${crossSigningSelfSigningPublicKey.value}`] = await createSigningJson(
                    oneTimeKeyToSign, crossSigningSelfSigningKey,
                )
            }
            oneTimeKeys[`signed_curve25519:${keyId}`] = oneTimeKeyToSign
        }

        await fetchJson<ApiV3KeysUploadResponse>(
            `${homeserverBaseUrl.value}/_matrix/client/v3/keys/upload`,
            {
                method: 'POST',
                body: JSON.stringify({
                    one_time_keys: oneTimeKeys,
                } satisfies ApiV3KeysUploadRequest),
                jsonSchema: ApiV3KeysUploadResponseSchema,
                useAuthorization: true,
            },
        )

        olmAccount.mark_keys_as_published()
        if (olmSecretKey.value) {
            await saveDiscortixTableKey('olm', ['account', sessionDeviceId.value], olmAccount.pickle(olmSecretKey.value), { durability: 'strict' })
        }
    }

    async function initialize() {
        if (!sessionUserId.value || !sessionDeviceId.value) throw new DOMException('User ID or Device ID not found. Cannot proceed.', 'NotFoundError')
            
        // Retrieve or generate a pickle key for secret storage.
        let pickleKeyString: string | null = null
        try {
            pickleKeyString = await getPickleKey(sessionUserId.value, sessionDeviceId.value)
        } catch (error) { /* Ignore - will generate a new one. */ }
        if (!pickleKeyString) {
            try {
                pickleKeyString = await createPickleKey(sessionUserId.value, sessionDeviceId.value)
            } catch (error) {
                log.error('Error when generating pickle key.', error)
                encryptionNotSupported.value = true
            }
        }
        if (pickleKeyString && !encryptionNotSupported.value) {
            try {
                userDevicePickleKey.value = await pickleKeyToAesKey(pickleKeyString)
            } catch (error) {
                log.error('Error when converting pickle key to AES key.', error)
                encryptionNotSupported.value = true
            }
        }
        if (!userDevicePickleKey.value) {
            encryptionNotSupported.value = true
        }

        // Convert string auth tokens to encrypted versions.
        if (userDevicePickleKey.value) {
            if (typeof accessToken.value === 'string') {
                accessToken.value = await encryptSecret(userDevicePickleKey.value, accessToken.value, 'access_token')
            }
            if (typeof accessToken.value === 'object') {
                decryptedAccessToken.value = await decryptSecret(userDevicePickleKey.value, accessToken.value, 'access_token')
            }
            if (typeof refreshToken.value === 'string') {
                refreshToken.value = await encryptSecret(userDevicePickleKey.value, refreshToken.value, 'refresh_token')
            }
            if (typeof refreshToken.value === 'object') {
                decryptedRefreshToken.value = await decryptSecret(userDevicePickleKey.value, refreshToken.value, 'refresh_token')
            }
        } else {
            // Set plain strings if encryption not supported.
            if (typeof accessToken.value === 'string') {
                decryptedAccessToken.value = accessToken.value
            }
            if (typeof refreshToken.value === 'string') {
                decryptedRefreshToken.value = refreshToken.value
            }
        }

        if (encryptionNotSupported.value || !userDevicePickleKey.value) {
            return
        }

        try {
            await initVodozemacAsync({ module_or_path: '/assets/wasm/vodozemac_bg.wasm' })
        } catch (error) {
            vodozemacInitFailed.value = true
            log.error('Vodozemac initialization failed.', error)
        }

        // Load OLM account
        olmSecretKey.value = userDevicePickleKey.value
        const accountPickle: string | undefined = (await loadDiscortixTableKey('olm', ['account', sessionDeviceId.value!])) ?? undefined
        if (accountPickle && olmSecretKey.value) {
            try {
                olmAccount.value = Account.from_pickle(accountPickle, olmSecretKey.value)
            } catch (error) {
                log.error('Error fetching OLM account from storage: ', error)
            }
        }

        // Retrieve signing/backup keys from storage if they exist there
        if (userDevicePickleKey.value) {
            const [
                crossSigningMasterStored,
                crossSigningUserSigningStored,
                crossSigningSelfSigningStored,
                megolmBackupV1Stored,
            ] = await allSettledValues([
                loadDiscortixTableKey('4s', [sessionUserId.value, 'm.cross_signing.master']),
                loadDiscortixTableKey('4s', [sessionUserId.value, 'm.cross_signing.user_signing']),
                loadDiscortixTableKey('4s', [sessionUserId.value, 'm.cross_signing.self_signing']),
                loadDiscortixTableKey('4s', [sessionUserId.value, 'm.megolm_backup.v1']),
            ])
            if (crossSigningMasterStored) {
                crossSigningMasterKey.value = decodeBase64(
                    await decryptSecret(userDevicePickleKey.value, crossSigningMasterStored, 'm.cross_signing.master')
                )
            }
            if (crossSigningUserSigningStored) {
                crossSigningUserSigningKey.value = decodeBase64(
                    await decryptSecret(userDevicePickleKey.value, crossSigningUserSigningStored, 'm.cross_signing.user_signing')
                )
            }
            if (crossSigningSelfSigningStored) {
                crossSigningSelfSigningKey.value = decodeBase64(
                    await decryptSecret(userDevicePickleKey.value, crossSigningSelfSigningStored, 'm.cross_signing.self_signing')
                )
            }
            if (megolmBackupV1Stored) {
                megolmBackupV1Key.value = decodeBase64(
                    await decryptSecret(userDevicePickleKey.value, megolmBackupV1Stored, 'm.megolm_backup.v1')
                )
            }
        }

        // Load SAS verified user/devices
        try {
            await loadSasVerifiedDevices()
        } catch (error) {
            sasVerificationLoadFailed.value = true
        }

        // Try to retrieve signing keys from the account data and uploaded store.
        let [
            secretStorageDefaultKeyName,
            crossSigningMaster,
            crossSigningUserSigning,
            crossSigningSelfSigning,
            megolmBackupV1,
        ] = await allSettledValues([
            getAccountDataByType<{ key: string }>('m.secret_storage.default_key'),
            !crossSigningMasterKey.value ? getAccountDataByType<SecretStorageAccountData>('m.cross_signing.master', SecretStorageAccountDataSchema) : Promise.resolve(),
            !crossSigningUserSigningKey.value ? getAccountDataByType<SecretStorageAccountData>('m.cross_signing.user_signing', SecretStorageAccountDataSchema) : Promise.resolve(),
            !crossSigningSelfSigningKey.value ? getAccountDataByType<SecretStorageAccountData>('m.cross_signing.self_signing', SecretStorageAccountDataSchema) : Promise.resolve(),
            !megolmBackupV1Key.value ? getAccountDataByType<SecretStorageAccountData>('m.megolm_backup.v1', SecretStorageAccountDataSchema) : Promise.resolve(),
        ] as const)

        const uploadedKeys = await queryAuthenticatedUserKeys()

        crossSigningMasterPublicKey.value = Object.keys(uploadedKeys?.masterKeys?.[sessionUserId.value]?.keys ?? {})[0]?.split(':')[1]
        crossSigningUserSigningPublicKey.value = Object.keys(uploadedKeys?.userSigningKeys?.[sessionUserId.value]?.keys ?? {})[0]?.split(':')[1]
        crossSigningSelfSigningPublicKey.value = Object.keys(uploadedKeys?.selfSigningKeys?.[sessionUserId.value]?.keys ?? {})[0]?.split(':')[1]

        // If no signing keys uploaded yet, create them and upload them.
        if (
            !uploadedKeys?.masterKeys?.[sessionUserId.value]
            || !uploadedKeys?.userSigningKeys?.[sessionUserId.value]
            || !uploadedKeys?.selfSigningKeys?.[sessionUserId.value]
        ) {
            const secretKey = await generateSecretKey()
            const secretKeyId = await generateSecretKeyId()
            const secretKeyDescription = await createSecretKeyDescription(secretKey, `m.secret_storage.key.${secretKeyId}`)

            const crossSigningMasterKeyPair = await generateEd25519Key()
            const crossSigningUserSigningKeyPair = await generateEd25519Key()
            const crossSigningSelfSigningKeyPair = await generateEd25519Key()
            const base64CrossSigningMasterPrivateKey = encodeUnpaddedBase64(new Uint8Array(crossSigningMasterKeyPair.privateKey))
            const base64CrossSigningUserSigningPrivateKey = encodeUnpaddedBase64(new Uint8Array(crossSigningUserSigningKeyPair.privateKey))
            const base64CrossSigningSelfSigningKeyPrivateKey = encodeUnpaddedBase64(new Uint8Array(crossSigningSelfSigningKeyPair.privateKey))

            const crossSigningMasterEncrypted = await encryptSecret(
                secretKey,
                base64CrossSigningMasterPrivateKey,
                'm.cross_signing.master',
            )
            const crossSigningUserSigningEncrypted = await encryptSecret(
                secretKey,
                base64CrossSigningUserSigningPrivateKey,
                'm.cross_signing.user_signing',
            )
            const crossSigningSelfSigningEncrypted = await encryptSecret(
                secretKey,
                base64CrossSigningSelfSigningKeyPrivateKey,
                'm.cross_signing.self_signing',
            )

            try {
                const crossSigningMasterDecrypted = await decryptSecret(
                    secretKey,
                    crossSigningMasterEncrypted,
                    'm.cross_signing.master'
                )
                const crossSigningUserSigningDecrypted = await decryptSecret(
                    secretKey,
                    crossSigningUserSigningEncrypted,
                    'm.cross_signing.user_signing'
                )
                const crossSigningSelfSigningDecrypted = await decryptSecret(
                    secretKey,
                    crossSigningSelfSigningEncrypted,
                    'm.cross_signing.self_signing'
                )
                if (
                    crossSigningMasterDecrypted !== base64CrossSigningMasterPrivateKey
                    || crossSigningUserSigningDecrypted !== base64CrossSigningUserSigningPrivateKey
                    || crossSigningSelfSigningDecrypted !== base64CrossSigningSelfSigningKeyPrivateKey
                ) {
                    throw new Error('Decrypted signing keys did not match encrypted counterparts.')
                }
            } catch (error) {
                log.error('Error when validating newly generated signing keys.', error)
                signingKeysValidationFailed.value = true
                return
            }

            secretStorageDefaultKeyName = {
                key: secretKeyId,
            }
            crossSigningMaster = {
                encrypted: {
                    [secretKeyId]: crossSigningMasterEncrypted,
                }
            }
            crossSigningUserSigning = {
                encrypted: {
                    [secretKeyId]: crossSigningUserSigningEncrypted,
                }
            }
            crossSigningSelfSigning = {
                encrypted: {
                    [secretKeyId]: crossSigningSelfSigningEncrypted,
                }
            }

            try {
                await uploadAuthenticatedUserDeviceSigningKeys({
                    crossSigningMaster: {
                        publicKey: new Uint8Array(crossSigningMasterKeyPair.publicKey),
                        privateKey: crossSigningMasterKeyPair.privateKey,
                    },
                    crossSigningUserSigning: {
                        publicKey: new Uint8Array(crossSigningUserSigningKeyPair.publicKey),
                        privateKey: crossSigningUserSigningKeyPair.privateKey,
                    },
                    crossSigningSelfSigning: {
                        publicKey: new Uint8Array(crossSigningSelfSigningKeyPair.publicKey),
                        privateKey: crossSigningSelfSigningKeyPair.privateKey,
                    }
                })

                await Promise.all([
                    setAccountDataByType('m.secret_storage.default_key', secretStorageDefaultKeyName),
                    setAccountDataByType(`m.secret_storage.key.${secretKeyId}`, secretKeyDescription),
                    setAccountDataByType('m.cross_signing.master', crossSigningMaster),
                    setAccountDataByType('m.cross_signing.user_signing', crossSigningUserSigning),
                    setAccountDataByType('m.cross_signing.self_signing', crossSigningSelfSigning),
                ])

                await saveDiscortixTableKey('4s', [sessionUserId.value, secretKeyId], encryptSecret(
                    userDevicePickleKey.value, encodeUnpaddedBase64(secretKey), `${sessionUserId.value}:${secretKeyId}`
                ), { durability: 'strict' })
            } catch (error) {
                log.error('Error when uploading newly generated signing keys.', error)

                crossSigningMaster = undefined
                crossSigningUserSigning = undefined
                crossSigningSelfSigning = undefined

                signingKeysUploadFailed.value = true
            }
        }
        
        // Check which account keys need which secret storage key (if more than one).
        let neededKeys = new Set<string>()
        if (secretStorageDefaultKeyName?.key) {
            neededKeys.add(secretStorageDefaultKeyName?.key)
        }
        if (!crossSigningMasterKey.value && crossSigningMaster?.encrypted) {
            for (const keyname in crossSigningMaster.encrypted) {
                neededKeys.add(keyname)
            }
        }
        if (!crossSigningUserSigningKey.value && crossSigningUserSigning?.encrypted) {
            for (const keyname in crossSigningUserSigning.encrypted) {
                neededKeys.add(keyname)
            }
        }
        if (!crossSigningSelfSigningKey.value && crossSigningSelfSigning?.encrypted) {
            for (const keyname in crossSigningSelfSigning.encrypted) {
                neededKeys.add(keyname)
            }
        }
        if (!megolmBackupV1Key.value && megolmBackupV1?.encrypted) {
            for (const keyname in megolmBackupV1.encrypted) {
                neededKeys.add(keyname)
            }
        }

        const keyDescriptions = (await allSettledValues(
            Array.from(neededKeys).map((keyId) => {
                return getAccountDataByType<AesHmacSha2KeyDescription>(
                    `m.secret_storage.key.${keyId}`, AesHmacSha2KeyDescriptionSchema
                ).then((result) => ({ id: keyId, description: result }))
            })
        ))

        // Retrieve secret keys from storage
        const secretKeys: Record<string, Uint8Array> = {}
        for (const keyId of Array.from(neededKeys)) {
            try {
                const secretKey = decodeBase64(
                    await decryptSecret(
                        userDevicePickleKey.value,
                        await loadDiscortixTableKey('4s', [sessionUserId.value, keyId]),
                        `${sessionUserId.value}:${keyId}`,
                    )
                )
                const keyDescription = keyDescriptions.find((description) => description?.id === keyId)
                if (keyDescription?.description && await validateSecretKeyDescription(secretKey, keyDescription.description)) {
                    secretKeys[keyId] = secretKey
                }
            } catch (error) { /* Ignore */ }
        }
        const ownedSecretKeyIds = Object.keys(secretKeys)

        // Retrieve signing private keys and OLM account
        for (const keyId of ownedSecretKeyIds) {
            if (crossSigningMaster?.encrypted[keyId]) {
                try {
                    crossSigningMasterKey.value = decodeBase64(
                        await decryptSecret(secretKeys[keyId]!, crossSigningMaster.encrypted[keyId], 'm.cross_signing.master')
                    )
                } catch (error) { /* Ignore */ }
            }
            if (crossSigningUserSigning?.encrypted[keyId]) {
                try {
                    crossSigningUserSigningKey.value = decodeBase64(
                        await decryptSecret(secretKeys[keyId]!, crossSigningUserSigning.encrypted[keyId], 'm.cross_signing.user_signing')
                    )
                } catch (error) { /* Ignore */ }
            }
            if (crossSigningSelfSigning?.encrypted[keyId]) {
                try {
                    crossSigningSelfSigningKey.value = decodeBase64(
                        await decryptSecret(secretKeys[keyId]!, crossSigningSelfSigning.encrypted[keyId], 'm.cross_signing.self_signing')
                    )
                } catch (error) { /* Ignore */ }
            }
            if (megolmBackupV1?.encrypted[keyId]) {
                try {
                    megolmBackupV1Key.value = decodeBase64(
                        await decryptSecret(secretKeys[keyId]!, megolmBackupV1.encrypted[keyId], 'm.megolm_backup.v1')
                    )
                } catch (error) { /* Ignore */ }
            }
        }

        // Determine which secret keys are missing if failed to retrieve any of the private signing keys.
        const missingKeyIdSet = new Set<string>()
        if (!crossSigningMasterKey.value && crossSigningMaster?.encrypted) {
            for (const keyId in crossSigningMaster.encrypted) {
                if (!ownedSecretKeyIds.includes(keyId)) {
                    missingKeyIdSet.add(keyId)
                }
            }
        }
        if (!crossSigningUserSigningKey.value && crossSigningUserSigning?.encrypted) {
            for (const keyId in crossSigningUserSigning.encrypted) {
                if (!ownedSecretKeyIds.includes(keyId)) {
                    missingKeyIdSet.add(keyId)
                }
            }
        }
        if (!crossSigningSelfSigningKey.value && crossSigningSelfSigning?.encrypted) {
            for (const keyId in crossSigningSelfSigning.encrypted) {
                if (!ownedSecretKeyIds.includes(keyId)) {
                    missingKeyIdSet.add(keyId)
                }
            }
        }
        secretKeyIdsMissing.value = Array.from(missingKeyIdSet)

        await generateDeviceKeys(uploadedKeys)
    }

    async function generateDeviceKeys(uploadedKeys?: ApiV3KeysQueryResponse) {
        if (!sessionDeviceId.value) return

        if (!uploadedKeys) {
            uploadedKeys = await queryAuthenticatedUserKeys()
        }

        // Generate Curve25519 identity key for OLM message encryption.
        if (!olmAccount.value && olmSecretKey.value) {
            olmAccount.value = new Account()
            saveDiscortixTableKey('olm', ['account', sessionDeviceId.value], olmAccount.value.pickle(olmSecretKey.value), { durability: 'strict' })
        }

        // Upload OLM device keys.
        if (olmAccount.value) {
            try {
                await uploadAuthenticatedUserDeviceKeys(
                    uploadedKeys,
                    olmAccount.value,
                    crossSigningSelfSigningKey.value,
                )
            } catch (error) {
                log.error('Device key upload failed:', error)
                deviceKeyUploadFailed.value = true
            }
        }
    }

    async function installSecretKey(keyId: string, secretKey: Uint8Array) {
        const keyDescription: AesHmacSha2KeyDescription = accountData.value[`m.secret_storage.key.${keyId}`]
        if (!keyDescription) throw new EncryptionVerificationError()
        try {
            const isValid = await validateSecretKeyDescription(secretKey, keyDescription)
            if (!isValid) throw new EncryptionVerificationError() 
        } catch (error) {
            throw new EncryptionVerificationError()
        }

        await saveDiscortixTableKey('4s', [sessionUserId.value!, keyId], await encryptSecret(
            userDevicePickleKey.value!,
            encodeUnpaddedBase64(secretKey),
            `${sessionUserId.value}:${keyId}`,
        ), { durability: 'strict' })
        secretKeyIdsMissing.value.splice(secretKeyIdsMissing.value.indexOf(keyId), 1)

        let [
            crossSigningMaster,
            crossSigningUserSigning,
            crossSigningSelfSigning,
            megolmBackupV1,
        ] = await allSettledValues([
            getAccountDataByType<SecretStorageAccountData>('m.cross_signing.master', SecretStorageAccountDataSchema),
            getAccountDataByType<SecretStorageAccountData>('m.cross_signing.user_signing', SecretStorageAccountDataSchema),
            getAccountDataByType<SecretStorageAccountData>('m.cross_signing.self_signing', SecretStorageAccountDataSchema),
            getAccountDataByType<SecretStorageAccountData>('m.megolm_backup.v1', SecretStorageAccountDataSchema),
        ] as const)

        if (crossSigningMaster?.encrypted[keyId]) {
            try {
                crossSigningMasterKey.value = decodeBase64(
                    await decryptSecret(secretKey, crossSigningMaster.encrypted[keyId], 'm.cross_signing.master')
                )
            } catch (error) { /* Ignore */ }
        }
        if (crossSigningUserSigning?.encrypted[keyId]) {
            try {
                crossSigningUserSigningKey.value = decodeBase64(
                    await decryptSecret(secretKey, crossSigningUserSigning.encrypted[keyId], 'm.cross_signing.user_signing')
                )
            } catch (error) { /* Ignore */ }
        }
        if (crossSigningSelfSigning?.encrypted[keyId]) {
            try {
                crossSigningSelfSigningKey.value = decodeBase64(
                    await decryptSecret(secretKey, crossSigningSelfSigning.encrypted[keyId], 'm.cross_signing.self_signing')
                )
            } catch (error) { /* Ignore */ }
        }
        if (megolmBackupV1?.encrypted[keyId]) {
            try {
                megolmBackupV1Key.value = decodeBase64(
                    await decryptSecret(secretKey, megolmBackupV1.encrypted[keyId], 'm.megolm_backup.v1')
                )
            } catch (error) { /* Ignore */ }
        }

        await Promise.allSettled([
            generateDeviceKeys(),
            loadAllMegolmSessions(),
            loadAllOlmSessions(),
        ])
    }

    async function installRecoveryKey(keyId: string, recoveryKey: string) {
        const secretKey = await recoveryKeyStringToRawKey(recoveryKey)
        await installSecretKey(keyId, secretKey)
    }

    // TODO - maybe persist these timestamps in storage to reduce API cost
    const fetchUserKeyTimestamps: Record<string, number> = {}
    async function fetchUserKeys(userIds: string[]) {
        const now = Date.now()
        for (let i = userIds.length - 1; i >= 0; i--) {
            const userId = userIds[i]!
            const timestamp = fetchUserKeyTimestamps[userId] || 0
            if (now - timestamp < 300000) {
                userIds.splice(i, 1)
            } else {
                fetchUserKeyTimestamps[userId] = now
            }
        }
        if (userIds.length === 0) return
        for (let i = 0; i < userIds.length; i += 10) {
            const deviceKeys: Record<string, any[]> = {}
            for (let j = i; j < i + 10; j++) {
                const userId = userIds[j]
                if (!userId) break
                deviceKeys[userId] = []
            }
            try {
                const queryResponse = await fetchJson<ApiV3KeysQueryResponse>(
                    `${homeserverBaseUrl.value}/_matrix/client/v3/keys/query`,
                    {
                        method: 'POST',
                        body: JSON.stringify({
                            device_keys: deviceKeys,
                        } satisfies ApiV3KeysQueryRequest),
                        useAuthorization: true,
                        jsonSchema: ApiV3KeysQueryResponseSchema,
                    },
                )
                populateKeysFromApiV3KeysQueryResponse(queryResponse)
            } catch (error) {
                log.error('Error fetching user keys.', error)
                for (const userId of userIds.slice(i, i + 10)) {
                    delete fetchUserKeyTimestamps[userId]
                }
            }
        }
    }
    
    function manageCryptoKeysFromApiV3SyncResponse(syncResponse: ApiV3SyncResponse) {
        if (route.name === 'room') {
            let userIds: string[] = []
            const roomId = route.params.roomId as string
            const joinedRoom = syncResponse.rooms?.join?.[roomId]
            if (joinedRoom?.state?.events) {
                for (const event of joinedRoom.state.events) {
                    if (event.type === 'm.room.member' && event.content?.membership === 'join') {
                        userIds.push(event.sender)
                    }
                }
            }
            if (joinedRoom?.timeline?.events) {
                for (const event of joinedRoom.timeline.events) {
                    if (event.type === 'm.room.member' && event.content?.membership === 'join') {
                        userIds.push(event.sender)
                    }
                }
            }
            fetchUserKeys(userIds)
        }
        if (
            syncResponse.deviceOneTimeKeysCount?.signedCurve25519 != null
            && syncResponse.deviceOneTimeKeysCount.signedCurve25519 < 50
            && olmAccount.value
            && isLeader.value
        ) {
            uploadAuthenticatedUserDeviceOneTimeKeys(
                olmAccount.value,
                olmAccount.value.max_number_of_one_time_keys - syncResponse.deviceOneTimeKeysCount.signedCurve25519,
                crossSigningSelfSigningKey.value,
            )
        }
    }

    return {
        getFriendlyErrorMessage: (error: Error | unknown) => getFriendlyErrorMessage(t, error),
        initialize,
        installSecretKey,
        installRecoveryKey,
        fetchUserKeys,
        manageCryptoKeysFromApiV3SyncResponse,
        generateDeviceKeys,
    }
}
