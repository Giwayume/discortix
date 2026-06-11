<template>
    <ResponsiveContextMenu
        ref="contextMenu"
        :model="contextMenuItems"
        @hide="emit('hide')"
    >
        <template #item="{ item, props }">
            <a class="p-contextmenu-item-link" v-bind="props.action">
                <span class="p-contextmenu-item-label" :class="item.labelClassName">{{ item.label }}</span>
                <span v-if="item.icon" :class="item.icon" class="ml-auto px-1 text-subtle" aria-hidden="true" />
                <i v-if="item.items" class="pi pi-angle-right ml-auto"></i>
            </a>
        </template>
    </ResponsiveContextMenu>
    <DeleteMessageConfirm
        v-model:visible="deleteMessageConfirmVisible"
        :room="props.room"
        :eventRenderInfo="deleteMessageConfirmEventRenderInfo"
        :i18nText="i18nText"
    />
    <EventSourceViewerDialog
        v-model:visible="eventSourceViewerDialogVisible"
        :eventRenderInfo="eventSourceRenderInfo"
    />
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref, type PropType } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

import { useKeyboard } from '@/composables/keyboard'
import { useRooms } from '@/composables/rooms'

import { useClientSettingsStore } from '@/stores/client-settings'
import { useRoomStore } from '@/stores/room'
import { useSessionStore } from '@/stores/session'

const DeleteMessageConfirm = defineAsyncComponent(() => import('./DeleteMessageConfirm.vue'))
const EventSourceViewerDialog = defineAsyncComponent(() => import('./EventSourceViewerDialog.vue'))
import ResponsiveContextMenu from '@/views/Common/ResponsiveContextMenu.vue'

import { useToast } from 'primevue/usetoast'

import type { MenuItem, MenuItemCommandEvent } from 'primevue/menuitem'
import type {
    EventWithRenderInfo,
    JoinedRoom,
} from '@/types'

interface EventChunk {
    id: string;
    loading: boolean;
    events: EventWithRenderInfo[];
}

const { t } = useI18n()
const toast = useToast()

const { isShiftKeyPressed } = useKeyboard()
const { redactEvent } = useRooms()

const { settings } = useClientSettingsStore()
const {
    currentRoomPermissions,
} = storeToRefs(useRoomStore())
const {
    userId: sessionUserId,
} = storeToRefs(useSessionStore())

const props = defineProps({
    activeEventChunkBufferIndex: {
        type: Number,
        required: true,
    },
    eventChunkBuffers: {
        type: Array as PropType<EventChunk[][]>,
        required: true,
    },
    i18nText: {
        type: Object as PropType<Record<string, string>>,
        required: true,
    },
    messageActionsTargetEventId: {
        type: String,
        default: undefined,
    },
    room: {
        type: Object as PropType<JoinedRoom>,
        required: true,
    },
    targetEventId: {
        type: String,
        default: undefined,
    },
    targetEventSender: {
        type: String,
        default: undefined,
    },
})

const emit = defineEmits<{
    (e: 'hide'): void
    (e: 'keepMessageActionsContextMenuTargetEventId', value: boolean): void
    (e: 'selectEmoji', event: Event, referenceEventId: string): void
    (e: 'update:editEventId', editEventId?: string): void
    (e: 'update:replyToEventId', replyToEventId?: string): void
    (e: 'update:targetEventId', targetEventId: string): void
}>()

/*----------------*\
|                  |
|   Context Menu   |
|                  |
\*----------------*/

const contextMenu = ref<InstanceType<typeof ResponsiveContextMenu>>()

const contextMenuItems = computed(() => {
    const contextMenuItems: MenuItem[] = []
    if (currentRoomPermissions.value.sendReaction) {
        contextMenuItems.push({
            key: 'addReaction',
            label: t('room.moreMessageActions.addReaction'),
            icon: 'pi pi-face-smile',
            command: runContextMenuCommand,
        })
        contextMenuItems.push({ separator: true })
    }
    if (currentRoomPermissions.value.sendMessage && sessionUserId.value === props.targetEventSender) {
        contextMenuItems.push({
            key: 'editMessage',
            label: t('room.moreMessageActions.editMessage'),
            icon: 'pi pi-pencil',
            command: runContextMenuCommand,
        })
    }
    if (currentRoomPermissions.value.sendMessage) {
        contextMenuItems.push({
            key: 'replyToMessage',
            label: t('room.moreMessageActions.reply'),
            icon: 'pi pi-reply -scale-x-100',
            command: runContextMenuCommand,
        })
    }
    contextMenuItems.push({
        key: 'forwardMessage',
        label: t('room.moreMessageActions.forward'),
        icon: 'pi pi-reply',
        command: runContextMenuCommand,
    })
    if (currentRoomPermissions.value.sendMessage) {
        contextMenuItems.push({
            key: 'createThread',
            label: t('room.moreMessageActions.createThread'),
            icon: 'pi pi-receipt',
            command: runContextMenuCommand,
        })
    }
    contextMenuItems.push({ separator: true })
    contextMenuItems.push({
        key: 'copyText',
        label: t('room.moreMessageActions.copyText'),
        icon: 'pi pi-copy',
        command: runContextMenuCommand,
    })
    if (currentRoomPermissions.value.changePinnedEvents) {
        contextMenuItems.push({
            key: 'pinMessage',
            label: t('room.moreMessageActions.pinMessage'),
            icon: 'pi pi-thumbtack',
            command: runContextMenuCommand,
        })
    }
    contextMenuItems.push({
        key: 'markUnread',
        label: t('room.moreMessageActions.markUnread'),
        icon: 'pi pi-book',
        command: runContextMenuCommand,
    })
    contextMenuItems.push({
        key: 'copyMessageLink',
        label: t('room.moreMessageActions.copyMessageLink'),
        icon: 'pi pi-link',
        command: runContextMenuCommand,
    })
    contextMenuItems.push({
        key: 'speakMessage',
        label: t('room.moreMessageActions.speakMessage'),
        icon: 'pi pi-headphones',
        command: runContextMenuCommand,
    })
    contextMenuItems.push({ separator: true })
    if (
        (currentRoomPermissions.value.redactOwnEvent && sessionUserId.value === props.targetEventSender)
        || (currentRoomPermissions.value.redactOtherUserEvent && sessionUserId.value !== props.targetEventSender)
    ) {
        contextMenuItems.push({
            key: 'deleteMessage',
            label: t('room.moreMessageActions.deleteMessage'),
            icon: 'pi pi-trash !text-feedback-critical',
            labelClassName: 'text-feedback-critical',
            command: runContextMenuCommand,
        })
        contextMenuItems.push({ separator: true })
    }
    if (settings.isDeveloperMode) {
        contextMenuItems.push({
            key: 'viewEventSource',
            label: t('room.moreMessageActions.viewEventSource'),
            icon: 'pi pi-code',
            command: runContextMenuCommand,
        })
        contextMenuItems.push({
            key: 'copyMessageId',
            label: t('room.moreMessageActions.copyMessageId'),
            icon: 'pi pi-id-card',
            command: runContextMenuCommand,
        })
    }
    if (contextMenuItems[contextMenuItems.length - 1]?.separator) {
        contextMenuItems.pop()
    }
    return contextMenuItems
})

async function runContextMenuCommand(event: MenuItemCommandEvent) {
    contextMenu.value?.hide()
    const eventId = props.targetEventId || props.messageActionsTargetEventId
    console.log(eventId)
    if (!eventId) return
    switch (event.item.key) {
        case 'addReaction':
            emit('selectEmoji', event.originalEvent, eventId)
            emit('update:targetEventId', eventId)
            emit('keepMessageActionsContextMenuTargetEventId', true)
            break
        case 'editMessage':
            emit('update:editEventId', eventId)
            break
        case 'replyToMessage':
            emit('update:replyToEventId', eventId)
            break
        case 'deleteMessage':
            if (isShiftKeyPressed.value) {
                redactEvent(props.room.roomId, eventId)
            } else {
                deleteMessageConfirmEventRenderInfo.value = undefined

                findEventRenderInfo:
                for (const chunk of props.eventChunkBuffers[props.activeEventChunkBufferIndex]!) {
                    for (const e of chunk.events) {
                        if (e.event.eventId === props.targetEventId) {
                            deleteMessageConfirmEventRenderInfo.value = e
                            break findEventRenderInfo
                        }
                    }
                }

                deleteMessageConfirmVisible.value = true
            }
            break
        case 'viewEventSource':
            eventSourceViewerDialogVisible.value = true
            eventSourceRenderInfo.value = undefined

            findEventRenderInfo:
            for (const chunk of props.eventChunkBuffers[props.activeEventChunkBufferIndex]!) {
                for (const e of chunk.events) {
                    if (e.event.eventId === props.targetEventId) {
                        eventSourceRenderInfo.value = e
                        break findEventRenderInfo
                    }
                }
            }

            break
        case 'copyMessageId':
            try {
                if (!navigator.clipboard) throw new Error('Clipboard API missing.')
                await navigator.clipboard.writeText(eventId)
                toast.add({ severity: 'success', summary: t('room.copyMessageIdConfirm', { eventId }), life: 3000 })
            } catch (error) {
                toast.add({ severity: 'error', summary: t('errors.clipboardApiNotSupported'), life: 4000 })
            }
            break
    }
}

/*--------------------------*\
|                            |
|   Delete Message Confirm   |
|                            |
\*--------------------------*/

const deleteMessageConfirmVisible = ref<boolean>(false)
const deleteMessageConfirmEventRenderInfo = ref<EventWithRenderInfo>()

/*------------------------------*\
|                                |
|   Event Source Viewer Dialog   |
|                                |
\*------------------------------*/

const eventSourceViewerDialogVisible = ref<boolean>(false)
const eventSourceRenderInfo = ref<EventWithRenderInfo>()

/*-----------*\
|             |
|   Exposed   |
|             |
\*-----------*/

function hide() {
    contextMenu.value?.hide()
}

function show(event: Event) {
    contextMenu.value?.show(event)
}

defineExpose({
    hide,
    runContextMenuCommand,
    show,
})

</script>