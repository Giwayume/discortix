<template>
    <div class="my-16 mx-auto max-w-174">
        <section class="px-3 py-2">
            <div class="mb-6">
                <h2 class="text-2xl leading-6 font-normal mb-1 text-(--text-strong)">{{ t('userSettings.encryption.identityHeading') }}</h2>
                <p class="text-sm text-(--text-subtle)">{{ t('userSettings.encryption.identityDescription') }}</p>
            </div>
            <template v-if="identityVerificationRequired">
                <Message severity="error" variant="simple" class="my-6">
                    <template #icon>
                        <span class="pi pi-exclamation-circle !text-md !leading-3 -mt-[1px] mr-1" aria-hidden="true" />
                    </template>
                    {{ t('userSettings.encryption.identityVerificationRequired') }}
                </Message>
                <Button severity="danger" size="small" @click="identityVerificationDialogVisible = true">
                    <span class="pi pi-key !text-sm" aria-hidden="true" />
                    <span class="p-button-label">{{ t('userSettings.encryption.verifyIdentityButton') }}</span>
                </Button>
                <IdentityVerificationDialog v-model:visible="identityVerificationDialogVisible" />
            </template>
            <template v-else>
                <Button severity="secondary" size="small">
                    <span class="pi pi-key !text-sm" aria-hidden="true" />
                    <span class="p-button-label">{{ t('userSettings.encryption.changeIdentityRecoveryKeyButton') }}</span>
                </Button>
            </template>
        </section>
        <div class="border-t border-(--border-subtle) my-10 mx-3" />
        <section class="px-3 py-2">
            <div class="mb-6">
                <h2 class="text-2xl leading-6 font-normal mb-1 text-(--text-strong)">{{ t('userSettings.encryption.roomKeysHeading') }}</h2>
                <p class="text-sm text-(--text-subtle)">{{ t('userSettings.encryption.roomKeysDescription') }}</p>
            </div>
            <div class="flex flex-wrap gap-2">
                <Button severity="secondary" size="small" @click="exportRoomKeysDialogVisible = true">
                    <span class="pi pi-download !text-sm" aria-hidden="true" />
                    <span class="p-button-label">{{ t('userSettings.encryption.exportRoomKeysButton') }}</span>
                </Button>
                <ExportRoomKeysDialog v-model:visible="exportRoomKeysDialogVisible" />
                <Button severity="secondary" size="small" @click="importRoomKeysDialogVisible = true">
                    <span class="pi pi-upload !text-sm" aria-hidden="true" />
                    <span class="p-button-label">{{ t('userSettings.encryption.importRoomKeysButton') }}</span>
                </Button>
                <ImportRoomKeysDialog v-model:visible="importRoomKeysDialogVisible" />
            </div>
        </section>
        <div class="border-t border-(--border-subtle) my-10 mx-3" />
        <section class="px-3 py-2">
            <div class="mb-6">
                <h2 class="text-2xl leading-6 font-normal mb-1 text-(--text-strong)">{{ t('userSettings.encryption.deviceKeysHeading') }}</h2>
                <p class="text-sm text-(--text-subtle)">{{ t('userSettings.encryption.deviceKeysDescription') }}</p>
            </div>
            <template v-if="deviceNeedsDeletion">
                <Message severity="error" variant="simple" class="my-6">
                    <template #icon>
                        <span class="pi pi-exclamation-circle !text-md !leading-3 -mt-[1px] mr-1" aria-hidden="true" />
                    </template>
                    {{ t('userSettings.encryption.deviceKeyNeedsReset') }}
                </Message>
                <Button severity="danger" size="small" @click="olmAccountMissingDialogVisible = true">
                    <span class="pi pi-refresh !text-sm" aria-hidden="true" />
                    <span class="p-button-label">{{ t('userSettings.encryption.resetDeviceButton') }}</span>
                </Button>
                <OlmAccountMissingDialog v-model:visible="olmAccountMissingDialogVisible" />
            </template>
            <template v-else-if="vodozemacInitFailed">
                <Message severity="error" variant="simple">
                    <template #icon>
                        <span class="pi pi-exclamation-circle !text-md !leading-3 -mt-[1px] mr-1" aria-hidden="true" />
                    </template>
                    {{ t('userSettings.encryption.unableToGenerateDeviceKeys') }}
                </Message>
            </template>
            <template v-else-if="identityVerificationRequired">
                {{ t('userSettings.encryption.deviceKeysNeedsIdentityVerification') }}
            </template>
            <div v-else-if="currentDeviceHasKeys" class="flex gap-2 items-center">
                <span class="pi pi-check-circle text-(--text-feedback-positive)" aria-hidden="true" />
                {{ t('userSettings.encryption.deviceHasKeys') }}
            </div>
            <div v-else>
                <Button severity="secondary" size="small" :loading="isGeneratingDeviceKeys" @click="tryGenerateDeviceKeys()">
                    <span class="pi pi-key !text-sm" aria-hidden="true" />
                    <div class="p-button-label">{{ t('userSettings.encryption.generateDeviceKeysButton') }}</div>
                    <div class="p-button-loading-dots" />
                </Button>
                <Message v-if="isGenerateDeviceKeysError" severity="error" variant="simple" size="small" class="mt-4">
                    <template #icon>
                        <span class="pi pi-exclamation-circle !text-xs !leading-3 -mt-[1px]" aria-hidden="true" />
                    </template>
                    {{ t('userSettings.encryption.generateDeviceKeysError') }}
                </Message>
            </div>
        </section>
        <div class="border-t border-(--border-subtle) my-10 mx-3" />
        <section class="px-3 py-2">
            <div class="mb-6">
                <h2 class="text-2xl leading-6 font-normal mb-1 text-(--text-strong)">{{ t('userSettings.encryption.warningsHeader') }}</h2>
            </div>
            <div class="flex mb-6 gap-6">
                <div class="grow-1">
                    <label
                        for="user-settings-encryption-unencrypted-warning-toggle"
                        class="text-md mb-1 text-(--text-strong)"
                    >{{ t('userSettings.encryption.warnUnencryptedMessage') }}</label>
                    <p class="text-sm text-(--text-subtle)">{{ t('userSettings.encryption.warnUnencryptedMessageDescription') }}</p>
                </div>
                <div class="shrink-1">
                    <ToggleSwitch id="user-settings-encryption-unencrypted-warning-toggle" v-model="settings.warnUnencryptedMessageInEncryptedRoom" />
                </div>
            </div>
        </section>
    </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'

import { useCryptoKeys } from '@/composables/crypto-keys'

import { useClientSettingsStore } from '@/stores/client-settings'
import { useCryptoKeysStore } from '@/stores/crypto-keys'

const ExportRoomKeysDialog = defineAsyncComponent(() => import('@/views/EncryptionSetup/ExportRoomKeysDialog.vue'))
const IdentityVerificationDialog = defineAsyncComponent(() => import('@/views/EncryptionSetup/IdentityVerificationDialog.vue'))
const ImportRoomKeysDialog = defineAsyncComponent(() => import('@/views/EncryptionSetup/ImportRoomKeysDialog.vue'))
const OlmAccountMissingDialog = defineAsyncComponent(() => import('@/views/EncryptionSetup/OlmAccountMissingDialog.vue'))

import Button from 'primevue/button'
import Message from 'primevue/message'
import ToggleSwitch from 'primevue/toggleswitch'

const { t } = useI18n()
const { generateDeviceKeys } = useCryptoKeys()
const { settings } = useClientSettingsStore()
const {
    identityVerificationRequired,
    vodozemacInitFailed,
    deviceNeedsDeletion,
    olmAccount,
} = storeToRefs(useCryptoKeysStore())

const exportRoomKeysDialogVisible = ref<boolean>(false)
const identityVerificationDialogVisible = ref<boolean>(false)
const importRoomKeysDialogVisible = ref<boolean>(false)
const olmAccountMissingDialogVisible = ref<boolean>(false)

const currentDeviceHasKeys = computed(() => {
    return !!olmAccount.value
})

const isGeneratingDeviceKeys = ref<boolean>(false)
const isGenerateDeviceKeysError = ref<boolean>(false)
async function tryGenerateDeviceKeys() {
    if (isGeneratingDeviceKeys.value) return
    isGenerateDeviceKeysError.value = false
    isGeneratingDeviceKeys.value = true
    try {
        await generateDeviceKeys()
    } catch (error) { /* Ignore */ } finally {
        isGeneratingDeviceKeys.value = false
    }
    if (!currentDeviceHasKeys.value) {
        isGenerateDeviceKeysError.value = true
    }
}

</script>