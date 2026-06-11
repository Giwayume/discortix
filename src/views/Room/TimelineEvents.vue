<template>
    <!-- This is here to trigger Vue update events. Wish I didn't have to hack it like this. -->
    <div hidden>{{ eventChunkRenderUuid }}</div>
    <div
        v-if="room"
        :data-timeline-id="componentUuid"
        class="p-chattimeline"
        @pointerdown="onPointerDownTimeline"
        @pointermove="onPointerMoveTimeline"
        @pointerup="onPointerUpTimeline"
        @mouseover="onMouseOverTimeline"
        @mouseleave="onMouseLeaveTimeline"
        @dragstart.prevent
        @click.capture="onClickTimeline"
        @contextmenu.capture="onContextMenuTimeline"
    >
        <ScrollPanel ref="scrollPanel">
            <div ref="scrollContentContainer" class="p-chattimeline-scroll-content-container">
                <MessagePlaceholder
                    v-if="showOldEventMessagePlaceholder"
                    ref="oldMessagePlaceholder"
                    :key="`oldMessagePlaceholderFor${room.roomId}`"
                />
                <MessageBeginning
                    v-else
                    :room="props.room"
                    @inviteUsers="emit('inviteUsers')"
                />
                <div
                    v-for="(eventChunkList, eventChunkBufferIndex) of eventChunkBuffers"
                    :key="eventChunkBufferIndex"
                    :class="{
                        'p-chattimeline-scroll-content': activeEventChunkBufferIndex === eventChunkBufferIndex,
                        'p-chattimeline-scroll-content-sizer': activeEventChunkBufferIndex !== eventChunkBufferIndex,
                    }"
                >
                    <div ref="eventChunkBufferContainers" class="p-chattimeline-scroll-content-chunks">
                        <div
                            v-timeline-event-render="{
                                isVisible: eventChunkBufferIndex === activeEventChunkBufferIndex,
                                eventChunkList,
                                i18nText,
                                messageActionsTargetEventId,
                                messageActionsContextMenuTargetEventId,
                                highlightEventId,
                                referenceEventId,
                                currentRoomCustomEmojiByCode,
                                useMediaCache: true,
                            }"
                        />
                    </div>
                    <!-- New messages bar -->
                    <!--div class="p-chattimeline-new-divider">
                        <div class="p-chattimeline-new-divider-tag">New</div>
                    </div-->
                    
                </div>
                <MessagePlaceholder
                    v-if="showNewEventMessagePlaceholder"
                    ref="newMessagePlaceholder"
                    :key="`newMessagePlaceholderFor${room.roomId}`"
                />
            </div>
            <TimelineEventsMessageActions
                ref="timelineEventsMessageActions"
                :i18nText="i18nText"
                :messageActionsTargetEventSender="messageActionsTargetEventSender"
                :scrollPanelContent="scrollPanelContent"
                :targetElement="messageActionsTargetElement"
                @showMoreMessageActions="showMoreMessageActions"
            />
        </ScrollPanel>
        <TimelineEventsMoreMessageActions
            ref="timelineEventsMoreMessageActions"
            v-model:targetEventId="messageActionsContextMenuTargetEventId"
            :activeEventChunkBufferIndex="activeEventChunkBufferIndex"
            :eventChunkBuffers="eventChunkBuffers"
            :i18nText="i18nText"
            :messageActionsTargetEventId="messageActionsTargetEventId"
            :room="props.room"
            :targetEventSender="messageActionsContextMenuTargetEventSender"
            @hide="onHideMoreMessageActionsContextMenu"
            @keepMessageActionsContextMenuTargetEventId="keepMessageActionsContextMenuTargetEventId = true"
            @selectEmoji="(event, referenceEventId) => emit('selectEmoji', event, referenceEventId)"
            @update:editEventId="emit('update:editEventId', $event)"
            @update:replyToEventId="emit('update:replyToEventId', $event)"
        />
        <MessagePreviewDialog v-model:visible="messagePreviewDialogVisble" :room="props.room" :event="messagePreviewEvent" :i18nText="i18nText" />
        <EditGroup v-model:visible="editGroupDialogVisible" :roomId="props.room.roomId" />
        <PhotoViewer v-model:visible="photoViewerVisible" :imageEvent="photoViewerImageEvent" />
        <FixDecryptionDialog v-model:visible="fixDecryptDialogVisible" :roomId="room.roomId" :eventId="fixDecryptEventId" />
    </div>
</template>

<script setup lang="ts">
import {
    computed, defineAsyncComponent, nextTick, onUpdated,
    onMounted, onUnmounted, provide, ref, watch, type PropType,
 } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { v4 as uuidv4 } from 'uuid'

import { throttle } from '@/utils/timing'
import { downloadFile } from '@/utils/file-access'

import { vTimelineEventRender } from '@/directives/timeline-event-render'

import { useApplication } from '@/composables/application'
import { useEmoji } from '@/composables/emoji'
import { useKeyboard } from '@/composables/keyboard'
import { useMediaCache } from '@/composables/media-cache'
import { useRooms } from '@/composables/rooms'
import { attachmentEventMessageTypes, messageEventTypes, settingsEventTypes } from '@/composables/event-timeline'

import { useAccountDataStore } from '@/stores/account-data'
import { useClientSettingsStore } from '@/stores/client-settings'
import { useMegolmStore } from '@/stores/megolm'
import { useProfileStore } from '@/stores/profile'
import { useRoomStore } from '@/stores/room'
import { useSessionStore } from '@/stores/session'

const EditGroup = defineAsyncComponent(() => import('./EditGroup.vue'))
const FixDecryptionDialog = defineAsyncComponent(() => import('@/views/EncryptionSetup/FixDecryptionDialog.vue'))
import MessageBeginning from './MessageBeginning.vue'
import MessagePlaceholder from './MessagePlaceholder.vue'
const MessagePreviewDialog = defineAsyncComponent(() => import('./MessagePreviewDialog.vue'))
const PhotoViewer = defineAsyncComponent(() => import('./PhotoViewer.vue'))
import TimelineEventsMessageActions from './TimelineEventsMessageActions.vue'
import TimelineEventsMoreMessageActions from './TimelineEventsMoreMessageActions.vue'

import ScrollPanel from 'primevue/scrollpanel'
import { useToast } from 'primevue/usetoast'

import {
    type JoinedRoom, type RoomEventReactionRender,
    type ApiV3SyncClientEventWithoutRoomId,
    type EventFileContent,
    type EventImageContent,
    type EventWithRenderInfo,
    type EmojiPickerEmojiItem,
} from '@/types'

interface EventChunk {
    id: string;
    loading: boolean;
    events: EventWithRenderInfo[];
}

const { t } = useI18n()
const toast = useToast()

const { isTouchEventsDetected } = useApplication()
const { currentRoomCustomEmojiByCode } = useEmoji()
const { isCtrlKeyPressed, isShiftKeyPressed } = useKeyboard()
const { getMxcBlob } = useMediaCache()
const { getMessageEvent, getPreviousMessages } = useRooms()

const { userNicknames } = storeToRefs(useAccountDataStore())
const { settings } = useClientSettingsStore()
const { decryptEvent: decryptMegolmEvent } = useMegolmStore()
const { profiles } = storeToRefs(useProfileStore())
const roomStore = useRoomStore()
const {
    currentRoomEncryptionEnabledTimestamp,
    decryptedRoomEvents,
    spoilersMarkedVisible,
} = storeToRefs(roomStore)
const { getTimelineEventById, getTimelineEventIndexById } = roomStore
const { userId: sessionUserId } = storeToRefs(useSessionStore())

const props = defineProps({
    room: {
        type: Object as PropType<JoinedRoom>,
        required: true,
    },
    referenceEventId: {
        type: String,
        default: undefined,
    },
})

const emit = defineEmits<{
    (e: 'update:anchoredToBottom', isAnchoredToBottom: boolean): void
    (e: 'update:editEventId', editEventId?: string): void
    (e: 'update:replyToEventId', replyToEventId?: string): void
    (e: 'inviteUsers'): void
    (e: 'retrySendMessage', eventId?: string): void
    (e: 'selectEmoji', event: Event, referenceEventId: string): void
    (e: 'showUserProfile', event: Event, userId: string): void
    (e: 'toggleEmoji', emoji: EmojiPickerEmojiItem, referenceEventId: string): void
}>()

const componentUuid = uuidv4()

// Caching i18n here, calculating in template for each item is extremely slow.
const i18nText = {
    noticeTag: t('room.noticeTag'),
    roomEncryptionEnabled: t('room.roomEncryptionEnabled'),
    unableToDecryptMessage: t('room.unableToDecryptMessage'),
    messageUnencryptedWarning: t('room.messageUnencryptedWarning'),
    messageUnencryptedWarningLearnMoreLink: t('room.messageUnencryptedWarningLearnMoreLink'),
    learnFixDecrypt: t('room.learnFixDecrypt'),
    joinedTheRoomPrefix: t('room.joinedTheRoomPrefix'),
    joinedTheRoomSuffix: t('room.joinedTheRoomSuffix'),
    leftTheRoom: t('room.leftTheRoom'),
    rejectedAnInvite: t('room.rejectedAnInvite'),
    bannedFromTheRoom: t('room.bannedFromTheRoom'),
    changedGroupIcon: t('room.changedGroupIcon'),
    changedGroupNamePrefix: t('room.changedGroupNamePrefix'),
    changedGroupNameSuffix: t('room.changedGroupNameSuffix'),
    removedGroupName: t('room.removedGroupName'),
    editGroupButton: t('room.editGroupButton'),
    addReaction: t('room.addReaction'),
    messageEditedIndicator: t('room.messageEditedIndicator'),
    messageSendError: t('room.messageSendError'),
    messageSendRetry: t('room.messageSendRetry'),
    editMessage: t('room.editMessage'),
    replyMessage: t('room.replyMessage'),
    forwardMessage: t('room.forwardMessage'),
    moreActionsMessage: t('room.moreActionsMessage'),
    replyToNoMessagePreview: t('room.replyToNoMessagePreview'),
    replyToNoAttachmentPreview: t('room.replyToNoAttachmentPreview'),
    unknownUserDisplayname: t('room.unknownUserDisplayname'),
    audioLoadFailed: t('errors.message.audioLoadFailed'),
}

const eventChunkSwapReadyUuid = ref<string | undefined>()
const eventChunkRenderUuid = ref<string>('')
const eventChunkRenderShowOldEventMessagePlaceholder = ref<boolean>(false)
const eventChunkBuffers = ref<EventChunk[][]>([[], []])
const activeEventChunkBufferIndex = ref<number>(0)
const eventChunkBufferContainers = ref<HTMLDivElement[]>([])

const isJustMounted = ref<boolean>(false)
const scrollPanel = ref<typeof ScrollPanel>()
const scrollPanelContent = ref<HTMLDivElement>()
const scrollContentContainer = ref<HTMLDivElement>()

const oldMessagePlaceholder = ref<InstanceType<typeof MessagePlaceholder>>()
const oldMessagePlaceholderHeight = ref<number>(1)
const newMessagePlaceholder = ref<InstanceType<typeof MessagePlaceholder>>()
const newMessagePlaceholderHeight = ref<number>(1)
const messagePlaceholderScrollMargin = ref<number>(Math.min(Math.floor(window.innerHeight / 2), 200))
const isLoadingPreviousMessages = ref<boolean>(false)

const needsMoreOldEvents = ref<boolean>(false)
const needsMoreNewEvents = ref<boolean>(false)

const eventsPerChunk = Math.ceil(Math.sqrt(window.innerHeight * 2 / 26))
const chunksPerView = Math.ceil(Math.sqrt(window.innerHeight * 2 / 26))
const offsetEventId = ref<string | undefined>()
const lastBufferSwapOffsetEventId = ref<string | undefined>()
const offsetChunk = ref<number>(0) // Relative to offsetEventId. Negative numbers scroll up for older messages
const lastBufferSwapOffsetChunk = ref<number>(0)
const lastBufferSwapVisibleTimelineLength = ref<number>(0)
const editGroupDialogVisible = ref<boolean>(false)
const fixDecryptDialogVisible = ref<boolean>(false)
const fixDecryptEventId = ref<string>()
const photoViewerVisible = ref<boolean>(false)
const photoViewerImageEvent = ref<ApiV3SyncClientEventWithoutRoomId<EventImageContent> | undefined>()

const isAnchoredToBottom = ref<boolean>(true)
const isActivelyScrolling = ref<boolean>(false)
let isAnchorScrollBottomRepeat = false
let anchorScrollBottomRepeatTimeoutHandle: number | undefined = undefined
watch(() => props.room, () => {
    isAnchoredToBottom.value = true
})
watch(() => isAnchoredToBottom.value, () => {
    emit('update:anchoredToBottom', isAnchoredToBottom.value)
}, { immediate: true })
watch(() => props.room.visibleTimeline.length, () => {
    if (isAnchoredToBottom.value && props.room.visibleTimeline.length > 0) {
        offsetEventId.value = props.room.visibleTimeline[props.room.visibleTimeline.length - 1]?.eventId
        offsetChunk.value = 0
    }
})

const offsetEventIndex = computed<number>(() => {
    return getTimelineEventIndexById(props.room.visibleTimeline, offsetEventId.value) ?? props.room.visibleTimeline.length - 1
})

const showOldEventMessagePlaceholder = ref<boolean>(true)
function shouldShowOldEventMessagePlaceholder() {
    if (offsetEventIndex.value + (offsetChunk.value * eventsPerChunk) - (chunksPerView * eventsPerChunk) > 0) {
        return true
    } else {
        return props.room.visibleTimeline[0]?.type !== 'm.room.create'
    }
}
watch(() => showOldEventMessagePlaceholder.value, () => {
    if (showOldEventMessagePlaceholder.value) {
        nextTick(() => {
            oldMessagePlaceholderHeight.value = oldMessagePlaceholder.value?.$el.offsetHeight ?? 1
        })
    }
}, { immediate: true })

const showNewEventMessagePlaceholder = computed<boolean>(() => {
    return (
        !isAnchoredToBottom.value
        && offsetEventIndex.value + 1 + (offsetChunk.value * eventsPerChunk) < props.room.visibleTimeline.length
    )
})
watch(() => showNewEventMessagePlaceholder.value, () => {
    if (showNewEventMessagePlaceholder.value) {
        nextTick(() => {
            newMessagePlaceholderHeight.value = newMessagePlaceholder.value?.$el.offsetHeight ?? 1
        })
    }
}, { immediate: true })

const isAllLoadingEventChunksReady = ref<boolean>(true)
const loadingEventChunks = computed<EventChunk[]>(() => {
    const today = new Date()
    const chunks: EventChunk[] = []

    let previousEvent: ApiV3SyncClientEventWithoutRoomId | undefined = undefined
    let currentDateDividerTs: number = 0
    for (let currentChunk = offsetChunk.value - chunksPerView; currentChunk <= offsetChunk.value; currentChunk += 1) {
        const currentChunkBottomEventIndex = offsetEventIndex.value + (currentChunk * eventsPerChunk)

        const chunk: EventChunk = {
            id: `${offsetEventId.value}::${offsetChunk.value + currentChunk}`,
            loading: true, // TODO - wait for network calls
            events: [],
        }

        const eventSlice = props.room.visibleTimeline.slice(
            Math.max(0, currentChunkBottomEventIndex + 1 - eventsPerChunk), Math.max(0, currentChunkBottomEventIndex + 1)
        )
        for (const event of eventSlice) {

            const previousEventOriginDate = new Date(currentDateDividerTs)
            const originDate = new Date(event.originServerTs)
            const category = settingsEventTypes.includes(event.type) ? 'settings' : messageEventTypes.includes(event.type) ? 'message' : 'unknown'
            const previousCategory = settingsEventTypes.includes(previousEvent?.type as string) ? 'settings' : messageEventTypes.includes(previousEvent?.type as string) ? 'message' : 'unknown'
            
            const currentDateDivider = (
                originDate.getFullYear() > previousEventOriginDate.getFullYear()
                || (
                    originDate.getFullYear() === previousEventOriginDate.getFullYear()
                    && originDate.getMonth() > previousEventOriginDate.getMonth()
                )
                || (
                    originDate.getFullYear() === previousEventOriginDate.getFullYear()
                    && originDate.getDate() !== previousEventOriginDate.getDate()
                    && originDate.getDate() > previousEventOriginDate.getDate()
                )
            ) ? originDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : undefined

            const isToday = (
                originDate.getFullYear() === today.getFullYear()
                && originDate.getMonth() === today.getMonth()
                && originDate.getDate() === today.getDate()
            )

            const reactions: RoomEventReactionRender[] = (props.room.reactions[event.eventId] ?? []).map((reaction) => {
                return {
                    ...reaction,
                    highlighted: !!reaction.events.find((event) => event.sender === sessionUserId.value),
                    displaynames: reaction.events.map((event) => userNicknames.value[event.sender] ?? profiles.value[event.sender]?.displayname ?? event.sender)
                }
            })

            const replacementEvent = props.room.replacements[event.eventId]?.find((replacementEvent) => replacementEvent.sender === event.sender)

            const mentionedUserIds: string[] = event.content?.['m.mentions']?.userIds ?? []
            const replyToEventId: string | undefined = event.content?.['m.relates_to']?.['m.in_reply_to']?.eventId
            let replyTo: EventWithRenderInfo['replyTo'] = undefined
            if (replyToEventId) {
                const replyToEvent = getTimelineEventById(props.room.visibleTimeline, replyToEventId, 200, currentChunkBottomEventIndex)
                const replyToReplacementEvent = props.room.replacements[replyToEventId]?.find((replacementEvent) => replacementEvent.sender === event.sender)
                const replyUserId = replyToEvent?.sender ?? mentionedUserIds[0]
                const userProfile = profiles.value[replyUserId ?? '']
                const replyToEventContent = (replyToReplacementEvent && decryptedRoomEvents.value[replyToReplacementEvent.eventId])
                    ? decryptedRoomEvents.value[replyToReplacementEvent.eventId]
                    : (replyToReplacementEvent?.content)
                        ? replyToReplacementEvent.content
                        : (replyToEvent && decryptedRoomEvents.value[replyToEventId])
                            ? decryptedRoomEvents.value[replyToEventId].content
                            : replyToEvent?.content
                const isAttachment = attachmentEventMessageTypes.includes(replyToEventContent?.msgtype)
                replyTo = {
                    userId: replyUserId,
                    displayname: userNicknames.value[replyUserId!] ?? userProfile?.displayname ?? replyUserId,
                    avatarUrl: userProfile?.avatarUrl,
                    eventId: replyToEventId,
                    bodyPreview: !isAttachment ? replyToEventContent?.body?.substring(0, 1000) : undefined,
                    messageType: replyToEventContent?.msgtype ?? 'm.text',
                    isAttachment,
                }
            }

            chunk.events.push({
                category,
                currentDateDivider,
                displayHeader: previousEvent?.sender !== event.sender
                    || category !== previousCategory
                    || !!replyTo
                    || !!currentDateDivider
                    || originDate.getTime() - previousEventOriginDate.getTime() > 300000,
                displayname: userNicknames.value[event.sender] ?? profiles.value[event.sender]?.displayname ?? event.sender,
                headerTime: isToday
                    ? originDate.toLocaleString(undefined, { hour: 'numeric', minute: 'numeric' })
                    : originDate.toLocaleString(undefined, { year: '2-digit', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }),
                isSpoiler: !!event.content?.['page.codeberg.everypizza.msc4193.spoiler'],
                time: originDate.toLocaleString(undefined, { hour: 'numeric', minute: 'numeric' }),
                isoTimestamp: originDate.toISOString(),
                avatarUrl: profiles.value[event.sender]?.avatarUrl,
                event: replacementEvent?.content?.['m.new_content'] ? { ...event, content: replacementEvent.content['m.new_content'] } : event,
                replacementEvent,
                replacementDate: replacementEvent?.originServerTs ? new Date(replacementEvent.originServerTs).toLocaleString() : undefined,
                reactions,
                replyTo,
                showUnencryptedWarning: settings.warnUnencryptedMessageInEncryptedRoom
                    && currentRoomEncryptionEnabledTimestamp.value != null
                    && event.sender !== sessionUserId.value
                    && event.type !== 'm.room.encrypted'
                    && event.originServerTs > currentRoomEncryptionEnabledTimestamp.value
            })

            previousEvent = event
            currentDateDividerTs = event.type === 'm.room.create' ? 0 : (event.originServerTs > currentDateDividerTs ? event.originServerTs : currentDateDividerTs)
        }

        isAllLoadingEventChunksReady.value = false
        const decryptPromises: Promise<void>[] = []
        for (const event of chunk.events) {
            if (event.replacementEvent?.type === 'm.room.encrypted') {
                if (decryptedRoomEvents.value[event.replacementEvent.eventId]) {
                    event.replacementEvent = decryptedRoomEvents.value[event.replacementEvent.eventId]!
                    event.event.content = event.replacementEvent.content['m.new_content']
                    continue
                }
                decryptPromises.push(
                    decryptMegolmEvent(props.room.roomId, event.event.content.sessionId, event.event.content.senderKey, event.replacementEvent.content).then((decrypted) => {
                        const decryptedEvent = {
                            ...event.replacementEvent,
                            ...decrypted,
                        }
                        decryptedRoomEvents.value[event.event.eventId] = decryptedEvent
                        event.replacementEvent = decryptedEvent
                        event.event.content = decryptedEvent.content['m.new_content']
                    })
                )
            } else if (event.event.type === 'm.room.encrypted') {
                if (decryptedRoomEvents.value[event.event.eventId]) {
                    event.event = decryptedRoomEvents.value[event.event.eventId]!
                    continue
                }
                decryptPromises.push(
                    decryptMegolmEvent(props.room.roomId, event.event.content.sessionId, event.event.content.senderKey, event.event.content).then((decrypted) => {
                        const decryptedEvent = {
                            ...event.event,
                            ...decrypted,
                        }
                        decryptedRoomEvents.value[event.event.eventId] = decryptedEvent
                        event.event = decryptedEvent
                        event.isSpoiler = !!decryptedEvent.content?.['page.codeberg.everypizza.msc4193.spoiler']
                    })
                )
            }
        }
        Promise.allSettled(decryptPromises).then(() => {
            isAllLoadingEventChunksReady.value = true
            for (const event of chunk.events) {
                event.isSpoiler = !!event.event.content?.['page.codeberg.everypizza.msc4193.spoiler']
            }
        })
        chunks.push(chunk)
    }
    return chunks
})
watch(() => [loadingEventChunks.value, isAllLoadingEventChunksReady.value] as const, ([eventChunks, isAllLoadingEventChunksReady]) => {
    if (!isAllLoadingEventChunksReady) return
    if (eventChunkSwapReadyUuid.value) {
        swapEventChunkBuffers()
    }
    const inactiveEventChunkBufferIndex = activeEventChunkBufferIndex.value === 0 ? 1 : 0
    eventChunkBuffers.value[inactiveEventChunkBufferIndex] = eventChunks
    eventChunkRenderUuid.value = uuidv4()
    eventChunkRenderShowOldEventMessagePlaceholder.value = shouldShowOldEventMessagePlaceholder()
}, { immediate: true })

watch(() => props.room.nonSequentialUpdateUuid, () => {
    nextTick(() => {
        swapEventChunkBuffers()
    })
})

onUpdated(() => {
    if (eventChunkRenderUuid.value) {
        eventChunkSwapReadyUuid.value = eventChunkRenderUuid.value
        eventChunkRenderUuid.value = ''
        if (isAnchoredToBottom.value) {
            swapEventChunkBuffers()
        }
    }
    if (isAnchoredToBottom.value && isAnchorScrollBottomRepeat) {
        scrollPanelContent.value!.scrollTop = scrollPanelContent.value!.scrollHeight - scrollPanelContent.value!.offsetHeight
    }
})

async function swapEventChunkBuffers() {
    if (!eventChunkSwapReadyUuid.value) return

    const inactiveEventChunkBufferIndex = activeEventChunkBufferIndex.value === 0 ? 1 : 0

    manageScrollSwap:
    if (scrollPanelContent.value) {
        const activeContainer = eventChunkBufferContainers.value[activeEventChunkBufferIndex.value]
        const inactiveContainer = eventChunkBufferContainers.value[inactiveEventChunkBufferIndex]
        if (!activeContainer || !inactiveContainer) break manageScrollSwap
        const oldEvents = activeContainer.querySelectorAll('[data-event-id]')

        let oldReferenceEvent = oldEvents[0]
        let newReferenceEvent = inactiveContainer.querySelector(`[data-event-id="${oldReferenceEvent?.getAttribute('data-event-id')}"]`)
        if (!newReferenceEvent) {
            oldReferenceEvent = oldEvents[oldEvents.length - 1]
            newReferenceEvent = inactiveContainer.querySelector(`[data-event-id="${oldReferenceEvent?.getAttribute('data-event-id')}"]`)
        }
        if (!newReferenceEvent) {
            await nextTick()
            oldReferenceEvent = oldEvents[0]
            newReferenceEvent = inactiveContainer.querySelector(`[data-event-id="${oldReferenceEvent?.getAttribute('data-event-id')}"]`)
            if (!newReferenceEvent) {
                oldReferenceEvent = oldEvents[oldEvents.length - 1]
                newReferenceEvent = inactiveContainer.querySelector(`[data-event-id="${oldReferenceEvent?.getAttribute('data-event-id')}"]`)
            }
        }
        if (!oldReferenceEvent || !newReferenceEvent) break manageScrollSwap

        const newReferenceClientRect = newReferenceEvent.getBoundingClientRect() 
        const newReferenceScrollTop = newReferenceClientRect.top - inactiveContainer.getBoundingClientRect().top
        const oldReferenceClientRect = oldReferenceEvent.getBoundingClientRect()
        const oldReferenceScrollTop = oldReferenceClientRect.top - activeContainer.getBoundingClientRect().top

        const oldMessagePlaceholderGap = 0 /* (
            (eventChunkRenderShowOldEventMessagePlaceholder.value ? oldMessagePlaceholderHeight.value : 0)
            - (showOldEventMessagePlaceholder.value ? oldMessagePlaceholderHeight.value : 0)
        )*/

        const oldScrollTop = scrollPanelContent.value!.scrollTop
        inactiveContainer.parentElement?.classList.remove('p-chattimeline-scroll-content-sizer')
        activeContainer.parentElement?.classList.add('p-chattimeline-scroll-content-sizer')
        if (
            isAnchoredToBottom.value
            && !isActivelyScrolling.value
            && (
                (
                    offsetEventId.value === lastBufferSwapOffsetEventId.value
                    && offsetChunk.value === lastBufferSwapOffsetChunk.value
                )
                || (
                    offsetEventId.value !== lastBufferSwapOffsetEventId.value
                    && props.room.visibleTimeline.length > lastBufferSwapVisibleTimelineLength.value
                    && offsetEventId.value === props.room.visibleTimeline[props.room.visibleTimeline.length - 1]?.eventId
                )
            )
        ) {
            scrollPanelContent.value!.scrollTop = scrollPanelContent.value!.scrollHeight - scrollPanelContent.value!.offsetHeight
            isAnchorScrollBottomRepeat = true
            clearTimeout(anchorScrollBottomRepeatTimeoutHandle)
            anchorScrollBottomRepeatTimeoutHandle = setTimeout(anchorScrollBottomRepeatCallback, 50)
        } else {
            scrollPanelContent.value!.scrollTop = oldScrollTop + (newReferenceScrollTop - oldReferenceScrollTop) + (newReferenceClientRect.height - oldReferenceClientRect.height) + oldMessagePlaceholderGap
        }
    }

    eventChunkSwapReadyUuid.value = undefined
    eventChunkBuffers.value[activeEventChunkBufferIndex.value] = []
    activeEventChunkBufferIndex.value = inactiveEventChunkBufferIndex
    showOldEventMessagePlaceholder.value = eventChunkRenderShowOldEventMessagePlaceholder.value

    lastBufferSwapOffsetEventId.value = offsetEventId.value
    lastBufferSwapOffsetChunk.value = offsetChunk.value
    lastBufferSwapVisibleTimelineLength.value = props.room.visibleTimeline.length
}
function anchorScrollBottomRepeatCallback() {
    isAnchorScrollBottomRepeat = false
}

let fetchOldEventsAbortController: AbortController | undefined
watch(() => needsMoreOldEvents.value, async () => {
    fetchOldEventsAbortController?.abort()

    if (needsMoreOldEvents.value) {
        const abortController = new AbortController()
        fetchOldEventsAbortController = abortController

        let targetOffsetChunk = offsetChunk.value - Math.round(chunksPerView / 2)
        let targetOffsetEventId = offsetEventId.value
        let targetOffsetEventIndex = offsetEventIndex.value

        // If the top of the timeline is encountered, reset to fit the chunked events exactly to the top.
        if (props.room.visibleTimeline[0]?.type === 'm.room.create') {
            targetOffsetChunk = Math.max(Math.floor(-offsetEventIndex.value / eventsPerChunk), targetOffsetChunk)
            if (
                offsetEventIndex.value + 1 + (targetOffsetChunk * eventsPerChunk)
                < (eventsPerChunk * chunksPerView)
            ) {
                targetOffsetEventIndex = Math.min(props.room.visibleTimeline.length - 1, eventsPerChunk * chunksPerView)
                const targetOffsetEvent = props.room.visibleTimeline[targetOffsetEventIndex]
                if (!targetOffsetEvent) {
                    needsMoreOldEvents.value = false
                    return
                }
                targetOffsetEventId = targetOffsetEvent.eventId
                targetOffsetChunk = 0
            }
        }

        await loadPreviousMessagesUpToChunk(targetOffsetChunk, targetOffsetEventId, abortController)

        if (abortController?.signal.aborted) return

        // If the top of the timeline is encountered, reset to fit the window exactly to the top.
        if (props.room.visibleTimeline[0]?.type === 'm.room.create') {
            targetOffsetChunk = Math.max(Math.floor(-offsetEventIndex.value / eventsPerChunk), targetOffsetChunk)
            if (
                offsetEventIndex.value + 1 + (targetOffsetChunk * eventsPerChunk)
                < (eventsPerChunk * chunksPerView)
            ) {
                targetOffsetEventIndex = Math.min(props.room.visibleTimeline.length - 1, eventsPerChunk * chunksPerView)
                const targetOffsetEvent = props.room.visibleTimeline[targetOffsetEventIndex]
                if (!targetOffsetEvent) {
                    needsMoreOldEvents.value = false
                    return
                }
                targetOffsetEventId = targetOffsetEvent.eventId
                targetOffsetChunk = 0
            }
        }

        if (
            needsMoreOldEvents.value
            && (
                targetOffsetChunk !== offsetChunk.value
                || targetOffsetEventId !== offsetEventId.value
                || targetOffsetEventIndex !== offsetEventIndex.value
            )
        ) {
            needsMoreOldEvents.value = false
            offsetChunk.value = targetOffsetChunk
            offsetEventId.value = targetOffsetEventId
            await nextTick()
        }
    } else {
        fetchOldEventsAbortController?.abort()
    }
}, { immediate: true })

let fetchNewEventsAbortController: AbortController | undefined
watch(() => needsMoreNewEvents.value, async () => {
    fetchNewEventsAbortController?.abort()

    if (needsMoreNewEvents.value) {
        const abortController = new AbortController()
        fetchNewEventsAbortController = abortController

        if (
            needsMoreNewEvents.value
            && offsetEventIndex.value + 1 + (offsetChunk.value * eventsPerChunk) - (chunksPerView * eventsPerChunk) < props.room.visibleTimeline.length
        ) {
            needsMoreNewEvents.value = false
            offsetChunk.value += Math.round(chunksPerView / 2)
            const maxOffsetChunk = Math.floor((props.room.visibleTimeline.length - offsetEventIndex.value) / eventsPerChunk)
            if (offsetChunk.value > maxOffsetChunk) {
                const latestEvent = props.room.visibleTimeline[props.room.visibleTimeline.length - 1]
                if (latestEvent) {
                    offsetEventId.value = latestEvent.eventId
                    offsetChunk.value = 0
                }
            }
        }
    } else {
        fetchNewEventsAbortController?.abort()
    }
}, { immediate: true })

onMounted(() => {
    if (scrollPanel.value) {
        scrollPanelContent.value = (scrollPanel.value as any).$el?.querySelector('.p-scrollpanel-content')
        scrollPanelContent.value?.addEventListener('scroll', onScrollContent)
        scrollPanelContent.value?.addEventListener('wheel', onWheelContent)
    }

    // TODO - update to latest message whenever scrolled to bottom (live view)
    if (props.room.visibleTimeline.length > 0) {
        offsetEventId.value = props.room.visibleTimeline[props.room.visibleTimeline.length - 1]?.eventId
    }

    // Initial timeline render
    eventChunkBuffers.value[activeEventChunkBufferIndex.value] = loadingEventChunks.value
    showOldEventMessagePlaceholder.value = shouldShowOldEventMessagePlaceholder()

    fetchOldEventsAbortController?.abort()
    fetchOldEventsAbortController = new AbortController()
    loadPreviousMessagesUpToChunk(offsetChunk.value, offsetEventId.value, fetchOldEventsAbortController)

    // TODO - how to handle error scenarios:
    // 400/404 M_NOT_FOUND
    // 400 M_LIMIT_EXCEEDED
    // 403 M_FORBIDDEN
    // May need to reset sync in some cases if can't request more message history. Prompt user?

    document.addEventListener('keydown', onKeydownTimeline, true)
    window.addEventListener('pointercancel', onPointerCancelTimeline, true)

    nextTick(() => {
        isJustMounted.value = true

        scrollToBottom()
    })
})

onUnmounted(() => {
    window.dispatchEvent(new CustomEvent('discortix-timeline-unmounted', { detail: { id: componentUuid } }))
    scrollPanelContent.value?.removeEventListener('scroll', onScrollContent)
    scrollPanelContent.value?.removeEventListener('wheel', onWheelContent)
    fetchOldEventsAbortController?.abort()
    fetchNewEventsAbortController?.abort()

    document.removeEventListener('keydown', onKeydownTimeline, true)
    window.removeEventListener('pointercancel', onPointerCancelTimeline, true)
})

async function loadPreviousMessagesUpToChunk(targetOffsetChunk: number, targetOffsetEventId?: string, abortController?: AbortController) {
    isLoadingPreviousMessages.value = true
    try {
        if (targetOffsetEventId === offsetEventId.value) {
            while (
                offsetEventIndex.value + 1 + (targetOffsetChunk * eventsPerChunk) - (chunksPerView * eventsPerChunk) < 0
                && props.room.visibleTimeline[0]?.type !== 'm.room.create'
            ) {
                if (abortController?.signal.aborted) throw new Error('Canceling network fetch.')

                await getPreviousMessages(props.room.roomId)

                if (abortController?.signal.aborted) throw new Error('Canceling network fetch.')
                await nextTick()
                await new Promise((resolve) => requestAnimationFrame(resolve))
            }
        }
    } catch (error) {
        // Throws are used for flow control
    } finally {
        isLoadingPreviousMessages.value = false
    }
}

function determineIfNearPlaceholderMargins() {
    if (!scrollPanelContent.value || eventChunkSwapReadyUuid.value) return
    const needsOld = showOldEventMessagePlaceholder.value && (
        scrollPanelContent.value.scrollTop < oldMessagePlaceholderHeight.value + messagePlaceholderScrollMargin.value
    )

    const needsNew = showNewEventMessagePlaceholder.value && (
        scrollPanelContent.value.scrollTop > (scrollPanelContent.value.scrollHeight - scrollPanelContent.value.offsetHeight) - (newMessagePlaceholderHeight.value + messagePlaceholderScrollMargin.value)
    )

    if (needsOld && needsNew) {
        if (scrollPanelContent.value.scrollTop < (scrollPanelContent.value.scrollHeight - scrollPanelContent.value.offsetHeight) / 3) {
            needsMoreOldEvents.value = true
            needsMoreNewEvents.value = false
        } else if (scrollPanelContent.value.scrollTop > (scrollPanelContent.value.scrollHeight - scrollPanelContent.value.offsetHeight) * (2/3)) {
            needsMoreOldEvents.value = false
            needsMoreNewEvents.value = true
        }
    } else {
        needsMoreOldEvents.value = needsOld
        needsMoreNewEvents.value = needsNew
    }
}

let scrollEndTimeoutHandle: number | undefined = undefined
function onScrollContent(event: Event) {
    clearTimeout(scrollEndTimeoutHandle)
    scrollEndTimeoutHandle = setTimeout(() => {
        onScrollContentEnd()
    }, 80)
    onScrollContentDeferred(event)
}

function onScrollContentEnd() {
    if (eventChunkSwapReadyUuid.value) {
        swapEventChunkBuffers()
    }
}

const onScrollContentDeferred = throttle((event: Event) => {
    if (isJustMounted.value) {
        isJustMounted.value = false
    } else {
        if (!scrollPanelContent.value) return

        determineIfNearPlaceholderMargins()
        
        isAnchoredToBottom.value = (
            // Roughly, bottom of list is within render view.
            (offsetEventIndex.value + 1 + (offsetChunk.value * eventsPerChunk) > props.room.visibleTimeline.length - eventsPerChunk)
            // Scroll bar is near the bottom.
            && scrollPanelContent.value.scrollTop >= scrollPanelContent.value.scrollHeight - scrollPanelContent.value.offsetHeight - 100
        )
        
    }
}, 100)

let wheelEndTimeoutHandle: number | undefined = undefined
function onWheelContent(event: WheelEvent) {
    isActivelyScrolling.value = true
    clearTimeout(wheelEndTimeoutHandle)
    wheelEndTimeoutHandle = setTimeout(onWheelContentEnd, 80)
}

function onWheelContentEnd() {
    isActivelyScrolling.value = false
}

async function scrollToBottom() {
    if (scrollPanelContent.value) {
        scrollPanelContent.value.scrollTop = scrollPanelContent.value.scrollHeight - scrollPanelContent.value.offsetHeight
    }
    isAnchoredToBottom.value = true
    needsMoreNewEvents.value = true
    await nextTick()
}

/*-------------------*\
|                     |
|   Message Actions   |
|                     |
\*-------------------*/

const timelineEventsMessageActions = ref<InstanceType<typeof TimelineEventsMessageActions>>()

const messageActionsTargetEventId = ref<string>()
const messageActionsTargetEventSender = ref<string>()
const messageActionsContextMenuTargetEventId = ref<string>()
const keepMessageActionsContextMenuTargetEventId = ref<boolean>(false)
const messageActionsContextMenuTargetEventSender = ref<string>()
const messageActionsTargetElement = ref<HTMLElement>()

const timelineEventsMoreMessageActions = ref<InstanceType<typeof TimelineEventsMoreMessageActions>>()

function resetMessageActionsContextMenuTargetEventId() {
    messageActionsContextMenuTargetEventId.value = undefined
    keepMessageActionsContextMenuTargetEventId.value = false
}

function showMoreMessageActions(event: MouseEvent) {
    if (!timelineEventsMoreMessageActions.value) return
    if (messageActionsContextMenuTargetEventId.value) {
        timelineEventsMoreMessageActions.value.hide()
    } else {
        messageActionsContextMenuTargetEventId.value = messageActionsTargetEventId.value
        messageActionsContextMenuTargetEventSender.value = messageActionsTargetEventSender.value
        timelineEventsMoreMessageActions.value.show(event)
    }
}

function onHideMoreMessageActionsContextMenu() {
    requestAnimationFrame(() => {
        if (!keepMessageActionsContextMenuTargetEventId.value) {
            messageActionsContextMenuTargetEventId.value = undefined
        }
    })
}

function onMouseOverTimeline(event: MouseEvent) {
    const target = event.target as HTMLElement
    if (isTouchEventsDetected.value || !target?.getAttribute || timelineEventsMessageActions.value?.$el?.contains(target)) return
    const eventElement = target?.closest('[data-event-id]')
    const eventId = eventElement?.getAttribute('data-event-id')
    const eventSender = eventElement?.getAttribute('data-event-sender') ?? ''
    if (eventId) {
        messageActionsTargetElement.value = eventElement as HTMLElement
        messageActionsTargetEventId.value = eventId
        messageActionsTargetEventSender.value = eventSender
        nextTick(() => {
            timelineEventsMessageActions.value?.updateMessageActionsFloating()
        })
    } else {
        messageActionsTargetElement.value = undefined
        messageActionsTargetEventId.value = undefined
    }
}

function onMouseLeaveTimeline(event: MouseEvent) {
    messageActionsTargetElement.value = undefined
    messageActionsTargetEventId.value = undefined
}

/*------------------------------------*\
|                                      |
|   Handle Interaction with Timeline   |
|                                      |
\*------------------------------------*/

let pointerDownTimelineTarget: HTMLElement | null
let pointerDownTimelinePointerId: number = -1
let pointerDownTimelineItemX: number = 0
let pointerDownTimelineItemY: number = 0
let pointerMoveTimelineItemX: number = 0
let pointerMoveTimelineItemY: number = 0
let pointerDownTimelineTimestamp: number = 0
let pointerPressTimelineTimeoutHandle: number | undefined = undefined

function onPointerDownTimeline(event: PointerEvent) {
    if (event.button === 0) {
        pointerDownTimelinePointerId = event.pointerId
        pointerDownTimelineTarget = event.target as HTMLElement
        pointerDownTimelineItemX = event.pageX
        pointerDownTimelineItemY = event.pageY
        pointerMoveTimelineItemX = event.pageX
        pointerMoveTimelineItemY = event.pageY
        pointerDownTimelineTimestamp = window.performance.now()
        console.log('down ', pointerDownTimelineItemX)
    }

    clearTimeout(pointerPressTimelineTimeoutHandle)
    if (event.button === 0 && isTouchEventsDetected.value) {
        pointerPressTimelineTimeoutHandle = setTimeout(() => {
            console.log(pointerMoveTimelineItemX, pointerDownTimelineItemX)
            if (
                Math.abs(pointerMoveTimelineItemX - pointerDownTimelineItemX) < settings.pointerMoveRadius
                && Math.abs(pointerMoveTimelineItemY - pointerDownTimelineItemY) < settings.pointerMoveRadius
            ) {
                onPointerPressTimeline(event)
            }
        }, settings.pointerPressTimeout)
    } else {
        pointerPressTimelineTimeoutHandle = undefined
    }
}

function onPointerCancelTimeline(event: PointerEvent) {
    clearTimeout(pointerPressTimelineTimeoutHandle)
}

function onPointerMoveTimeline(event: PointerEvent) {
    if (event.pointerId === pointerDownTimelinePointerId) {
        pointerMoveTimelineItemX = event.pageX
        pointerMoveTimelineItemY = event.pageY
    }
}

function onPointerUpTimeline(event: PointerEvent) {
    // "Click" / "Tap" simulation. Need to do this because of the Safari "double tap with hover states" issue.
    if (event.button === 0) {
        clearTimeout(pointerPressTimelineTimeoutHandle)
    }
    let isPrimaryPointerUp = false
    if (event.pointerId === pointerDownTimelinePointerId) {
        isPrimaryPointerUp = true
        pointerDownTimelinePointerId = -1
    }
    if (
        event.button === 0
        && isPrimaryPointerUp
        && event.target && event.target === pointerDownTimelineTarget
        && window.performance.now() - pointerDownTimelineTimestamp <= settings.pointerClickTimeout
        && Math.abs(event.pageX - pointerDownTimelineItemX) < settings.pointerMoveRadius
        && Math.abs(event.pageY - pointerDownTimelineItemY) < settings.pointerMoveRadius
    ) {
        const link = (event.target as HTMLElement)?.closest('a[href],[data-link-id],[data-mx-spoiler]')
        if (!link) return
        const eventId = link.closest('[data-event-id]')?.getAttribute('data-event-id') ?? undefined
        if (link.getAttribute('data-mx-spoiler') != null && link.getAttribute('aria-expanded') != 'true') {
            link.setAttribute('aria-expanded', 'true')
            const spoilerIndex = Array.from(
                link.closest('.p-chattimeline-event-content')?.querySelectorAll('[data-mx-spoiler]') ?? []
            ).findIndex((spoilerLink) => spoilerLink === link)
            spoilersMarkedVisible.value.add(`${eventId}_body_spoiler_${spoilerIndex}`)
            return
        }
        const href = link.getAttribute('href')
        if (link.tagName === 'A' && href) {
            if (href.startsWith('https://matrix.to/#/!')) {
                const [roomId, eventId] = href.replace('https://matrix.to/#/', '').split('/')
                if (roomId === props.room.roomId) {
                    jumpToMessage(eventId)
                } else {
                    // TODO - handle event redirect click
                }
            } else if (href.startsWith('https://matrix.to/#/@') || href.startsWith('https://matrix.to/#/%40')) {
                const userId = href.replace('https://matrix.to/#/', '')
                emit('showUserProfile', event, userId.startsWith('%40') ? decodeURIComponent(userId) : userId)
            } else {
                window.open(href, '_blank')
            }
            return
        }
        const linkId = link.getAttribute('data-link-id')
        switch (linkId) {
            case 'addReaction':
                const reactionKey = link.getAttribute('data-reaction-key')
                if (reactionKey) {
                    if (!eventId) return
                    emit('toggleEmoji', {
                        emoji: reactionKey,
                        description: '',
                        codes: [],
                    }, eventId)
                } else {
                    if (eventId) {
                        messageActionsContextMenuTargetEventId.value = eventId
                    }
                    timelineEventsMoreMessageActions.value?.runContextMenuCommand({
                        originalEvent: event,
                        item: { key: 'addReaction' },
                    })
                }
                return
            case 'downloadFile': {
                if (!props.room.visibleTimeline) return
                const event = findRenderedEvent(eventId)
                if (!event) return
                downloadFileFromEvent(event)
                return
            }
            case 'editGroup':
                editGroupDialogVisible.value = true
                return
            case 'editMessage':
                emit('update:editEventId', eventId ?? messageActionsTargetEventId.value)
                return
            case 'fixDecrypt':
                fixDecryptEventId.value = eventId
                fixDecryptDialogVisible.value = true
                return
            case 'jumpToMessage':
                const jumpToEventId = link.getAttribute('data-jump-to-event-id')
                if (!jumpToEventId) return
                jumpToMessage(jumpToEventId)
                return
            case 'removeMediaSpoiler':
                link.classList.add('p-chattimeline-spoiler-visible')
                spoilersMarkedVisible.value.add(`${eventId}_image`)
                return
            case 'replyToMessage':
                emit('update:replyToEventId', eventId ?? messageActionsTargetEventId.value)
                return
            case 'retrySendMessage':
                emit('retrySendMessage', eventId)
                return
            case 'viewFullImage': {
                if (!props.room.visibleTimeline) return
                const event = findRenderedEvent(eventId)
                if (!event) return
                photoViewerImageEvent.value = event
                photoViewerVisible.value = true
                return
            }
            case 'viewUserProfile':
                const userId = link.getAttribute('data-user-id')
                if (!userId) return
                emit('showUserProfile', event, userId)
                return
            default:
                break
        }
        const userId = link.getAttribute('data-user-id')
        if (userId) {
            // TODO - open user modal
        }
    }
}

function onPointerPressTimeline(event: PointerEvent) {
    pointerDownTimelinePointerId = -1
    const target = event.target as Element
    const eventElement = target?.closest('[data-event-id]')
    const eventId = eventElement?.getAttribute('data-event-id')
    const eventSender = eventElement?.getAttribute('data-event-sender') ?? ''
    messageActionsContextMenuTargetEventId.value = eventId ?? undefined
    messageActionsContextMenuTargetEventSender.value = eventSender
    if (eventId) {
        timelineEventsMoreMessageActions.value?.show(event)
        window.navigator.vibrate?.(100)
    }
}

function onClickTimeline(event: MouseEvent) {
    event.preventDefault()
}

function onContextMenuTimeline(event: Event) {
    if (isTouchEventsDetected.value) {
        event.preventDefault()
    }
}

function onKeydownTimeline(event: KeyboardEvent) {
    if (isShiftKeyPressed.value && isCtrlKeyPressed.value && event.key === 'R') {
        event.preventDefault()
        props.room.nonSequentialUpdateUuid = uuidv4()
        props.room.visibleTimeline.push({
            eventId: uuidv4(),
            originServerTs: Date.now(),
            type: 'm.room.message',
            sender: '@test:example.com',
            content: {
                body: 'Automated test!',
                msgtype: 'm.text',
            },
        })
    }
}

// function viewPhoto(event: ApiV3SyncClientEventWithoutRoomId<EventImageContent>) {
//     photoViewerImageEvent.value = event
//     photoViewerVisible.value = true
// }

function findRenderedEvent(eventId?: string) {
    let event: ApiV3SyncClientEventWithoutRoomId | undefined = undefined
    findEvent:
    for (const eventChunk of eventChunkBuffers.value[activeEventChunkBufferIndex.value]!) {
        for (const e of eventChunk.events) {
            if (e.event.eventId === eventId) {
                event = e.event
                break findEvent
            }
        }
    }
    return event
}

function downloadFileFromEvent(event: ApiV3SyncClientEventWithoutRoomId<EventFileContent>) {
    getMxcBlob(event.content.file ?? event.content.url!, {
        type: 'download',
        mimetype: event.content.info?.mimetype
    }).then((blob) => {
        downloadFile(blob, event.content.filename ?? '')
    }).catch(() => {
        toast.add({ severity: 'error', summary: t('errors.message.downloadFileFailed'), life: 4000 })
    })
}

/*----------------------------*\
|                              |
|   Pause Videos Out of View   |
|                              |
\*----------------------------*/

const videoIntersectionObserver = ref<IntersectionObserver>()
provide('videoIntersectionObserver', videoIntersectionObserver)

function onIntersectVideo(entries: IntersectionObserverEntry[]) {
    for (const entry of entries) {
        if (!entry.isIntersecting) {
            (entry.target as HTMLVideoElement)?.pause()
        }
    }
}

onMounted(() => {
    const observerRoot = (scrollPanel.value as any).$el
    if (!observerRoot) return
    videoIntersectionObserver.value = new IntersectionObserver(onIntersectVideo, {
        root: observerRoot,
        rootMargin: '0px',
        threshold: 0.0,
    })
})

onUnmounted(() => {
    videoIntersectionObserver.value?.disconnect()
    videoIntersectionObserver.value = undefined
})

/*-------------------*\
|                     |
|   Jump to Message   |
|                     |
\*-------------------*/

const highlightEventId = ref<string | undefined>()
let highlightEventTimeoutHandle: number | undefined = undefined

const messagePreviewEvent = ref<ApiV3SyncClientEventWithoutRoomId>()
const messagePreviewDialogVisble = ref<boolean>(false)

async function jumpToMessage(eventId?: string) {
    if (!eventId || !scrollPanelContent.value || !scrollContentContainer.value) return

    const renderedEvent = scrollContentContainer.value.querySelector<HTMLDivElement>(`[data-event-id="${eventId}"]`)
    if (renderedEvent) {
        scrollPanelContent.value.scrollTop = Math.max(0, renderedEvent.offsetTop + (renderedEvent.offsetHeight / 2) - (scrollPanelContent.value.offsetHeight / 2))
        highlightEventId.value = eventId

        clearTimeout(highlightEventTimeoutHandle)
        highlightEventTimeoutHandle = setTimeout(() => {
            highlightEventId.value = undefined
        }, 5000)
    } else {
        const eventIndex = getTimelineEventIndexById(props.room.visibleTimeline, eventId)
        if (eventIndex != null) {
            offsetEventId.value = eventId
            offsetChunk.value = Math.round(chunksPerView / 2)
            highlightEventId.value = eventId
            props.room.nonSequentialUpdateUuid = uuidv4()

            clearTimeout(highlightEventTimeoutHandle)
            highlightEventTimeoutHandle = setTimeout(() => {
                highlightEventId.value = undefined
            }, 5000)
        } else {
            try {
                messagePreviewEvent.value = await getMessageEvent(props.room.roomId, eventId)
                if (!messagePreviewEvent.value) throw new Error('Missing message')
                messagePreviewDialogVisble.value = true
            } catch (error) {
                toast.add({ severity: 'error', summary: t('messagePreviewDialog.unableToView'), life: 5000 })
            }
        }
    }
}

/*------------------*\
|                    |
|   Expose Methods   |
|                    |
\*------------------*/

defineExpose({
    resetMessageActionsContextMenuTargetEventId,
    scrollToBottom,
})

</script>

<style lang="scss" scoped>
.p-chattimeline:deep(.p-scrollpanel-content-container) {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
}
.p-chattimeline:deep(.p-scrollpanel-content) {
    padding-right: 0 !important;
    padding-bottom: 1.75rem !important;
    height: auto;
    max-height: calc(100% + calc(2 * var(--p-scrollpanel-bar-size)));
    width: 100% !important;
    max-width: 100% !important;
}
.p-chattimeline:deep(.p-scrollpanel-bar.p-scrollpanel-bar-y) {
    margin-left: -0.125rem;
}
</style>