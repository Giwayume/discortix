<template>
    <Dialog
        :visible="visible"
        modal
        :draggable="false"
        :header="t('addSpaceDialog.title')"
        :style="{ width: 'calc(100% - 1rem)', maxWidth: '30rem' }"
        :pt="{
            title: {
                class: 'text-center w-full pl-2',
            }
        }"
        @update:visible="(visible) => emit('update:visible', visible)"
    >
        <p class="text-center">{{ t('addSpaceDialog.description') }}</p>
        <img
            v-if="avatarPreviewObjectUrl"
            class="upload-avatar-preview"
            :src="avatarPreviewObjectUrl"
            :alt="t('addSpaceDialog.avatarPreviewImage')"
            @click="pickAvatar"
        >
        <button v-else class="upload-avatar-select" @click="pickAvatar">
            <span class="pi pi-camera" aria-hidden="true" />
            {{ t('addSpaceDialog.uploadIcon') }}
        </button>
        <form :id="'add-space-dialog-form-' + uuid" novalidate @submit.prevent="submit">
            <div class="p-staticlabel flex flex-col mb-2">
                <label :for="'space-name-' + uuid" class="text-strong pb-2">{{ t('addSpaceDialog.spaceName') }}</label>
                <InputText :id="'space-name-' + uuid" v-model="spaceName" required />
            </div>
            <div class="flex items-center gap-2 my-4">
                <label :for="'public-toggle-' + uuid" class="text-strong">{{ t('addSpaceDialog.publicToggle') }}</label>
                <ToggleSwitch v-model="isPublic" :inputId="'public-toggle-' + uuid" />
            </div>
        </form>
        <template #footer>
            <div class="flex justify-between w-full">
                <button class="link text-strong" @click="emit('update:visible', false)">
                    {{ t('addSpaceDialog.backButton') }}
                </button>
                <Button
                    :form="'add-space-dialog-form-' + uuid"
                    :disabled="spaceName.trim().length === 0"
                    :loading="isCreatingRoom"
                    type="submit"
                >
                    <div class="p-button-label">{{ t('addSpaceDialog.createButton') }}</div>
                    <div class="p-button-loading-dots" />
                </Button>
            </div>
        </template>
    </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { v4 as uuidv4 } from 'uuid'

import { pickFile } from '@/utils/file-access'

import { createMediaInfo, createLazyMediaUpload } from '@/composables/media'
import { useRooms } from '@/composables/rooms'

import { useProfileStore } from '@/stores/profile'
import { useSessionStore } from '@/stores/session'

import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import ToggleSwitch from 'primevue/toggleswitch'
import { useToast } from 'primevue/usetoast'

import type {
    ApiV3RoomCreateRequest,
    EventRoomAvatarContent,
    MediaInfo,
} from '@/types'

const { t } = useI18n()
const router = useRouter()
const toast = useToast()

const { userId: sessionUserId } = storeToRefs(useSessionStore())
const { authenticatedUserDisplayName } = storeToRefs(useProfileStore())

const { createRoom, sendStateEvent } = useRooms()

const uuid = uuidv4()

const props = defineProps({
    visible: {
        type: Boolean,
        default: false,
    },
})

const emit = defineEmits<{
    (e: 'update:visible', visible: boolean): void
}>()

const spaceName = ref<string>('')
const avatarFile = ref<File | null>(null)
const avatarPreviewObjectUrl = ref<string>('')
const isPublic = ref<boolean>(false)
const isCreatingRoom = ref<boolean>(false)

const defaultSpaceName = computed(() => {
    return t('addSpaceDialog.defaultSpaceName', {
        username: authenticatedUserDisplayName.value || sessionUserId.value
    })
})

watch(() => props.visible, (visible, wasVisible) => {
    if (visible && !wasVisible) {
        spaceName.value = defaultSpaceName.value
        avatarFile.value = null
        avatarPreviewObjectUrl.value = ''
        isPublic.value = false
        isCreatingRoom.value = false
    } else if (!visible && wasVisible) {
        if (avatarPreviewObjectUrl.value) {
            URL.revokeObjectURL(avatarPreviewObjectUrl.value)
            avatarPreviewObjectUrl.value = ''
        }
    }
})

async function pickAvatar() {
    avatarFile.value = await pickFile({ multiple: false })
    const mediaInfo = await createMediaInfo(avatarFile.value)
    if (mediaInfo.type !== 'image') {
        avatarFile.value = null
        if (avatarPreviewObjectUrl.value) {
            URL.revokeObjectURL(avatarPreviewObjectUrl.value)
            avatarPreviewObjectUrl.value = ''
        }
        return
    }
    if (avatarPreviewObjectUrl.value) {
        URL.revokeObjectURL(avatarPreviewObjectUrl.value)
    }
    avatarPreviewObjectUrl.value = URL.createObjectURL(avatarFile.value)
}

async function submit() {
    isCreatingRoom.value = true
    
    try {

        const createRoomRequest: ApiV3RoomCreateRequest = {
            creation_content: {
                type: 'm.space',
            },
            initial_state: [],
            name: spaceName.value,
            preset: isPublic.value ? 'public_chat' : 'private_chat',
            visibility: isPublic.value ? 'public' : 'private',
        }

        let createdRoomId: string | undefined = undefined
        let avatarUpload: ReturnType<typeof createLazyMediaUpload> | undefined = undefined
        let mediaInfo: MediaInfo | undefined = undefined
        let avatarMxcUri: string | undefined = undefined

        uploadGroupAvatar:
        if (avatarFile.value) {
            avatarUpload = createLazyMediaUpload()

            mediaInfo = await createMediaInfo(avatarFile.value)
            if (mediaInfo.type !== 'image') break uploadGroupAvatar

            avatarMxcUri = await avatarUpload.useBlob(avatarFile.value)

            createRoomRequest.initial_state?.push({
                type: 'm.room.avatar',
                state_key: '',
                content: {
                    url: avatarMxcUri,
                    info: mediaInfo.info,
                },
            })
        }

        try {
            ({ roomId: createdRoomId } = await createRoom(createRoomRequest))
        } catch (error) {
            avatarUpload?.discard()
            throw error
        }

        try {
            // A new MXC URI can be assigned if waited too long to upload.
            const newAvatarMxcUri = await avatarUpload?.upload()
            if (newAvatarMxcUri) {
                await sendStateEvent<EventRoomAvatarContent>(
                    createdRoomId, 'm.room.avatar', '', {
                        url: newAvatarMxcUri,
                        info: mediaInfo?.type === 'image' ? mediaInfo.info : undefined,
                    }
                )   
            }
        } catch (error) { /* Ignore - user can try again later. */ }

        router.push({
            name: 'room',
            params: { roomId: createdRoomId },
        })
    } catch (error) {
        toast.add({ severity: 'error', summary: t('addSpaceDialog.errorCreatingSpaceToast'), life: 5000 })
    } finally {
        isCreatingRoom.value = false
    }

    emit('update:visible', false)
}

</script>

<style scoped>
.upload-avatar-preview {
    display: block;
    width: 5rem;
    height: 5rem;
    border-radius: 5rem;
    margin: 1.5rem auto 1rem auto;
    text-indent: -9999px;
    cursor: pointer;
}
.upload-avatar-select {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;
    background: transparent;
    width: 5rem;
    height: 5rem;
    color: var(--interactive-text-default);
    border: 0.125rem dashed currentColor;
    border-radius: 5rem;
    margin: 1.5rem auto 1rem auto;
    text-transform: uppercase;
    font-size: 0.75rem;
    font-weight: bold;
    cursor: pointer;

    &::before {
        content: '+';
        box-sizing: content-box;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-strong);
        position: absolute;
        top: -0.25rem;
        right: -0.25rem;
        background: var(--control-primary-background-default);
        width: 1.5rem;
        height: 1.5rem;
        border-radius: 50%;
        font-size: 1rem;
        font-weight: normal;
        border: 0.125rem solid var(--background-surface-high);
    }

    .pi {
        font-size: 1.5rem;
    }
}
</style>