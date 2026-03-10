<template>
    <MainHeader>
        <div class="flex pl-4 py-2 pr-2 items-center">
            <template v-if="isInsideSpace">
                <span class="pi pi-hashtag w-4 mr-2 text-center text-(--channel-icon)" />
            </template>
            <template v-else-if="otherMembersDisplayed.length === 1">
                <OverlayStatus level="low" :status="otherMembersDisplayed[0]!.presence" size="small" class="w-5 h-5 mr-2">
                    <AuthenticatedImage :mxcUri="otherMembersDisplayed[0]!.avatarUrl" type="thumbnail" :width="48" :height="48" method="scale">
                        <template v-slot="{ src }">
                            <Avatar :image="src" shape="circle" class="p-avatar-full" :aria-label="t('layout.userAvatarImage')" />
                        </template>
                        <template #error>
                            <Avatar icon="pi pi-user" shape="circle" class="p-avatar-full" :aria-label="t('layout.userAvatarImage')" />
                        </template>
                    </AuthenticatedImage>
                </OverlayStatus>
            </template>
            <template v-else-if="otherMembersDisplayed.length > 1">
                <AvatarGroup class="mr-2">
                    <template v-for="member of otherMembersDisplayed" :key="member.userId">
                        <AuthenticatedImage :mxcUri="member.avatarUrl" type="thumbnail" :width="48" :height="48" method="scale">
                            <template v-slot="{ src }">
                                <Avatar :image="src" shape="circle" class="p-avatar-full" :aria-label="t('layout.userAvatarImage')" />
                            </template>
                            <template #error>
                                <Avatar icon="pi pi-user" shape="circle" class="p-avatar-full" :aria-label="t('layout.userAvatarImage')" />
                            </template>
                        </AuthenticatedImage>
                    </template>
                </AvatarGroup>
            </template>
            <h1 class="font-medium text-(--text-strong) mr-2">
                <template v-if="roomName">{{ roomName }}</template>
                <template v-else>{{ roomMemberListDisplay }}</template>
            </h1>
        </div>
    </MainHeader>
    <MainBody :disableScrollbar="true">
        <TimelineEvents
            ref="timelineEvents"
            :key="`TimelineEventsFor${props.room.roomId}`"
            :room="props.room"
            @update:anchoredToBottom="isAnchoredToBottom = $event"
            @retrySendMessage="retrySendMessage($event)"
        />
        <template #footer>
            <div v-if="typingDisplayNames.length > 0 && isAnchoredToBottom" class="relative">
                <div class="joined-room__typing-indicator">
                    <div class="p-button-loading">
                        <div class="p-button-loading-dots" />
                    </div>
                    <I18nT tag="div" :keypath="typingDisplayMessageKey" scope="global">
                        <template #displayname>
                            <strong>{{ typingDisplayNames }}</strong>
                        </template>
                    </I18nT>
                </div>
            </div>
            <form class="joined-room__chat-bar" @submit.prevent="onSubmitMessageForm">
                <div class="joined-room__chat-bar-input">
                    <Button
                        icon="pi pi-plus"
                        severity="secondary"
                        variant="text"
                        class="!h-8 !w-8 !mt-[0.6875rem]"
                        :aria-label="t('room.messageAddButton')"
                    />
                    <Textarea
                        v-model="message"
                        rows="1"
                        autoResize
                        class="p-textarea-transparent"
                        :placeholder="t('room.messagePlaceholder', { roomName: roomName ?? roomMemberListDisplay })"
                        @keydown="onKeydownMessageTextarea"
                        @input="onInputMessageTextarea"
                    />
                    <Button
                        icon="pi pi-face-smile"
                        severity="secondary"
                        variant="text"
                        class="!h-8 !w-8 !mt-[0.6875rem]"
                        :aria-label="t('room.messageEmojiButton')"
                    />
                </div>
                <Button
                    type="submit"
                    icon="pi pi-send"
                    rounded
                    class="!h-11 !w-11 !mr-2 !mt-[0.375rem] shrink-0"
                    :aria-label="t('room.messageSendButton')"
                />
            </form>
        </template>
    </MainBody>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { v4 as uuidv4 } from 'uuid'

import { useApplication } from '@/composables/application'
import { useRooms }from '@/composables/rooms'

import { useProfileStore } from '@/stores/profile'
import { useRoomStore } from '@/stores/room'
import { useSessionStore } from '@/stores/session'

import { isRoomPartOfSpace } from '@/utils/room'
import { throttle } from '@/utils/timing'

import AuthenticatedImage from '@/views/Common/AuthenticatedImage.vue'
import MainBody from '@/views/Layout/MainBody.vue'
import MainHeader from '@/views/Layout/MainHeader.vue'
import OverlayStatus from '@/views/Common/OverlayStatus.vue'

import TimelineEvents from './TimelineEvents.vue'

import Avatar from 'primevue/avatar'
import AvatarGroup from 'primevue/avatargroup'
import Button from 'primevue/button'
import Textarea from 'primevue/textarea'

import {
    type JoinedRoom,
    type EventTextContent,
    type ApiV3SyncClientEventWithoutRoomId,
} from '@/types'

const { t } = useI18n()
const { isTouchEventsDetected } = useApplication()
const { sendTypingNotification, sendMessageEvent } = useRooms()

const roomStore = useRoomStore()
const {
    getTimelineEventIndexById,
    associateTransactionIdWithEventId,
    populateSentMessageEvent
} = roomStore
const { profiles } = storeToRefs(useProfileStore())
const { userId } = storeToRefs(useSessionStore())

const props = defineProps({
    room: {
        type: Object as PropType<JoinedRoom>,
        required: true,
    }
})

const timelineEvents = ref<InstanceType<typeof TimelineEvents>>()
const isAnchoredToBottom = ref<boolean>(false)
const message = ref<string>('')

const roomName = computed<string | undefined>(() => {
    const roomNameEvent = props.room.stateEventsByType['m.room.name']?.[0]
    return roomNameEvent?.content.name
})

const roomMemberListDisplay = computed<string>(() => {
    return otherMembersDisplayed.value.map((member) => member.displayname ?? member.userId).join(', ')
})

const isInsideSpace = computed<boolean>(() => {
    return isRoomPartOfSpace(props.room)
})

const otherMembers = computed(() => {
    return (props.room as JoinedRoom).stateEventsByType['m.room.member']?.filter((member) => {
        return (member.content.membership === 'join' || member.content.membership === 'invite') && member.stateKey && member.stateKey != userId.value
    }).map((member) => {
        const userId = member.stateKey!
        return {
            userId,
            avatarUrl: profiles.value[userId]?.avatarUrl ?? member.content.avatarUrl,
            displayname: profiles.value[userId]?.displayname ?? member.content.displayname,
            presence: profiles.value[userId]?.presence ?? 'offline',
        }
    }) ?? []
})
const otherMembersDisplayed = computed(() => {
    return otherMembers.value.slice(0, 5)
})

const typingUserIds = computed(() => {
    return props.room.typingUserIds.filter((id) => id != userId.value)
})

const typingDisplayNames = computed(() => {
    return typingUserIds.value.map((userId) => {
        return profiles.value[userId]?.displayname ?? userId
    }).join(', ')
})

const typingDisplayMessageKey = computed(() => {
    if (typingUserIds.value.length === 1) {
        return 'room.typingIndicatorSingle'
    } else if (typingUserIds.value.length < 3) {
        return 'room.typingIndicatorMultiple'
    } else {
        return 'room.typingIndicatorSeveral'
    }
})

function onKeydownMessageTextarea(event: KeyboardEvent) {
    if (event.code === 'Enter' && !event.shiftKey && !isTouchEventsDetected.value) {
        event.preventDefault()
        onSubmitMessageForm()
    }
}

let lastTypingNotificationSentTimestamp: number = 0
let stopTypingTimeoutHandle: number | undefined = undefined
const onInputMessageTextarea = throttle(() => {
    if (message.value.length > 0) {
        clearTimeout(stopTypingTimeoutHandle)
        const now = window.performance.now()
        if (now - lastTypingNotificationSentTimestamp > 15000) {
            lastTypingNotificationSentTimestamp = now
            sendTypingNotification(props.room.roomId, true)
        }
        stopTypingTimeoutHandle = window.setTimeout(onStopTyping, 5000)
    } else {
        onStopTyping()
    }
}, 2500)
function onStopTyping() {
    lastTypingNotificationSentTimestamp = 0
    clearTimeout(stopTypingTimeoutHandle)
    stopTypingTimeoutHandle = undefined
    sendTypingNotification(props.room.roomId, false)
}

async function onSubmitMessageForm() {
    if (message.value.trim() === '') return

    await timelineEvents.value?.scrollToBottom()

    const txnId = uuidv4()
    const event: ApiV3SyncClientEventWithoutRoomId = reactive({
        content: {
            body: message.value,
            msgtype: 'm.text',
        } satisfies EventTextContent,
        eventId: `PLACEHOLDER_${txnId}`,
        originServerTs: Date.now(),
        sender: userId.value!,
        type: 'm.room.message',
        txnId,
        sendError: false,
    })
    message.value = ''

    populateSentMessageEvent(props.room.roomId, event)

    try {
        const response = await sendMessageEvent<EventTextContent>(
            props.room.roomId, 'm.room.message', txnId, event.content
        )
        associateTransactionIdWithEventId(props.room.roomId, txnId, response.eventId)
    } catch (error) {
        event.sendError = true
    }
}

async function retrySendMessage(eventId?: string) {
    const eventIndex = getTimelineEventIndexById(props.room.visibleTimeline, eventId)
    const event = props.room.visibleTimeline[eventIndex ?? -1]
    if (!event?.txnId) return
    event.sendError = false

    try {
        const response = await sendMessageEvent(
            props.room.roomId, event.type, event.txnId, event.content
        )
        associateTransactionIdWithEventId(props.room.roomId, event.txnId, response.eventId)
    } catch (error) {
        event.sendError = true
    }
}

</script>

<style lang="scss" scoped>
.joined-room__typing-indicator {
    background: var(--background-base-lower);
    position: absolute;
    display: flex;
    overflow: hidden;
    align-items: center;
    padding: 0 0 0 4.5rem;
    top: -1.75rem;
    left: 0;
    right: 0;
    height: 1.75rem;
    font-size: 0.875rem;
    color: var(--channels-default);
    z-index: 1;

    strong {
        color: var(--text-strong);
    }

    .p-button-loading {
        position: absolute;
        left: 2.25rem;
        top: 0.875rem;
        transform: scale(0.75);
    }
}
.joined-room__chat-bar {
    display: flex;
    align-items: flex-start;
    
    .joined-room__chat-bar-input {
        display: flex;
        align-items: flex-start;
        min-height: 3.5rem;
        padding: 0 0.5rem 0 0.5rem;
        margin: 0 0.5rem 0.5rem 0.5rem;
        background: var(--chat-background-default);
        border: 1px solid var(--border-muted);
        border-radius: var(--radius-sm);
        flex-grow: 1;
        flex-shrink: 1;
        overflow: hidden;

        .p-textarea {
            align-self: center;
            flex-grow: 1;
            max-height: 50dvh;
            overflow-x: hidden !important;
            overflow-y: auto !important;
            overscroll-behavior: none;
            flex-shrink: 1 !important;
            min-width: 0 !important;

            &[style *= "44px"] {
                overflow: hidden !important;
            }
        }
    }

    > :deep(.p-button) > .p-button-icon {
        transform: translateX(-0.125rem) rotate(45deg);
    }
}
</style>