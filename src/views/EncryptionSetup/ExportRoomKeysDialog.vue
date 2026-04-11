<template>
    <Dialog
        :visible="visible"
        modal
        :header="t('exportRoomKeysDialog.title')"
        :style="{ width: 'calc(100% - 1rem)', maxWidth: '30rem' }"
        @update:visible="(visible) => emit('update:visible', visible)"
    >
        <p class="text-muted" v-html="micromark(t('exportRoomKeysDialog.subtitle'))" />
        <form id="export-room-keys-dialog-form" novalidate @submit.prevent="submit">
            <div class="p-staticlabel grow-1 flex flex-col gap-2 mt-5 mb-5">
                <label for="export-room-keys-backup-passphrase-entry" class="text-strong">{{ t('exportRoomKeysDialog.passphrase') }}</label>
                <InputText
                    id="export-room-keys-backup-passphrase-entry"
                    v-model.trim="formData.passphrase"
                    type="password"
                    :invalid="v$.passphrase.$invalid && v$.$dirty"
                    required
                    class="grow-1"
                    autocomplete="off"
                />
                <Message v-if="(v$.passphrase.$invalid && v$.$dirty)" severity="error" size="small" variant="simple">
                    <template #icon>
                        <span class="pi pi-exclamation-circle !text-xs !leading-3 -mt-[1px]" aria-hidden="true" />
                    </template>
                    <template v-if="v$.passphrase.required.$invalid">
                        {{ t('exportRoomKeysDialog.passphraseRequired') }}
                    </template>
                    <template v-else>
                        {{ t('exportRoomKeysDialog.passphraseInvalid') }}
                    </template>
                </Message>
            </div>
        </form>
        <template #footer>
            <Button severity="secondary" @click="emit('update:visible', false)">{{ t('exportRoomKeysDialog.cancelButton') }}</Button>
            <Button form="export-room-keys-dialog-form" type="submit">
                {{ t('exportRoomKeysDialog.exportButton') }}
            </Button>
        </template>
    </Dialog>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { micromark } from 'micromark'

import { useVuelidate } from '@vuelidate/core'
import { required } from '@vuelidate/validators'

import { downloadFile } from '@/utils/file-access'
import { encryptMegolmKeyFile } from '@/utils/megolm-export'

import { useMegolmStore } from '@/stores/megolm'
import { useSessionStore } from '@/stores/session'

import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'

const { t } = useI18n()
const { generateMegolmBackup } = useMegolmStore()
const { userId: sessionUserId } = storeToRefs(useSessionStore())

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

watch(() => props.visible, (visible, wasVisible) => {
    if (visible && !wasVisible) {
        formData.passphrase = ''
        v$.value.$reset()
    }
})

const formData = reactive({
    passphrase: '',
})

const formRules = {
    passphrase: {
        required,
        invalid: () => !passphraseInvalid.value,
    },
}

const v$ = useVuelidate(formRules, formData)

const passphraseInvalid = ref<boolean>(false)

async function submit() {
    passphraseInvalid.value = false

    if (!await v$.value.$validate()) return

    const keys = generateMegolmBackup()
    const file = await encryptMegolmKeyFile(JSON.stringify(keys), formData.passphrase)
    downloadFile(new Blob([file]), t('exportRoomKeysDialog.backupFilename', { userId: sessionUserId.value?.replace(/^@/, '').split(':')[0] }))

    emit('update:visible', false)
    emit('success')
}

</script>

<style lang="scss" scoped>
:deep(p) {
    strong {
        color: var(--text-strong);
    }
}
</style>