<template>
    <Dialog
        :visible="props.visible"
        modal
        :draggable="false"
        :header="t('modifyAttachmentDialog.title')"
        :style="{
            width: 'calc(100% - 1rem)',
            maxWidth: '30rem',
        }"
        @update:visible="emit('update:visible', $event)"
    >
        <img v-if="media?.mediaInfo.type === 'image'" :src="media?.previewObjectUrl" class="modify-attachment__media-preview">
        <label for="modify-attachment-filename-input" class="block text-(--text-strong) pb-2">{{ t('modifyAttachmentDialog.filename') }}</label>
        <InputText id="modify-attachment-filename-input" v-model="formData.filename" class="w-full mb-4" />
        <label for="modify-attachment-description-input" class="block text-(--text-strong) pb-2">{{ t('modifyAttachmentDialog.description') }}</label>
        <InputText id="modify-attachment-description-input" v-model="formData.description" :placeholder="t('modifyAttachmentDialog.descriptionPlaceholder')" class="w-full mb-6" />
        <label class="flex items-center mb-2">
            <Checkbox v-model="formData.spoiler" binary />
            <span class="ml-3">{{ t('modifyAttachmentDialog.markSpoiler') }}</span>
        </label>
        <template #footer>
            <Button :label="t('modifyAttachmentDialog.cancelButton')" class="grow-1 basis-1" severity="secondary" @click="emit('update:visible', false)" autofocus />
            <Button :label="t('modifyAttachmentDialog.saveButton')" class="grow-1 basis-1" severity="primary" @click="modifyConfirm()" />
        </template>
    </Dialog>
</template>

<script setup lang="ts">
import { reactive, watch, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'

import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'

import type { MediaInfo, MediaAttachmentPendingUpload } from '@/types'

const { t } = useI18n()

const props = defineProps({
    visible: {
        type: Boolean,
        default: false,
    },
    media: {
        type: Object as PropType<MediaAttachmentPendingUpload>,
        default: undefined,
    }
})

watch(() => props.visible, (visible, wasVisible) => {
    if (visible && !wasVisible) {
        formData.filename = props.media?.filename ?? ''
        formData.description = props.media?.description ?? ''
        formData.spoiler = props.media?.spoiler ?? false
    }
})

const emit = defineEmits<{
    (e: 'update:visible', visible: boolean): void
    (e: 'update:media', media: Pick<MediaAttachmentPendingUpload, 'description' | 'filename' | 'spoiler'>): void
}>()

const formData = reactive({
    filename: '',
    description: '',
    spoiler: false,
})

function modifyConfirm() {
    emit('update:media', {...formData})
    emit('update:visible', false)
}

</script>

<style lang="scss" scoped>
.modify-attachment__media-preview {
    height: auto;
    margin-inline-start: 1rem;
    margin-block: 1rem;
    max-height: 150px;
    max-width: calc(100% - 2rem);
    object-fit: contain;
    object-position: left;
    width: min-content;
}
</style>