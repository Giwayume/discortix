<template>
    <Dialog
        :visible="props.visible"
        modal
        :draggable="false"
        :header="t('editGroupIcon.title')"
        :style="{ width: 'calc(100% - 1rem)', maxWidth: '30rem' }"
        @update:visible="(visible) => emit('update:visible', visible)"
    >
        <template v-if="uploadingAvatar">
            <ProgressBar mode="indeterminate"></ProgressBar>
        </template>
        <div v-else class="flex justify-center items-center">
            <div
                role="button"
                tabindex="0"
                class="flex flex-col justify-center items-center bg-(--background-mod-normal) hover:bg-(--background-mod-subtle) rounded-md w-53 h-54 text-(--interactive-text-default) hover:text-(--interactive-text-hover) cursor-pointer"
                @click="selectFile"
            >
                <span class="pi pi-image mb-2" :style="{ '--p-icon-size': '1.5rem' }" aria-hidden="true" />
                <span class="text-sm font-semibold">{{ t('editGroupIcon.uploadImage') }}</span>
            </div>
        </div>
    </Dialog>
    <CropAvatarImageDialog v-model:visible="cropImageDialogVisible" :file="cropImageFile" @apply="apply" />
</template>

<script setup lang="ts">
import { defineAsyncComponent, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { InvalidFileError } from '@/utils/error'
import { pickFile } from '@/utils/file-access'

import { createMediaInfo, createLazyMediaUpload } from '@/composables/media'
import { useRooms } from '@/composables/rooms'

const CropAvatarImageDialog = defineAsyncComponent(() => import('@/views/Common/CropAvatarImageDialog.vue'))

import Dialog from 'primevue/dialog'
import ProgressBar from 'primevue/progressbar'
import { useToast } from 'primevue/usetoast'

import type { EventRoomAvatarContent } from '@/types'

const toast = useToast()
const { sendStateEvent } = useRooms()

const props = defineProps({
    visible: {
        type: Boolean,
        default: false,
    },
    roomId: {
        type: String,
        default: undefined,
    }
})

const emit = defineEmits<{
    (e: 'update:visible', visible: boolean): void
    (e: 'iconSelected', imageBlob: Blob): void
}>()

const { t } = useI18n()

const cropImageDialogVisible = ref<boolean>(false)
const cropImageFile = ref<File>()
const uploadingAvatar = ref<boolean>(true)

watch(() => props.visible, (visible, wasVisible) => {
    if (visible && !wasVisible) {
        cropImageFile.value = undefined
        uploadingAvatar.value = false
        cropImageDialogVisible.value = false
    }
})

function selectFile() {
    pickFile({ multiple: false }).then((file) => {
        cropImageFile.value = file
        cropImageDialogVisible.value = true
    }).catch(() => {
        // Ignore cancelation
    })
}

async function apply(imageBlob: Blob) {
    if (props.roomId) {
        uploadingAvatar.value = true
        try {
            let avatarUpload = createLazyMediaUpload()
            let mediaInfo = await createMediaInfo(imageBlob)
            if (mediaInfo.type !== 'image') {
                throw new InvalidFileError('Media is not a recognized image type.')
            }

            const avatarMxcUri = await avatarUpload.useBlob(imageBlob)

            try {
                await sendStateEvent<EventRoomAvatarContent>(props.roomId, 'm.room.avatar', '', {
                    url: avatarMxcUri,
                    info: mediaInfo?.type === 'image' ? mediaInfo.info : undefined,
                })
                await avatarUpload.upload()
            } catch (error) {
                avatarUpload.discard()
                throw error
            }

        } catch (error) {
            if (error instanceof InvalidFileError) {
                toast.add({ severity: 'error', summary: t('editGroupIcon.unrecognizedImageTypeToast'), life: 5000 })
            } else {
                toast.add({ severity: 'error', summary: t('editGroupIcon.mediaUploadErrorToast'), life: 5000 })
            }
        } finally {
            uploadingAvatar.value = false
        }
    }
    emit('iconSelected', imageBlob)
    emit('update:visible', false)
}

</script>
