<template>
    <Application key="mainApplication" :title="t('messageRequests.title')" titleIcon="pi pi-envelope">
        <template #sidebar-list>
            <SidebarListDirectMessages />
        </template>
        <MainHeader>
            <div class="flex pl-4 py-2 pr-2 items-center">
                <span class="pi pi-envelope w-8 text-center text-(--channel-icon)" />
                <h1 class="font-medium text-(--text-strong) mr-2">{{ t('messageRequests.title') }}</h1>
            </div>
        </MainHeader>
        <MainBody>
            <div class="flex flex-col gap-3 px-6 py-4">
                <div v-for="room of invites" :key="room.roomId" class="message-request-item">
                    <AuthenticatedImage :mxcUri="room.avatarUrl" type="thumbnail" :width="48" :height="48" method="scale">
                        <template v-slot="{ src }">
                            <Avatar :image="src" shape="circle" size="large" :aria-label="t('layout.userAvatarImage')" />
                        </template>
                        <template #error>
                            <Avatar :icon="room.heroes.length > 1 ? 'pi pi-users' : 'pi pi-user'" shape="circle" size="large" :aria-label="t('layout.userAvatarImage')" />
                        </template>
                    </AuthenticatedImage>
                    <div class="grow-1">
                        <div>
                            <span class="text-(--text-strong)">{{ room.name || room.displayname }}</span>
                            <time class="text-xs text-(--text-muted) ml-2" :datetime="room.datetime">
                                {{ room.displayTime }}
                            </time>
                        </div>
                        <div class="text-xs text-(--text-muted)">{{ room.heroes.join(', ') }}</div>
                    </div>
                    <Button severity="primary" size="small" :loading="room.loadingJoinRoom" :disabled="room.loadingIgnoreRoom" @click="tryJoinRoom(room.roomId)">
                        <div class="p-button-label">{{ i18nText.acceptDmButton }}</div>
                        <div class="p-button-loading-dots" />
                    </Button>
                    <Button severity="secondary" size="small" :loading="room.loadingIgnoreRoom" :disabled="room.loadingJoinRoom" @click="tryIgnoreRoom(room.roomId)">
                        <div class="p-button-label">{{ i18nText.ignoreButton }}</div>
                        <div class="p-button-loading-dots" />
                    </Button>
                </div>
            </div>
        </MainBody>
    </Application>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'

import { useRooms } from '@/composables/rooms'

import { useProfileStore } from '@/stores/profile'
import { useRoomStore } from '@/stores/room'

import Application from './Layout/Application.vue'
import AuthenticatedImage from '@/views/Common/AuthenticatedImage.vue'
import MainBody from './Layout/MainBody.vue'
import MainHeader from './Layout/MainHeader.vue'
import SidebarListDirectMessages from './Layout/SidebarListDirectMessages.vue'

import Avatar from 'primevue/avatar'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'

const { t } = useI18n()
const router = useRouter()
const toast = useToast()

const { joinRoom, leaveRoom, forgetRoom } = useRooms()

const { profiles } = storeToRefs(useProfileStore())
const roomStore = useRoomStore()
const { invitedDirectMessageRooms } = storeToRefs(roomStore)
const { deleteInvitedRoom } = roomStore

const i18nText = {
    acceptDmButton: t('messageRequests.acceptDmButton'),
    ignoreButton: t('messageRequests.ignoreButton'),
}

const loadingJoinRoomId = ref<string>()
const loadingIgnoreRoomId = ref<string>()

const invites = computed(() => {
    return invitedDirectMessageRooms.value.map((room) => {
        return {
            ...room,
            displayname: room.heroes.map(
                (userId) => profiles.value[userId ?? '']?.displayname ?? userId
            ).filter((displayName) => !!displayName).join(', '),
            datetime: new Date(room.lastMessageTs).toISOString(),
            displayTime: new Date(room.lastMessageTs).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }),
            loadingJoinRoom: loadingJoinRoomId.value === room.roomId,
            loadingIgnoreRoom: loadingIgnoreRoomId.value === room.roomId,
        }
    })
})

async function tryJoinRoom(roomId: string) {
    loadingJoinRoomId.value = roomId
    try {
        const { roomId: joinedRoomId } = await joinRoom(roomId, t('messageRequests.dmJoinReason'))
        router.push({
            name: 'room',
            params: {
                roomId: joinedRoomId,
            }
        })
    } catch (error) {
        toast.add({ severity: 'error', summary: t('messageRequests.joinRoomErrorToast'), life: 5000 })
    } finally {
        loadingJoinRoomId.value = undefined
    }
}

async function tryIgnoreRoom(roomId: string) {
    loadingIgnoreRoomId.value = roomId
    let isError = false
    try {
        await leaveRoom(roomId)
    } catch (error) {
        isError = true
        deleteInvitedRoom(roomId)
    }
    try {
        await forgetRoom(roomId)
    } catch (error) {
        isError = true
        deleteInvitedRoom(roomId)
    }
    if (isError) {
        toast.add({ severity: 'error', summary: t('messageRequests.rejectInviteErrorToast'), life: 5000 })
    }
    loadingIgnoreRoomId.value = undefined

}

</script>

<style lang="scss" scoped>
.message-request-item {
    background: var(--background-mod-subtle);
    border-radius: var(--radius-sm);
    padding: 0.75rem 0.5rem;
    min-height: 3rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
}
</style>