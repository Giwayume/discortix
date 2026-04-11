<template>
    <Dialog
        :visible="visible"
        modal
        :header="t('olmAccountMissingDialog.title')"
        :style="{ width: 'calc(100% - 1rem)', maxWidth: '30rem' }"
        @update:visible="(visible) => emit('update:visible', visible)"
    >
        <template v-if="step === 'introduction'">
            <p class="text-muted">{{ t('olmAccountMissingDialog.description') }}</p>
        </template>
        <template v-else-if="step === 'exportKeys'">
            <div class="text-feedback-critical mt-4">{{ t('olmAccountMissingDialog.beforeResetWarning') }}</div>
            <div class="border-t border-(--border-subtle) my-4" />
            <h2 class="text-lg text-strong">{{ t('olmAccountMissingDialog.identityRecoveryKeyHeading') }}</h2>
            <p class="text-muted">{{ t('olmAccountMissingDialog.identityRecoveryKeyWarning') }}</p>
            <div class="border-t border-(--border-subtle) my-4" />
            <h2 class="text-lg text-strong">{{ t('olmAccountMissingDialog.roomKeysHeading') }}</h2>
            <p class="text-muted">{{ t('olmAccountMissingDialog.roomKeysBackupWarning') }}</p>
            <Button severity="secondary" size="small" class="mt-4" @click="exportRoomKeysDialogVisible = true">
                <span class="pi pi-download !text-sm" aria-hidden="true" />
                <span class="p-button-label">{{ t('olmAccountMissingDialog.exportRoomKeysButton') }}</span>
            </Button>
            <ExportRoomKeysDialog v-model:visible="exportRoomKeysDialogVisible" />
            <div class="border-t border-(--border-subtle) my-4" />
        </template>
        <template #footer>
            <Button severity="secondary" @click="emit('update:visible', false)">{{ t('olmAccountMissingDialog.doNotResetButton') }}</Button>
            <template v-if="step === 'introduction'">
                <Button severity="danger" @click="step = 'exportKeys'">{{ t('olmAccountMissingDialog.resetButton') }}</Button>
            </template>
            <template v-else-if="step === 'exportKeys'">
                <Button severity="danger" @click="resetDevice">{{ t('olmAccountMissingDialog.continueResetButton') }}</Button>
            </template>
        </template>
    </Dialog>
    <DeleteDeviceDialog ref="deleteDeviceDialog" v-model:visible="deleteDeviceDialogVisible" @success="onDeleteDeviceSuccess" />
</template>

<script setup lang="ts">
import { defineAsyncComponent, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'

import { useLogout } from '@/composables/logout'
import { useSessionStore } from '@/stores/session'

const DeleteDeviceDialog = defineAsyncComponent(() => import('@/views/UserSettings/DeleteDeviceDialog.vue'))
const ExportRoomKeysDialog = defineAsyncComponent(() => import('@/views/EncryptionSetup/ExportRoomKeysDialog.vue'))

import Button from 'primevue/button'
import Dialog from 'primevue/dialog'

const { t } = useI18n()
const { logout } = useLogout()
const { deviceId: sessionDeviceId } = storeToRefs(useSessionStore())

const props = defineProps({
    visible: {
        type: Boolean,
        default: false,
    },
})
watch(() => props.visible, (visible, wasVisible) => {
    if (visible && !wasVisible) {
        step.value = 'introduction'
    }
})

const emit = defineEmits<{
    (e: 'update:visible', visible: boolean): void
}>()

const step = ref<string>('introduction')

const deleteDeviceDialog = ref<InstanceType<typeof DeleteDeviceDialog>>()
const deleteDeviceDialogVisible = ref<boolean>(false)

const exportRoomKeysDialogVisible = ref<boolean>(false)

async function resetDevice() {
    if (!sessionDeviceId.value) return
    deleteDeviceDialog.value?.show({ deviceId: sessionDeviceId.value })
}

function onDeleteDeviceSuccess() {
    sessionDeviceId.value = undefined
    logout()
}

</script>
