<template>
    <!-- This is here to trigger Vue update events. Wish I didn't have to hack it like this. -->
    <!-- <div hidden>{{ visibleEventChunks?.[0]?.events[0]?.event.eventId }}</div> -->
    <div hidden>{{ eventChunkRenderUuid }}</div>
    <div
        v-if="room"
        :data-timeline-id="componentUuid"
        class="p-chattimeline"
        @pointerdown="onPointerDownTimeline"
        @pointerup="onPointerUpTimeline"
        @mouseover="onMouseOverTimeline"
        @mouseleave="onMouseLeaveTimeline"
        @click.capture="onClickTimeline"
    >
        <ScrollPanel ref="scrollPanel">
            <div ref="scrollContentContainer" class="p-chattimeline-scroll-content-container">
                <MessagePlaceholder
                    v-if="showOldEventMessagePlaceholder"
                    ref="oldMessagePlaceholder"
                    :key="`oldMessagePlaceholderFor${room.roomId}`"
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
                        <template v-for="chunk of eventChunkList" :key="chunk.id">
                            <template v-for="e of chunk.events" :key="e.event.eventId">
                                <div v-if="e.currentDateDivider && e.event.type !== 'm.room.create'" class="p-chattimeline-date-heading">
                                    <time :datetime="e.isoTimestamp">{{ e.currentDateDivider }}</time>
                                </div>
                                <div
                                    v-if="e.category === 'message'"
                                    class="p-chattimeline-event"
                                    :class="{
                                        'p-chattimeline-event--groupstart': e.displayHeader,
                                        'p-chattimeline-event--sending': !!e.event.txnId,
                                        'p-chattimeline-event--hover': messageActionsTargetEventId === e.event.eventId || messageActionsContextMenuTargetEventId === e.event.eventId
                                    }"
                                    :data-event-id="e.event.eventId"
                                >
                                    <!-- Message type events (most common) -->
                                    <template v-if="e.displayHeader">
                                        <h3 class="p-chattimeline-event-header">
                                            <span class="link" :data-user-id="e.event.sender" role="button" tabindex="0">{{ e.displayname }}</span>
                                            <time :datetime="e.isoTimestamp">{{ e.headerTime }}</time>
                                        </h3>
                                        <div class="p-avatar p-avatar-circle p-avatar-chat">
                                            <AuthenticatedImage :mxcUri="e.avatarUrl" type="thumbnail" :width="48" :height="48" method="scale">
                                                <template v-slot="{ src }">
                                                    <img :src="src" class="w-full h-full">
                                                </template>
                                                <template #error>
                                                    <span class="p-avatar-icon pi pi-user" />
                                                </template>
                                            </AuthenticatedImage>
                                        </div>
                                    </template>
                                    <template v-if="e.event.type === 'm.room.message'">
                                        <!-- Message -->
                                        <template v-if="e.event.content.msgtype === 'm.audio'">
                                            <!-- Audio -->
                                            {{ e.event.content.msgtype }}
                                        </template>
                                        <template v-else-if="e.event.content.msgtype === 'm.file'">
                                            <!-- File -->
                                            {{ e.event.content.msgtype }}
                                        </template>
                                        <template v-else-if="e.event.content.msgtype === 'm.image'">
                                            <!-- Image -->
                                            <AuthenticatedImage
                                                :mxcUri="e.event.content.url"
                                                :encryptedFile="e.event.content.info?.thumbnailFile || e.event.content.file"
                                                type="download"
                                            >
                                                <template v-slot="{ src }">
                                                    <img
                                                        :src="src"
                                                        :alt="e.event.content.body"
                                                        class="p-chattimeline-event-image"
                                                        tabindex="0"
                                                        :style="{
                                                            '--image-target-height': (e.event.content.info?.thumbnailInfo?.h || e.event.content.info?.h || 16) + 'px',
                                                            '--image-aspect-ratio': (e.event.content.info?.thumbnailInfo?.w || e.event.content.info?.w || 16) / (e.event.content.info?.thumbnailInfo?.h || e.event.content.info?.h || 16),
                                                        }"
                                                        @dragstart.prevent
                                                        @click="viewPhoto(e.event)"
                                                    >
                                                </template>
                                            </AuthenticatedImage>
                                        </template>
                                        <template v-else-if="e.event.content.msgtype === 'm.sticker'">
                                            <!-- Sticker -->
                                            {{ e.event.content.msgtype }}
                                        </template>
                                        <template v-else-if="e.event.content.msgtype === 'm.text'">
                                            <!-- Text -->
                                            <div class="p-chattimeline-event-content">
                                                <div v-if="e.event.content.format === 'org.matrix.custom.html'" v-dompurify-html="e.event.content.formattedBody" />
                                                <template v-else>{{ e.event.content.body }}</template>
                                                <span v-if="e.replacementEvent" v-tooltip.top="{ value: isTouchEventsDetected ? undefined : e.replacementDate }" class="p-chattimeline-edited">{{ i18nText.messageEditedIndicator }}</span>
                                            </div>
                                        </template>
                                        <template v-else-if="e.event.content.msgtype === 'm.video'">
                                            <!-- Video -->
                                            {{ e.event.content.msgtype }}
                                        </template>
                                    </template>
                                    <!-- Encrypted Event -->
                                    <div v-else-if="e.event.type === 'm.room.encrypted'" class="text-(--channels-default)">
                                        <span class="pi pi-exclamation-triangle mr-1 !text-sm" aria-hidden="true" />{{ i18nText.unableToDecryptMessage }}
                                        <span data-link-id="fixDecrypt" class="link" role="button" tabindex="0">{{ i18nText.learnFixDecrypt }}</span>
                                    </div>
                                    <!-- Display time -->
                                    <time v-if="!e.displayHeader" class="p-chattimeline-asidetime" :datetime="e.isoTimestamp">{{ e.time }}</time>
                                    <!-- Reactions -->
                                    <div v-if="e.reactions.length > 0" class="flex flex-wrap">
                                        <span
                                            v-for="reaction of e.reactions"
                                            :key="reaction.key"
                                            role="button"
                                            tabindex="0"
                                            class="p-chattimeline-event-reaction"
                                            :class="{ 'p-chattimeline-event-reaction--self': reaction.highlighted }"
                                            data-link-id="react"
                                            :data-react-key="reaction.key"
                                        >
                                            {{ reaction.key }}
                                            <span class="p-chattimeline-event-reaction-count">{{ reaction.displaynames.length }}</span>
                                        </span>
                                        <span
                                            v-tooltip.top="{ value: isTouchEventsDetected ? undefined : i18nText.addReaction }"
                                            role="button"
                                            tabindex="0"
                                            class="p-chattimeline-event-reaction"
                                            data-link-id="react"
                                            :aria-label="i18nText.addReaction"
                                        >
                                            <span class="pi pi-face-smile" aria-hidden="true" />
                                        </span>
                                    </div>
                                    <!-- Send Error -->
                                    <Message v-if="e.event.sendError" severity="error" size="small" variant="simple">
                                        <template #icon>
                                            <span class="pi pi-exclamation-circle !text-xs !leading-3 -mt-[1px]" aria-hidden="true" />
                                        </template>
                                        {{ i18nText.messageSendError }}
                                        <span class="link" role="button" tabindex="0" data-link-id="retrySendMessage">{{ i18nText.messageSendRetry }}</span>
                                    </Message>
                                </div>
                                <div
                                    v-else-if="e.category === 'settings'"
                                    class="p-chattimeline-event p-chattimeline-event-settings"
                                    :class="{
                                        'p-chattimeline-event--groupstart': e.displayHeader,
                                        'p-chattimeline-event--hover': messageActionsTargetEventId === e.event.eventId,
                                    }"
                                    :data-event-id="e.event.eventId"
                                >
                                    <!-- Settings type events (less common) -->
                                    <template v-if="e.event.type === 'm.room.avatar'">
                                        <!-- Chat room icon/avatar changed -->
                                        <span class="p-chattimeline-event-icon pi pi-pencil" aria-hidden="true" />
                                        <strong>
                                            <span class="link" :data-user-id="e.event.sender" role="button" tabindex="0">{{ e.displayname }}</span>
                                        </strong>
                                        {{ i18nText.changedGroupIcon }}
                                        <span data-link-id="editGroup" class="link" role="button" tabindex="0">{{ i18nText.editGroupButton }}</span>
                                        <time :datetime="e.isoTimestamp">{{ e.headerTime }}</time>
                                    </template>
                                    <template v-else-if="e.event.type === 'm.room.member'">
                                        <!-- Member Join/Leave room -->
                                        <span class="p-chattimeline-event-icon pi" :class="[e.event.content.membership === 'join' ? 'pi-arrow-right' : 'pi-info-circle']" aria-hidden="true" />
                                        <span v-if="e.event.content.membership === 'join'" class="mr-1">
                                            {{ i18nText.joinedTheRoomPrefix }}<strong><span class="link" :data-user-id="e.event.sender" role="button" tabindex="0">{{ e.displayname }}</span></strong>{{ i18nText.joinedTheRoomSuffix }}
                                        </span>
                                        <template v-else>
                                            <strong class="mr-1">
                                                <span class="link" :data-user-id="e.event.sender" role="button" tabindex="0">{{ e.displayname }}</span>
                                            </strong>
                                            <span v-if="e.event.content.membership === 'leave'">{{ i18nText.leftTheRoom }}</span>
                                            <span v-if="e.event.content.membership === 'ban'">{{ i18nText.bannedFromTheRoom }}</span>
                                        </template>
                                        <time :datetime="e.isoTimestamp">{{ e.headerTime }}</time>
                                    </template>
                                    <template v-else-if="e.event.type === 'm.room.name'">
                                        <!-- Chat group name changed -->
                                        <span class="p-chattimeline-event-icon pi pi-pencil" aria-hidden="true" />
                                        <strong>
                                            <span class="link" :data-user-id="e.event.sender" role="button" tabindex="0">{{ e.displayname }}</span>
                                        </strong>
                                        {{ i18nText.changedGroupNamePrefix }}<strong>{{ e.event.content.name }}</strong>{{ i18nText.changedGroupNameSuffix }}
                                        <span data-link-id="editGroup" class="link" role="button" tabindex="0">{{ i18nText.editGroupButton }}</span>
                                        <time :datetime="e.isoTimestamp">{{ e.headerTime }}</time>
                                    </template>
                                    <template v-else-if="e.event.type === 'm.room.encryption'">
                                        <!-- Encryption Enabled -->
                                        <span class="p-chattimeline-event-icon pi pi-lock" aria-hidden="true" />
                                        {{ i18nText.roomEncryptionEnabled }}
                                        <time :datetime="e.isoTimestamp">{{ e.headerTime }}</time>
                                    </template>
                                    <template v-else>
                                        <!-- Unhandled Event Type -->
                                        {{ e.event.type }}
                                    </template>
                                </div>
                                <!-- Start of chat (least common) -->
                                <MessageBeginning
                                    v-else-if="e.event.type === 'm.room.create'"
                                    :room="props.room"
                                />
                            </template>
                        </template>
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
        </ScrollPanel>
        <EditGroup v-model:visible="editGroupDialogVisible" :roomId="props.room.roomId" />
        <PhotoViewer v-model:visible="photoViewerVisible" :imageEvent="photoViewerImageEvent" />
        <FixDecryptionDialog v-model:visible="fixDecryptDialogVisible" :roomId="room.roomId" :eventId="fixDecryptEventId" />
        <div
            v-if="!isTouchEventsDetected"
            ref="messageActionsContainer"
            :hidden="!messageActionsTargetElement"
            class="timeline-events__message-actions"
            :style="messageActionsFloatingStyles"
        >
            <Button
                v-tooltip.top="{ value: i18nText.addReaction }"
                icon="pi pi-face-smile" :aria-label="i18nText.addReaction" severity="secondary" variant="text"
            />
            <Button
                v-tooltip.top="{ value: i18nText.editMessage }"
                icon="pi pi-pencil" :aria-label="i18nText.editMessage" severity="secondary" variant="text"
            />
            <Button
                v-tooltip.top="{ value: i18nText.replyMessage }"
                icon="pi pi-reply -scale-x-100" :aria-label="i18nText.replyMessage" severity="secondary" variant="text"
            />
            <Button
                v-tooltip.top="{ value: i18nText.forwardMessage }"
                icon="pi pi-reply" :aria-label="i18nText.forwardMessage" severity="secondary" variant="text"
            />
            <Button
                v-tooltip.top="{ value: i18nText.moreActionsMessage }"
                icon="pi pi-ellipsis-h" :aria-label="i18nText.moreActionsMessage" severity="secondary" variant="text"
                @click="showMoreMessageActions($event)"
            />
        </div>
        <ContextMenu ref="moreMessageActionsContextMenu" :model="moreMessageActionsContextMenuItems" @hide="messageActionsContextMenuTargetEventId = undefined">
            <template #item="{ item, props }">
                <a class="p-contextmenu-item-link" v-bind="props.action">
                    <span class="p-contextmenu-item-label">{{ item.label }}</span>
                    <span v-if="item.icon" :class="item.icon" class="ml-auto px-1 text-(--text-subtle)" aria-hidden="true" />
                    <i v-if="item.items" class="pi pi-angle-right ml-auto"></i>
                </a>
            </template>
        </ContextMenu>
    </div>
</template>

<script setup lang="ts">
import {
    computed, defineAsyncComponent, nextTick,
    onUpdated, onMounted, onUnmounted, ref, watch, type PropType,
 } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { v4 as uuidv4 } from 'uuid'
import { useFloating, offset as floatingOffset, autoUpdate as floatingAutoUpdate } from '@floating-ui/vue'

import { decryptMegolmEvent } from '@/utils/crypto'
import { throttle } from '@/utils/timing'

import { useApplication } from '@/composables/application'
import { useRooms } from '@/composables/rooms'
import { messageEventTypes, settingsEventTypes } from '@/composables/event-timeline'

import { useCryptoKeysStore } from '@/stores/crypto-keys'
import { useProfileStore } from '@/stores/profile'
import { useRoomStore } from '@/stores/room'
import { useSessionStore } from '@/stores/session'

import AuthenticatedImage from '@/views/Common/AuthenticatedImage.vue'
const EditGroup = defineAsyncComponent(() => import('./EditGroup.vue'))
const FixDecryptionDialog = defineAsyncComponent(() => import('@/views/EncryptionSetup/FixDecryptionDialog.vue'))
import MessageBeginning from './MessageBeginning.vue'
import MessagePlaceholder from './MessagePlaceholder.vue'
const PhotoViewer = defineAsyncComponent(() => import('./PhotoViewer.vue'))

import Button from 'primevue/button'
import ContextMenu from 'primevue/contextmenu'
import Message from 'primevue/message'
import ScrollPanel from 'primevue/scrollpanel'
import vTooltip from 'primevue/tooltip'

import {
    type JoinedRoom, type RoomEventReactionRender,
    type ApiV3SyncClientEventWithoutRoomId,
    type EventImageContent,
} from '@/types'

interface EventWithRenderInfo {
    category: 'settings' | 'message' | 'unknown';
    currentDateDivider: string | undefined;
    displayHeader: boolean;
    displayname: string;
    headerTime: string;
    time: string;
    isoTimestamp: string;
    avatarUrl?: string;
    event: ApiV3SyncClientEventWithoutRoomId;
    replacementEvent?: ApiV3SyncClientEventWithoutRoomId;
    replacementDate?: string;
    reactions: RoomEventReactionRender[];
}

interface EventChunk {
    id: string;
    loading: boolean;
    events: EventWithRenderInfo[];
}

const { t } = useI18n()
const { profiles } = storeToRefs(useProfileStore())
const { isTouchEventsDetected } = useApplication()
const { getPreviousMessages } = useRooms()
const roomStore = useRoomStore()
const { decryptedRoomEvents } = storeToRefs(roomStore)
const { getTimelineEventIndexById } = useRoomStore()
const { roomKeys } = storeToRefs(useCryptoKeysStore())
const { userId } = storeToRefs(useSessionStore())

const props = defineProps({
    room: {
        type: Object as PropType<JoinedRoom>,
        required: true,
    }
})

const emit = defineEmits<{
    (e: 'update:anchoredToBottom', isAnchoredToBottom: boolean ): void
    (e: 'retrySendMessage', eventId?: string): void
}>()

const componentUuid = uuidv4()

// Caching i18n here, calculating in template for each item is extremely slow.
const i18nText = {
    roomEncryptionEnabled: t('room.roomEncryptionEnabled'),
    unableToDecryptMessage: t('room.unableToDecryptMessage'),
    learnFixDecrypt: t('room.learnFixDecrypt'),
    joinedTheRoomPrefix: t('room.joinedTheRoomPrefix'),
    joinedTheRoomSuffix: t('room.joinedTheRoomSuffix'),
    leftTheRoom: t('room.leftTheRoom'),
    bannedFromTheRoom: t('room.bannedFromTheRoom'),
    changedGroupIcon: t('room.changedGroupIcon'),
    changedGroupNamePrefix: t('room.changedGroupNamePrefix'),
    changedGroupNameSuffix: t('room.changedGroupNameSuffix'),
    editGroupButton: t('room.editGroupButton'),
    addReaction: t('room.addReaction'),
    messageEditedIndicator: t('room.messageEditedIndicator'),
    messageSendError: t('room.messageSendError'),
    messageSendRetry: t('room.messageSendRetry'),
    editMessage: t('room.editMessage'),
    replyMessage: t('room.replyMessage'),
    forwardMessage: t('room.forwardMessage'),
    moreActionsMessage: t('room.moreActionsMessage'),
}

const eventChunkSwapReadyUuid = ref<string | undefined>()
const eventChunkRenderUuid = ref<string>('')
const eventChunkRenderShowOldEventMessagePlaceholder = ref<boolean>(false)
const eventChunkBuffers = ref<EventChunk[][]>([[], []])
const activeEventChunkBufferIndex = ref<number>(0)
const eventChunkBufferContainers = ref<HTMLDivElement[]>([])

const isJustMounted = ref<boolean>(false)
const hasAttemptedToScroll = ref<boolean>(false)
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
const offsetChunk = ref<number>(0) // Relative to offsetEventId. Negative numbers scroll up for older messages
const editGroupDialogVisible = ref<boolean>(false)
const fixDecryptDialogVisible = ref<boolean>(false)
const fixDecryptEventId = ref<string>()
const photoViewerVisible = ref<boolean>(false)
const photoViewerImageEvent = ref<ApiV3SyncClientEventWithoutRoomId<EventImageContent> | undefined>()

const messageActionsContainer = ref<HTMLDivElement>()

const isAnchoredToBottom = ref<boolean>(true)
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
                    highlighted: !!reaction.events.find((event) => event.sender === userId.value),
                    displaynames: reaction.events.map((event) => profiles.value[event.sender]?.displayname ?? event.sender)
                }
            })

            const replacementEvent = props.room.replacements[event.eventId]

            chunk.events.push({
                category,
                currentDateDivider,
                displayHeader: previousEvent?.sender !== event.sender
                    || category !== previousCategory
                    || !!currentDateDivider
                    || originDate.getTime() - previousEventOriginDate.getTime() > 300000,
                displayname: profiles.value[event.sender]?.displayname ?? event.sender,
                headerTime: isToday
                    ? originDate.toLocaleString(undefined, { hour: 'numeric', minute: 'numeric' })
                    : originDate.toLocaleString(undefined, { year: '2-digit', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }),
                time: originDate.toLocaleString(undefined, { hour: 'numeric', minute: 'numeric' }),
                isoTimestamp: originDate.toISOString(),
                avatarUrl: profiles.value[event.sender]?.avatarUrl,
                event: replacementEvent?.content?.['m.new_content'] ? { ...event, content: replacementEvent.content['m.new_content'] } : event,
                replacementEvent,
                replacementDate: replacementEvent?.originServerTs ? new Date(replacementEvent.originServerTs).toLocaleString() : undefined,
                reactions,
            })

            previousEvent = event
            currentDateDividerTs = event.type === 'm.room.create' ? 0 : (event.originServerTs > currentDateDividerTs ? event.originServerTs : currentDateDividerTs)
        }

        const decryptPromises: Promise<void>[] = []
        for (const event of chunk.events) {
            if (event.replacementEvent?.type === 'm.room.encrypted') {
                if (decryptedRoomEvents.value[event.replacementEvent.eventId]) {
                    event.replacementEvent = decryptedRoomEvents.value[event.replacementEvent.eventId]!
                    event.event.content = event.replacementEvent.content['m.new_content']
                    continue
                }
                const roomKey = roomKeys.value[props.room.roomId]?.[event.event.content.sessionId]?.[event.event.content.senderKey]
                if (!roomKey) continue
                decryptPromises.push(
                    decryptMegolmEvent(event.replacementEvent.content, roomKey).then((decrypted) => {
                        const decryptedEvent = {
                            ...event.replacementEvent,
                            ...decrypted,
                        }
                        decryptedRoomEvents.value[event.event.eventId] = decryptedEvent
                        event.replacementEvent = decryptedEvent
                        event.event.content = decryptedEvent.content['m.new_content']
                    }).catch((error) => {
                        console.error(error)
                    })
                )
            } else if (event.event.type === 'm.room.encrypted') {
                if (decryptedRoomEvents.value[event.event.eventId]) {
                    event.event = decryptedRoomEvents.value[event.event.eventId]!
                    continue
                }
                const roomKey = roomKeys.value[props.room.roomId]?.[event.event.content.sessionId]?.[event.event.content.senderKey]
                if (!roomKey) continue
                decryptPromises.push(
                    decryptMegolmEvent(event.event.content, roomKey).then((decrypted) => {
                        const decryptedEvent = {
                            ...event.event,
                            ...decrypted,
                        }
                        decryptedRoomEvents.value[event.event.eventId] = decryptedEvent
                        event.event = decryptedEvent
                    }).catch((error) => {
                        console.error(error)
                    })
                )
            }
            
        }
        Promise.allSettled(decryptPromises).then(() => {
            chunk.loading = false
        })
        chunks.push(chunk)
    }
    return chunks
})
watch(() => loadingEventChunks.value, (eventChunks) => {
    if (eventChunkSwapReadyUuid.value) {
        swapEventChunkBuffers()
    }
    const inactiveEventChunkBufferIndex = activeEventChunkBufferIndex.value === 0 ? 1 : 0
    eventChunkBuffers.value[inactiveEventChunkBufferIndex] = eventChunks
    eventChunkRenderUuid.value = uuidv4()
    eventChunkRenderShowOldEventMessagePlaceholder.value = shouldShowOldEventMessagePlaceholder()
}, { immediate: true })

onUpdated(() => {
    if (eventChunkRenderUuid.value) {
        eventChunkSwapReadyUuid.value = eventChunkRenderUuid.value
        eventChunkRenderUuid.value = ''
        if (isAnchoredToBottom.value) {
            swapEventChunkBuffers()
        }
    }
})

function swapEventChunkBuffers() {
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
        if (isAnchoredToBottom.value) {
            scrollPanelContent.value!.scrollTop = scrollPanelContent.value!.scrollHeight - scrollPanelContent.value!.offsetHeight
        } else {
            scrollPanelContent.value!.scrollTop = oldScrollTop + (newReferenceScrollTop - oldReferenceScrollTop) + (newReferenceClientRect.height - oldReferenceClientRect.height) + oldMessagePlaceholderGap
        }
    }

    eventChunkSwapReadyUuid.value = undefined
    eventChunkBuffers.value[activeEventChunkBufferIndex.value] = []
    activeEventChunkBufferIndex.value = inactiveEventChunkBufferIndex
    showOldEventMessagePlaceholder.value = eventChunkRenderShowOldEventMessagePlaceholder.value
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
    hasAttemptedToScroll.value = false

    if (scrollPanel.value) {
        scrollPanelContent.value = (scrollPanel.value as any).$el?.querySelector('.p-scrollpanel-content')
        scrollPanelContent.value?.addEventListener('scroll', onScrollContent)
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

    nextTick(() => {
        isJustMounted.value = true

        scrollToBottom()
    })
})

onUnmounted(() => {
    window.dispatchEvent(new CustomEvent('discortix-timeline-unmounted', { detail: { id: componentUuid } }))
    scrollPanelContent.value?.removeEventListener('scroll', onScrollContent)
    fetchOldEventsAbortController?.abort()
    fetchNewEventsAbortController?.abort()
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
        hasAttemptedToScroll.value = true
        isAnchoredToBottom.value = scrollPanelContent.value.scrollTop >= scrollPanelContent.value.scrollHeight - scrollPanelContent.value.offsetHeight - 100
    }
}, 100)

async function scrollToBottom() {
    if (scrollPanelContent.value) {
        scrollPanelContent.value.scrollTop = scrollPanelContent.value.scrollHeight - scrollPanelContent.value.offsetHeight
    }
    isAnchoredToBottom.value = true
    needsMoreNewEvents.value = true
    await nextTick()
}

/*---------------*\
| Message Actions |
\*---------------*/

const messageActionsTargetEventId = ref<string>()
const messageActionsContextMenuTargetEventId = ref<string>()
const messageActionsTargetElement = ref<HTMLElement>()
const { floatingStyles: messageActionsFloatingStyles, update: updateMessageActionsFloating } = useFloating(
    messageActionsTargetElement, messageActionsContainer, {
        whileElementsMounted: floatingAutoUpdate,
        transform: false,
        placement: 'top-end',
        middleware: [floatingOffset({ mainAxis: -12, crossAxis: -8 })]
    }
);

const moreMessageActionsContextMenu = ref<InstanceType<typeof ContextMenu>>()
const moreMessageActionsContextMenuItems = ref([
    {
        label: t('room.moreMessageActions.addReaction'),
        icon: 'pi pi-face-smile',
    },
    { separator: true },
    {
        label: t('room.moreMessageActions.editMessage'),
        icon: 'pi pi-pencil',
    },
    {
        label: t('room.moreMessageActions.reply'),
        icon: 'pi pi-reply -scale-x-100',
    },
    {
        label: t('room.moreMessageActions.forward'),
        icon: 'pi pi-reply',
    },
    {
        label: t('room.moreMessageActions.createThread'),
        icon: 'pi pi-receipt',
    },
    { separator: true },
    {
        label: t('room.moreMessageActions.copyText'),
        icon: 'pi pi-copy',
    },
    {
        label: t('room.moreMessageActions.pinMessage'),
        icon: 'pi pi-thumbtack',
    },
    {
        label: t('room.moreMessageActions.markUnread'),
        icon: 'pi pi-book',
    },
    {
        label: t('room.moreMessageActions.copyMessageLink'),
        icon: 'pi pi-link',
    },
    {
        label: t('room.moreMessageActions.speakMessage'),
        icon: 'pi pi-headphones',
    },
    { separator: true },
    {
        label: t('room.moreMessageActions.deleteMessage'),
        icon: 'pi pi-trash',
    },
    { separator: true },
    {
        label: t('room.moreMessageActions.copyMessageId'),
        icon: 'pi pi-id-card',
    },
])

function showMoreMessageActions(event: MouseEvent) {
    messageActionsContextMenuTargetEventId.value = messageActionsTargetEventId.value
    moreMessageActionsContextMenu.value?.show(event)
}

function onMouseOverTimeline(event: MouseEvent) {
    const target = event.target as HTMLElement
    if (isTouchEventsDetected.value || !target?.getAttribute || messageActionsContainer.value?.contains(target)) return
    const eventElement = target?.closest('[data-event-id]')
    const eventId = eventElement?.getAttribute('data-event-id')
    if (eventId) {
        messageActionsTargetElement.value = eventElement as HTMLElement
        messageActionsTargetEventId.value = eventId
        nextTick(() => {
            updateMessageActionsFloating()
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

/*--------------------------------*\
| Handle Interaction with Timeline |
\*--------------------------------*/

let pointerDownTimelineTarget: HTMLElement | null
let pointerDownTimelineItemX: number = 0
let pointerDownTimelineItemY: number = 0
let pointerDownTimelineTimestamp: number = 0

function onPointerDownTimeline(event: PointerEvent) {
    pointerDownTimelineTarget = event.target as HTMLElement
    pointerDownTimelineItemX = event.pageX
    pointerDownTimelineItemY = event.pageY
    pointerDownTimelineTimestamp = window.performance.now()
}

function onPointerUpTimeline(event: PointerEvent) {
    // "Click" / "Tap" simulation. Need to do this because of the Safari "double tap with hover states" issue.
    if (
        event.target && event.target === pointerDownTimelineTarget
        && window.performance.now() - pointerDownTimelineTimestamp <= 500
        && Math.abs(event.pageX - pointerDownTimelineItemX) < 8
        && Math.abs(event.pageY - pointerDownTimelineItemY) < 8
    ) {
        const link = (event.target as HTMLElement)?.closest('a[href],[data-link-id],[data-user-id]')
        if (!link) return
        const href = link.getAttribute('href')
        if (link.tagName === 'A' && href) {
            if (href.startsWith('https://matrix.to/#/!')) {
                const [roomId, eventId] = href.replace('https://matrix.to/#/', '').split('/')
                // TODO - handle user click
            } else if (href.startsWith('https://matrix.to/#/@')) {
                const userId = href.replace('https://matrix.to/#/', '')
                // TODO - open user modal
            } else {
                window.open(href, '_blank')
            }
            return
        }
        const linkId = link.getAttribute('data-link-id')
        const eventId = link.closest('[data-event-id]')?.getAttribute('data-event-id') ?? undefined
        switch (linkId) {
            case 'editGroup':
                editGroupDialogVisible.value = true
                return
            case 'fixDecrypt':
                fixDecryptEventId.value = eventId
                fixDecryptDialogVisible.value = true
                return
            case 'retrySendMessage':
                emit('retrySendMessage', eventId)
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

function onClickTimeline(event: MouseEvent) {
    event.preventDefault()
}

function viewPhoto(event: ApiV3SyncClientEventWithoutRoomId<EventImageContent>) {
    photoViewerImageEvent.value = event
    photoViewerVisible.value = true
}

/*--------------*\
| Expose Methods |
\*--------------*/

defineExpose({
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

.timeline-events__message-actions {
    display: flex;
    position: absolute;
    padding: 0.125rem;
    background: var(--background-surface-high);
    border: 1px solid var(--border-muted);
    border-radius: 0.5rem;
    box-shadow: var(--shadow-low);
    width: max-content;
    top: 0;
    left: auto !important;
    right: 0.5rem !important;
    z-index: 5;

    > .p-button {
        padding: 0.125rem !important;
        width: 1.75rem !important;
        height: 1.75rem !important;
    }
}
</style>