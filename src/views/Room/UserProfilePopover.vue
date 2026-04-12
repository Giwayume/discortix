<template>
    <div v-if="visible" class="user-profile-popover-overlay" @click="hide()" />
    <div v-if="visible" ref="popoverContainer" class="user-profile-popover" role="dialog" :style="floatingStyles">
        <header class="user-profile-popover__header">
            <div class="user-profile-popover__header-banner">
                <Button
                    v-if="isFriend"
                    v-tooltip.top="t('userProfilePopover.friendButton')" icon="pi pi-user"
                    severity="secondary" rounded :aria-label="t('userProfilePopover.friendButton')"
                    @click="removeFriendDialogVisible = true"
                />
                <Button
                    v-else
                    v-tooltip.top="t('userProfilePopover.addFriendButton')" icon="pi pi-user-plus"
                    severity="secondary" rounded :aria-label="t('userProfilePopover.addFriendButton')"
                    @click="addFriend(props.userId!)"
                />
                <Button
                    v-tooltip.top="t('userProfilePopover.moreButton')" icon="pi pi-ellipsis-h"
                    severity="secondary" rounded :aria-label="t('userProfilePopover.moreButton')"
                    @click="contextMenu?.show($event)"
                />
            </div>
            <div class="user-profile-popover__header-avatar">
                <OverlayStatus level="low" :status="presence" size="xlarge" class="w-full h-full">
                    <AuthenticatedImage :mxcUri="avatarUrl" type="thumbnail" :width="48" :height="48" method="scale">
                        <template v-slot="{ src }">
                            <Avatar :image="src" shape="circle" class="p-avatar-full" :aria-label="t('layout.userAvatarImage')" />
                        </template>
                        <template #error>
                            <Avatar icon="pi pi-user" shape="circle" class="p-avatar-full" :aria-label="t('layout.userAvatarImage')" />
                        </template>
                    </AuthenticatedImage>
                </OverlayStatus>
            </div>
            <div v-if="statusMessage" class="user-profile-popover__header-status">
                <div class="user-profile-popover__header-status-message">
                    {{ statusMessage }}
                </div>
            </div>
        </header>
        <div class="user-profile-popover__body">
            <h3 class="user-profile-popover__displayname">{{ displayname }}</h3>
            <p class="user-profile-popover__username">{{ props.userId }}</p>
        </div>
        <footer class="user-profile-popover__footer">
            <template v-if="isSelf">
                <Button size="small" class="mt-2 w-full" @click="editProfile">
                    <span class="pi pi-pencil text-xs!" aria-hidden="true" />
                    <span class="p-button-label">{{ t('userProfilePopover.editProfileButton') }}</span>
                </Button>
            </template>
            <template v-else>
                <InputText :placeholder="t('userProfilePopover.messagePlaceholder', { displayname })" class="w-full" />
            </template>
        </footer>
    </div>
    <ContextMenu ref="contextMenu" :model="contextMenuItems">
        <template #item="{ item, props }">
            <a class="p-contextmenu-item-link" v-bind="props.action">
                <span class="p-contextmenu-item-label" :class="item.labelClassName">{{ item.label }}</span>
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
        <p v-html="micromark(t('userProfilePopover.removeFriendConfirm.subtitle', { displayname }))" />
        <template #footer>
            <Button :label="t('userProfilePopover.removeFriendConfirm.cancelButton')" class="grow-1 basis-1" severity="secondary" @click="removeFriendDialogVisible = false" autofocus />
            <Button :label="t('userProfilePopover.removeFriendConfirm.removeButton')" class="grow-1 basis-1" severity="danger" @click="removeFriend(props.userId!); removeFriendDialogVisible = false" />
        </template>
    </Dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { micromark } from 'micromark'
import {
    useFloating,
    offset as floatingOffset,
    autoPlacement as floatingAutoPlacement,
    autoUpdate as floatingAutoUpdate,
} from '@floating-ui/vue'

import { useAccountData } from '@/composables/account-data'
import { useApplication } from '@/composables/application'

import { useAccountDataStore } from '@/stores/account-data'
import { useClientSettingsStore } from '@/stores/client-settings'
import { useProfileStore } from '@/stores/profile'
import { useSessionStore } from '@/stores/session'

import AuthenticatedImage from '@/views/Common/AuthenticatedImage.vue'
import OverlayStatus from '@/views/Common/OverlayStatus.vue'

import Avatar from 'primevue/avatar'
import Button from 'primevue/button'
import ContextMenu from 'primevue/contextmenu'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import vTooltip from 'primevue/tooltip'

import type { EventInvalidDiscortixFriendsContent } from '@/types'

const { t } = useI18n()

const { addFriend, removeFriend } = useAccountData()
const { openUserSettings } = useApplication()

const { accountData } = storeToRefs(useAccountDataStore())
const { settings } = useClientSettingsStore()
const { profiles } = storeToRefs(useProfileStore())
const { userId: sessionUserId } = storeToRefs(useSessionStore())

const props = defineProps({
    userId: {
        type: String,
        default: undefined,
    },
})

const isSelf = computed(() => {
    return sessionUserId.value === props.userId
})

const isFriend = computed(() => {
    return (accountData.value['invalid.discortix.friends'] as EventInvalidDiscortixFriendsContent)?.friends?.includes(props.userId!)
})

const displayname = computed(() => {
    return profiles.value[props.userId ?? '']?.displayname ?? props.userId?.split(':')[0] ?? ''
})

const avatarUrl = computed(() => {
    return profiles.value[props.userId ?? '']?.avatarUrl
})

const presence = computed(() => {
    return profiles.value[props.userId ?? '']?.presence
})

const statusMessage = computed(() => {
    return profiles.value[props.userId ?? '']?.statusMessage
})

const targetElement = ref<HTMLElement>()
const popoverContainer = ref<HTMLDivElement>()

const { floatingStyles, update: updateFloatingPosition } = useFloating(
    targetElement, popoverContainer, {
        whileElementsMounted: floatingAutoUpdate,
        transform: false,
        middleware: [
            floatingAutoPlacement({
                alignment: 'start',
            }),
            floatingOffset({ mainAxis: -12, crossAxis: -8 }),
        ]
    }
)

const contextMenu = ref<InstanceType<typeof ContextMenu>>()
const contextMenuItems = computed(() => {
    const items = [
        {
            key: 'viewFullProfile',
            label: t('userProfilePopover.moreMenu.viewFullProfile'),
        },
        {
            key: 'inviteToSpace',
            label: t('userProfilePopover.moreMenu.inviteToSpace'),
            items: [
                {
                    key: 'server1',
                    label: 'Sever 1',
                },
            ],
        },
        { separator: true },
        {
            key: 'ignore',
            label: t('userProfilePopover.moreMenu.ignore'),
        },
        {
            key: 'block',
            label: t('userProfilePopover.moreMenu.block'),
            labelClassName: 'text-feedback-critical',
        },
        {
            key: 'reportUserProfile',
            label: t('userProfilePopover.moreMenu.reportUserProfile'),
            labelClassName: 'text-feedback-critical',
        },
    ]
    if (settings.isDeveloperMode) {
        items.push({ separator: true })
        items.push({
            key: 'reportUserProfile',
            label: t('userProfilePopover.moreMenu.copyUserId'),
        })
    }
    return items
})

function onKeydownDocument(event: KeyboardEvent) {
    if (visible.value && event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        visible.value = false
    }
}

onMounted(() => {
    document.addEventListener('keydown', onKeydownDocument, true)
})

onUnmounted(() => {
    document.removeEventListener('keydown', onKeydownDocument, true)
})

const visible = ref<boolean>(false)
const removeFriendDialogVisible = ref<boolean>(false)

function editProfile() {
    openUserSettings('editProfile')
    hide()
}

function hide() {
    visible.value = false
}

function show(event: Event) {
    if (!event.target) return
    targetElement.value = event.target as HTMLElement
    visible.value = true
    nextTick(() => {
        updateFloatingPosition()
    })
}

defineExpose({
    show,
    hide,
})

</script>

<style lang="scss" scoped>
.user-profile-popover-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 19;
}
.user-profile-popover {
    --custom-nickname-line-height: 1.5rem;

    position: absolute;
    top: 0;
    left: 0;
    background: var(--background-base-low);
    border-radius: var(--radius-sm);
    overflow: hidden;
    padding: 0 0 0.25rem 0;
    max-height: calc(d100vh - 1.25rem);
    width: 18.75rem;
    max-width: calc(d100vw - 2rem);
    box-shadow: var(--shadow-border), var(--shadow-high);
    z-index: 20;
}

.user-profile-popover__header {
    position: relative;
    min-height: 9.5rem;

    .p-button {
        --p-button-secondary-background: var(--control-overlay-secondary-background-default);
        --p-button-secondary-hover-background: var(--control-overlay-secondary-background-hover);
        --p-button-secondary-active-background: var(--control-overlay-secondary-background-active);
    }
}
.user-profile-popover__header-banner {
    display: flex;
    justify-content: flex-end;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 1rem;
    width: 100%;
    height: 6.5625rem;
    background: white;
}
.user-profile-popover__header-avatar {
    width: 5rem;
    height: 5rem;
    position: absolute;
    left: 1rem;
    top: 4rem;

    .p-avatar {
        background: var(--background-base-lower);
        outline: 0.375rem solid var(--background-base-low);
    }
}
.user-profile-popover__header-status {
    display: block;
    position: relative;
    top: -0.5rem;
    background: var(--custom-status-bubble-background);
    border-radius: var(--radius-lg);
    color: var(--text-default);
    margin: 0 0.75rem 0 6.8125rem;
    box-shadow: var(--shadow-low);
    padding: 0.5rem 0.75rem;
    width: auto;

    &::before {
        content: '';
        position: absolute;
        top: -0.5rem;
        width: 1.25rem;
        height: 1.25rem;
        background: var(--custom-status-bubble-background);
        border-radius: 50%;
    }

    &::after {
        content: '';
        position: absolute;
        height: 0.625rem;
        width: 0.625rem;
        left: 0rem;
        top: -0.9375rem;
        background: var(--custom-status-bubble-background);
        border-radius: 50%;
    }
}

.user-profile-popover__header-status-message {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    overflow: hidden;
    text-overflow: ellipsis;
    max-height: 2.25rem;
    font-size: 0.875rem;
    line-height: 1.25;
}

.user-profile-popover__body {
    padding: 0.25rem 1rem 0.5rem 1rem;
}
.user-profile-popover__displayname {
    max-height: calc(var(--custom-nickname-line-height)*3);
    word-break: break-word;
    font-size: 1.25rem;
    font-weight: 700;
    line-height: 1.5;
    color: var(--text-default);
}
.user-profile-popover__username {
    font-size: 0.875rem;
    word-break: break-all;
    color: var(--text-strong);
    line-height: 1.25rem;
}

.user-profile-popover__footer {
    padding: 0 1rem 0.75rem 1rem;
}
</style>