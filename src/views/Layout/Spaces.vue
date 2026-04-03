<template>
    <div class="application__spaces">
        <ScrollPanel>
            <div class="application__spaces__scroll-content">
                <button
                    v-tooltip.right="{ value: isTouchEventsDetected ? undefined : t('layout.directMessages') }"
                    class="application__space application__space--dm"
                    :class="{
                        'application__space--active': !currentTopLevelSpaceId && route.name !== 'discover',
                    }"
                    :aria-label="t('layout.directMessages')"
                    @click="viewDirectMessages"
                    @contextmenu.prevent
                >
                    <div class="application__space__icon">
                        <span class="pi pi-comments" aria-hidden="true" />
                    </div>
                    <div v-if="dmNotificationCount > 0" class="application__space__notify-count">
                        {{ dmNotificationCount }}
                    </div>
                </button>
                <template v-for="dmChat of dmChats">
                    <button
                        v-tooltip.right="{ value: isTouchEventsDetected ? undefined : dmChat.name }"
                        class="application__space application__space--dm-notify application__space--notify"
                        :aria-label="dmChat.name"
                        @contextmenu.prevent
                    >
                        <div class="application__space__icon">
                            <AuthenticatedImage
                                v-if="dmChat.avatarUrl"
                                :mxcUri="dmChat.avatarUrl"
                                type="thumbnail"
                                :width="48"
                                :height="48"
                                method="scale"
                            >
                                <template v-slot="{ src }">
                                    <img :src="src" :alt="t('layout.spaceAvatarAlt')">
                                </template>
                                <template #error>
                                    <span class="pi pi-user" aria-hidden="true" />
                                </template>
                            </AuthenticatedImage>
                            <template v-else><span class="pi pi-user" aria-hidden="true" /></template>
                        </div>
                        <div class="application__space__notify-count">{{ dmChat.notificationCount }}</div>
                    </button>
                </template>
                <hr>
                <template v-for="space of joinedSpaces">
                    <button
                        v-tooltip.right="{ value: isTouchEventsDetected ? undefined : space.name }"
                        class="application__space"
                        :class="{
                            'application__space--active': currentTopLevelSpaceId === space.roomId,
                        }"
                        :aria-label="space.name"
                        @click="viewSpace(space)"
                        @contextmenu="showSpaceContextMenu($event, space)"
                    >
                        <div class="application__space__icon">
                            <AuthenticatedImage
                                v-if="space.avatarUrl"
                                :mxcUri="space.avatarUrl"
                                type="thumbnail"
                                :width="48"
                                :height="48"
                                method="scale"
                            >
                                <template v-slot="{ src }">
                                    <img :src="src" :alt="t('layout.spaceAvatarAlt')">
                                </template>
                                <template #error>
                                    {{ createAcronym(space.name) }}
                                </template>
                            </AuthenticatedImage>
                            <template v-else>{{ createAcronym(space.name) }}</template>
                        </div>
                    </button>
                </template>
                <button
                    v-tooltip.right="{ value: isTouchEventsDetected ? undefined : t('layout.addSpace') }"
                    class="application__space application__space--action"
                    :aria-label="t('layout.addSpace')"
                    @contextmenu.prevent
                >
                    <div class="application__space__icon">
                        <span class="pi pi-plus-circle" aria-hidden="true" />
                    </div>
                </button>
                <button
                    v-tooltip.right="{ value: isTouchEventsDetected ? undefined : t('layout.discover') }"
                    class="application__space application__space--action"
                    :class="{
                        'application__space--active': route.name === 'discover',
                    }"
                    :aria-label="t('layout.discover')"
                    @contextmenu.prevent
                    @click="viewDiscover()"
                >
                    <div class="application__space__icon">
                        <span class="pi pi-compass" aria-hidden="true" />
                    </div>
                </button>
            </div>
        </ScrollPanel>
        <ContextMenu ref="contextMenu" :model="contextMenuItems">
            <template #item="{ item, props }">
                <a class="p-contextmenu-item-link" v-bind="props.action">
                    <span class="p-contextmenu-item-label">{{ item.label }}</span>
                    <span v-if="item.shortcut" class="ml-auto border border-surface rounded bg-emphasis text-muted-color text-xs p-1">{{ item.shortcut }}</span>
                    <i v-if="item.items" class="pi pi-angle-right ml-auto"></i>
                </a>
            </template>
            <!-- p-contextmenu-item-label p-contextmenu-item-link p-contextmenu-item-content -->
        </ContextMenu>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useApplication } from '@/composables/application'
import { useRoomStore } from '@/stores/room'
import { useSpaceStore } from '@/stores/space'

import AuthenticatedImage from '@/views/Common/AuthenticatedImage.vue'

import ContextMenu from 'primevue/contextmenu'
import ScrollPanel from 'primevue/scrollpanel'
import vTooltip from 'primevue/tooltip'

import type { SpaceSummary } from '@/types'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { isTouchEventsDetected, toggleApplicationSidebar } = useApplication()
const { invitedDirectMessageRooms } = storeToRefs(useRoomStore())
const { currentTopLevelSpaceId, joinedSpaces } = storeToRefs(useSpaceStore())

/*--------------------*\
|                      |
|   DM Notifications   |
|                      |
\*--------------------*/

const dmNotificationCount = computed(() => {
    return Math.min(99, invitedDirectMessageRooms.value.length)
})

const dmChats = ref<SpaceSummary[]>([
    // {
    //     avatarUrl: undefined,
    //     creator: '@user:matrix.org',
    //     name: 'Username',
    //     roomId: '',
    //     roomVersion: '1',
    //     notificationCount: 2,
    // }
])

/*----------------*\
|                  |
|   Context Menu   |
|                  |
\*----------------*/

const contextMenu = ref<InstanceType<typeof ContextMenu>>()
const contextMenuSelectedSpace = ref<SpaceSummary>()
const contextMenuState = reactive({
    generalNotifications: 'all' as 'all' | 'mentions' | 'nothing',
    suppressEveryone: false,
    suppressAllRoleMentions: false,
    suppressHighlights: false,
    muteNewEvents: false,
    mobilePushNotifications: false,
    hideMutedChannels: false,
})
const contextMenuItems = ref([
    {
        label: 'Mark as Read',
    },
    {
        separator: true,
    },
    {
        label: 'Invite to Space',
    },
    {
        separator: true,
    },
    {
        label: 'Mute Space',
        items: [
            {
                label: 'For 15 Minutes',
            },
            {
                label: 'For 1 Hour',
            },
            {
                label: 'For 3 Hours',
            },
            {
                label: 'For 8 Hours',
            },
            {
                label: 'For 24 Hours',
            },
            {
                label: 'Until I turn it back on',
            },
        ]
    },
    {
        label: 'Notification Settings',
        items: [
            {
                label: 'All Messages',
                radioModel: 'generalNotifications',
                radioValue: 'all',
            },
            {
                label: 'Only @mentions',
                radioModel: 'generalNotifications',
                radioValue: 'mentions',
            },
            {
                label: 'Nothing',
                radioModel: 'generalNotifications',
                radioValue: 'nothing',
            },
            {
                separator: true,
            },
            {
                label: 'Suppress @everyone and @here',
                checkboxModel: 'suppressEveryone',
            },
            {
                label: 'Suppress All Role @mentions',
                checkboxModel: 'suppressAllRoleMentions',
            },
            {
                label: 'Suppress Highlights',
                checkboxModel: 'suppressHighlights',
            },
            {
                label: 'Mute New Events',
                checkboxModel: 'muteNewEvents',
            },
            {
                separator: true,
            },
            {
                label: 'Mobile Push Notifications',
                checkboxModel: 'mobilePushNotifications',
            },
        ]
    },
    {
        label: 'Hide Muted Channels',
        checkboxModel: 'hideMutedChannels',
    },
    {
        separator: true,
    },
    {
        label: 'Space Settings',
        items: [
            {
                label: 'Space Profile',
            },
            {
                label: 'Emoji',
            },
            {
                label: 'Stickers',
            },
            {
                label: 'Members',
            },
            {
                label: 'Invites',
            },
            {
                label: 'Access',
            },
            {
                label: 'Bans',
            },
        ]
    },
    {
        label: 'Privacy Settings',
    },
    {
        separator: true,
    },
    {
        label: 'Create Room',
    },
    {
        label: 'Create Category',
    },
    {
        separator: true,
    },
    {
        label: 'Copy Space ID',
    },
])

/*-----------*\
|             |
|   Methods   |
|             |
\*-----------*/

function createAcronym(spaceName: string) {
    const wordSplit = spaceName.toUpperCase().split(' ')
    return wordSplit.length >= 2
        ? wordSplit.slice(0, 2).map((word) => word[0]).join('')
        : wordSplit[0]?.slice(0, 2)
}

function viewDirectMessages() {
    router.push({ name: 'home' })
}

function viewSpace(space: SpaceSummary) {
    router.push({ name: 'room', params: { roomId: space.roomId } })
}

function viewDiscover() {
    toggleApplicationSidebar(false)
    router.push({ name: 'discover' })
}

function showSpaceContextMenu(event: MouseEvent, space: SpaceSummary) {
    contextMenuSelectedSpace.value = space
    contextMenu.value?.show(event)
};
</script>

<style lang="scss" scoped>
.application__spaces {
    flex-shrink: 0;
    width: 4.5rem;
    margin: -0.25rem 0 0 0;
    padding: 0 0 4rem 0;

    hr {
        color: var(--app-frame-border);
        width: 2rem;
        margin: 0.25rem;
    }
}

.application__spaces__scroll-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
}

.application__space {
    display: block;
    position: relative;
    width: 3rem;
    height: 3rem;
    cursor: pointer;

    &:before {
        content: '';
        display: block;
        position: absolute;
        left: -0.75rem;
        top: 50%;
        background-color: var(--text-strong);
        border-radius: 0 0.25rem 0.25rem 0;
        margin-inline-start: -0.25rem;
        width: 0;
        height: 0;
        transform: translate(0, -50%);
        transition: height 0.2s, width 0.2s;
    }

    &:hover {
        &:not(.application__space--action):before {
            height: 1.25rem;
            width: 0.5rem;
        }

        .application__space__icon {
            background: var(--control-primary-background-default);
        }
    }

    &.application__space--active {
        &:before {
            height: 2.5rem !important;
            width: 0.5rem;
        }

        .application__space__icon {
            background: var(--control-primary-background-default);
        }
    }

    &.application__space--notify {
        &:before {
            height: 0.5rem !important;
            width: 0.5rem;
        }
    }
}

.application__space__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--background-mod-subtle);
    color: var(--text-default);
    mask: var(--application-space-icon-mask);
    mask-size: 3rem;
    mask-repeat: no-repeat;
    width: 3rem;
    height: 3rem;
    font-size: 1.125rem;
    font-weight: 500;
    line-height: 1.2em;
    transition: background-color 0.2s;
    white-space: nowrap;

    --p-icon-size: 1.125rem;
}

.application__space__notify-count {
    position: absolute;
    right: 0.25rem;
    bottom: 0.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 0.25rem;
    font-size: 0.75rem;
    font-weight: 700;
    min-width: 1rem;
    height: 1rem;
    outline: 0.125rem solid var(--background-base-lowest);
    background: var(--badge-notification-background);
    color: var(--white);
    border-radius: var(--radius-round);
    z-index: 2;
}

.application__space--dm {
    .application__space__icon {
        color: var(--text-strong);
    }
}

.application__space--dm-notify {
    .application__space__icon {
        mask: none;
        border-radius: 50%;
        margin: 0.25rem;
        width: calc(100% - 0.5rem);
        height: calc(100% - 0.5rem);
    }
}
</style>