<template>
    <Dialog
        :visible="visible"
        modal
        :header="t('deviceVerificationRequest.title')"
        :style="{ width: 'calc(100% - 1rem)', maxWidth: '30rem' }"
        @update:visible="(visible) => emit('update:visible', visible)"
    >
        <template v-if="verificationErrorMessage">
            {{ verificationErrorMessage }}
        </template>
        <template v-else-if="verificationStatus === 'ready' || verificationStatus === 'requested'">
            <div v-html="micromark(t('deviceVerificationRequest.sendingRequestInstructions'))" />
            <ProgressBar mode="indeterminate" class="mt-8 mb-4" />
        </template>
        <template v-else-if="verificationStatus === 'start'">
            <template v-if="verificationSasEmoji.length > 0">
                <p class="text-subtle">{{ t('deviceVerificationResponse.emojiVerificationInstructions') }}</p>
                <div class="flex flex-wrap justify-center items-center gap-x-10 gap-y-4 my-4">
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
            <p v-if="hasSentMac">{{ t('deviceVerificationRequest.verificationSent') }}</p>
        </template>
        <template v-else-if="verificationStatus === 'noMatch'">
            <div v-html="micromark(t('deviceVerificationRequest.noMatchDisclaimer'))" />
        </template>
        <template v-else-if="verificationStatus === 'requestSecrets'">
            {{ t('deviceVerificationRequest.requestSecrets') }}
            <ProgressBar mode="indeterminate" class="mt-8 mb-4" />
        </template>
        <template v-else-if="verificationStatus === 'done'">
            <div class="flex flex-col items-center mt-11 mb-7">
                <span class="pi pi-check-circle text-feedback-positive text-6xl!" aria-hidden="true" />
                <p>{{ t('deviceVerificationRequest.done') }}</p>
            </div>
        </template>
        <template v-else>
            {{ t('deviceVerificationRequest.errors.unknown') }}
        </template>
        <template #footer>
            <Button
                v-if="verificationStatus === 'start' && !hasSentMac"
                severity="secondary"
                :label="t('deviceVerificationRequest.sasNoMatchButton')"
                @click="cancelWithNoMatch()"
            />
            <Button
                v-else-if="verificationStatus === 'canceled' || verificationStatus === 'ignored' || verificationStatus === 'done'"
                :label="t('deviceVerificationRequest.okButton')"
                @click="dismissModal()"
            />
            <Button
                v-else
                severity="secondary"
                :label="t('deviceVerificationRequest.cancelButton')"
                @click="dismissModal()"
            />
            <Button
                v-if="verificationStatus === 'requested'"
                severity="primary"
                :label="t('deviceVerificationRequest.resendRequestButton')"
                @click="resendRequest()"
            />
            <Button
                v-if="verificationStatus === 'start' && !hasSentMac"
                severity="primary"
                :loading="isSendingMac"
                @click="sendMac()"
            >
                <span class="p-button-label">{{ t('deviceVerificationRequest.sasMatchButton') }}</span>
                <span class="p-button-loading-dots" />
            </Button>
        </template>
    </Dialog>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
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
    EventKeyVerificationStartSasv1ContentSchema,
    type ApiV3SyncToDeviceEvent,
    type EventKeyVerificationAcceptContent,
    type EventKeyVerificationCancelContent,
    type EventKeyVerificationDoneContent,
    type EventKeyVerificationKeyContent,
    type EventKeyVerificationMacContent,
    type EventKeyVerificationReadyContent,
    type EventKeyVerificationRequestContent,
    type EventKeyVerificationStartContent,
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
})

const emit = defineEmits<{
    (e: 'update:visible', visible: boolean): void
    (e: 'success'): void
}>()

const verificationRequestTimeoutTime = 600000 // 10 minutes
let verificationRequestTimeout: number | undefined = undefined
const verificationStatus = ref<'requested' | 'ready' | 'start' | 'noMatch' | 'ignored' | 'canceled' | 'requestSecrets' | 'done'>('requested')
const verificationSasDecimals = ref<string>('')
const verificationSasEmoji = ref<SasEmoji[]>([])
const verificationError = ref<Error | null>(null)
const otherDeviceIds = ref<string[]>([])
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
    sas?: Sas;
    establishedSas?: EstablishedSas;
}
const transactions = ref<Record<string, VerificationTransaction>>({})

const verificationErrorMessage = computed<string | null>(() => {
    if (!verificationError.value) return null
    if (verificationStatus.value === 'requested') {
        if (verificationError.value instanceof HttpError) {
            return t('deviceVerificationRequest.errors.fetchUserKeysError')
        }
    } else if (verificationStatus.value === 'ready') {
        if (verificationError.value instanceof HttpError) {
            return t('deviceVerificationRequest.errors.startFailed')
        }
    } else if (verificationStatus.value === 'ignored') {
        return t('deviceVerificationRequest.errors.ignored')
    } else if (verificationStatus.value === 'canceled') {
        return t('deviceVerificationRequest.errors.otherDeviceCanceled')
    }
    if (verificationError.value instanceof NetworkConnectionError) {
        return t('deviceVerificationRequest.errors.serverDown')
    }
    return t('deviceVerificationRequest.errors.unknown')
})

async function request() {
    clearTimeout(verificationRequestTimeout)
    verificationStatus.value = 'requested'
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
    try {
        await fetchUserKeys([sessionUserId.value])
        const userDeviceIds: Array<[string, string]> = []
        const sessionUserDeviceKeys = deviceKeys.value[sessionUserId.value]
        if (!sessionUserDeviceKeys) {
            throw new Error('Missing other device keys')
        }
        const toDeviceRequests: Array<Promise<string>> = []
        for (const deviceId in sessionUserDeviceKeys) {
            if (deviceId === sessionDeviceId.value) continue
            if (sessionUserDeviceKeys[deviceId]?.dehydrated) continue
            otherDeviceIds.value.push(deviceId)
            userDeviceIds.push([sessionUserId.value, deviceId])
            const transactionId = uuidv4()
            transactions.value[transactionId] = {
                toDeviceId: deviceId,
            }
            toDeviceRequests.push(
                sendMessageToDevices([[sessionUserId.value, deviceId]], 'm.key.verification.request', {
                    fromDevice: sessionDeviceId.value!,
                    methods: ['m.sas.v1'],
                    timestamp: Date.now(),
                    transactionId,
                } satisfies EventKeyVerificationRequestContent)
                    .then(() => transactionId)
                    .catch(() => transactionId)
            )
        }
        if (toDeviceRequests.length === 0) throw new Error('Missing other devices')
        const toDeviceResponses = await Promise.allSettled(toDeviceRequests)
        for (const response of toDeviceResponses) {
            if (response.status === 'rejected') {
                delete transactions.value[response.reason]
            }
        }

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

function resendRequest() {
    cancel()
    request()
}

async function ready(event: ApiV3SyncToDeviceEvent) {
    try {
        if (currentTransactionId.value || !sessionDeviceId.value) return
        const eventContent = event.content as EventKeyVerificationReadyContent
        const transaction = transactions.value[eventContent.transactionId!]
        if (!transaction) {
            log.warn('Received a m.key.verification.ready event for an unknown transaction id: ', eventContent.transactionId)
            sendMessageToDevices([[sessionUserId.value!, eventContent.fromDevice]], 'm.key.verification.cancel', {
                code: 'm.unknown_transaction',
                reason: 'Unknown transaction.',
                transactionId: eventContent.transactionId!,
            } satisfies EventKeyVerificationCancelContent)
            return cancelIfNoTransactions()
        }
        if (!eventContent.methods.includes('m.sas.v1')) {
            log.warn('The other device doesn\'t support the transaction methods this app supports. Transaction ID: ', eventContent.transactionId)
            sendMessageToDevices([[sessionUserId.value!, transaction.toDeviceId]], 'm.key.verification.cancel', {
                code: 'm.unknown_method',
                reason: 'Method not supported.',
                transactionId: eventContent.transactionId!,
            } satisfies EventKeyVerificationCancelContent)
            deleteTransaction(eventContent.transactionId)
            return cancelIfNoTransactions()
        }
        if (eventContent.fromDevice !== transaction.toDeviceId) {
            log.warn('The other device had an unexpected from_device id: ', eventContent.fromDevice)
            sendMessageToDevices([[sessionUserId.value!, transaction.toDeviceId]], 'm.key.verification.cancel', {
                code: 'm.unexpected_message',
                reason: 'Transaction ID belongs to a different device.',
                transactionId: eventContent.transactionId!,
            } satisfies EventKeyVerificationCancelContent)
            deleteTransaction(eventContent.transactionId)
            return cancelIfNoTransactions()
        }
        for (const transactionId in Object.keys(transactions.value)) {
            const otherTransaction = transactions.value[transactionId]
            if (transactionId !== eventContent.transactionId && otherTransaction) {
                sendMessageToDevices([[sessionUserId.value!, otherTransaction.toDeviceId]], 'm.key.verification.cancel', {
                    code: 'm.accepted',
                    reason: 'Another device accepted the verification request.',
                    transactionId,
                } satisfies EventKeyVerificationCancelContent)
                deleteTransaction(transactionId)
            }
        }
        clearTimeout(verificationRequestTimeout)
        verificationStatus.value = 'ready'
        await sendMessageToDevices([[sessionUserId.value!, transaction.toDeviceId]], 'm.key.verification.start', {
            fromDevice: sessionDeviceId.value,
            method: 'm.sas.v1',
            transactionId: eventContent.transactionId,
        } satisfies EventKeyVerificationStartContent)
    } catch (error) {
        log.warn('An error occurred when handling a m.key.verification.ready event', error)
        if (error instanceof Error) {
            verificationError.value = error
        } else {
            verificationError.value = new Error('Unknown error')
        }
        cancel()
    }
}

async function start(event: ApiV3SyncToDeviceEvent) {
    try {
        if (currentTransactionId.value) return
        const eventContent = event.content as EventKeyVerificationStartContent
        const transaction = transactions.value[eventContent.transactionId!]
        if (!transaction) {
            log.warn('Received a m.key.verification.start event for an unknown transaction id: ', eventContent.transactionId)
            await sendMessageToDevices([[sessionUserId.value!, eventContent.fromDevice]], 'm.key.verification.cancel', {
                code: 'm.unknown_transaction',
                reason: 'Unknown transaction.',
                transactionId: eventContent.transactionId!,
            } satisfies EventKeyVerificationCancelContent)
            return cancelIfNoTransactions()
        }
        if (eventContent.method !== 'm.sas.v1') {
            log.warn('The other device doesn\'t support the transaction method this app supports. Transaction ID: ', eventContent.transactionId)
            await sendMessageToDevices([[sessionUserId.value!, transaction.toDeviceId]], 'm.key.verification.cancel', {
                code: 'm.unknown_method',
                reason: 'Method not supported.',
                transactionId: eventContent.transactionId!,
            } satisfies EventKeyVerificationCancelContent)
            deleteTransaction(eventContent.transactionId)
            return cancelIfNoTransactions()
        }
        if (eventContent.fromDevice !== transaction.toDeviceId) {
            log.warn('The other device had an unexpected from_device id: ', eventContent.fromDevice)
            await sendMessageToDevices([[sessionUserId.value!, transaction.toDeviceId]], 'm.key.verification.cancel', {
                code: 'm.unexpected_message',
                reason: 'Transaction ID belongs to a different device.',
                transactionId: eventContent.transactionId!,
            } satisfies EventKeyVerificationCancelContent)
            deleteTransaction(eventContent.transactionId)
            return cancelIfNoTransactions()
        }
        const { error, data: eventContentSasv1 } = EventKeyVerificationStartSasv1ContentSchema.safeParse(event.content)
        if (!eventContentSasv1) {
            log.warn('The other device sent a m.sas.v1 start event that did not parse correctly.', error)
            await sendMessageToDevices([[sessionUserId.value!, transaction.toDeviceId]], 'm.key.verification.cancel', {
                code: 'm.invalid_message',
                reason: 'Invalid message syntax received.',
                transactionId: eventContent.transactionId!,
            } satisfies EventKeyVerificationCancelContent)
            deleteTransaction(eventContent.transactionId)
            return cancelIfNoTransactions()
        }
        if (!eventContentSasv1.hashes.includes('sha256')) {
            log.warn('The other device does not support the sha256 hash.')
            await sendMessageToDevices([[sessionUserId.value!, transaction.toDeviceId]], 'm.key.verification.cancel', {
                code: 'm.unknown_method',
                reason: 'Hash sha256 must be supported.',
                transactionId: eventContent.transactionId!,
            } satisfies EventKeyVerificationCancelContent)
            deleteTransaction(eventContent.transactionId)
            return cancelIfNoTransactions()
        }
        if (!eventContentSasv1.keyAgreementProtocols.includes('curve25519-hkdf-sha256')) {
            log.warn('The other device does not support the curve25519-hkdf-sha256 key agreement protocol.')
            await sendMessageToDevices([[sessionUserId.value!, transaction.toDeviceId]], 'm.key.verification.cancel', {
                code: 'm.unknown_method',
                reason: 'Key agreement protocol curve25519-hkdf-sha256 must be supported.',
                transactionId: eventContent.transactionId!,
            } satisfies EventKeyVerificationCancelContent)
            deleteTransaction(eventContent.transactionId)
            return cancelIfNoTransactions()
        }
        if (!eventContentSasv1.messageAuthenticationCodes.includes('hkdf-hmac-sha256.v2')) {
            log.warn('The other device does not support the hkdf-hmac-sha256.v2 key agreement protocol.')
            await sendMessageToDevices([[sessionUserId.value!, transaction.toDeviceId]], 'm.key.verification.cancel', {
                code: 'm.unknown_method',
                reason: 'Message authentication code hkdf-hmac-sha256.v2 must be supported.',
                transactionId: eventContent.transactionId!,
            } satisfies EventKeyVerificationCancelContent)
            deleteTransaction(eventContent.transactionId)
            return cancelIfNoTransactions()
        }

        transaction.sas = new Sas()

        const ephemeralCurvePublicKey = transaction.sas.public_key
        const eventContentCanonicalJson = canonicalJsonStringify(snakeCaseApiRequest(eventContentSasv1), ['signatures', 'unsigned'])

        const ephemeralCurvePublicKeyBytes = new TextEncoder().encode(ephemeralCurvePublicKey)
        const eventContentCanonicalJsonBytes = new TextEncoder().encode(eventContentCanonicalJson)
        const combinedBytes = new Uint8Array(ephemeralCurvePublicKeyBytes.length + eventContentCanonicalJsonBytes.length)
        combinedBytes.set(ephemeralCurvePublicKeyBytes, 0)
        combinedBytes.set(eventContentCanonicalJsonBytes, ephemeralCurvePublicKeyBytes.length)
        const hashBuffer = await crypto.subtle.digest('SHA-256', combinedBytes)
        const commitment = encodeUnpaddedBase64(new Uint8Array(hashBuffer))

        transaction.shortAuthenticationString = eventContentSasv1.shortAuthenticationString.filter((s) => s === 'decimal' || s === 'emoji')

        await sendMessageToDevices([[sessionUserId.value!, transaction.toDeviceId]], 'm.key.verification.accept', {
            commitment,
            hash: 'sha256',
            keyAgreementProtocol: 'curve25519-hkdf-sha256',
            messageAuthenticationCode: 'hkdf-hmac-sha256.v2',
            shortAuthenticationString: transaction.shortAuthenticationString,
            transactionId: eventContent.transactionId,
        } satisfies EventKeyVerificationAcceptContent)

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

async function keyReceived(event: ApiV3SyncToDeviceEvent) {
    try {
        if (currentTransactionId.value) return

        const eventContent = event.content as EventKeyVerificationKeyContent
        const transaction = transactions.value[eventContent.transactionId!]
        if (!transaction) {
            return cancelIfNoTransactions()
        }

        if (!transaction.sas) {
            deleteTransaction(eventContent.transactionId)
            return cancelIfNoTransactions()
        }

        const publicKey = transaction.sas.public_key

        transaction.establishedSas = transaction.sas?.diffie_hellman(eventContent.key)
        if (!transaction.establishedSas) {
            deleteTransaction(eventContent.transactionId)
            return cancelIfNoTransactions()
        }

        await sendMessageToDevices([[sessionUserId.value!, transaction.toDeviceId]], 'm.key.verification.key', {
            key: publicKey,
            transactionId: eventContent.transactionId,
        } satisfies EventKeyVerificationKeyContent)

        const info = `MATRIX_KEY_VERIFICATION_SAS|${event.sender}|${transaction.toDeviceId}|${eventContent.key}|${sessionUserId.value}|${sessionDeviceId.value}|${publicKey}|${eventContent.transactionId}`

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
            return cancelIfNoTransactions()
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

function deleteTransaction(transactionId?: string) {
    const transaction = transactions.value[transactionId!]
    if (!transaction) return
    try {
        transaction.sas?.free()
    } catch { /* Ignore */ }
    try {
        transaction.establishedSas?.free()
    } catch { /* Ignore */ }
    delete transactions.value[transactionId!]
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

function cancel() {
    clearTimeout(verificationRequestTimeout)
    if (!sessionUserId.value) return
    for (const transactionId in transactions.value) {
        const transaction = transactions.value[transactionId]
        if (!transaction) continue
        sendMessageToDevices([[sessionUserId.value!, transaction.toDeviceId]], 'm.key.verification.cancel', {
            code: 'm.user',
            reason: 'User canceled the request.',
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
}

function dismissModal() {
    if (verificationStatus.value === 'done') {
        emit('success')
    }
    emit('update:visible', false)
}

watch(() => props.visible, (visible, wasVisible) => {
    if (visible && !wasVisible) {
        request()
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
    if (event.type === 'm.key.verification.cancel') {
        otherDeviceCancel(event)
    } else if (event.type === 'm.key.verification.done') {
        doneReceived(event)
    } else if (event.type === 'm.key.verification.key') {
        keyReceived(event)
    } else if (event.type === 'm.key.verification.mac') {
        macReceived(event)
    } else if (event.type === 'm.key.verification.ready') {
        ready(event)
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