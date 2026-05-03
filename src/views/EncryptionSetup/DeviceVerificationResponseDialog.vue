<template>
    <Dialog
        :visible="visible"
        modal
        :draggable="false"
        :header="t('deviceVerificationResponse.title')"
        :style="{ width: 'calc(100% - 1rem)', maxWidth: '30rem' }"
        @update:visible="(visible) => emit('update:visible', visible)"
    >
        <template v-if="verificationErrorMessage">
            {{ verificationErrorMessage }}
        </template>
        <template v-else-if="verificationStatus === 'ready'">
            <ProgressBar mode="indeterminate" class="mt-8 mb-4" />
        </template>
        <template v-else-if="verificationStatus === 'start'">
            <template v-if="verificationSasEmoji.length > 0">
                <p class="text-subtle">{{ t('deviceVerificationResponse.emojiVerificationInstructions') }}</p>
                <div class="flex flex-wrap justify-center items-center gap-x-12 gap-y-4 my-4">
                    <div v-for="sasEmoji of verificationSasEmoji" class="flex flex-col items-center">
                        <span class="text-4xl mb-1">{{ sasEmoji.emoji }}</span>
                        <span class="text-strong">{{ sasEmoji.description }}</span>
                    </div>
                </div>
            </template>
            <template v-else>
                <p class="text-subtle">{{ t('deviceVerificationResponse.decimalVerificationInstructions') }}</p>
                <div class="text-center text-2xl font-bold my-4">
                    {{ verificationSasDecimals }}
                </div>
            </template>
            <p v-if="hasSentMac">{{ t('deviceVerificationResponse.verificationSent') }}</p>
        </template>
        <template v-else-if="verificationStatus === 'noMatch'">
            <div v-html="micromark(t('deviceVerificationResponse.noMatchDisclaimer'))" />
        </template>
        <template v-else-if="verificationStatus === 'requestSecrets'">
            {{ t('deviceVerificationResponse.requestSecrets') }}
            <ProgressBar mode="indeterminate" class="mt-8 mb-4" />
        </template>
        <template v-else-if="verificationStatus === 'done'">
            <div class="flex flex-col items-center mt-11 mb-7">
                <span class="pi pi-check-circle text-feedback-positive text-6xl!" aria-hidden="true" />
                <p>{{ t('deviceVerificationResponse.done') }}</p>
            </div>
        </template>
        <template v-else>
            {{ t('deviceVerificationResponse.errors.unknown') }}
        </template>
        <template #footer>
            <Button
                v-if="verificationStatus === 'start' && !hasSentMac"
                severity="secondary"
                :label="t('deviceVerificationResponse.sasNoMatchButton')"
                @click="cancelWithNoMatch()"
            />
            <Button
                v-else-if="verificationStatus === 'canceled' || verificationStatus === 'ignored' || verificationStatus === 'done'"
                :label="t('deviceVerificationResponse.okButton')"
                @click="dismissModal()"
            />
            <Button
                v-else
                severity="secondary"
                :label="t('deviceVerificationResponse.cancelButton')"
                @click="dismissModal()"
            />
            <Button
                v-if="verificationStatus === 'start' && !hasSentMac"
                severity="primary"
                :loading="isSendingMac"
                @click="sendMac()"
            >
                <span class="p-button-label">{{ t('deviceVerificationResponse.sasMatchButton') }}</span>
                <span class="p-button-loading-dots" />
            </Button>
        </template>
    </Dialog>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { micromark } from 'micromark'
import { v4 as uuidv4 } from 'uuid'
import { EstablishedSas, Sas } from 'vodozemac-wasm-bindings'

import sasEmoji from '@/i18n/sas-emoji.json'

import { encodeUnpaddedBase64, decodeBase64 } from '@/utils/base64'
import { stringify as canonicalJsonStringify } from '@/utils/canonical-json'
import { HttpError, NetworkConnectionError } from '@/utils/error'
import { allSettledValues } from '@/utils/promise'
import { snakeCaseApiRequest } from '@/utils/zod'

import { useAccountData } from '@/composables/account-data'
import { useCryptoKeys } from '@/composables/crypto-keys'
import { createLogger } from '@/composables/logger'
import { useOlm } from '@/composables/olm'

import { useCryptoKeysStore } from '@/stores/crypto-keys'
import { useSessionStore } from '@/stores/session'

import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import ProgressBar from 'primevue/progressbar'

import {
    type ApiV3SyncToDeviceEvent,
    type EventKeyVerificationAcceptContent,
    type EventKeyVerificationCancelContent,
    type EventKeyVerificationDoneContent,
    type EventKeyVerificationKeyContent,
    type EventKeyVerificationMacContent,
    type EventKeyVerificationReadyContent,
    type EventKeyVerificationRequestContent,
    type EventKeyVerificationStartContent,
    type EventKeyVerificationStartSasv1Content,
    type EventSecretRequestContent,
    type EventSecretSendContent,
    type SasEmoji,
} from '@/types'

const log = createLogger(import.meta.url)

const { t, locale } = useI18n()

const { getAccountDataByType } = useAccountData()
const { fetchUserKeys, installSecretKey } = useCryptoKeys()
const { onInboundMessage, sendMessageToDevices } = useOlm()

const cryptoKeysStore = useCryptoKeysStore()
const {
    deviceKeys,
    crossSigningMasterKey,
    crossSigningUserSigningKey,
    crossSigningSelfSigningKey,
    megolmBackupV1Key,
} = storeToRefs(cryptoKeysStore)
const { addSasVerifiedDevice } = cryptoKeysStore
const { userId: sessionUserId, deviceId: sessionDeviceId } = storeToRefs(useSessionStore())

const props = defineProps({
    visible: {
        type: Boolean,
        default: false,
    },
    deviceVerificationRequestEventContent: {
        type: Object as PropType<EventKeyVerificationRequestContent>,
        default: undefined,
    }
})

const emit = defineEmits<{
    (e: 'update:visible', visible: boolean): void
    (e: 'success'): void
}>()

const verificationRequestTimeoutTime = 600000 // 10 minutes
let verificationRequestTimeout: number | undefined = undefined
const verificationStatus = ref<'ready' | 'start' | 'noMatch' | 'ignored' | 'canceled' | 'requestSecrets' | 'done'>('ready')
const verificationSasDecimals = ref<string>('')
const verificationSasEmoji = ref<SasEmoji[]>([])
const verificationError = ref<Error | null>(null)
const isSendingMac = ref<boolean>(false)
const hasSentMac = ref<boolean>(false)
const hasReceivedMac = ref<boolean>(false)
const isOtherDone = ref<boolean>(false)
const currentTransactionId = ref<string>()
const pendingSecretRequests = ref<Record<string, string>>({})
let secretRequestTimeout: number | undefined

interface VerificationTransaction {
    toDeviceId: string;
    shortAuthenticationString?: Array<'decimal' | 'emoji'>;
    acceptEventContent?: EventKeyVerificationAcceptContent;
    startEventContent?: EventKeyVerificationStartContent;
    sas?: Sas;
    establishedSas?: EstablishedSas;
}
const transactions = ref<Record<string, VerificationTransaction>>({})

const verificationErrorMessage = computed<string | null>(() => {
    if (!verificationError.value) return null
    if (verificationStatus.value === 'ready') {
        if (verificationError.value instanceof HttpError) {
            return t('deviceVerificationResponse.errors.startFailed')
        }
    } else if (verificationStatus.value === 'ignored') {
        return t('deviceVerificationResponse.errors.ignored')
    } else if (verificationStatus.value === 'canceled') {
        return t('deviceVerificationResponse.errors.otherDeviceCanceled')
    }
    if (verificationError.value instanceof NetworkConnectionError) {
        return t('deviceVerificationResponse.errors.serverDown')
    }
    return t('deviceVerificationResponse.errors.unknown')
})

async function requestReceived() {
    verificationStatus.value = 'ready'
    verificationError.value = null
    isSendingMac.value = false
    hasSentMac.value = false
    hasReceivedMac.value = false
    isOtherDone.value = false
    currentTransactionId.value = undefined
    if (!sessionUserId.value) {
        verificationError.value = new Error('Missing user ID')
        return
    }
    if (!props.deviceVerificationRequestEventContent?.transactionId) {
        verificationError.value = new Error('Missing verification request event content')
        return
    }
    try {
        await fetchUserKeys([sessionUserId.value])
        const sessionUserDeviceKeys = deviceKeys.value[sessionUserId.value]
        if (!sessionUserDeviceKeys) {
            throw new Error('Missing other device keys')
        }

        currentTransactionId.value = props.deviceVerificationRequestEventContent.transactionId
        transactions.value[currentTransactionId.value] = {
            toDeviceId: props.deviceVerificationRequestEventContent.fromDevice,
        }

        await sendMessageToDevices([[sessionUserId.value, props.deviceVerificationRequestEventContent.fromDevice]], 'm.key.verification.ready', {
            fromDevice: sessionDeviceId.value!,
            methods: ['m.sas.v1'],
            transactionId: currentTransactionId.value,
        } satisfies EventKeyVerificationReadyContent)

        const startEventContent: EventKeyVerificationStartSasv1Content = {
            fromDevice: sessionDeviceId.value!,
            hashes: ['sha256'],
            keyAgreementProtocols: ['curve25519-hkdf-sha256'],
            messageAuthenticationCodes: ['hkdf-hmac-sha256.v2'],
            method: 'm.sas.v1',
            shortAuthenticationString: ['decimal', 'emoji'],
            transactionId: currentTransactionId.value,
        }
        transactions.value[currentTransactionId.value]!.startEventContent = startEventContent

        await sendMessageToDevices([[sessionUserId.value!, props.deviceVerificationRequestEventContent.fromDevice]], 'm.key.verification.start', startEventContent)

        verificationRequestTimeout = setTimeout(() => {
            verificationStatus.value = 'ignored'
            verificationError.value = new Error('No transactions')
            cancel()
        }, verificationRequestTimeoutTime)
    } catch (error) {
        log.warn('An error occurred when handling a m.key.verification.request event', error)
        if (error instanceof Error) {
            verificationError.value = error
        } else {
            verificationError.value = new Error('Unknown error')
        }
    }
}

async function start(event: ApiV3SyncToDeviceEvent) {
    try {
        if (!currentTransactionId.value) return
        const eventContent = event.content as EventKeyVerificationStartContent
        if (eventContent.transactionId !== currentTransactionId.value) return
        const transaction = transactions.value[currentTransactionId.value]

        if (!transaction) {
            log.warn('Received a m.key.verification.start event for an unknown transaction id: ', eventContent.transactionId)
            return cancel({
                code: 'm.unknown_transaction',
                reason: 'Unknown transaction.',
                transactionId: currentTransactionId.value,
            }, new Error('Unknown transaction.'))
        }
        if (eventContent.method !== 'm.sas.v1') {
            log.warn('The other device doesn\'t support the transaction method this app supports. Transaction ID: ', eventContent.transactionId)
            return cancel({
                code: 'm.unknown_method',
                reason: 'Method not supported.',
                transactionId: currentTransactionId.value,
            }, new Error('Method not supported.'))
        }
        if (eventContent.fromDevice !== transaction.toDeviceId) {
            log.warn('The other device had an unexpected from_device id: ', eventContent.fromDevice)
            return cancel({
                code: 'm.unexpected_message',
                reason: 'Transaction ID belongs to a different device.',
                transactionId: currentTransactionId.value,
            }, new Error('Transaction ID belongs to a different device.'))
        }

        // await sendMessageToDevices([[sessionUserId.value!, transaction.toDeviceId]], 'm.key.verification.start', {
        //     fromDevice: sessionDeviceId.value!,
        //     hashes: ['sha256'],
        //     keyAgreementProtocols: ['curve25519-hkdf-sha256'],
        //     messageAuthenticationCodes: ['hkdf-hmac-sha256.v2'],
        //     method: 'm.sas.v1',
        //     shortAuthenticationString: ['decimal', 'emoji'],
        //     transactionId: currentTransactionId.value,
        // } satisfies EventKeyVerificationStartSasv1Content)

    } catch (error) {
        log.warn('An error occurred when handling a m.key.verification.start event', error)
        if (error instanceof Error) {
            verificationError.value = error
        } else {
            verificationError.value = new Error('Unknown error')
        }
        cancel()
    }
}

async function acceptReceived(event: ApiV3SyncToDeviceEvent) {
    try {
        if (!currentTransactionId.value) return
        const eventContent = event.content as EventKeyVerificationAcceptContent
        if (eventContent.transactionId !== currentTransactionId.value) return
        const transaction = transactions.value[currentTransactionId.value]

        if (!transaction) {
            log.warn('Received a m.key.verification.accept event for an unknown transaction id: ', eventContent.transactionId)
            return cancel({
                code: 'm.unknown_transaction',
                reason: 'Unknown transaction.',
                transactionId: currentTransactionId.value,
            }, new Error('Unknown transaction.'))
        }
        if (eventContent.hash !== 'sha256' || eventContent.keyAgreementProtocol !== 'curve25519-hkdf-sha256' || eventContent.messageAuthenticationCode !== 'hkdf-hmac-sha256.v2') {
            log.warn('Received a m.key.verification.accept event with an unknown protocol: ', eventContent.transactionId)
            return cancel({
                code: 'm.unknown_method',
                reason: 'Hash, key agreement protocol, or authentication code not supported.',
                transactionId: currentTransactionId.value,
            }, new Error('Hash, key agreement protocol, or authentication code not supported.'))
        }

        transaction.sas = new Sas()
        transaction.acceptEventContent = eventContent
        transaction.shortAuthenticationString = eventContent.shortAuthenticationString as never

        const publicKey = transaction.sas.public_key

        await sendMessageToDevices([[sessionUserId.value!, transaction.toDeviceId]], 'm.key.verification.key', {
            key: publicKey,
            transactionId: currentTransactionId.value,
        } satisfies EventKeyVerificationKeyContent)

    } catch (error) {
        log.warn('An error occurred when handling a m.key.verification.accept event', error)
        if (error instanceof Error) {
            verificationError.value = error
        } else {
            verificationError.value = new Error('Unknown error')
        }
        cancel()
    }
}

async function keyReceived(event: ApiV3SyncToDeviceEvent) {
    try {
        if (!currentTransactionId.value) return
        const eventContent = event.content as EventKeyVerificationKeyContent
        if (eventContent.transactionId !== currentTransactionId.value) return
        const transaction = transactions.value[currentTransactionId.value]

        if (!transaction?.sas || !transaction?.acceptEventContent || !transaction?.startEventContent) {
            return cancel(undefined, new Error('Missing required transaction params.'))
        }

        const myPublicKey = transaction.sas.public_key

        const senderEphemeralCurvePublicKey = eventContent.key
        const eventContentCanonicalJson = canonicalJsonStringify(snakeCaseApiRequest(transaction.startEventContent), ['signatures', 'unsigned'])

        const senderEphemeralCurvePublicKeyBytes = new TextEncoder().encode(senderEphemeralCurvePublicKey)
        const eventContentCanonicalJsonBytes = new TextEncoder().encode(eventContentCanonicalJson)
        const combinedBytes = new Uint8Array(senderEphemeralCurvePublicKeyBytes.length + eventContentCanonicalJsonBytes.length)
        combinedBytes.set(senderEphemeralCurvePublicKeyBytes, 0)
        combinedBytes.set(eventContentCanonicalJsonBytes, senderEphemeralCurvePublicKeyBytes.length)
        const hashBuffer = await crypto.subtle.digest('SHA-256', combinedBytes)
        const commitment = encodeUnpaddedBase64(new Uint8Array(hashBuffer))

        if (commitment !== transaction.acceptEventContent.commitment) {
            log.warn('Computed commitment with m.key.verification.key does not match commitment from m.key.verification.accept event: ', eventContent.transactionId)
            verificationStatus.value === 'noMatch'
            return cancel({
                code: 'm.key_mismatch',
                reason: 'Commitment from m.key.verification.accept event does not match the given key.',
                transactionId: currentTransactionId.value,
            }, new Error('Commitment from m.key.verification.accept event does not match the given key.'))
        }

        transaction.establishedSas = transaction.sas?.diffie_hellman(eventContent.key)
        if (!transaction.establishedSas) {
            return cancel(undefined, new Error('Missing required transaction params.'))
        }

        const info = `MATRIX_KEY_VERIFICATION_SAS|${sessionUserId.value}|${sessionDeviceId.value}|${myPublicKey}|${event.sender}|${transaction.toDeviceId}|${eventContent.key}|${eventContent.transactionId}`

        const bytes = transaction.establishedSas.bytes(info)

        verificationSasEmoji.value = []
        verificationSasDecimals.value = ''
        if (transaction.shortAuthenticationString?.includes('emoji')) {
            for (const emojiIndex of bytes.emoji_indices) {
                const emoji = sasEmoji[emojiIndex] as unknown as SasEmoji
                verificationSasEmoji.value.push({
                    ...emoji,
                    description: emoji.translated_descriptions[locale.value] ?? emoji.description,
                })
            }
        } else {
            for (const byte of bytes.decimals) {
                verificationSasDecimals.value += byte
            }
        }

        verificationStatus.value = 'start'
        currentTransactionId.value = eventContent.transactionId

    } catch (error) {
        log.warn('An error occurred when handling a m.key.verification.key event', error)
        if (error instanceof Error) {
            verificationError.value = error
        } else {
            verificationError.value = new Error('Unknown error')
        }
        cancel()
    }
}

async function sendMac() {
    try {
        if (!currentTransactionId.value) {
            return cancelIfNoTransactions()
        }

        isSendingMac.value = true

        const deviceKeyId = Object.keys(deviceKeys.value[sessionUserId.value!]?.[sessionDeviceId.value!]?.keys ?? {})?.find((key) => key.startsWith('ed25519:')) ?? ''
        const myEd25519Key = deviceKeys.value[sessionUserId.value!]?.[sessionDeviceId.value!]?.keys?.[deviceKeyId]
        const transaction = transactions.value[currentTransactionId.value]

        if (!transaction?.establishedSas || !myEd25519Key) {
            throw new Error('Missing information to send mac.')
        }

        const baseInfo = `MATRIX_KEY_VERIFICATION_MAC${sessionUserId.value}${sessionDeviceId.value}${sessionUserId.value}${transaction.toDeviceId}${currentTransactionId.value}`

        await sendMessageToDevices([[sessionUserId.value!, transaction.toDeviceId]], 'm.key.verification.mac', {
            keys: transaction.establishedSas.calculate_mac(
                deviceKeyId,
                baseInfo + 'KEY_IDS',
            ),
            mac: {
                [deviceKeyId]: transaction.establishedSas.calculate_mac(
                    `${myEd25519Key}`,
                    baseInfo + deviceKeyId,
                ),
            },
            transactionId: currentTransactionId.value,
        } satisfies EventKeyVerificationMacContent)

        hasSentMac.value = true

        if (hasReceivedMac.value) {
            sendDone()
        }
    } catch (error) {
        log.warn('An error occurred when sending a m.key.verification.mac event', error)
        if (error instanceof Error) {
            verificationError.value = error
        } else {
            verificationError.value = new Error('Unknown error')
        }
        cancel()
    } finally {
        isSendingMac.value = false
    }
}

async function macReceived(event: ApiV3SyncToDeviceEvent) {
    try {
        const eventContent = event.content as EventKeyVerificationMacContent

        if (
            (!currentTransactionId.value || currentTransactionId.value !== eventContent.transactionId)
            && verificationStatus.value !== 'start'
        ) {
            log.warn('Received an unexpected m.key.verification.mac event from another device.')
            return cancelIfNoTransactions()
        }

        const transaction = transactions.value[currentTransactionId.value!]

        if (!transaction?.establishedSas) {
            throw new Error('Missing transaction to receive mac.')
        }

        const baseInfo = `MATRIX_KEY_VERIFICATION_MAC${sessionUserId.value}${transaction.toDeviceId}${sessionUserId.value}${sessionDeviceId.value}${currentTransactionId.value}`

        const keyIds = Object.keys(eventContent.mac).sort().join(',')
        if (eventContent.keys !== transaction.establishedSas.calculate_mac(keyIds, baseInfo + 'KEY_IDS')) {
            throw new Error('Mac verification for key IDs failed.')
        }
        for (const keyId of Object.keys(eventContent.mac)) {
            const keyMac = eventContent.mac[keyId]!
            const key = deviceKeys.value[sessionUserId.value!]?.[transaction.toDeviceId]?.keys?.[keyId]
            if (key && keyMac !== transaction.establishedSas.calculate_mac(key, baseInfo + keyId)) {
                throw new Error('Mac verification for key IDs failed.')
            }
        }

        hasReceivedMac.value = true

        if (hasSentMac.value) {
            sendDone()
        }
    } catch (error) {
        log.warn('An error occurred when handling a m.key.verification.mac event', error)
        if (error instanceof Error) {
            verificationError.value = error
        } else {
            verificationError.value = new Error('Unknown error')
        }
        cancel()
    }
}

async function sendDone() {
    try {

        const transaction = transactions.value[currentTransactionId.value!]

        if (!transaction) {
            throw new Error('Missing transaction.')
        }

        await sendMessageToDevices([[sessionUserId.value!, transaction.toDeviceId]], 'm.key.verification.done', {
            transactionId: currentTransactionId.value,
        } satisfies EventKeyVerificationDoneContent)

        if (isOtherDone.value) {
            done()
        }
    } catch (error) {
        log.warn('An error occurred when sending a m.key.verification.done event', error)
        if (error instanceof Error) {
            verificationError.value = error
        } else {
            verificationError.value = new Error('Unknown error')
        }
        cancel()
    }
}

async function doneReceived(event: ApiV3SyncToDeviceEvent) {
    try {
        const eventContent = event.content as EventKeyVerificationDoneContent

        if (eventContent.transactionId !== currentTransactionId.value) {
            return
        }

        isOtherDone.value = true

        if (hasSentMac.value) {
            done()
        }
    } catch (error) {
        log.warn('An error occurred when handling a m.key.verification.done event', error)
        if (error instanceof Error) {
            verificationError.value = error
        } else {
            verificationError.value = new Error('Unknown error')
        }
        cancel()
    }
}

function done() {
    if (verificationStatus.value === 'requestSecrets' || verificationStatus.value === 'done') return
    const transaction = transactions.value[currentTransactionId.value!]

    if (!transaction) {
        return cancelIfNoTransactions()
    }

    verificationStatus.value = 'requestSecrets'

    addSasVerifiedDevice(sessionUserId.value!, transaction.toDeviceId)

    try {
        transaction.sas?.free()
    } catch { /* Ignore */ }
    try {
        transaction.establishedSas?.free()
    } catch { /* Ignore */ }
    delete transactions.value[currentTransactionId.value!]

    cancel()

    requestSecrets(transaction.toDeviceId)
}

async function requestSecrets(otherDeviceId: string) {
    try {
        verificationStatus.value = 'requestSecrets'

        secretRequestTimeout = setTimeout(requestSecretsTimeout, 10000)

        let [
            crossSigningMaster,
            crossSigningUserSigning,
            crossSigningSelfSigning,
            megolmBackupV1,
        ] = await allSettledValues([
            getAccountDataByType('m.cross_signing.master'),
            getAccountDataByType('m.cross_signing.user_signing'),
            getAccountDataByType('m.cross_signing.self_signing'),
            getAccountDataByType('m.megolm_backup.v1'),
        ] as const)

        if (crossSigningMaster && !crossSigningMasterKey.value) {
            const requestId = uuidv4()
            pendingSecretRequests.value[requestId] = 'm.cross_signing.master'
            await sendMessageToDevices([[sessionUserId.value!, otherDeviceId]], 'm.secret.request', {
                action: 'request',
                name: 'm.cross_signing.master',
                requestId,
                requestingDeviceId: sessionDeviceId.value!,
            } satisfies EventSecretRequestContent)
        }

        if (crossSigningUserSigning && !crossSigningUserSigningKey.value) {
            const requestId = uuidv4()
            pendingSecretRequests.value[requestId] = 'm.cross_signing.user_signing'
            await sendMessageToDevices([[sessionUserId.value!, otherDeviceId]], 'm.secret.request', {
                action: 'request',
                name: 'm.cross_signing.user_signing',
                requestId,
                requestingDeviceId: sessionDeviceId.value!,
            } satisfies EventSecretRequestContent)
        }

        if (crossSigningSelfSigning && !crossSigningSelfSigningKey.value) {
            const requestId = uuidv4()
            pendingSecretRequests.value[requestId] = 'm.cross_signing.self_signing'
            await sendMessageToDevices([[sessionUserId.value!, otherDeviceId]], 'm.secret.request', {
                action: 'request',
                name: 'm.cross_signing.self_signing',
                requestId,
                requestingDeviceId: sessionDeviceId.value!,
            } satisfies EventSecretRequestContent)
        }

        if (megolmBackupV1 && !megolmBackupV1Key.value) {
            const requestId = uuidv4()
            pendingSecretRequests.value[requestId] = 'm.megolm_backup.v1'
            await sendMessageToDevices([[sessionUserId.value!, otherDeviceId]], 'm.secret.request', {
                action: 'request',
                name: 'm.megolm_backup.v1',
                requestId,
                requestingDeviceId: sessionDeviceId.value!,
            } satisfies EventSecretRequestContent)
        }

    } catch (error) {
        clearTimeout(secretRequestTimeout)
        requestSecretsTimeout()
    }
}

async function secretReceived(event: ApiV3SyncToDeviceEvent) {
    const eventContent = event.content as EventSecretSendContent
    const secretId = pendingSecretRequests.value[eventContent.requestId]
    if (!secretId) return
    if (secretId.startsWith('m.secret_storage.key.')) {
        const keyId = secretId.replace('m.secret_storage.key.', '')
        try {
            await installSecretKey(keyId, decodeBase64(eventContent.secret))
        } catch (error) {
            log.warn('Error when installing a received secret storage key: ', error)
        }
    } else {
        switch (secretId) {
            case 'm.cross_signing.master':
                crossSigningMasterKey.value = decodeBase64(eventContent.secret)
                break
            case 'm.cross_signing.user_signing':
                crossSigningUserSigningKey.value = decodeBase64(eventContent.secret)
                break
            case 'm.cross_signing.self_signing':
                crossSigningSelfSigningKey.value = decodeBase64(eventContent.secret)
                break
            case 'm.megolm_backup.v1':
                megolmBackupV1Key.value = decodeBase64(eventContent.secret)
                break
        }
    }
    delete pendingSecretRequests.value[eventContent.requestId]
    if (Object.keys(pendingSecretRequests.value).length === 0) {
        clearTimeout(secretRequestTimeout)
        verificationStatus.value = 'done'
    }
}

function requestSecretsTimeout() {
    verificationStatus.value = 'done'
}

function otherDeviceCancel(event: ApiV3SyncToDeviceEvent) {
    const transaction = transactions.value[event.content.transactionId]
    if (!transaction) return
    try {
        transaction.sas?.free()
    } catch { /* Ignore */ }
    try {
        transaction.establishedSas?.free()
    } catch { /* Ignore */ }
    delete transactions.value[event.content.transactionId]
    cancelIfNoTransactions()
}

function cancelWithNoMatch() {
    verificationStatus.value = 'noMatch'
    cancel()
}

function cancelIfNoTransactions() {
    if (verificationStatus.value === 'noMatch') return
    if (verificationStatus.value === 'start') {
        cancel()
        verificationStatus.value = 'canceled'
        verificationError.value = new Error('Other user canceled')
    } else if (Object.keys(transactions.value).length === 0) {
        cancel()
        verificationStatus.value = 'ignored'
        verificationError.value = new Error('No transactions')
    }
}

function cancel(message?: EventKeyVerificationCancelContent, error?: Error) {
    clearTimeout(verificationRequestTimeout)
    if (!sessionUserId.value) return
    for (const transactionId in transactions.value) {
        const transaction = transactions.value[transactionId]
        if (!transaction) continue
        sendMessageToDevices([[sessionUserId.value!, transaction.toDeviceId]], 'm.key.verification.cancel', {
            code: 'm.user',
            reason: 'User canceled the request.',
            ...(message ? message : {}),
            transactionId,
        } satisfies EventKeyVerificationCancelContent)
        try {
            transaction.sas?.free()
        } catch { /* Ignore */ }
        try {
            transaction.establishedSas?.free()
        } catch { /* Ignore */ }
    }
    transactions.value = {}
    if (error) {
        verificationError.value = error
    }
}

function dismissModal() {
    if (verificationStatus.value === 'done') {
        emit('success')
    }
    emit('update:visible', false)
}

watch(() => props.visible, (visible, wasVisible) => {
    if (visible && !wasVisible) {
        requestReceived()
    }
    else if (!visible && wasVisible) {
        cancel()
        clearTimeout(verificationRequestTimeout)
        clearTimeout(secretRequestTimeout)
        secretRequestTimeout = undefined
    }
})

onInboundMessage(async (event) => {
    if (!props.visible) return
    if (event.type === 'm.key.verification.accept') {
        acceptReceived(event)
    } else if (event.type === 'm.key.verification.cancel') {
        otherDeviceCancel(event)
    } else if (event.type === 'm.key.verification.done') {
        doneReceived(event)
    } else if (event.type === 'm.key.verification.key') {
        keyReceived(event)
    } else if (event.type === 'm.key.verification.mac') {
        macReceived(event)
    } else if (event.type === 'm.key.verification.start') {
        start(event)
    } else if (event.type === 'm.secret.send') {
        secretReceived(event)
    }
})

onUnmounted(() => {
    cancel()
})

</script>

<style lang="scss" scoped>
:deep(p) {
    margin-top: 1rem;
    margin-bottom: 1rem;
    &:first-child {
        margin-top: 0;
    }
    &:last-child {
        margin-bottom: 0;
    }
}
:deep(ul) {
    list-style: disc;
    padding-left: 1rem;
}
</style>