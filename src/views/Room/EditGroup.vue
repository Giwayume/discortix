<template>
    <Dialog
        :visible="visible"
        modal
        :draggable="false"
        :header="t('editGroup.title')"
        :style="{ width: 'calc(100% - 1rem)', maxWidth: '30rem' }"
        @update:visible="(visible) => emit('update:visible', visible)"
    >
        <Message v-if="!room" severity="error" variant="simple">
            {{ t('editGroup.groupNotFound') }}
        </Message>
        <template v-else>
            <div class="edit-group__edit-avatar-button mx-auto mt-2" tabindex="0" role="button" :aria-label="t('editGroup.editRoomAvatar')" @click="editGroupIcon">
                <Avatar v-if="newAvatarObjectUrl" :image="newAvatarObjectUrl" shape="circle" class="p-avatar-full" :aria-label="t('editGroup.roomAvatar')" />
                <AuthenticatedImage v-else :mxcUri="roomAvatarUrl" type="thumbnail" :width="96" :height="96" method="scale">
                    <template v-slot="{ src }">
                        <Avatar :image="src" shape="circle" class="p-avatar-full" :aria-label="t('editGroup.roomAvatar')" />
                    </template>
                    <template #error>
                        <Avatar
                            icon="pi pi-users"
                            shape="circle"
                            class="p-avatar-full"
                            :style="{ '--p-avatar-icon-size': '3rem', '--p-avatar-background': 'var(--background-surface-highest)', '--p-avatar-color': 'var(--background-mod-normal)' }"
                            :aria-label="t('layout.userAvatarImage')"
                        />
                    </template>
                </AuthenticatedImage>
                <div class="flex items-center justify-center absolute -top-1 -right-1 w-10 h-10 bg-(--background-mod-subtle) rounded-full border-4 border-(--background-surface-high)">
                    <span class="pi pi-pencil" aria-hidden="true" />
                </div>
            </div>
            <form :id="'edit-group-form-' + uuid" class="pt-6 pb-2" @submit.prevent="save">
                <InputText v-model="newRoomName" :placeholder="roomNamePlaceholder" :disabled="isSaving" :aria-label="t('editGroup.groupName')" class="w-full" />
            </form>
        </template>
        <template #footer>
            <template v-if="room">
                <Button :label="t('editGroup.cancelButton')" severity="secondary" class="grow-1 basis-1" @click="emit('update:visible', false)" />
                <Button type="submit" :form="'edit-group-form-' + uuid" severity="primary" class="grow-1 basis-1" :loading="isSaving">
                    <span class="p-button-label">{{ t('editGroup.saveButton') }}</span>
                    <div class="p-button-loading-dots" />
                </Button>
            </template>
        </template>
    </Dialog>
    <EditGroupIcon v-model:visible="editGroupIconVisible" @iconSelected="onIconSelected" />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { v4 as uuidv4 } from 'uuid'

import { InvalidFileError } from '@/utils/error'

import { createMediaInfo, createLazyMediaUpload } from '@/composables/media'
import { useRooms } from '@/composables/rooms'

import { useAccountDataStore } from '@/stores/account-data'
import { useProfileStore } from '@/stores/profile'
import { useRoomStore } from '@/stores/room'
import { useSessionStore } from '@/stores/session'

import AuthenticatedImage from '@/views/Common/AuthenticatedImage.vue'
import EditGroupIcon from '@/views/Room/EditGroupIcon.vue'

import Avatar from 'primevue/avatar'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import { useToast } from 'primevue/usetoast'

import type { EventRoomAvatarContent, EventRoomNameContent } from '@/types'

const { t } = useI18n()
const toast = useToast()
const uuid = uuidv4()

const { sendStateEvent } = useRooms()

const { userNicknames } = storeToRefs(useAccountDataStore())
const { profiles } = storeToRefs(useProfileStore())
const { joined: joinedRooms } = storeToRefs(useRoomStore())
const { userId: currentUserId } = storeToRefs(useSessionStore())

const props = defineProps({
    visible: {
        type: Boolean,
        default: false,
    },
    roomId: {
        type: String,
        required: true,
    }
})

const emit = defineEmits<{
    (e: 'update:visible', visible: boolean): void
}>()

const roomAvatarUrl = ref<string | undefined>()
const newAvatarBlob = ref<Blob | undefined>()
const newAvatarObjectUrl = ref<string | undefined>()
const currentRoomName = ref<string>('')
const newRoomName = ref<string>('')
const isSaving = ref<boolean>(false)

const room = computed(() => {
    return joinedRooms.value[props.roomId]
})

const roomNamePlaceholder = computed(() => {
    if (!room.value) return ''
    return (room.value.stateEventsByType['m.room.member']?.filter((member) => {
        return (member.content.membership === 'join' || member.content.membership === 'invite') && member.stateKey && member.stateKey != currentUserId.value
    }).map((member) => {
        const userId = (member.content.membership === 'join' ? member.sender : member.stateKey) ?? ''
        return userNicknames.value[userId] ?? profiles.value[userId]?.displayname ?? member.content.displayname ?? userId
    }) ?? []).slice(0, 5).join(', ')
})

watch(() => props.visible, (visible, wasVisible) => {
    if (visible && !wasVisible) {
        isSaving.value = false
        if (room.value) {
            roomAvatarUrl.value = room.value.stateEventsByType['m.room.avatar']?.[0]?.content?.url
            currentRoomName.value = room.value.stateEventsByType['m.room.name']?.[0]?.content?.name ?? ''
            newRoomName.value = currentRoomName.value
        } else {
            roomAvatarUrl.value = undefined
            currentRoomName.value = ''
            newRoomName.value = ''
        }
        newAvatarBlob.value = undefined
        newAvatarObjectUrl.value = undefined
    }
    if (!visible && wasVisible) {
        if (newAvatarObjectUrl.value) {
            URL.revokeObjectURL(newAvatarObjectUrl.value)
            newAvatarObjectUrl.value = undefined
        }
    }
})

const editGroupIconVisible = ref<boolean>(false)

function editGroupIcon() {
    if (isSaving.value) return
    editGroupIconVisible.value = true
}

function onIconSelected(iconBlob: Blob) {
    newAvatarBlob.value = iconBlob
    if (newAvatarObjectUrl.value) {
        URL.revokeObjectURL(newAvatarObjectUrl.value)
        newAvatarObjectUrl.value = undefined
    }
    newAvatarObjectUrl.value = URL.createObjectURL(iconBlob)
}

async function save() {

    try {
        if (newRoomName.value !== currentRoomName.value) {
            isSaving.value = true

            await sendStateEvent<EventRoomNameContent>(props.roomId, 'm.room.name', '', {
                name: newRoomName.value,
            })

        }
        if (newAvatarBlob.value) {
            isSaving.value = true

            let avatarUpload = createLazyMediaUpload()
            let mediaInfo = await createMediaInfo(newAvatarBlob.value)
            if (mediaInfo.type !== 'image') {
                throw new InvalidFileError('Media is not a recognized image type.')
            }

            const avatarMxcUri = await avatarUpload.useBlob(newAvatarBlob.value)

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

        }
    } catch (error) {
        if (error instanceof InvalidFileError) {
            toast.add({ severity: 'error', summary: t('editGroupIcon.unrecognizedImageTypeToast'), life: 5000 })
        } else {
            toast.add({ severity: 'error', summary: t('editGroup.saveErrorToast'), life: 5000 })
        }
    } finally {
        isSaving.value = false
    }

    emit('update:visible', false)
}

</script>

<style lang="scss" scoped>
.edit-group__edit-avatar-button {
    position: relative;
    width: 7.5rem;
    height: 7.5rem;
    cursor: pointer;

    .pi {
        color: var(--text-muted);
    }

    &:hover {
        .pi {
            color: var(--text-strong);
        }

        .p-avatar {
            --p-avatar-background: var(--background-mod-normal) !important;
        }
    }
}
</style>
