<template>
    <Dialog
        :visible="visible"
        modal
        :draggable="false"
        :style="{
            width: '100%',
            maxWidth: 'calc(100dvw - 5rem)',
            height: 'calc(100dvh - 4rem)',
            maxHeight: 'none',
        }"
        class="p-dialog-fullwidth !p-0 !overflow-hidden"
        @update:visible="emit('update:visible', visible)"
    >
        <template #container="{ closeCallback }">
            <div
                class="room-settings__dialog-container"
                @pointerdown="onPointerDownMobileLayout"
                @pointermove="onPointerMoveMobileLayout"
                @pointercancel="onPointerCancelMobileLayout"
            >
                <aside class="p-dialog-sidebar flex flex-col">
                    <ScrollPanel class="grow-1 overflow-hidden">
                        <div class="py-15 pr-[0.375rem] pl-4">
                            <Menu :model="menuItems">
                                <template #item="{ item, props }">
                                    <a
                                        class="p-menu-item-link"
                                        :class="{ 'p-menu-item-link-active': item.key === selectedMenuItem.key }"
                                        tabindex="-1"
                                    >
                                        <span class="p-menu-item-label">{{ item.label }}</span>
                                    </a>
                                </template>
                            </Menu>
                        </div>
                    </ScrollPanel>
                    <Button
                        class="p-dialog-mobile-only-button p-dialog-close-button w-10! h-10! absolute! top-2! right-2! z-1!"
                        icon="pi pi-times"
                        severity="secondary"
                        variant="text"
                        rounded
                        :aria-label="t('dialog.close')"
                        @click="emit('update:visible', false)"
                    />
                </aside>
                <div
                    class="p-dialog-main block! relative! py-15 px-10"
                    :class="{ 'p-dialog-main--visible': mainPanelVisible, 'p-dialog-main--animating': isAnimatingSidebarToggle }"
                    :style="{ '--dialog-main-sidebar-offset': mainPanelSidebarOffset + 'px' }"
                >
                    <Button
                        icon="pi pi-arrow-left"
                        severity="secondary"
                        variant="text"
                        class="p-dialog-mobile-only-button p-0! w-10! h-10! absolute! top-2! left-8!"
                        :style="{ '--p-icon-size': '1.125rem' }"
                        :aria-label="t('userSettings.navBackButton')"
                        @click="mainPanelVisible = false"
                    />
                    <Button
                        class="p-dialog-mobile-only-button p-dialog-close-button w-10! h-10! absolute! top-2! right-8!"
                        icon="pi pi-times"
                        severity="secondary"
                        variant="text"
                        rounded
                        :aria-label="t('dialog.close')"
                        @click="emit('update:visible', false)"
                    />
                    <SpaceProfileSettings v-if="selectedMenuItem.key === 'spaceProfile'" :roomId="roomId" />
                    <EngagementSettings v-else-if="selectedMenuItem.key === 'engagement'" :roomId="roomId" />
                    <EmojiSettings v-else-if="selectedMenuItem.key === 'emoji'" :roomId="roomId" />
                    <MembersSettings v-else-if="selectedMenuItem.key === 'members'" :roomId="roomId" />
                    <PermissionsSettings v-else-if="selectedMenuItem.key === 'permissions'" :roomId="roomId" />
                    <InvitesSettings v-else-if="selectedMenuItem.key === 'invites'" :roomId="roomId" />
                    <AccessSettings v-else-if="selectedMenuItem.key === 'access'" :roomId="roomId" />
                    <AuditLogSettings v-else-if="selectedMenuItem.key === 'auditLog'" :roomId="roomId" />
                    <BansSettings v-else-if="selectedMenuItem.key === 'bans'" :roomId="roomId" />
                </div>
                <div class="p-dialog-custom-close pt-15 pr-4">
                    <Button v-slot="slotProps" asChild>
                        <button
                            v-bind="slotProps.a11yAttrs"
                            class="room-settings__close"
                            @click="emit('update:visible', false)"
                        >
                            <div class="flex items-center justify-center w-9 h-9 border-2 rounded-full mb-2">
                                <span class="pi pi-times" aria-hidden="true" />
                            </div>
                            <span class="text-xs font-bold uppercase leading-3">
                                {{ t('roomSettings.escapeButton') }}
                            </span>
                        </button>
                    </Button>
                </div>
            </div>
        </template>
    </Dialog>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'

import { useRoomStore } from '@/stores/room'

const SpaceProfileSettings = defineAsyncComponent(() => import('./RoomSettings/SpaceProfile.vue'))
const EngagementSettings = defineAsyncComponent(() => import('./RoomSettings/Engagement.vue'))
const EmojiSettings = defineAsyncComponent(() => import('./RoomSettings/Emoji.vue'))
const MembersSettings = defineAsyncComponent(() => import('./RoomSettings/Members.vue'))
const PermissionsSettings = defineAsyncComponent(() => import('./RoomSettings/Permissions.vue'))
const InvitesSettings = defineAsyncComponent(() => import('./RoomSettings/Invites.vue'))
const AccessSettings = defineAsyncComponent(() => import('./RoomSettings/Access.vue'))
const AuditLogSettings = defineAsyncComponent(() => import('./RoomSettings/AuditLog.vue'))
const BansSettings = defineAsyncComponent(() => import('./RoomSettings/Bans.vue'))

import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Menu from 'primevue/menu'
import ScrollPanel from 'primevue/scrollpanel'
import type { MenuItem, MenuItemCommandEvent } from 'primevue/menuitem'

const { t } = useI18n()

const { joined: joinedRooms } = storeToRefs(useRoomStore())

const props = defineProps({
    visible: {
        type: Boolean,
        default: false,
    },
    roomId: {
        type: String,
        default: undefined,
    },
})

watch(() => props.visible, (visible, wasVisible) => {
    if (visible && !wasVisible) {
        mainPanelVisible.value = false
        mainPanelSidebarOffset.value = 0
    }
})

const emit = defineEmits<{
    (e: 'update:visible', visible: boolean): void
}>()

const mainPanelVisible = ref<boolean>(false)
watch(() => mainPanelVisible.value, () => {
    isAnimatingSidebarToggle.value = true
    setTimeout(() => {
        isAnimatingSidebarToggle.value = false
        mainPanelSidebarOffset.value = 0
    }, 300)
})

const mainPanelSidebarOffset = ref<number>(0)
const isAnimatingSidebarToggle = ref<boolean>(false)

/*-------------------*\
|                     |
|   Room Properties   |
|                     |
\*-------------------*/

const roomName = computed(() => {
    return joinedRooms.value[props.roomId!]?.stateEventsByType['m.room.name']?.[0]?.content.name
})

/*----------------*\
|                  |
|   Sidebar Menu   |
|                  |
\*----------------*/

const menuItems = computed(() => {
    const menuCategories = []
    menuCategories.push({
        label: roomName.value,
        items: [
            {
                key: 'spaceProfile',
                label: t('roomSettings.menu.spaceProfile'),
                command: selectMenuItem,
            },
            {
                key: 'engagement',
                label: t('roomSettings.menu.engagement'),
                command: selectMenuItem,
            },
        ],
    })
    menuCategories.push({
        label: t('roomSettings.menu.expression'),
        items: [
            {
                key: 'emoji',
                label: t('roomSettings.menu.emoji'),
                command: selectMenuItem,
            },
        ],
    })
    menuCategories.push({
        label: t('roomSettings.menu.people'),
        items: [
            {
                key: 'members',
                label: t('roomSettings.menu.members'),
                command: selectMenuItem,
            },
            {
                key: 'permissions',
                label: t('roomSettings.menu.permissions'),
                command: selectMenuItem,
            },
            {
                key: 'invites',
                label: t('roomSettings.menu.invites'),
                command: selectMenuItem,
            },
            {
                key: 'access',
                label: t('roomSettings.menu.access'),
                command: selectMenuItem,
            },
        ],
    })
    menuCategories.push({
        label: t('roomSettings.menu.moderation'),
        items: [
            {
                key: 'auditLog',
                label: t('roomSettings.menu.auditLog'),
                command: selectMenuItem,
            },
            {
                key: 'bans',
                label: t('roomSettings.menu.bans'),
                command: selectMenuItem,
            },
        ],
    })
    return menuCategories
})

function selectMenuItem(event: MenuItemCommandEvent) {
    selectedMenuItem.value = event.item
    mainPanelSidebarOffset.value = 0
    mainPanelVisible.value = true
}

const selectedMenuItem = ref<MenuItem>(menuItems.value[0]!.items[0]!)

/*--------------------------------*\
|                                  |
|   Navigation With Touch Events   |
|                                  |
\*--------------------------------*/

let primaryPointerDown: {
    pageX: number;
    pageY: number;
    lastPageX: number;
    mainPanelSidebarOffset: number;
} | undefined = undefined
let isDraggingDrawer = ref<boolean | undefined>()
let averageXSpeed: number = 0
let averageXSpeedTimestamp: number = 0

function pointDistance(p1x: number, p1y: number, p2x: number, p2y: number) {
    const dx = p2x - p1x
    const dy = p2y - p1y
    return Math.hypot(dx, dy)
}

function onPointerDownMobileLayout(event: PointerEvent) {
    if (!primaryPointerDown && event.isPrimary && event.button === 0) {
        isDraggingDrawer.value = undefined
        primaryPointerDown = {
            pageX: event.pageX,
            pageY: event.pageY,
            lastPageX: event.pageX,
            mainPanelSidebarOffset: mainPanelSidebarOffset.value,
        }
        averageXSpeed = 0
        averageXSpeedTimestamp = window.performance.now()
    }
}

function onPointerMoveMobileLayout(event: PointerEvent) {
    if (!primaryPointerDown || isDraggingDrawer.value === false) return
    if (
        !isDraggingDrawer.value
        && pointDistance(event.pageX, event.pageY, primaryPointerDown.pageX, primaryPointerDown.pageY) > 8
        && Math.abs(event.pageX - primaryPointerDown.pageX) > Math.abs(event.pageY - primaryPointerDown.pageY)
        && (
            (mainPanelSidebarOffset.value === 0 && event.pageX > primaryPointerDown.pageX)
        )
    ) {
        isDraggingDrawer.value = true
    }
    if (isDraggingDrawer.value) {
        event.preventDefault()
        event.stopPropagation()
        mainPanelSidebarOffset.value = Math.max(0, Math.min(window.innerWidth, primaryPointerDown.mainPanelSidebarOffset + event.pageX - primaryPointerDown.pageX))
        let speedProportion = Math.min(1, (window.performance.now() - averageXSpeedTimestamp) / 100)
        averageXSpeed = ((event.pageX - primaryPointerDown.lastPageX) * speedProportion) + (averageXSpeed * (1 - speedProportion))
        averageXSpeedTimestamp = window.performance.now()
        primaryPointerDown.lastPageX = event.pageX
    }
}

function onPointerCancelMobileLayout(event: PointerEvent) {
    onPointerUpWindow(event)
}

function onPointerUpWindow(event: PointerEvent) {
    if (primaryPointerDown && isDraggingDrawer.value) {
        isAnimatingSidebarToggle.value = true

        const distanceDragged = Math.abs(event.pageX - primaryPointerDown.pageX)

        if (
            primaryPointerDown.mainPanelSidebarOffset === 0
            && distanceDragged >= 30
            && averageXSpeed > 4
        ) {
            mainPanelVisible.value = false
        } else if (mainPanelSidebarOffset.value > (window.innerWidth) / 2) {
            mainPanelVisible.value = false
        }
        mainPanelSidebarOffset.value = 0

        setTimeout(() => {
            isAnimatingSidebarToggle.value = false
        }, 300)
    }
    isDraggingDrawer.value = undefined
    primaryPointerDown = undefined
}

onMounted(() => {
    window.addEventListener('pointerup', onPointerUpWindow, true)
})

onUnmounted(() => {
    window.removeEventListener('pointerup', onPointerUpWindow, true)
})

</script>

<style scoped lang="scss">
.room-settings__dialog-container {
    display: inline-flex;
    flex-direction: row;
    width: 100%;
    height: 100%;
    position: relative;
    background: linear-gradient(to right, var(--background-base-lowest) 0%, var(--background-base-lowest) 50%, var(--background-base-low) 51%);
    justify-content: center;
}
.p-dialog-sidebar {
    background: var(--background-base-lowest);
    padding: 0;
}
.p-dialog-main {
    background: var(--background-base-low);
    flex-basis: 48.75rem;
}
.p-dialog-mobile-only-button {
    display: none;
}
aside {
    --p-menu-submenu-label-padding: 1.5rem 0.625rem 0.25rem 0.625rem;
    --p-menu-submenu-label-padding-first: 0 0.625rem 0.25rem 0.625rem;
    --p-menu-item-padding: 0.375rem 0.625rem;
    --p-menu-list-gap: 0.125rem;
    --p-menu-item-link-min-height: 2rem;
    --p-menu-item-border-radius: 0.25rem;

    :deep(.p-menu-submenu-label) {
        text-transform: uppercase;
        font-weight: 700;
        color: var(--channels-default);
        font-size: 0.75rem;
    }
}
.room-settings__close {
    color: var(--interactive-text-default);
    display: flex;
    flex-direction: column;
    cursor: pointer;

    &:hover {
        color: var(--text-strong);
    }
}
@media screen and (max-width: 800px) {
    .p-dialog-mobile-only-button {
        display: inline-flex;
    }
    .p-dialog-sidebar {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        max-width: none;

        &:deep(.p-menu-item) {
            --p-menu-item-active-background: var(--p-menu-item-background);
        }
    }
    .p-dialog-main {
        background: var(--p-dialog-background);
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        max-width: none;
        z-index: 1;
        pointer-events: none;
        opacity: 0;
        transform: translateX(100%);
        touch-action: pan-y;
        flex-basis: 100%;

        &.p-dialog-main--visible {
            opacity: 1;
            pointer-events: all;
            transform: translateX(var(--dialog-main-sidebar-offset, 0));
        }

        &.p-dialog-main--animating {
            transition: transform 0.2s, opacity 0.2s;
        }
    }
    .p-dialog-custom-close {
        display: none;
    }
}
</style>