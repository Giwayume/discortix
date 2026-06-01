<template>
    <h2 class="text-strong text-xl">
        {{ t('roomSettings.menu.spaceProfile') }}
    </h2>
    <p class="text-sm mt-2">
        {{ t('roomSettings.spaceProfile.summary') }}
    </p>
    <div v-if="loadErrorMessage" class="px-3 py-2">
        <Message severity="error" size="small" variant="simple">
            <template #icon>
                <span class="pi pi-exclamation-circle !text-xs !leading-3 -mt-[1px]" aria-hidden="true" />
            </template>
            {{ loadErrorMessage }}
        </Message>
    </div>
    <ProgressBar v-if="loading" mode="indeterminate" class="my-4" />
    <div v-else class="h-9" />
    <div class="mt-1 mb-10">
        <label for="room-settings-space-profile-name" class="block text-strong pb-2">
            {{ t('roomSettings.spaceProfile.nameLabel') }}
        </label>
        <InputText
            id="room-settings-space-profile-name"
            v-model.trim="roomName"
            class="w-full"
            maxlength="255"
            :disabled="loading"
            @input="hasUnsavedChanges = true"
        />
    </div>
    <div class="border-t border-(--border-strong)" />
    <div class="flex flex-row my-10 items-center">
        <div class="grow-1 shrink-1">
            <h3 class="block text-strong">
                {{ t('roomSettings.spaceProfile.iconLabel') }}
            </h3>
            <p class="text-subtle text-sm my-2">
                {{ t('roomSettings.spaceProfile.iconInstructions') }}
            </p>
            <div class="flex gap-2">
                <Button :label="t('roomSettings.spaceProfile.changeIconButton')" size="small" @click="pickIcon" />
                <Button :label="t('roomSettings.spaceProfile.removeIconButton')" size="small" severity="secondary" class="text-feedback-critical!" @click="removeIcon" />
            </div>
        </div>
        <div class="grow-0 shrink-0">
            <img v-if="roomIconPreviewUrl" :src="roomIconPreviewUrl" class="w-18! h-18! rounded-md">
            <div
                v-else-if="roomIconFile === null || !defaultRoomAvatarUrl"
                class="flex items-center justify-center w-18! h-18! rounded-md bg-(--background-surface-highest)"
            >
                <span
                    class="pi pi-user"
                    style="--p-icon-size: 2rem"
                    aria-hidden="true"
                />
            </div>
            <AuthenticatedImage v-else-if="defaultRoomAvatarUrl" :mxc-uri="defaultRoomAvatarUrl">
                <template v-slot="{ src }">
                    <img :src="src" :alt="t('roomSettings.spaceProfile.iconLabel')" class="w-18! h-18! rounded-md">
                </template>
            </AuthenticatedImage>
        </div>
    </div>
    <div class="border-t border-(--border-strong)" />
    <div class="my-10">
        <label for="room-settings-space-profile-description" class="block text-strong">
            {{ t('roomSettings.spaceProfile.descriptionLabel') }}
        </label>
        <p class="text-subtle text-sm my-2">
            {{ t('roomSettings.spaceProfile.descriptionPrompt') }}
        </p>
        <Textarea
            id="room-settings-space-profile-description"
            v-model.trim="roomDescription"
            class="w-full"
            maxlength="255"
            :placeholder="t('roomSettings.spaceProfile.descriptionPlaceholder')"
            :rows="3"
            :disabled="loading"
            @input="hasUnsavedChanges = true"
        />
    </div>
    <SaveChangesFooter :visible="hasUnsavedChanges && !loading" @reset="reset" @save="save" />
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'

import { ZodError } from '@/utils/error'
import { pickFile } from '@/utils/file-access'

import { createLazyMediaUpload, createMediaInfo } from '@/composables/media'
import { useRooms } from '@/composables/rooms'

import { useRoomStore } from '@/stores/room'

import AuthenticatedImage from '@/views/Common/AuthenticatedImage.vue'
import SaveChangesFooter from '@/views/UserSettings/SaveChangesFooter.vue'

import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import ProgressBar from 'primevue/progressbar'
import Textarea from 'primevue/textarea';

import type {
    EventRoomAvatarContent,
    EventRoomNameContent,
    EventRoomTopicContent,
    MediaImageInfo
} from '@/types'

const { t } = useI18n()

const { sendStateEvent } = useRooms()

const { joined: joinedRooms } = storeToRefs(useRoomStore())

const props = defineProps({
    roomId: {
        type: String,
        default: undefined,
    }
})

const loading = ref<boolean>(false)
const loadError = ref<Error | undefined>()
const hasUnsavedChanges = ref<boolean>(false)
const roomName = ref<string>('')
const roomDescription = ref<string>('')
const roomIconFile = ref<File | null | undefined>() // null means remove the icon
const roomIconPreviewUrl = ref<string>()
const roomIconMediaInfo = ref<MediaImageInfo>()

const loadErrorMessage = computed<string | undefined>(() => {
    if (!loadError.value) return
    if (loadError.value instanceof ZodError) {
        return t('errors.schemaValidation')
    }
    return t('roomSettings.spaceProfile.error.unknown')
})

const defaultRoomName = computed(() => {
    return joinedRooms.value[props.roomId!]?.stateEventsByType['m.room.name']?.[0]?.content.name ?? ''
})

const defaultRoomDescription = computed(() => {
    return joinedRooms.value[props.roomId!]?.stateEventsByType['m.room.topic']?.[0]?.content.topic ?? ''
})

const defaultRoomAvatarUrl = computed(() => {
    return joinedRooms.value[props.roomId!]?.stateEventsByType['m.room.avatar']?.[0]?.content.url ?? ''
})

onMounted(() => {
    reset()
})

async function pickIcon() {
    try {
        const file = await pickFile({ multiple: false })
        if (!file) return
        if (roomIconPreviewUrl.value) {
            URL.revokeObjectURL(roomIconPreviewUrl.value)
            roomIconPreviewUrl.value = undefined
        }
        const mediaInfo = await createMediaInfo(file, true, 512)
        if (mediaInfo.type === 'image') {
            roomIconFile.value = file
            roomIconPreviewUrl.value = URL.createObjectURL(roomIconFile.value)
            roomIconMediaInfo.value = mediaInfo
            hasUnsavedChanges.value = true
        }
    } catch (error) {
        roomIconFile.value = undefined
        roomIconMediaInfo.value = undefined
    }
}

async function removeIcon() {
    roomIconFile.value = null
    roomIconPreviewUrl.value = undefined
    roomIconMediaInfo.value = undefined
    hasUnsavedChanges.value = true
}

async function reset() {
    hasUnsavedChanges.value = false
    roomName.value = defaultRoomName.value
    roomDescription.value = defaultRoomDescription.value
    roomIconFile.value = undefined
    roomIconMediaInfo.value = undefined
    if (roomIconPreviewUrl.value) {
        URL.revokeObjectURL(roomIconPreviewUrl.value)
        roomIconPreviewUrl.value = undefined
    }
}

async function save() {
    if (!props.roomId) return
    loading.value = true
    loadError.value = undefined
    try {
        if (roomName.value !== defaultRoomName.value) {
            await sendStateEvent<EventRoomNameContent>(props.roomId, 'm.room.name', '', {
                name: roomName.value,
            })
        }
        if (roomDescription.value !== defaultRoomDescription.value) {
            await sendStateEvent<EventRoomTopicContent>(props.roomId, 'm.room.topic', '', {
                topic: roomDescription.value,
            })
        }
        if (roomIconFile.value !== undefined) {
            if (roomIconFile.value == null) {
                await sendStateEvent<EventRoomAvatarContent>(props.roomId, 'm.room.avatar', '', {
                    info: undefined,
                    url: undefined,
                })
            } else {
                const mediaUpload = createLazyMediaUpload()
                const mxcUri = await mediaUpload.useBlob(
                    roomIconMediaInfo.value?.thumbnailBlob || roomIconFile.value
                )
                try {
                    await sendStateEvent<EventRoomAvatarContent>(props.roomId, 'm.room.avatar', '', {
                        info: roomIconMediaInfo.value?.info?.thumbnailInfo || roomIconMediaInfo.value?.info,
                        url: mxcUri,
                    })
                    await mediaUpload.upload()
                } catch (error) {
                    await mediaUpload.discard()
                }
            }
        }
        reset()
    } catch (error) {
        if (error instanceof Error) {
            loadError.value = error
        } else {
            loadError.value = new Error('A non-error object was thrown.')
        }
    } finally {
        loading.value = false
    }
}

</script>