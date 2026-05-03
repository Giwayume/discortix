<template>
    <SidebarListHeader>
        <div class="flex justify-between gap-2 w-full">
            <Button
                severity="secondary"
                variant="text"
                class="font-semibold !py-0 !px-2 !h-8 !text-strong !gap-1"
                @click="onClickSpaceDropdown"
                @contextmenu.prevent="onContextMenuSpaceDropdown"
            >
                <span class="text-nowrap text-ellipsis overflow-hidden">{{ spaceName }}</span>
                <span class="pi pi-chevron-down !text-xs" aria-hidden="true" />
            </Button>
            <Button
                v-if="currentTopLevelSpacePermissions.invite"
                v-tooltip.bottom="{ value: isTouchEventsDetected ? undefined : t('layout.inviteToSpace') }"
                icon="pi pi-user-plus"
                severity="secondary"
                variant="text"
                class="!w-8 !h-8 !text-strong"
                :style="{ '--p-icon-size': '1.125rem' }"
            />
        </div>
    </SidebarListHeader>
    <SidebarListBody>
        <div class="p-2">
            <div
                class="p-menu !min-w-auto mt-1"
                :style="{
                    '--p-menu-item-focus-background': 'var(--background-mod-subtle)',
                }"
            >
                <div class="p-menu-list" role="navigation">
                    <div class="p-menu-item">
                        <div class="p-menu-item-content">
                            <div
                                role="button"
                                class="p-menu-item-link"
                                :class="{ 'p-menu-item-link-active': currentTopLevelSpaceId === route.params.roomId }"
                                @pointerdown="(event) => onPointerDownRoom(event, browseRoomsItem)"
                                @pointerup="(event) => onPointerUpRoom(event, browseRoomsItem)"
                            >
                                <span class="p-menu-item-icon pi pi-list" aria-hidden="true" />
                                <span class="p-menu-item-label flex gap-3 max-w-full">
                                    {{ browseRoomsItem.label }}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="my-3 mx-2 border-t border-(--border-subtle)" />
            <template v-if="currentTopLevelSpaceRoomList.length > 0">
                <template v-for="roomCategory of currentTopLevelSpaceRoomList" :key="roomCategory.name">
                    <div class="flex justify-between">
                        <Button
                            severity="secondary"
                            variant="text"
                            class="!text-sm !h-6 !px-2 !shrink-1 !overflow-hidden"
                            :style="{ '--p-button-text-secondary-hover-background': 'transparent' }"
                            :aria-expanded="!roomCategory.collapsed"
                            @click="toggleCategory(roomCategory.name)"
                        >
                            {{ roomCategory.name || t('layout.unnamedRoomCategory') }}
                            <span
                                class="pi !text-[0.5rem]"
                                :class="{
                                    'pi-chevron-down': !roomCategory.collapsed,
                                    'pi-chevron-up': roomCategory.collapsed,
                                }"
                                aria-hidden="true"
                            />
                        </Button>
                        <Button
                            v-tooltip.top="{ value: isTouchEventsDetected ? undefined : t('layout.createRoom') }"
                            icon="pi pi-plus"
                            severity="secondary"
                            variant="text"
                            class="!text-sm !h-6 !w-6 !p-0"
                            :style="{ '--p-icon-size': '0.75rem' }"
                            :aria-label="t('layout.createRoom')"
                        />
                    </div>
                    <div
                        class="p-menu !min-w-auto mt-1 mb-2"
                        :style="{
                            '--p-menu-item-focus-background': 'var(--background-mod-subtle)',
                        }"
                    >
                        <div class="p-menu-list" role="navigation">
                            <template v-for="room of roomCategory.rooms" :key="room.roomId">
                                <div
                                    v-if="room.roomId === route.params.roomId || !roomCategory.collapsed"
                                    class="p-menu-item"
                                >
                                    <div class="p-menu-item-content">
                                        <div
                                            role="button"
                                            class="p-menu-item-link"
                                            :class="{ 'p-menu-item-link-active': room.roomId === route.params.roomId }"
                                            @pointerdown="(event) => onPointerDownRoom(event, room)"
                                            @pointerup="(event) => onPointerUpRoom(event, room)"
                                        >
                                            <span class="p-menu-item-icon pi pi-hashtag" aria-hidden="true" />
                                            <span class="p-menu-item-label flex gap-3 max-w-full">
                                                {{ room.name }}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </template>
                        </div>
                    </div>
                </template>
            </template>
            <div v-else-if="isLoadingRoomList" class="flex flex-col gap-1 v-fade-in">
                <Skeleton height="2.25rem" />
                <Skeleton height="2.25rem" />
                <Skeleton height="2.25rem" />
            </div>
        </div>
        <div class="hidden"><Menu /></div> <!-- Inject menu styles, hacky. -->
    </SidebarListBody>
    <ContextMenu ref="spaceMenu" :model="spaceMenuItems" @hide="onHideSpaceMenu">
        <template #item="{ item, props }">
            <a class="p-contextmenu-item-link" v-bind="props.action">
                <span class="p-contextmenu-item-label">{{ item.label }}</span>
                <span v-if="item.icon" class="ml-auto" :class="item.icon" aria-hidden="true" />
                <span v-else-if="item.items" class="pi pi-angle-right ml-auto" />
            </a>
        </template>
        <!-- p-contextmenu-item-label p-contextmenu-item-link p-contextmenu-item-content -->
    </ContextMenu>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'

import { useApplication } from '@/composables/application'
import { useRooms } from '@/composables/rooms'

import { useClientSettingsStore } from '@/stores/client-settings'
import { useSpaceStore } from '@/stores/space'

import SidebarListBody from './SidebarListBody.vue'
import SidebarListHeader from './SidebarListHeader.vue'

import Button from 'primevue/button'
import ContextMenu, { type ContextMenuContext } from 'primevue/contextmenu'
import Menu from 'primevue/menu'
import type { MenuItem, MenuItemCommandEvent } from 'primevue/menuitem'
import Skeleton from 'primevue/skeleton'
import vTooltip from 'primevue/tooltip'
import { useToast } from 'primevue/usetoast'

import type { RoomSummary } from '@/types'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useToast()

const { isTouchEventsDetected, toggleApplicationSidebar } = useApplication()
const { getRoomHierarchy } = useRooms()

const { settings } = useClientSettingsStore()
const spaceStore = useSpaceStore()
const {
    spaceLoadingRoomSummaries,
    currentTopLevelSpacePermissions,
    currentTopLevelSpaceId, currentTopLevelSpaceName, currentTopLevelSpaceRoomList,
} = storeToRefs(spaceStore)
const { getSpaceClientSettings, updateSpaceClientSettings } = spaceStore

watch(() => currentTopLevelSpaceId.value, (currentTopLevelSpaceId) => {
    if (!currentTopLevelSpaceId) return
    getRoomHierarchy(currentTopLevelSpaceId)
}, { immediate: true })

const isLoadingRoomList = computed(() => {
    if (!currentTopLevelSpaceId.value) return false
    return !!spaceLoadingRoomSummaries.value[currentTopLevelSpaceId.value]
})

const spaceName = computed(() => {
    return currentTopLevelSpaceName.value ?? t('layout.unnamedSpace')
})

const browseRoomsItem: MenuItem = {
    key: currentTopLevelSpaceId.value,
    label: t('layout.browseRooms'),
    icon: 'pi pi-user',
}

/*----------------------------*\
|                              |
|   Server Settings Dropdown   |
|                              |
\*----------------------------*/

const spaceMenu = ref<InstanceType<typeof ContextMenu>>()
const isSpaceMenuVisible = ref<boolean>(false)

const spaceMenuItems = computed(() => {
    const spaceMenuItems: MenuItem[] = []

    if (currentTopLevelSpacePermissions.value.invite) {
        spaceMenuItems.push({
            key: 'inviteToSpace',
            icon: 'pi pi-user-plus',
            label: t('sidebarListSpaceRooms.spaceMenu.inviteToSpace'),
            command: runSpaceMenuCommand,
        })
    }
    if (
        currentTopLevelSpacePermissions.value.ban
        || currentTopLevelSpacePermissions.value.changeGuestAccess
        || currentTopLevelSpacePermissions.value.changeHistoryVisibility
        || currentTopLevelSpacePermissions.value.changeJoinRules
        || currentTopLevelSpacePermissions.value.changePowerLevels
        || currentTopLevelSpacePermissions.value.changeRoomAvatar
        || currentTopLevelSpacePermissions.value.changeRoomCanonicalAlias
        || currentTopLevelSpacePermissions.value.changeRoomName
        || currentTopLevelSpacePermissions.value.changeRoomTags
        || currentTopLevelSpacePermissions.value.changeRoomTopic
        || currentTopLevelSpacePermissions.value.changeSeverAcl
        || currentTopLevelSpacePermissions.value.closeRoom
        || currentTopLevelSpacePermissions.value.createChildRoom
        || currentTopLevelSpacePermissions.value.kick
        || currentTopLevelSpacePermissions.value.redactOtherUserEvent
    ) {
        spaceMenuItems.push({
            key: 'spaceSettings',
            icon: 'pi pi-cog',
            label: t('sidebarListSpaceRooms.spaceMenu.spaceSettings'),
            command: runSpaceMenuCommand,
        })
    }
    if (currentTopLevelSpacePermissions.value.createChildRoom) {
        spaceMenuItems.push({
            key: 'createRoom',
            icon: 'pi pi-plus-circle',
            label: t('sidebarListSpaceRooms.spaceMenu.createRoom'),
            command: runSpaceMenuCommand,
        })
        spaceMenuItems.push({
            key: 'createCategory',
            icon: 'pi pi-folder-plus',
            label: t('sidebarListSpaceRooms.spaceMenu.createCategory'),
            command: runSpaceMenuCommand,
        })
    }

    // TODO - research if this is possible within Matrix spec
    // spaceMenuItems.push({
    //     key: 'createEvent',
    //     icon: 'pi pi-calendar-plus',
    //     label: t('sidebarListSpaceRooms.spaceMenu.createEvent'),
    //     command: runSpaceMenuCommand,
    // })

    if (spaceMenuItems.length > 0) {
        spaceMenuItems.push({ separator: true })
    }

    spaceMenuItems.push({
        key: 'notificationSettings',
        icon: 'pi pi-bell',
        label: t('sidebarListSpaceRooms.spaceMenu.notificationSettings'),
        command: runSpaceMenuCommand,
    })
    spaceMenuItems.push({
        key: 'privacySettings',
        icon: 'pi pi-shield',
        label: t('sidebarListSpaceRooms.spaceMenu.privacySettings'),
        command: runSpaceMenuCommand,
    })

    spaceMenuItems.push({ separator: true })

    spaceMenuItems.push({
        key: 'hideMutedRooms',
        label: t('sidebarListSpaceRooms.spaceMenu.hideMutedRooms'),
        command: runSpaceMenuCommand,
    })

    if (settings.isDeveloperMode) {
        spaceMenuItems.push({ separator: true })
        spaceMenuItems.push({
            key: 'copySpaceInfo',
            label: t('sidebarListSpaceRooms.spaceMenu.copySpaceInfo'),
            items: [
                {
                    key: 'copySpaceId',
                    label: t('sidebarListSpaceRooms.spaceMenu.copySpaceId'),
                    command: runSpaceMenuCommand,
                },
            ],
        })
    }
    return spaceMenuItems
})

async function runSpaceMenuCommand(event: MenuItemCommandEvent) {
    switch (event.item.key) {
        case 'inviteToSpace':
            break
        case 'spaceSettings':
            break
        case 'createRoom':
            break
        case 'createCategory':
            break
        case 'createEvent':
            break
        case 'privacySettings':
            break
        case 'copySpaceId':
            try {
                if (!navigator.clipboard) throw new Error('Clipboard API missing.')
                await navigator.clipboard.writeText(currentTopLevelSpaceId.value!)
                toast.add({ severity: 'success', summary: t('sidebarListSpaceRooms.copySpaceIdConfirm', { spaceId: currentTopLevelSpaceId.value }), life: 3000 })
            } catch (error) {
                toast.add({ severity: 'error', summary: t('errors.clipboardApiNotSupported'), life: 4000 })
            }
            break
    }
}

async function onHideSpaceMenu() {
    setTimeout(() => {
        isSpaceMenuVisible.value = false
    }, 250)
}

function onClickSpaceDropdown(event: MouseEvent) {
    if (event.button === 0) {
        if (isSpaceMenuVisible.value) {
            spaceMenu.value?.hide()
            isSpaceMenuVisible.value = false
        } else {
            console.log('not visible')
            isSpaceMenuVisible.value = true
            spaceMenu.value?.show(event)
        }
    }
}

function onContextMenuSpaceDropdown(event: Event) {

}

/*----------------------------*\
|                              |
|   Room List Pointer Events   |
|                              |
\*----------------------------*/

let pointerDownRoomItem: MenuItem | RoomSummary | undefined = undefined
let pointerDownRoomItemX: number = 0
let pointerDownRoomItemY: number = 0
let pointerDownRoomTimestamp: number = 0

function onPointerDownRoom(event: PointerEvent, item: MenuItem) {
    pointerDownRoomItem = item
    pointerDownRoomItemX = event.pageX
    pointerDownRoomItemY = event.pageY
    pointerDownRoomTimestamp = window.performance.now()
}

function onPointerUpRoom(event: PointerEvent, item: MenuItem | RoomSummary) {
    // "Click" / "Tap" simulation. Need to do this because of the Safari "double tap with hover states" issue.
    if (
        item === pointerDownRoomItem
        && window.performance.now() - pointerDownRoomTimestamp <= 500
        && Math.abs(event.pageX - pointerDownRoomItemX) < 8
        && Math.abs(event.pageY - pointerDownRoomItemY) < 8
    ) {
        selectRoom(item)
    }
}

function selectRoom(item: MenuItem | RoomSummary) {
    if ((item as MenuItem)?.key) {
        router.push({ name: 'room', params: { roomId: (item as MenuItem).key } }).then(() => {
            toggleApplicationSidebar(false)
        })
    } else if ((item as RoomSummary)?.roomId) {
        router.push({ name: 'room', params: { roomId: (item as RoomSummary).roomId } }).then(() => {
            toggleApplicationSidebar(false)
        })
    }
}

/*-------------------*\
|                     |
|   Room Categories   |
|                     |
\*-------------------*/

function toggleCategory(categoryName: string) {
    if (!currentTopLevelSpaceId.value) return
    const clientSettings = getSpaceClientSettings(currentTopLevelSpaceId.value)
    if (clientSettings.collapsedCategoryNames.includes(categoryName)) {
        clientSettings.collapsedCategoryNames.splice(
            clientSettings.collapsedCategoryNames.indexOf(categoryName), 1
        )
    } else {
        clientSettings.collapsedCategoryNames.push(categoryName)
    }
    updateSpaceClientSettings(currentTopLevelSpaceId.value, clientSettings)
}

</script>
