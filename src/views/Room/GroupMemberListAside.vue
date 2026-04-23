<template>
    <div class="w-[16.5625rem]">
        <ScrollPanel>
            <template v-for="(memberList, memberListIndex) of [joinedMemberItems, invitedMemberItems]" :key="memberListIndex">
                <h2 v-if="memberList.length > 0" class="pt-5 pl-4 pr-1 pb-1 text-(--channels-default) text-nowrap text-sm">
                    <template v-if="memberListIndex === 0">
                        {{ t('room.groupMemberListAside.memberCountHeading', { count: memberList.length }) }}
                    </template>
                    <template v-else>
                        {{ t('room.groupMemberListAside.inviteCountHeading', { count: memberList.length }) }}
                    </template>
                </h2>
                <div
                    v-if="memberList.length > 0"
                    :style="{
                        '--p-menu-item-focus-background': 'var(--background-mod-subtle)',
                    }"
                    class="p-menu mx-2 !min-w-auto"
                >
                    <div class="p-menu-list" role="navigation">
                        <template v-for="item of memberList" :key="item.key">
                            <div
                                class="p-menu-item"
                                role="presentation"
                            >
                                <div class="p-menu-item-content">
                                    <div
                                        role="button"
                                        class="p-menu-item-link px-2! py-1!"
                                        @pointerdown="(event) => onPointerDownMember(event, item)"
                                        @pointerup="(event) => onPointerUpMember(event, item)"
                                        @contextmenu="(event) => onContextMenuMember(event, item)"
                                    >
                                        <span class="p-menu-item-label flex gap-3 max-w-full">
                                            <OverlayStatus level="lowest" :status="item.presence" :invisible="item.isGroup" class="w-8 h-8">
                                                <AuthenticatedImage :mxcUri="item.avatarUrl" type="thumbnail" :width="48" :height="48" method="scale">
                                                    <template v-slot="{ src }">
                                                        <Avatar :image="src" shape="circle" size="large" :aria-label="t('layout.userAvatarImage')" />
                                                    </template>
                                                    <template #error>
                                                        <Avatar icon="pi pi-user" shape="circle" size="large" :aria-label="t('layout.userAvatarImage')" />
                                                    </template>
                                                </AuthenticatedImage>
                                            </OverlayStatus>
                                            <div class="flex flex-col justify-center overflow-hidden">
                                                <div class="overflow-hidden text-nowrap text-ellipsis leading-5 -mb-[2px]">{{ item.displayname ?? item.label }}</div>
                                                <div
                                                    v-if="item.statusMessage"
                                                    v-tooltip.top="{ value: isTouchEventsDetected ? undefined : item.statusMessage }"
                                                    class="overflow-hidden text-nowrap text-ellipsis text-xs leading-4 -mt-[2px]"
                                                >{{ item.statusMessage }}</div>
                                            </div>
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </template>
                    </div>
                </div>
            </template>
        </ScrollPanel>
    </div>
    <ContextMenu ref="memberContextMenu" :model="memberContextMenuItems">
        <template #item="{ item, props }">
            <a class="p-contextmenu-item-link" v-bind="props.action">
                <span class="p-contextmenu-item-label" :class="item.labelClassName">
                    {{ item.label }}
                    <span v-if="item.subtitle" class="block text-xs text-muted">{{ item.subtitle }}</span>
                </span>
                <span v-if="item.icon" :class="item.icon" class="ml-auto px-1 text-subtle" aria-hidden="true" />
                <i v-if="item.items" class="pi pi-angle-right ml-auto"></i>
            </a>
        </template>
    </ContextMenu>
    <Dialog
        v-model:visible="removeFriendDialogVisible"
        modal
        :draggable="false"
        :style="{ width: 'calc(100% - 1rem)', maxWidth: '30rem' }"
    >
        <template #header>
            <div class="p-dialog-title">
                {{ t('userProfilePopover.removeFriendConfirm.title') }}
            </div>
        </template>
        <p v-html="micromark(t('userProfilePopover.removeFriendConfirm.subtitle', { displayname: memberContextMenuTargetDisplayname }))" />
        <template #footer>
            <Button :label="t('userProfilePopover.removeFriendConfirm.cancelButton')" class="grow-1 basis-1" severity="secondary" @click="removeFriendDialogVisible = false" autofocus />
            <Button :label="t('userProfilePopover.removeFriendConfirm.removeButton')" class="grow-1 basis-1" severity="danger" @click="removeFriend(memberContextMenuTargetUserId!); removeFriendDialogVisible = false" />
        </template>
    </Dialog>
    <AddUserNicknameDialog v-model:visible="addUserNicknameDialogVisible" :userId="memberContextMenuTargetUserId" />
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { micromark } from 'micromark'

import { useApplication } from '@/composables/application'
import { useAccountData } from '@/composables/account-data'
import { useRooms } from '@/composables/rooms'

import { useAccountDataStore } from '@/stores/account-data'
import { useClientSettingsStore } from '@/stores/client-settings'
import { useProfileStore } from '@/stores/profile'
import { useRoomStore } from '@/stores/room'
import { useSessionStore } from '@/stores/session'

const AddUserNicknameDialog = defineAsyncComponent(() => import('@/views/Room/AddUserNicknameDialog.vue'))
import AuthenticatedImage from '@/views/Common/AuthenticatedImage.vue'
import OverlayStatus from '@/views/Common/OverlayStatus.vue'

import Avatar from 'primevue/avatar'
import Button from 'primevue/button'
import ContextMenu from 'primevue/contextmenu'
import Dialog from 'primevue/dialog'
import ScrollPanel from 'primevue/scrollpanel'
import vTooltip from 'primevue/tooltip'
import { useToast } from 'primevue/usetoast'
import type { MenuItem, MenuItemCommandEvent } from 'primevue/menuitem'

import type { EventInvalidDiscortixFriendsContent } from '@/types'

const { t } = useI18n()
const toast = useToast()

const { isTouchEventsDetected } = useApplication()
const { addFriend, removeFriend } = useAccountData()
const { createOrJoinRoomWithUsers } = useRooms()

const { accountData, userNicknames } = storeToRefs(useAccountDataStore())
const { settings } = useClientSettingsStore()
const { profiles } = storeToRefs(useProfileStore())
const { currentRoomPermissions, joined: joinedRooms } = storeToRefs(useRoomStore())
const { userId: sessionUserId } = storeToRefs(useSessionStore())

const props = defineProps({
    roomId: {
        type: String,
        required: true,
    },
})

const emit = defineEmits<{
    (e: 'mentionUserId', userId: string): void
    (e: 'showUserProfile', event: Event, userId: string): void
}>()

const room = computed(() => {
    return joinedRooms.value[props.roomId]
})

/*----------------*\
|                  |
|   Member Lists   |
|                  |
\*----------------*/

const joinedMemberItems = computed<MenuItem[]>(() => {
    const items: MenuItem[] = []
    if (room.value) {
        const joinedUserIds = new Set((room.value.stateEventsByType['m.room.member'] ?? [])
            .filter((memberEvent) => memberEvent.content?.membership === 'join')
            .map((memberEvent) => memberEvent.sender))
        for (const userId of joinedUserIds) {
            const profile = profiles.value[userId]
            items.push({
                key: userId,
                label: userId,
                displayname: userNicknames.value[userId] ?? profile?.displayname ?? userId,
                avatarUrl: profile?.avatarUrl,
                presence: profile?.presence,
                statusMessage: profile?.statusMessage,
            })
        }
    }
    items.sort((a, b) => {
        if (a.displayname < b.displayname) return -1
        if (a.displayname > b.displayname) return 1
        return 0
    })
    return items
})

const invitedMemberItems = computed<MenuItem[]>(() => {
    const items: MenuItem[] = []
    if (room.value) {
        const joinedUserIds = new Set((room.value.stateEventsByType['m.room.member'] ?? [])
            .filter((memberEvent) => memberEvent.content?.membership === 'invite')
            .map((memberEvent) => memberEvent.stateKey))
        for (const userId of joinedUserIds) {
            if (!userId) continue
            const profile = profiles.value[userId]
            items.push({
                key: userId,
                label: userId,
                displayname: userNicknames.value[userId] ?? profile?.displayname ?? userId,
                avatarUrl: profile?.avatarUrl,
                presence: profile?.presence,
                statusMessage: profile?.statusMessage,
            })
        }
    }
    items.sort((a, b) => {
        if (a.displayname < b.displayname) return -1
        if (a.displayname > b.displayname) return 1
        return 0
    })
    return items
})

/*-------------------*\
|                     |
|   Click on Member   |
|                     |
\*-------------------*/

let pointerDownMemberItem: MenuItem | undefined = undefined
let pointerDownMemberItemX: number = 0
let pointerDownMemberItemY: number = 0
let pointerDownMemberTimestamp: number = 0

function onPointerDownMember(event: PointerEvent, item: MenuItem) {
    pointerDownMemberItem = item
    pointerDownMemberItemX = event.pageX
    pointerDownMemberItemY = event.pageY
    pointerDownMemberTimestamp = window.performance.now()
}

function onPointerUpMember(event: PointerEvent, item: MenuItem) {
    // "Click" / "Tap" simulation. Need to do this because of the Safari "double tap with hover states" issue.
    if (
        item === pointerDownMemberItem
        && event.button === 0
        && item.key
        && window.performance.now() - pointerDownMemberTimestamp <= 500
        && Math.abs(event.pageX - pointerDownMemberItemX) < 8
        && Math.abs(event.pageY - pointerDownMemberItemY) < 8
    ) {
        emit('showUserProfile', event, item.key)
    }
}

function onContextMenuMember(event: MouseEvent, item: MenuItem) {
    event.preventDefault()
    if (!item.key) return
    memberContextMenuTargetUserId.value = item.key
    memberContextMenu.value?.show(event)
}

/*------------------------------*\
|                                |
|   Context Menu Actions State   |
|                                |
\*------------------------------*/

const addUserNicknameDialogVisible = ref<boolean>(false)
const removeFriendDialogVisible = ref<boolean>(false)

/*-----------------------*\
|                         |
|   Member Context Menu   |
|                         |
\*-----------------------*/

const memberContextMenuTargetUserId = ref<string>()
const memberContextMenuTargetDisplayname = computed<string>(() => {
    if (!memberContextMenuTargetUserId.value) return ''
    const userId = memberContextMenuTargetUserId.value
    return userNicknames.value[userId] ?? profiles.value[userId]?.displayname ?? userId
})

const memberContextMenu = ref<InstanceType<typeof ContextMenu>>()
const memberContextMenuItems = computed(() => {
    const contextMenuItems: MenuItem[] = []
    const isOtherUser = memberContextMenuTargetUserId.value !== sessionUserId.value
    contextMenuItems.push({
        key: 'profile',
        label: t('room.groupMemberListAside.contextMenu.profile'),
        command: runMemberContextMenuCommand,
    })
    contextMenuItems.push({
        key: 'mention',
        label: t('room.groupMemberListAside.contextMenu.mention'),
        command: runMemberContextMenuCommand,
    })
    if (isOtherUser) {
        contextMenuItems.push({
            key: 'message',
            label: t('room.groupMemberListAside.contextMenu.message'),
            command: runMemberContextMenuCommand,
        })
        // contextMenuItems.push({
        //     key: 'startCall',
        //     label: t('room.groupMemberListAside.contextMenu.startCall'),
        //     command: runMemberContextMenuCommand,
        // })
        contextMenuItems.push({
            key: 'addNote',
            label: t('room.groupMemberListAside.contextMenu.addNote'),
            subtitle: t('room.groupMemberListAside.contextMenu.addNoteSubtitle'),
            command: runMemberContextMenuCommand,
        })
        if (userNicknames.value[memberContextMenuTargetUserId.value!]) {
            contextMenuItems.push({
                key: 'changeNickname',
                label: t('room.groupMemberListAside.contextMenu.changeNickname'),
                command: runMemberContextMenuCommand,
            })
        } else {
            contextMenuItems.push({
                key: 'addNickname',
                label: t('room.groupMemberListAside.contextMenu.addNickname'),
                command: runMemberContextMenuCommand,
            })
        }
        contextMenuItems.push({ separator: true })
        if (currentRoomPermissions.value.kick || currentRoomPermissions.value.changePowerLevels) {
            if (currentRoomPermissions.value.kick) {
                contextMenuItems.push({
                    key: 'removeFromGroup',
                    label: t('room.groupMemberListAside.contextMenu.removeFromGroup'),
                    labelClassName: 'text-feedback-critical',
                    command: runMemberContextMenuCommand,
                })
            }
            if (currentRoomPermissions.value.changePowerLevels) {
                contextMenuItems.push({
                    key: 'makeGroupAdmin',
                    label: t('room.groupMemberListAside.contextMenu.makeGroupAdmin'),
                    labelClassName: 'text-feedback-critical',
                    command: runMemberContextMenuCommand,
                })
            }
            contextMenuItems.push({ separator: true })
        }
        contextMenuItems.push({
            key: 'inviteToServer',
            label: t('room.groupMemberListAside.contextMenu.inviteToServer'),
            command: runMemberContextMenuCommand,
        })
        if (memberContextMenuTargetUserId.value && (accountData.value['invalid.discortix.friends'] as EventInvalidDiscortixFriendsContent)?.friends.includes(memberContextMenuTargetUserId.value)) {
            contextMenuItems.push({
                key: 'removeFriend',
                label: t('room.groupMemberListAside.contextMenu.removeFriend'),
                command: runMemberContextMenuCommand,
            })
        } else {
            contextMenuItems.push({
                key: 'addFriend',
                label: t('room.groupMemberListAside.contextMenu.addFriend'),
                command: runMemberContextMenuCommand,
            })
        }
        contextMenuItems.push({
            key: 'block',
            label: t('room.groupMemberListAside.contextMenu.block'),
            labelClassName: 'text-feedback-critical',
            command: runMemberContextMenuCommand,
        })
    }
    if (settings.isDeveloperMode) {
        contextMenuItems.push({ separator: true })
        contextMenuItems.push({
            key: 'copyUserId',
            label: t('room.groupMemberListAside.contextMenu.copyUserId'),
            command: runMemberContextMenuCommand,
        })
    }

    return contextMenuItems
})

async function runMemberContextMenuCommand(event: MenuItemCommandEvent) {
    const userId = memberContextMenuTargetUserId.value
    if (!userId) return
    switch (event.item.key) {
        case 'profile':
            break
        case 'mention':
            emit('mentionUserId', userId)
            break
        case 'message':
            createOrJoinRoomWithUsers([userId])
            break
        case 'startCall':
            break
        case 'addNote':
            break
        case 'addNickname': case 'changeNickname':
            addUserNicknameDialogVisible.value = true
            break
        case 'removeFromGroup':
            break
        case 'makeGroupAdmin':
            break
        case 'inviteToServer':
            break
        case 'addFriend':
            addFriend(userId)
            break
        case 'removeFriend':
            removeFriendDialogVisible.value = true
            break
        case 'block':
            break
        case 'copyUserId':
            try {
                if (!navigator.clipboard) throw new Error('Clipboard API missing.')
                await navigator.clipboard.writeText(userId)
                toast.add({ severity: 'success', summary: t('room.copyUserIdConfirm', { userId }), life: 3000 })
            } catch (error) {
                toast.add({ severity: 'error', summary: t('errors.clipboardApiNotSupported'), life: 4000 })
            }
            break
    }
}

</script>

<style lang="scss" scoped>
.p-scrollpanel {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
}
.p-menu {
    --p-avatar-background: var(--background-base-lowest);
}
</style>