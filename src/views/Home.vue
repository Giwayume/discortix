<template>
    <Application key="mainApplication" :title="t('home.title')" titleIcon="pi pi-users">
        <template #sidebar-list>
            <SidebarListDirectMessages />
        </template>
        <MainHeader>
            <div class="flex px-4 py-2 items-center overflow-hidden w-full">
                <span class="pi pi-users w-8 text-center text-(--channel-icon)" />
                <h1 class="font-medium text-(--text-strong) mr-3">{{ t('home.title') }}</h1>
                <div class="rounded-full w-1 h-1 bg-(--border-subtle) mr-3"></div>
                <div class="flex gap-4">
                    <Button :label="t('home.friendFilters.online')" :aria-pressed="activeTab === 'online'" severity="secondary" variant="text" size="small" @click="activeTab = 'online'" />
                    <Button :label="t('home.friendFilters.all')" :aria-pressed="activeTab === 'all'" severity="secondary" variant="text" size="small" @click="activeTab = 'all'" />
                    <Button :label="t('home.friendFilters.addFriend')" :aria-pressed="activeTab === 'addFriend'" severity="primary" size="small" @click="activeTab = 'addFriend'" />
                </div>
                <Button
                    v-tooltip.bottom="{ value: isTouchEventsDetected ? undefined : t('home.newGroupDm') }"
                    icon="pi pi-comment" severity="secondary" variant="text" class="ml-auto !w-8 !h-8"
                    :aira-label="t('home.newGroupDm')" @click="newMessageDialogVisible = true"
                />
            </div>
        </MainHeader>
        <MainBody>
            <template v-if="activeTab === 'online' || activeTab === 'all'">
                <div class="pt-3 pl-6 pr-4 pb-2">
                    <IconField>
                        <InputIcon class="pi pi-search" />
                        <InputText v-model.trim="searchText" class="w-full" :placeholder="t('home.friendSearchPlaceholder')" :aria-label="t('home.friendSearchPlaceholder')" autocomplete="off" autocorrect="off" autocapitalize="off" />
                        <Button
                            v-if="searchText" icon="pi pi-times-circle" class="!absolute right-1 top-[50%] -translate-y-[50%]"
                            rounded severity="secondary" variant="text" :aria-label="t('home.clearSearchButton')"
                            @click="clearSearchText()"
                        />
                    </IconField>
                </div>
                <h2 class="pt-4 ml-6 mr-5 pb-4 text-(--text-default) text-sm border-b border-(--border-subtle)">
                    {{ activeTab === 'online' ? t('home.onlineFriendCount', onlineFriendCount) : t('home.allFriendCount', allFriendCount) }}
                </h2>
                <div class="px-3 relative -top-[1px]">
                    <template 
                        v-for="(friend, friendIndex) of activeTab === 'online' ? onlineFriends : allFriends"
                        :key="friend.userId"
                    >
                        <div v-if="friendIndex !== 0" class="ml-3 mr-2 border-t border-(--border-subtle)" />
                        <div
                            class="flex h-16 px-3 gap-3 items-center rounded-xs hover:bg-(--background-mod-subtle) cursor-pointer"
                            @click="onClickFriendItem($event, friend)"
                        >
                            <OverlayStatus level="high" :status="friend.presence" class="w-8 h-8">
                                <AuthenticatedImage :mxcUri="friend.avatarUrl" type="thumbnail" :width="48" :height="48" method="scale">
                                    <template v-slot="{ src }">
                                        <Avatar :image="src" shape="circle" size="large" :aria-label="t('layout.userAvatarImage')" />
                                    </template>
                                    <template #error>
                                        <Avatar icon="pi pi-user" shape="circle" size="large" :aria-label="t('layout.userAvatarImage')" />
                                    </template>
                                </AuthenticatedImage>
                            </OverlayStatus>
                            <div class="grow-1">
                                <div class="text-(--text-strong)">{{ friend.displayname ?? friend.userId }}</div>
                                <div class="text-xs text-(--text-muted)">{{ friend.statusMessage ?? t('presence.status.' + friend.presence) }}</div>
                            </div>
                            <Button
                                v-tooltip.top="{ value: isTouchEventsDetected ? undefined : t('home.messageTooltip') }"
                                icon="pi pi-comment" severity="secondary" variant="text" class="ml-auto !w-8 !h-8 !rounded-full"
                                :aira-label="t('home.messageTooltip')"
                                @click="messageFriend(friend)"
                            />
                            <Button
                                v-tooltip.top="{ value: isTouchEventsDetected ? undefined : t('home.moreTooltip') }"
                                icon="pi pi-ellipsis-v" severity="secondary" variant="text" class="ml-auto !w-8 !h-8 !rounded-full"
                                :aira-label="t('home.moreTooltip')"
                                @click="showFriendContextMenu($event, friend)"
                            />
                        </div>
                    </template>
                </div>
                <div v-if="activeTab === 'online' && onlineFriendCount === 0" class="text-sm px-6 py-4 text-(--text-muted)">
                    {{ t('home.noOnlineFriends') }}
                </div>
                <div v-if="activeTab === 'all' && allFriendCount === 0" class="text-sm px-6 py-4 text-(--text-muted)">
                    {{ t('home.noFriends') }}
                </div>
            </template>
            <template v-else-if="activeTab === 'addFriend'">
                <form class="pt-5 pl-7 pr-7 pb-5 border-b border-(--border-subtle)" novalidate @submit.prevent="tryAddFriend">
                    <h2 class="text-xl font-semibold text-(--text-strong) mb-2">{{ t('home.addFriendHeading') }}</h2>
                    <label for="home-add-friend-username-input">{{ t('home.addFriendLabel') }}</label>
                    <div class="relative mt-4">
                        <InputText v-model="addFriendUsername" id="home-add-friend-username-input" class="w-full h-13 !pr-30" :placeholder="t('home.addFriendPlaceholder')" @input="addFriendStatus = undefined" />
                        <Button type="submit" :loading="isAdding" size="small" class="!absolute right-3 top-[50%] -translate-y-[50%]">
                            <span class="p-button-label">{{ t('home.addFriendButton') }}</span>
                            <span class="p-button-loading-dots" />
                        </Button>
                    </div>
                    <Message v-if="addFriendStatus === 'error'" severity="error" size="small" variant="simple" class="mt-2">
                        {{ t('home.friendRequestFailedDescription') }}
                    </Message>
                    <Message v-if="addFriendStatus === 'success'" severity="success" size="small" variant="simple" class="mt-2">
                        <div v-html="micromark(t('home.friendRequestSuccess', { displayname: addedFriendDisplayname }))" />
                    </Message>
                </form>
                <Dialog
                    v-model:visible="addFriendFailedDialogVisible"
                    modal
                    :header="t('home.friendRequestFailedTitle')"
                    :style="{ width: 'calc(100% - 1rem)', maxWidth: '24rem' }"
                >
                    <p>{{ t('home.friendRequestFailedDescription') }}</p>
                    <template #footer>
                        <Button class="w-full" :label="t('home.okayButton')" @click="addFriendFailedDialogVisible = false" />
                    </template>
                </Dialog>
                <div class="pt-5 pl-7 pr-7 pb-5">
                    <h2 class="text-xl font-semibold text-(--text-strong) mb-2">{{ t('home.otherPlacesMakeFriendsHeading') }}</h2>
                    <p class="leading-5 mb-6">{{ t('home.otherPlacesMakeFriendsDescription') }}</p>
                    <Button severity="secondary" variant="outlined" class="max-w-full !h-13 !px-[0.625rem] !py-2" @click="router.push({ name: 'discover' })">
                        <div class="flex items-center justify-center rounded-sm w-9 h-9 bg-(--green-360)">
                            <span class="pi pi-compass" aria-hidden="true" />
                        </div>
                        <span class="p-button-label">{{ t('home.exploreSpacesButton') }}</span>
                        <span class="pi pi-chevron-right ml-4 mr-2" aria-hidden="true" />
                    </Button>
                </div>
            </template>
        </MainBody>
    </Application>
    <NewMessageDialog v-model:visible="newMessageDialogVisible" />
    <Dialog
        v-model:visible="removeFriendConfirmDialogVisible"
        modal
        :header="t('home.removeFriendConfirm.title', { displayname: contextMenuSelectedFriend?.displayname ?? contextMenuSelectedFriend?.userId })"
        :style="{ width: 'calc(100% - 1rem)', maxWidth: '24rem' }"
    >
        <p>{{ t('home.removeFriendConfirm.subtitle', { displayname: contextMenuSelectedFriend?.displayname ?? contextMenuSelectedFriend?.userId }) }}</p>
        <template #footer>
            <Button class="basis-1 grow-1" severity="secondary" autofocus :label="t('home.removeFriendConfirm.cancelButton')" @click="removeFriendConfirmDialogVisible = false" />
            <Button class="basis-1 grow-1" severity="danger" :label="t('home.removeFriendConfirm.removeFriendButton')" @click="confirmRemoveFriend" />
        </template>
    </Dialog>
    <ContextMenu ref="contextMenu" :model="contextMenuItems" @hide="onHideContextMenu">
        <template #item="{ item, props }">
            <a class="p-contextmenu-item-link" v-bind="props.action">
                <span class="p-contextmenu-item-label" :class="item.labelClass">{{ item.label }}</span>
            </a>
        </template>
    </ContextMenu>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { micromark } from 'micromark'

import { snakeCaseApiRequest } from '@/utils/zod'

import { useAccountData } from '@/composables/account-data'
import { useApplication } from '@/composables/application'

import { useAccountDataStore } from '@/stores/account-data'
import { useProfileStore } from '@/stores/profile'
import { useRoomStore } from '@/stores/room'
import { useSessionStore } from '@/stores/session'

import Application from './Layout/Application.vue'
import AuthenticatedImage from './Common/AuthenticatedImage.vue'
import MainBody from './Layout/MainBody.vue'
import MainHeader from './Layout/MainHeader.vue'
const NewMessageDialog = defineAsyncComponent(() => import('@/views/Layout/NewMessageDialog.vue'))
import OverlayStatus from './Common/OverlayStatus.vue'
import SidebarListDirectMessages from './Layout/SidebarListDirectMessages.vue'

import Avatar from 'primevue/avatar'
import Button from 'primevue/button'
import ContextMenu from 'primevue/contextmenu'
import Dialog from 'primevue/dialog'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import vTooltip from 'primevue/tooltip'

import type {
    EventInvalidDiscortixFriendsContent,
    UserProfile,
} from '@/types'

const { t } = useI18n()
const router = useRouter()
const { addFriend, removeFriend, setAccountDataByType, toggleRoomVisibility } = useAccountData()
const { isTouchEventsDetected } = useApplication()

const { accountData, hiddenRooms } = storeToRefs(useAccountDataStore())
const { profiles } = storeToRefs(useProfileStore())
const { draft: draftRoom, joined: joinedRooms, invited: invitedRooms } = storeToRefs(useRoomStore())
const { userId: sessionUserId } = storeToRefs(useSessionStore())

const activeTab = ref<'online' | 'all' | 'addFriend'>('online')
const isAdding = ref<boolean>(false)
const addFriendUsername = ref<string>('')
const addFriendStatus = ref<'success' | 'error'>()
const addedFriendDisplayname = ref<string>()
const addFriendFailedDialogVisible = ref<boolean>(false)
const removeFriendConfirmDialogVisible = ref<boolean>(false)
const newMessageDialogVisible = ref<boolean>(false)

watch(() => activeTab.value, () => {
    if (!isAdding.value) {
        addFriendUsername.value = ''
        addFriendStatus.value = undefined
        addedFriendDisplayname.value = undefined
        addFriendFailedDialogVisible.value = false
        removeFriendConfirmDialogVisible.value = false
    }
})

const allFriends = computed<UserProfile[]>(() => {
    const searchTerms = searchText.value.toLowerCase().split(/\s+/)
    return ((accountData.value['invalid.discortix.friends'] as EventInvalidDiscortixFriendsContent)?.friends.map((userId) => {
        return profiles.value[userId] ?? {
            userId,
            currentlyActive: false,
            presence: 'offline',
        } as UserProfile
    }) ?? []).filter((friend) => {
        let allTermsFound = true
        const displayname = friend.displayname?.toLowerCase()
        const userId = (friend.userId.replace(/^@/, '').split(':')[0]!).toLowerCase()
        for (const searchTerm of searchTerms) {
            if (
                (!displayname || !displayname.includes(searchTerm))
                && (!userId || !userId.includes(searchTerm))
            ) {
                allTermsFound = false
                break
            }
        }
        return allTermsFound
    })
})

const onlineFriends = computed<UserProfile[]>(() => {
    return allFriends.value.filter((profile) => profile.presence === 'online' || profile.presence === 'unavailable')
})

const allFriendCount = computed(() => {
    return allFriends.value.length
})

const onlineFriendCount = computed(() => {
    return onlineFriends.value.length
})

function onClickFriendItem(event: MouseEvent, friend: UserProfile) {
    if (!(event.target as HTMLElement)?.closest('.p-button')) {
        messageFriend(friend)
    }
}

async function tryAddFriend() {
    isAdding.value = true
    try {
        const userId = await addFriend(addFriendUsername.value)
        addFriendStatus.value = 'success'
        addedFriendDisplayname.value = profiles.value[userId]?.displayname ?? userId
    } catch (error) {
        addFriendFailedDialogVisible.value = true
        addFriendStatus.value = 'error'
    } finally {
        isAdding.value = false
        addFriendUsername.value = ''
    }
}

async function tryRemoveFriend(friend: UserProfile) {
    removeFriend(friend.userId)
}

function messageFriend(friend: UserProfile) {

    // See if there is an existing joined room and navigate to it.
    for (const roomId in joinedRooms.value) {
        const room = joinedRooms.value[roomId]
        if (!room) continue
        if (room.accountData['m.tag']?.tags?.['m.server_notice']) continue
        const roomUserIds = new Set<string>((room.stateEventsByType['m.room.member'] ?? [])
            .filter((memberEvent) => (
                (memberEvent.content.membership === 'join' && memberEvent.sender !== sessionUserId.value)
                || (memberEvent.content.membership === 'invite') && memberEvent.stateKey !== sessionUserId.value))
            .map((memberEvent) => memberEvent.content.membership === 'invite' ? memberEvent.stateKey ?? memberEvent.sender : memberEvent.sender))
        if (roomUserIds.size !== 1) continue
        if (!roomUserIds.has(friend.userId)) continue
        if (hiddenRooms.value[roomId]) {
            toggleRoomVisibility(roomId, true)
        }
        router.push({
            name: 'room',
            params: { roomId },
        })
        return
    }

    // See if there is an existing invited room and navigate to it.
    for (const roomId in invitedRooms.value) {
        const room = invitedRooms.value[roomId]
        if (!room) continue
        const roomUserIds = new Set<string>((room.stateEventsByType['m.room.member'] ?? [])
            .filter((memberEvent) => (
                (memberEvent.content.membership === 'join' && memberEvent.sender !== sessionUserId.value)
                || (memberEvent.content.membership === 'invite') && memberEvent.stateKey !== sessionUserId.value))
            .map((memberEvent) => memberEvent.content.membership === 'invite' ? memberEvent.stateKey ?? memberEvent.sender : memberEvent.sender))
        if (roomUserIds.size !== 1) continue
        if (!roomUserIds.has(friend.userId)) continue
        if (hiddenRooms.value[roomId]) {
            toggleRoomVisibility(roomId, true)
        }
        router.push({
            name: 'room',
            params: { roomId },
        })
        return
    }

    draftRoom.value = {
        invited: [friend.userId],
    }
    router.push({
        name: 'create-room',
    })
}

/*----------*\
|            |
|   Search   |
|            |
\*----------*/

const searchText = ref<string>('')

function clearSearchText() {
    if (searchText.value !== '') {
        searchText.value = ''
    }
}

/*----------------*\
|                  |
|   Context Menu   |
|                  |
\*----------------*/

const contextMenu = ref<InstanceType<typeof ContextMenu>>()
const contextMenuSelectedFriend = ref<UserProfile>()
const contextMenuTarget = ref<HTMLElement>()
const contextMenuItems = ref([
    // TODO - video/voice calls
    /*
    {
        label: t('home.contextMenu.startVideoCall'),
    },
    {
        label: t('home.contextMenu.startVoiceCall'),
    },
    */
    {
        labelClass: 'text-(--text-feedback-critical)',
        label: t('home.contextMenu.removeFriend'),
        command() {
            if (!contextMenuSelectedFriend.value) return
            removeFriendConfirmDialogVisible.value = true
        }
    },  
])

let resetContextMenuTargetTimeoutHandle: number | undefined = undefined
function onHideContextMenu() {
    clearTimeout(resetContextMenuTargetTimeoutHandle)
    resetContextMenuTargetTimeoutHandle = setTimeout(() => {
        contextMenuTarget.value = undefined
    }, 200)
}

function showFriendContextMenu(event: MouseEvent, friend: UserProfile) {
    contextMenuSelectedFriend.value = friend
    if (contextMenuTarget.value === event.target) {
        contextMenu.value?.hide()
    } else {
        clearTimeout(resetContextMenuTargetTimeoutHandle)
        contextMenu.value?.show(event)
    }
    contextMenuTarget.value = event.target as HTMLElement
}

function confirmRemoveFriend() {
    if (!contextMenuSelectedFriend.value) return
    tryRemoveFriend(contextMenuSelectedFriend.value)
    removeFriendConfirmDialogVisible.value = false
}

</script>