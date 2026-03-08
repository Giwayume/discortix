<template>
    <!-- This is here to trigger Vue update events. Wish I didn't have to hack it like this. -->
    <div hidden>{{ visibleEventChunks?.[0]?.events[0]?.event.eventId }}</div>
    <div
        v-if="room"
        :data-timeline-id="componentUuid"
        class="p-chattimeline"
        @pointerdown="onPointerDownTimeline"
        @pointerup="onPointerUpTimeline"
        @click.capture="onClickTimeline"
    >
        <ScrollPanel ref="scrollPanel">
            <div ref="scrollContentContainer" class="p-chattimeline-scroll-content-container">
                <MessagePlaceholder
                    v-if="showOldEventMessagePlaceholder"
                    ref="oldMessagePlaceholder"
                    :key="`oldMessagePlaceholderFor${room.roomId}`"
                />
                <template v-for="chunk of visibleEventChunks" :key="chunk.id">
                    <template v-for="e of chunk.events" :key="e.event.eventId">
                        <div v-if="e.currentDateDivider && e.event.type !== 'm.room.create'" class="p-chattimeline-date-heading">
                            <time :datetime="e.isoTimestamp">{{ e.currentDateDivider }}</time>
                        </div>
                        <div
                            v-if="e.category === 'message'"
                            class="p-chattimeline-event"
                            :class="{ 'p-chattimeline-event-groupstart': e.displayHeader }"
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
                                    <div
                                        v-if="e.event.content.format === 'org.matrix.custom.html'"
                                        class="p-chattimeline-event-content"
                                        v-dompurify-html="e.event.content.formattedBody"
                                    />
                                    <div v-else class="p-chattimeline-event-content">{{ e.event.content.body }}</div>
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
                        </div>
                        <div
                            v-else-if="e.category === 'settings'"
                            class="p-chattimeline-event p-chattimeline-event-settings"
                            :class="{ 'p-chattimeline-event-groupstart': e.displayHeader }"
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
                                <span data-link-id="fixDecrypt" class="link" role="button" tabindex="0">{{ i18nText.editGroupButton }}</span>
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
                
                <!-- New messages bar -->
                <!--div class="p-chattimeline-new-divider">
                    <div class="p-chattimeline-new-divider-tag">New</div>
                </div-->
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
    </div>
</template>

<script setup lang="ts">
import {
    computed, defineAsyncComponent, nextTick,
    onBeforeUpdate, onUpdated, onMounted, onUnmounted, ref, watch, type PropType,
 } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { v4 as uuidv4 } from 'uuid'

import { decryptMegolmEvent } from '@/utils/crypto'
import { throttle } from '@/utils/timing'

import { useRooms } from '@/composables/rooms'
import { useCryptoKeysStore } from '@/stores/crypto-keys'
import { useProfileStore } from '@/stores/profile'
import { useRoomStore } from '@/stores/room'

import AuthenticatedImage from '@/views/Common/AuthenticatedImage.vue'
const EditGroup = defineAsyncComponent(() => import('./EditGroup.vue'))
const FixDecryptionDialog = defineAsyncComponent(() => import('@/views/EncryptionSetup/FixDecryptionDialog.vue'))
import MessageBeginning from './MessageBeginning.vue'
import MessagePlaceholder from './MessagePlaceholder.vue'
const PhotoViewer = defineAsyncComponent(() => import('./PhotoViewer.vue'))

import ScrollPanel from 'primevue/scrollpanel'

import { type JoinedRoom, type ApiV3SyncClientEventWithoutRoomId, type EventImageContent } from '@/types'

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
}

interface EventChunk {
    id: string;
    loading: boolean;
    events: EventWithRenderInfo[];
}

const { t } = useI18n()
const { profiles } = storeToRefs(useProfileStore())
const { getPreviousMessages } = useRooms()
const roomStore = useRoomStore()
const { decryptedRoomEvents } = storeToRefs(roomStore)
const { getTimelineEventIndexById } = useRoomStore()
const { roomKeys } = storeToRefs(useCryptoKeysStore())

const props = defineProps({
    room: {
        type: Object as PropType<JoinedRoom>,
        required: true,
    }
})

const componentUuid = uuidv4()

// Lists all known custom rendered events. The events we do not wish to display in the timeline are commented out.
const customEventTypes = [
    'm.room.create',
]

// Lists all known "setting-type" events. The events we do not wish to display in the timeline are commented out.
const settingsEventTypes = [
    // 'm.room.aliases',
    'm.room.avatar',
    // 'm.room.canonical_alias',
    'm.room.encryption',
    // 'm.room.guest_access',
    // 'm.room.history_visibility',
    // 'm.room.join_rules',
    'm.room.member',
    'm.room.name',
    'm.room.pinned_events',
    // 'm.room.power_levels',
    // 'm.room.related_groups',
    // 'm.room.server_acl',
    // 'm.room.third_party_invite',
    'm.room.tombstone',
    // 'm.room.topic',

    // msgtype for m.room.message
    'm.emote',
    'm.location',
    'm.notice',
    'm.poll.response',
    'm.poll.start',
    // 'm.reaction',
    // 'm.replace',
    'm.server_notice',
]
// Lists all known "message-type" events. The events we do not wish to display in the timeline are commented out.
const messageEventTypes = [
    'm.room.encrypted',
    'm.room.message',
    'm.sticker',

    // msgtype for m.room.message
    'm.audio',
    'm.file',
    'm.image',
    'm.poll.start',
    'm.sticker',
    'm.text',
    'm.video',
]
// Lists all known message types for "message-type" events. The events we do not wish to display in the timeline are commented out.
const messageEventMessageTypes = [
    'm.audio',
    'm.emote',
    'm.file',
    'm.image',
    'm.location',
    'm.notice',
    // 'm.reaction',
    // 'm.replace',
    'm.server_notice',
    'm.sticker',
    'm.text',
    'm.video',
]
const visibleMembershipStatuses = ['join', 'leave', 'ban']

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
}

const isJustMounted = ref<boolean>(false)
const scrollPanel = ref<typeof ScrollPanel>()
const scrollPanelContent = ref<HTMLDivElement>()
const scrollContentContainer = ref<HTMLDivElement>()
let scrollContentContainerResizeObserver: ResizeObserver | undefined = undefined
const scrollContentContainerHeight = ref<number>(window.innerHeight)

const oldMessagePlaceholder = ref<InstanceType<typeof MessagePlaceholder>>()
const oldMessagePlaceholderHeight = ref<number>(1)
const newMessagePlaceholder = ref<InstanceType<typeof MessagePlaceholder>>()
const newMessagePlaceholderHeight = ref<number>(1)
const messagePlaceholderScrollMargin = ref<number>(Math.min(Math.floor(window.innerHeight / 2), 200))

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

const isAnchoredToBottom = ref<boolean>(true)
watch(() => props.room, () => {
    isAnchoredToBottom.value = true
})

const offsetEventIndex = computed<number>(() => {
    return getTimelineEventIndexById(props.room, offsetEventId.value) ?? props.room.timeline.length - 1
})

const showOldEventMessagePlaceholder = computed<boolean>(() => {
    if (offsetEventIndex.value + (offsetChunk.value * eventsPerChunk) - (chunksPerView * eventsPerChunk) > 0) {
        return true
    } else {
        return props.room.timeline[0]?.type !== 'm.room.create'
    }
})
watch(() => showOldEventMessagePlaceholder.value, () => {
    if (showOldEventMessagePlaceholder.value) {
        nextTick(() => {
            oldMessagePlaceholderHeight.value = oldMessagePlaceholder.value?.$el.offsetHeight ?? 1
        })
    }
}, { immediate: true })

const showNewEventMessagePlaceholder = computed<boolean>(() => {
    return offsetEventIndex.value + 1 + (offsetChunk.value * eventsPerChunk) < props.room.timeline.length
})
watch(() => showNewEventMessagePlaceholder.value, () => {
    if (showNewEventMessagePlaceholder.value) {
        nextTick(() => {
            newMessagePlaceholderHeight.value = newMessagePlaceholder.value?.$el.offsetHeight ?? 1
        })
    }
}, { immediate: true })

function isEventVisible(event: ApiV3SyncClientEventWithoutRoomId) {
    if (
        !settingsEventTypes.includes(event.type)
        && !messageEventTypes.includes(event.type)
        && !customEventTypes.includes(event.type)
    ) return false
    if (event.type === 'm.room.member') {
        if (!visibleMembershipStatuses.includes(event.content.membership)) return false
    } else if (event.type === 'm.room.message') {
        if (!messageEventMessageTypes.includes(event.content.msgtype)) return false
    }
    return true
}

const visibleEventChunks = computed<EventChunk[]>(() => {
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

        const eventSlice = props.room.timeline.slice(
            Math.max(0, currentChunkBottomEventIndex + 1 - eventsPerChunk), Math.max(0, currentChunkBottomEventIndex + 1)
        )
        for (const event of eventSlice) {
            if (!isEventVisible(event)) continue

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
            chunk.events.push({
                category,
                currentDateDivider,
                displayHeader: previousEvent?.sender !== event.sender || category !== previousCategory || !!currentDateDivider,
                displayname: profiles.value[event.sender]?.displayname ?? event.sender,
                headerTime: isToday
                    ? originDate.toLocaleString(undefined, { hour: 'numeric', minute: 'numeric' })
                    : originDate.toLocaleString(undefined, { year: '2-digit', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }),
                time: originDate.toLocaleString(undefined, { hour: 'numeric', minute: 'numeric' }),
                isoTimestamp: originDate.toISOString(),
                avatarUrl: profiles.value[event.sender]?.avatarUrl,
                event,
            })

            previousEvent = event
            currentDateDividerTs = event.type === 'm.room.create' ? 0 : (event.originServerTs > currentDateDividerTs ? event.originServerTs : currentDateDividerTs)
        }

        const decryptPromises: Promise<void>[] = []
        for (const event of chunk.events) {
            if (event.event.type === 'm.room.encrypted') {
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

let fetchOldEventsAbortController: AbortController | undefined
watch(() => needsMoreOldEvents.value, async () => {
    if (needsMoreOldEvents.value) {
        const abortController = new AbortController()
        fetchOldEventsAbortController = abortController

        let targetOffsetChunk = offsetChunk.value - Math.round(chunksPerView / 2)
        let targetOffsetEventId = offsetEventId.value
        let targetOffsetEventIndex = offsetEventIndex.value
        if (props.room.timeline[0]?.type === 'm.room.create') {
            targetOffsetChunk = Math.max(Math.floor(-offsetEventIndex.value / eventsPerChunk), targetOffsetChunk)
            if (
                offsetEventIndex.value + 1 + (targetOffsetChunk * eventsPerChunk) - (chunksPerView * eventsPerChunk)
                < (eventsPerChunk * chunksPerView)
            ) {
                targetOffsetEventIndex = Math.min(props.room.timeline.length - 1, eventsPerChunk * chunksPerView)
                const targetOffsetEvent = props.room.timeline[targetOffsetEventIndex]
                if (!targetOffsetEvent) {
                    needsMoreOldEvents.value = false
                    return
                }
                targetOffsetEventId = targetOffsetEvent.eventId
                targetOffsetChunk = 0
            }
        }

        await loadPreviousMessagesUpToChunk(targetOffsetChunk, targetOffsetEventId, 'up', abortController)
        // if (targetOffsetEventId === offsetEventId.value) {
        //     while (
        //         offsetEventIndex.value + 1 + (targetOffsetChunk * eventsPerChunk) - (chunksPerView * eventsPerChunk) < 0
        //         && props.room.timeline[0]?.type !== 'm.room.create'
        //     ) {
        //         if (
        //             abortController?.signal.aborted
        //             || !showOldEventMessagePlaceholder.value
        //         ) {
        //             if (!showOldEventMessagePlaceholder.value) {
        //                 needsMoreOldEvents.value = false
        //             }
        //             return
        //         }

        //         await getPreviousMessages(props.room.roomId)
        //         scrollJumpDirection = 'up'

        //         if (abortController?.signal.aborted) return
        //         await nextTick()
        //     }
        // }

        if (abortController?.signal.aborted) return

        if (
            needsMoreOldEvents.value
            && (
                targetOffsetChunk !== offsetChunk.value
                || targetOffsetEventId !== offsetEventId.value
                || targetOffsetEventIndex !== offsetEventIndex.value
            )
        ) {
            scrollJumpDirection = 'up'
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
    if (needsMoreNewEvents.value) {
        const abortController = new AbortController()
        fetchNewEventsAbortController = abortController

        if (
            needsMoreNewEvents.value
            && offsetEventIndex.value + 1 + (offsetChunk.value * eventsPerChunk) - (chunksPerView * eventsPerChunk) < props.room.timeline.length
        ) {
            scrollJumpDirection = 'down'
            needsMoreNewEvents.value = false
            offsetChunk.value += Math.round(chunksPerView / 2)
            const maxOffsetChunk = Math.floor((props.room.timeline.length - offsetEventIndex.value) / eventsPerChunk)
            if (offsetChunk.value > maxOffsetChunk) {
                const latestEvent = props.room.timeline[props.room.timeline.length - 1]
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

    if (scrollContentContainer.value) {
        scrollContentContainerResizeObserver = new ResizeObserver(onResizeScrollContentContainer)
        scrollContentContainerResizeObserver.observe(scrollContentContainer.value)
    }

    if (scrollPanel.value) {
        scrollPanelContent.value = (scrollPanel.value as any).$el?.querySelector('.p-scrollpanel-content')
        scrollPanelContent.value?.addEventListener('scroll', onScrollContent)
    }

    // TODO - update to latest message whenever scrolled to bottom (live view)
    if (props.room.timeline.length > 0) {
        offsetEventId.value = props.room.timeline[props.room.timeline.length - 1]?.eventId
    }

    if (props.room.timelineGapStartToken) {
        getPreviousMessages(props.room.roomId)
    }

    nextTick(() => {
        isJustMounted.value = true
    })

    console.log('mounted')
    loadPreviousMessagesUpToChunk(offsetChunk.value, offsetEventId.value)

    // TODO - how to handle error scenarios:
    // 400/404 M_NOT_FOUND
    // 400 M_LIMIT_EXCEEDED
    // 403 M_FORBIDDEN
    // May need to reset sync in some cases if can't request more message history. Prompt user?
})

let scrollJumpDirection: 'up' | 'down' | 'bottom' | undefined = undefined
let scrollJumpReference: {
    eventId: string;
    offset: number;
    height: number;
    scrollTop: number;
} | undefined = undefined
let timer: any

onBeforeUpdate(() => {
    timer = window.performance.now()
    if (scrollJumpDirection && scrollPanelContent.value) {
        const eventElements = scrollContentContainer.value?.querySelectorAll('[data-event-id]')
        let scrollReferenceEvent = scrollJumpDirection === 'up'
            ? eventElements?.[0]
            : eventElements?.[eventElements?.length - 1]
        const scrollReferenceEventClientRect = scrollReferenceEvent?.getBoundingClientRect()

        if (scrollReferenceEvent && scrollReferenceEventClientRect) {
            scrollJumpReference = {
                eventId: scrollReferenceEvent.getAttribute('data-event-id') ?? '',
                offset: scrollReferenceEventClientRect.top,
                height: scrollReferenceEventClientRect.height,
                scrollTop: scrollPanelContent.value.scrollTop,
            }
        }

        scrollPanelContent.value.style.overflow = 'hidden'
    }
})

onUpdated(() => {
    if (scrollJumpDirection && scrollJumpReference && scrollPanelContent.value) {
        if (scrollJumpDirection === 'bottom') {
            scrollPanelContent.value.scrollTop = scrollPanelContent.value.scrollHeight - scrollPanelContent.value.offsetHeight
        } else {
            const scrollReferenceEvent = scrollContentContainer.value?.querySelector(`[data-event-id="${scrollJumpReference.eventId}"]`) || undefined
            if (scrollReferenceEvent) {
                const afterClientRect = scrollReferenceEvent.getBoundingClientRect()
                const afterOffset = afterClientRect.top
                const afterHeight = afterClientRect.height
                scrollPanelContent.value.scrollTop = scrollJumpReference.scrollTop - (scrollJumpReference.offset - afterOffset) + (afterHeight - scrollJumpReference.height)
                scrollJumpReference = undefined
            }
        }
        scrollPanelContent.value.style.overflow = ''
        scrollJumpDirection = undefined
        scrollJumpReference = undefined
    }
})

onUnmounted(() => {
    window.dispatchEvent(new CustomEvent('discortix-timeline-unmounted', { detail: { id: componentUuid } }))
    scrollPanelContent.value?.removeEventListener('scroll', onScrollContent)
    scrollContentContainerResizeObserver?.disconnect()
    fetchOldEventsAbortController?.abort()
    fetchNewEventsAbortController?.abort()
})

async function loadPreviousMessagesUpToChunk(targetOffsetChunk: number, targetOffsetEventId?: string, scrollDirection: 'up' | 'bottom' = 'bottom', abortController?: AbortController) {
    if (targetOffsetEventId === offsetEventId.value) {
        while (
            offsetEventIndex.value + 1 + (targetOffsetChunk * eventsPerChunk) - (chunksPerView * eventsPerChunk) < 0
            && props.room.timeline[0]?.type !== 'm.room.create'
        ) {
            if (
                abortController?.signal.aborted
                || !showOldEventMessagePlaceholder.value
            ) {
                if (!showOldEventMessagePlaceholder.value) {
                    needsMoreOldEvents.value = false
                }
                return
            }

            await getPreviousMessages(props.room.roomId)
            scrollJumpDirection = scrollDirection

            if (abortController?.signal.aborted) return
            await nextTick()
        }
    }
}

function determineIfNearPlaceholderMargins() {
    if (!scrollPanelContent.value) return
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

const onScrollContent = throttle(() => {
    if (isJustMounted.value) {
        isJustMounted.value = false
    } else {
        if (!scrollPanelContent.value) return

        determineIfNearPlaceholderMargins()
        isAnchoredToBottom.value = scrollPanelContent.value.scrollTop >= scrollPanelContent.value.scrollHeight - scrollPanelContent.value.offsetHeight - 100
    }
}, 100)

function onResizeScrollContentContainer(entries: ResizeObserverEntry[]) {
    if (entries[0]) {
        scrollContentContainerHeight.value = entries[0]?.borderBoxSize[0]?.blockSize ?? window.innerHeight
    }
    if (isAnchoredToBottom.value && scrollPanelContent.value) {
        scrollPanelContent.value.scrollTop = scrollPanelContent.value.scrollHeight - scrollPanelContent.value.offsetHeight
    }
}

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
        switch (linkId) {
            case 'editGroup':
                editGroupDialogVisible.value = true
                return
            case 'fixDecrypt':
                fixDecryptEventId.value = link.closest('[data-event-id]')?.getAttribute('data-event-id') ?? undefined
                fixDecryptDialogVisible.value = true
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