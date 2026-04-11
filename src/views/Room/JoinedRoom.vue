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
            <h1 class="font-medium text-strong mr-2">
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
            :referenceEventId="replyToEventId || editEventId"
            @update:anchoredToBottom="isAnchoredToBottom = $event"
            @update:editEventId="onUpdateEditEventId"
            @update:replyToEventId="onUpdateReplyToEventId"
            @retrySendMessage="retrySendMessage($event)"
            @selectEmoji="showExpressionPicker"
            @toggleEmoji="onEmojiSelected"
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
            <div v-if="replyToEventId || editEventId" class="joined-room__reply-bar">
                <template v-if="replyToEventId">
                    {{ t('room.replyingTo') }} <strong>{{ replyToDisplayName }}</strong>
                </template>
                <template v-else>
                    {{ t('room.messageEditing') }}
                </template>
                <Button
                    icon="pi pi-times-circle" rounded severity="secondary"
                    variant="text" :aria-label="replyToEventId ? t('room.messageCancelReplyButton') : t('room.messageCancelEditButton')"
                    @click="onCancelEditOrReply()"
                />
            </div>
            <ul v-if="selectedMedia.length > 0 && editEventId == null" class="joined-room__attachment-bar">
                <li v-for="media in selectedMedia" :key="media.id" class="joined-room__attachment-bar__attachment">
                    <div class="joined-room__attachment-bar__controls">
                        <Button
                            v-tooltip.top="{ value: isTouchEventsDetected ? undefined : t('room.attachmentMenu.spoiler') }"
                            :icon="media.spoiler ? 'pi pi-eye-slash' : 'pi pi-eye'" severity="secondary" variant="text"
                            :aria-label="t('room.attachmentMenu.spoiler')" @click="media.spoiler = !media.spoiler" />
                        <Button v-tooltip.top="{ value: isTouchEventsDetected ? undefined : t('room.attachmentMenu.modify') }"
                            icon="pi pi-pencil" severity="secondary" variant="text" :aria-label="t('room.attachmentMenu.modify')"
                            @click="editSelectedMedia(media)" />
                        <Button v-tooltip.top="{ value: isTouchEventsDetected ? undefined : t('room.attachmentMenu.remove') }"
                            icon="pi pi-trash" severity="danger" variant="text" :aria-label="t('room.attachmentMenu.remove')" 
                            @click="removeSelectedMedia(media)" />
                    </div>
                    <div v-if="media.mediaInfo.type === 'image' || media.mediaInfo.type === 'video'" class="joined-room__attachment-bar__media-preview">
                        <div v-if="media.spoiler" class="joined-room__attachment-bar__media-preview__spoiler-overlay">
                            <div class="joined-room__attachment-bar__media-preview__spoiler-overlay__label">
                                {{ t('room.attachmentSpoiler') }}
                            </div>
                        </div>
                        <img v-if="media.mediaInfo.type === 'image'" :src="media.previewObjectUrl">
                        <video v-else-if="media.mediaInfo.type === 'video'" :src="media.previewObjectUrl" />
                    </div>
                    <div v-else class="joined-room__attachment-bar__media-icon">
                        <span class="pi" :class="media.mediaInfo.type === 'audio' ? 'pi-headphones' : 'pi-file'" aria-hidden="true" />
                    </div>
                    <span class="joined-room__attachment-bar__attachment__filename">
                        {{ media.filename }}
                    </span>
                </li>
            </ul>
            <form class="joined-room__chat-bar" @submit.prevent="onSubmitMessageForm">
                <div class="joined-room__chat-bar-input">
                    <Button
                        icon="pi pi-plus"
                        severity="secondary"
                        variant="text"
                        class="!h-8 !w-8 !mt-[0.6875rem]"
                        :aria-label="t('room.messageAddButton')"
                        @click="mediaContextMenu?.show($event)"
                    />
                    <Textarea
                        v-model="message"
                        ref="messageTextarea"
                        rows="1"
                        autoResize
                        class="p-textarea-transparent"
                        :placeholder="t('room.messagePlaceholder', { roomName: roomName ?? roomMemberListDisplay })"
                        @keydown="onKeydownMessageTextarea"
                        @input="onInputMessageTextarea"
                    />
                    <Button
                        v-pointer="{ click: showExpressionPicker }"
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
    <ContextMenu ref="mediaContextMenu" :model="addMediaContextMenuItems">
        <template #item="{ item, props }">
            <a class="p-contextmenu-item-link" v-bind="props.action">
                <span :class="item.icon" aria-hidden="true" />
                <span class="p-contextmenu-item-label" :class="item.labelClass">{{ item.label }}</span>
            </a>
        </template>
    </ContextMenu>
    <ModifyAttachmentDialog
        v-model:visible="modifyAttachmentDialogVisible"
        :media="editingSelectedMedia"
        @update:media="onUpdateEditingSelectedMedia"
    />
    <ExpressionPicker
        ref="expressionPicker"
        :emojiOnly="expressionPickerEmojiOnly"
        @selectEmoji="onEmojiSelected"
        @hidden="onExpressionPickerHidden"
    />
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onUnmounted, reactive, ref, watch, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { v4 as uuidv4 } from 'uuid'
import type { GroupSession } from 'vodozemac-wasm-bindings'

import { encryptFile } from '@/utils/crypto'
import { FileTooBigError, HttpError, PendingNetworkRequestError } from '@/utils/error'
import { pickFile } from '@/utils/file-access'
import { formatMessage } from '@/utils/message'
import { isRoomPartOfSpace } from '@/utils/room'
import { throttle } from '@/utils/timing'

import { vPointer } from '@/directives/pointer'

import { useApplication } from '@/composables/application'
import { useCryptoKeys } from '@/composables/crypto-keys'
import { useEmoji } from '@/composables/emoji'
import { createLogger } from '@/composables/logger'
import { createLazyMediaUpload, createMediaInfo } from '@/composables/media'
import { useMegolm } from '@/composables/megolm'
import { useRooms } from '@/composables/rooms'

import { useProfileStore } from '@/stores/profile'
import { useRoomStore } from '@/stores/room'
import { useSessionStore } from '@/stores/session'

import AuthenticatedImage from '@/views/Common/AuthenticatedImage.vue'
const ExpressionPicker = defineAsyncComponent(() => import('@/views/Room/ExpressionPicker.vue'))
import MainBody from '@/views/Layout/MainBody.vue'
import MainHeader from '@/views/Layout/MainHeader.vue'
const ModifyAttachmentDialog = defineAsyncComponent(() => import('@/views/Room/ModifyAttachmentDialog.vue'))
import OverlayStatus from '@/views/Common/OverlayStatus.vue'

import TimelineEvents from './TimelineEvents.vue'

import Avatar from 'primevue/avatar'
import AvatarGroup from 'primevue/avatargroup'
import Button from 'primevue/button'
import ContextMenu from 'primevue/contextmenu'
import Textarea from 'primevue/textarea'
import type { MenuItem } from 'primevue/menuitem'
import vTooltip from 'primevue/tooltip'
import { useToast } from 'primevue/usetoast'

import {
    type JoinedRoom,
    type ApiV3SyncClientEventWithoutRoomId,
    type EmojiPickerEmojiItem,
    type EncryptedFile,
    type EventAudioContent,
    type EventFileContent,
    type EventImageContent,
    type EventTextContent,
    type EventVideoContent,
    type MediaAttachmentPendingUpload,
    type MediaImageInfo,
} from '@/types'

const log = createLogger(import.meta.url)

const { t } = useI18n()
const toast = useToast()

const { isTouchEventsDetected } = useApplication()
const { fetchUserKeys } = useCryptoKeys()
const { currentRoomCustomEmojiByCode } = useEmoji()
const { getOutboundGroupSession } = useMegolm()
const { sendTypingNotification, sendMessageEvent, sendMessageReaction, redactEvent } = useRooms()

const roomStore = useRoomStore()
const {
    currentRoomEncryptionEnabledTimestamp,
    decryptedRoomEvents,
    pendingMediaUploads,
} = storeToRefs(roomStore)
const {
    getTimelineEventIndexById,
    getTimelineEventById,
    associateTransactionIdWithEventId,
    populateSentMessageEvent,
    cancelUnsentMessageEvent,
} = roomStore
const { profiles } = storeToRefs(useProfileStore())
const { userId: sessionUserId } = storeToRefs(useSessionStore())

const props = defineProps({
    room: {
        type: Object as PropType<JoinedRoom>,
        required: true,
    }
})

/*-----------------*\
|                   |
|   General state   |
|                   |
\*-----------------*/

const timelineEvents = ref<InstanceType<typeof TimelineEvents>>()
const isAnchoredToBottom = ref<boolean>(false)
const message = ref<string>('')
const messageTextarea = ref<InstanceType<typeof Textarea>>()

const replyToDisplayName = computed<string | undefined>(() => {
    if (!replyToEventId.value) return
    const event = getTimelineEventById(props.room.visibleTimeline, replyToEventId.value)
    return event?.sender ? (profiles.value[event.sender]?.displayname ?? event.sender) : undefined
})

const roomName = computed<string | undefined>(() => {
    const roomNameEvent = props.room.stateEventsByType['m.room.name']?.[0]
    return roomNameEvent?.content.name
})

const roomMemberListDisplay = computed<string>(() => {
    return Array.from(new Set(otherMembersDisplayed.value.map((member) => member.displayname ?? member.userId))).join(', ') || t('layout.emptyRoom')
})

const isInsideSpace = computed<boolean>(() => {
    return isRoomPartOfSpace(props.room)
})

const otherMembers = computed(() => {
    return Array.from(new Set((props.room as JoinedRoom).stateEventsByType['m.room.member']?.map(member => {
        return (member.content.membership === 'join' ? member.sender : member.content.membership === 'invite' ? member.stateKey : undefined) ?? ''
    }).filter(
        userId => userId && userId != sessionUserId.value
    ))).map((userId) => {
        return {
            userId,
            avatarUrl: profiles.value[userId]?.avatarUrl,
            displayname: profiles.value[userId]?.displayname,
            presence: profiles.value[userId]?.presence ?? 'offline',
        }
    })
})
const otherMembersDisplayed = computed(() => {
    return otherMembers.value.slice(0, 5)
})

/*-------------------------*\
|                           |
|   Fetch Encryption Keys   |
|                           |
\*-------------------------*/

watch(() => props.room.stateEventsByType['m.room.member'], (members) => {
    if (!members) return
    const userIds: string[] = []
    for (const member of members) {
        if (member.content?.membership !== 'join') continue
        userIds.push(member.sender)
    }
    fetchUserKeys(userIds)
}, { immediate: true })

/*---------------------*\
|                       |
|   Typing indicators   |
|                       |
\*---------------------*/

const typingUserIds = computed(() => {
    return props.room.typingUserIds.filter((id) => id != sessionUserId.value)
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

/*------------------*\
|                    |
|   Add Media Menu   |
|                    |
\*------------------*/

const mediaContextMenu = ref<InstanceType<typeof ContextMenu>>()

const addMediaContextMenuItems = ref<MenuItem[]>([
    {
        label: t('room.messageAddMenu.uploadFile'),
        icon: 'pi pi-upload',
        command() {
            selectMedia()
        }
    },
    {
        label: t('room.messageAddMenu.createPoll'),
        icon: 'pi pi-chart-bar',
        command() {
        }
    },
])

const selectedMedia = ref<MediaAttachmentPendingUpload[]>([])
const editingSelectedMedia = ref<MediaAttachmentPendingUpload>()
const modifyAttachmentDialogVisible = ref<boolean>(false)

async function selectMedia() {
    const file = await pickFile({ multiple: false })
    const mediaInfo = await createMediaInfo(file, true)
    let encryptedFile: EncryptedFile | undefined = undefined
    let encryptedFileBlob: Blob | undefined = undefined
    let encryptedThumbnailFile: EncryptedFile | undefined = undefined
    let encryptedThumbnailFileBlob: Blob | undefined = undefined
    if (currentRoomEncryptionEnabledTimestamp.value != null) {
        let encryptedData: Uint8Array
        ({ encryptedFile, encryptedData } = await encryptFile(file))
        encryptedFileBlob = new Blob([encryptedData as never])
        if ((mediaInfo.type === 'image' || mediaInfo.type === 'video') && mediaInfo.thumbnailBlob) {
            ({ encryptedFile: encryptedThumbnailFile, encryptedData } = await encryptFile(mediaInfo.thumbnailBlob))
            encryptedThumbnailFileBlob = new Blob([encryptedData as never])
        }
    }

    selectedMedia.value.push({
        description: '',
        id: uuidv4(),
        file,
        filename: file.name,
        mediaInfo,
        previewObjectUrl: URL.createObjectURL(file),
        spoiler: false,
        encryptedFile,
        encryptedFileBlob,
        encryptedThumbnailFile,
        encryptedThumbnailFileBlob,
    })
}

function editSelectedMedia(media: MediaAttachmentPendingUpload) {
    editingSelectedMedia.value = media
    modifyAttachmentDialogVisible.value = true
}

function onUpdateEditingSelectedMedia(media: Pick<MediaAttachmentPendingUpload, 'description' | 'filename' | 'spoiler'>) {
    if (!editingSelectedMedia.value) return
    editingSelectedMedia.value.filename = media.filename
    editingSelectedMedia.value.description = media.description
    editingSelectedMedia.value.spoiler = media.spoiler
}

function removeSelectedMedia(media: MediaAttachmentPendingUpload) {
    const mediaIndex = selectedMedia.value.indexOf(media)
    URL.revokeObjectURL(media.previewObjectUrl)
    selectedMedia.value.splice(mediaIndex, 1)
}

function removeAllSelectedMedia() {
    for (let media of selectedMedia.value) {
        URL.revokeObjectURL(media.previewObjectUrl)
    }
    selectedMedia.value = []
}

/*-----------------------------*\
|                               |
|   Expression / emoji picker   |
|                               |
\*-----------------------------*/

const expressionPicker = ref<InstanceType<typeof ExpressionPicker>>()
const expressionPickerTriggerReferenceEventId = ref<string | undefined>()
const expressionPickerEmojiOnly = ref<boolean>(false)

function showExpressionPicker(event: Event, referenceEventId?: string) {
    expressionPickerTriggerReferenceEventId.value = referenceEventId
    expressionPickerEmojiOnly.value = !!referenceEventId
    expressionPicker.value?.show(event)
}

async function onEmojiSelected(emoji: EmojiPickerEmojiItem, referenceEventId?: string) {
    referenceEventId = referenceEventId ?? expressionPickerTriggerReferenceEventId.value
    if (referenceEventId) {
        try {
            await sendMessageReaction(props.room.roomId, emoji.emoji, referenceEventId)
        } catch (error) {
            let messageText = t('errors.unexpected')
            if (error instanceof PendingNetworkRequestError) {
                messageText = t('errors.message.pendingReaction')
            } else if (error instanceof HttpError) {
                if (error.isMatrixGuestAccessForbidden()) {
                    messageText = t('errors.message.guestReaction')
                } else if (error.isMatrixForbidden()) {
                    messageText = t('errors.message.forbidden')
                }
            }
            toast.add({ severity: 'error', summary: messageText, life: 4000 })
            log.error('Error sending reaction.', error)
        }
    } else if (messageTextarea.value) {
        const textarea = (messageTextarea.value as any).$el as HTMLTextAreaElement
        if (textarea.selectionStart > -1) {
            const beforeText = message.value.slice(0, textarea.selectionStart)
            const afterText = message.value.slice(textarea.selectionEnd)
            message.value = beforeText + (beforeText.length > 0 && beforeText.charAt(beforeText.length - 1) !== ' ' ? ' ' : '')
                + emoji.emoji + (afterText.length > 0 && afterText.charAt(0) !== '' ? ' ' : '') + afterText
        }
    }
    expressionPicker.value?.hide()
}

async function onExpressionPickerHidden() {
    timelineEvents.value?.resetMessageActionsContextMenuTargetEventId()
}

/*---------------------------------*\
|                                   |
|   Editing / replying to message   |
|                                   |
\*---------------------------------*/

const editEventId = ref<string | undefined>()
const replyToEventId = ref<string | undefined>()

function onUpdateEditEventId(eventId: string | undefined) {
    replyToEventId.value = undefined
    editEventId.value = eventId
    let event = props.room.replacements[eventId ?? '']?.[0] ?? getTimelineEventById(props.room.visibleTimeline, eventId)
    if (event?.type === 'm.room.encrypted') {
        event = decryptedRoomEvents.value[event.eventId] ?? event
    }
    if (event) {
        message.value = event.content?.['invalid.discortix.unredacted_body']
            ?? event.content?.body ?? ''
    }
    if (eventId) {
        (messageTextarea.value as any)?.$el?.focus()
    }
}

function onUpdateReplyToEventId(eventId: string | undefined) {
    if (editEventId.value) {
        editEventId.value = undefined
        message.value = ''
    }
    replyToEventId.value = eventId
    if (eventId) {
        (messageTextarea.value as any)?.$el?.focus()
    }
}

function onCancelEditOrReply() {
    replyToEventId.value = undefined
    if (editEventId.value) {
        editEventId.value = undefined
        message.value = ''
    }
}

watch(() => props.room.roomId, () => {
    editEventId.value = undefined
    replyToEventId.value = undefined
    message.value = ''
})

/*------------------------------*\
|                                |
|   Typing in message textarea   |
|                                |
\*------------------------------*/

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

/*---------------------*\
|                       |
|   Sending a message   |
|                       |
\*---------------------*/

async function onSubmitMessageForm() {
    const mediaToUpload = editEventId.value == null ? selectedMedia.value : []
    if (message.value.trim() === '' && mediaToUpload.length === 0) return

    await timelineEvents.value?.scrollToBottom()

    const roomId = props.room.roomId
    const txnId = uuidv4()
    const { body, unredactedBody, formattedBody } = formatMessage(message.value, currentRoomCustomEmojiByCode.value, t)

    let editingEvent: ApiV3SyncClientEventWithoutRoomId | undefined
    if (editEventId.value && !replyToEventId.value) {
        editingEvent = props.room.replacements[editEventId.value ?? '']?.[0] ?? getTimelineEventById(props.room.visibleTimeline, editEventId.value)
        if (editingEvent?.type === 'm.room.encrypted') {
            editingEvent = decryptedRoomEvents.value[editingEvent.eventId]
        }
    }

    let eventContent: EventTextContent | EventAudioContent | EventImageContent | EventVideoContent | EventFileContent = {
        body,
        format: formattedBody != body ? 'org.matrix.custom.html' : undefined,
        formattedBody: formattedBody != body ? formattedBody : undefined,
        msgtype: 'm.text',
    }
    if (editingEvent?.content) {
        eventContent = editingEvent.content
        eventContent.body = body
        eventContent.format = formattedBody != body ? 'org.matrix.custom.html' : undefined
        eventContent.formattedBody = formattedBody != body ? formattedBody : undefined
    }

    if (unredactedBody) {
        eventContent['invalid.discortix.unredacted_body'] = unredactedBody
    }

    if (replyToEventId.value) {
        eventContent['m.relates_to'] = {
            'm.in_reply_to': {
                eventId: replyToEventId.value,
            },
        }
    } else if (editEventId.value) {
        eventContent['m.relates_to'] = {
            relType: 'm.replace',
            eventId: editEventId.value,
        }
        eventContent['m.new_content'] = {
            ...eventContent,
        }
        eventContent.body = '* ' + eventContent.body
        if (eventContent.formattedBody) {
            eventContent.formattedBody = '* ' + eventContent.formattedBody
        }
    }

    const event: ApiV3SyncClientEventWithoutRoomId = reactive({
        content: eventContent,
        eventId: `PLACEHOLDER_${txnId}`,
        originServerTs: Date.now(),
        sender: sessionUserId.value!,
        type: 'm.room.message',
        txnId,
        sendError: false,
    })

    message.value = ''
    replyToEventId.value = undefined
    editEventId.value = undefined
    removeAllSelectedMedia()

    // Send the main text event.
    if (
        (mediaToUpload.length > 0 && mediaToUpload[0]?.description)
        || (mediaToUpload.length === 0)
    ) {
        populateSentMessageEvent(roomId, event)
        try {
            let groupSession: GroupSession | undefined = await getOutboundGroupSession(roomId)
            const response = await sendMessageEvent<EventTextContent>(
                roomId, 'm.room.message', txnId, event.content, groupSession
            )
            associateTransactionIdWithEventId(roomId, txnId, response.eventId)
        } catch (error) {
            log.error('Error sending message:', error)
            event.sendError = true
        }
    }

    // Create placeholder events in the timeline for each media event.
    const mediaEvents: ApiV3SyncClientEventWithoutRoomId[] = []
    for (const [mediaIndex, media] of mediaToUpload.entries()) {
        const txnId = uuidv4()

        const event: ApiV3SyncClientEventWithoutRoomId = reactive({
            content: {},
            eventId: `PLACEHOLDER_${txnId}`,
            originServerTs: Date.now(),
            sender: sessionUserId.value!,
            type: 'm.room.message',
            txnId,
            sendError: false,
        })

         if (media.mediaInfo.type === 'audio') {
            event.content = {
                body: media.filename,
                filename: media.filename,
                info: media.mediaInfo.info,
                msgtype: 'm.audio',
            }
        } else if (media.mediaInfo.type === 'image') {
            event.content = {
                body: media.filename,
                filename: media.filename,
                info: media.mediaInfo.info,
                msgtype: 'm.image',
            } satisfies EventImageContent
        } else if (media.mediaInfo.type === 'video') {
            event.content = {
                body: media.filename,
                filename: media.filename,
                info: media.mediaInfo.info,
                msgtype: 'm.video',
            }
        } else if (media.mediaInfo.type === 'unknown') {
            event.content = {
                body: media.filename,
                filename: media.filename,
                info: media.mediaInfo.info,
                msgtype: 'm.file',
            }
        }

        if (!media.description && mediaIndex === 0) {
            event.content.body = body
            if (formattedBody != body) {
                event.content.format = 'org.matrix.custom.html'
                event.content.formattedBody = formattedBody
            }
        }

        if (media.spoiler) {
            event.content['page.codeberg.everypizza.msc4193.spoiler'] = true
        }

        pendingMediaUploads.value[txnId] = media
        populateSentMessageEvent(roomId, event)
        mediaEvents.push(event)
    }

    // Upload the files and send the media events.
    for (const mediaEvent of mediaEvents) {
        const txnId = mediaEvent.txnId
        if (!txnId) continue

        await sendMediaEvent(mediaEvent)
    }

}

async function sendMediaEvent(event: ApiV3SyncClientEventWithoutRoomId) {
    const roomId = props.room.roomId
    const media = pendingMediaUploads.value[event.txnId!] ?? pendingMediaUploads.value[event.eventId]

    if (['m.audio', 'm.file', 'm.image', 'm.video'].includes(event.content?.msgtype) && !media && event.txnId) {
        cancelUnsentMessageEvent(roomId, event.txnId)
        return
    }

    let createdEventId: string | undefined

    try {
        let mediaUpload: ReturnType<typeof createLazyMediaUpload> | undefined = undefined
        let thumbnailMediaUpload: ReturnType<typeof createLazyMediaUpload> | undefined = undefined

        if (media) {
            if (media.contentUri && !media.fileUploaded) {
                mediaUpload = createLazyMediaUpload()
                mediaUpload.useContentUri(media.contentUri)
            } else if (!media.contentUri) {
                mediaUpload = createLazyMediaUpload()
                media.contentUri = await mediaUpload.useBlob(media.encryptedFileBlob ?? media.file)
            }

            const thumbnailBlob = media.encryptedThumbnailFileBlob
                || (media.mediaInfo.type === 'image' || media.mediaInfo.type === 'video')
                    ? (media.encryptedThumbnailFileBlob ?? (media.mediaInfo as MediaImageInfo).thumbnailBlob)
                    : undefined
            if (media.thumbnailContentUri && !media.thumbnailUploaded) {
                thumbnailMediaUpload = createLazyMediaUpload()
                thumbnailMediaUpload.useContentUri(media.thumbnailContentUri)
            } else if (!media.thumbnailContentUri && thumbnailBlob) {
                thumbnailMediaUpload = createLazyMediaUpload()
                media.thumbnailContentUri = await thumbnailMediaUpload.useBlob(thumbnailBlob)
            }

            if (event.content.msgtype === 'm.audio') {
                if (media.encryptedFile) {
                    (event.content as EventAudioContent).file = media.encryptedFile
                    media.encryptedFile.url = media.contentUri
                } else {
                    (event.content as EventAudioContent).url = media.contentUri
                }
            } else if (event.content.msgtype === 'm.file') {
                if (media.encryptedFile) {
                    (event.content as EventFileContent).file = media.encryptedFile
                    media.encryptedFile.url = media.contentUri
                } else {
                    (event.content as EventFileContent).url = media.contentUri
                }
            } else if (event.content.msgtype === 'm.image') {
                if (media.encryptedFile) {
                    (event.content as EventImageContent).file = media.encryptedFile
                    media.encryptedFile.url = media.contentUri
                    if (media.thumbnailContentUri && media.encryptedThumbnailFile) {
                        (event.content as EventImageContent).info!.thumbnailFile = media.encryptedThumbnailFile
                        media.encryptedThumbnailFile.url = media.thumbnailContentUri
                    }
                } else {
                    (event.content as EventImageContent).url = media.contentUri
                    if (media.thumbnailContentUri) {
                        (event.content as EventImageContent).info!.thumbnailUrl = media.thumbnailContentUri
                    }
                }
            } else if (event.content.msgtype === 'm.video') {
                if (media.encryptedFile) {
                    (event.content as EventVideoContent).file = media.encryptedFile
                    media.encryptedFile.url = media.contentUri
                    if (media.thumbnailContentUri && media.encryptedThumbnailFile) {
                        (event.content as EventVideoContent).info!.thumbnailFile = media.encryptedThumbnailFile
                        media.encryptedThumbnailFile.url = media.thumbnailContentUri
                    }
                } else {
                    (event.content as EventVideoContent).url = media.contentUri
                    if (media.thumbnailContentUri) {
                        (event.content as EventVideoContent).info!.thumbnailUrl = media.thumbnailContentUri
                    }
                }
            }
        }

        if (event.txnId) {
            let groupSession: GroupSession | undefined = await getOutboundGroupSession(props.room.roomId)
            const response = await sendMessageEvent(
                roomId, event.type, event.txnId, event.content, groupSession
            )
            createdEventId = response.eventId
            associateTransactionIdWithEventId(roomId, event.txnId, response.eventId)
        }

        if (media) {
            await thumbnailMediaUpload?.upload()
            media.thumbnailUploaded = true

            mediaUpload?.upload()
            media.fileUploaded = true
        }

        delete pendingMediaUploads.value[createdEventId!]
    } catch (error) {
        if (error instanceof FileTooBigError || (error instanceof HttpError && error.isMatrixTooLarge())) {
            if (createdEventId) {
                redactEvent(roomId, createdEventId)
            } else if (event.txnId) {
                cancelUnsentMessageEvent(roomId, event.txnId)
            }
            toast.add({ severity: 'error', summary: t('errors.message.mediaTooLarge', { filename: media?.filename }), life: 6000 })
        } else {
            log.error('Error resending message:', error)
            event.sendError = true
        }
    }

}

async function retrySendMessage(eventId?: string) {
    const eventIndex = getTimelineEventIndexById(props.room.visibleTimeline, eventId)
    const event = props.room.visibleTimeline[eventIndex ?? -1]
    if (!event) return
    event.sendError = false

    if (['m.audio', 'm.file', 'm.image', 'm.video'].includes(event.content?.msgtype)) {
        await sendMediaEvent(event)
    } else if (event.txnId) {
        try {
            const roomId = props.room.roomId
            const response = await sendMessageEvent(
                roomId, event.type, event.txnId, event.content
            )
            associateTransactionIdWithEventId(roomId, event.txnId, response.eventId)
        } catch (error) {
            log.error('Error resending message:', error)
            event.sendError = true
        }
    }
}

/*-------------*\
|               |
|   Lifecycle   |
|               |
\*-------------*/

function clearSharedState() {
    message.value = ''
    replyToEventId.value = undefined
    editEventId.value = undefined
    removeAllSelectedMedia()
}

watch(() => props.room.roomId, () => {
    clearSharedState()
})

onUnmounted(() => {
    clearSharedState()
})

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
.joined-room__reply-bar {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    overflow: hidden;
    position: relative;
    background: var(--background-surface-higher);
    border-bottom: 1px solid var(--border-subtle);
    border-start-end-radius: var(--radius-sm);
    border-start-start-radius: var(--radius-sm);
    font-size: 0.875rem;
    padding: 0.1875rem 3rem 0 1rem;
    margin: 0 3.75rem 0 0.5rem;
    min-height: 2.1875rem;

    .p-button {
        position: absolute;
        top: 50%;
        right: 0.5rem;
        transform: translateY(-50%);

        --p-icon-size: 0.875rem;
    }

    ~ .joined-room__attachment-bar {
        border-start-end-radius: 0;
        border-start-start-radius: 0;
    }

    ~ .joined-room__chat-bar {
        .joined-room__chat-bar-input {
            border-start-end-radius: 0;
            border-start-start-radius: 0;
        }
    }
}
.joined-room__attachment-bar {
    display: flex;
    align-items: center;
    gap: 1.75rem;
    overflow: auto hidden;
    position: relative;
    background: var(--chat-background-default);
    border: 1px solid var(--border-muted);
    border-bottom: none;
    border-start-end-radius: var(--radius-sm);
    border-start-start-radius: var(--radius-sm);
    padding: 1.25rem 0.625rem 0.625rem 0.625rem;
    margin: 0 3.75rem 0 0.5rem;

    ~ .joined-room__chat-bar {
        .joined-room__chat-bar-input {
            border-top-color: var(--chat-background-default);
            border-start-end-radius: 0;
            border-start-start-radius: 0;
        }
    }
}
.joined-room__attachment-bar__attachment {
    background-color: var(--background-surface-high);
    border: 1px solid var(--border-normal);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-low);
    display: inline-flex;
    flex-direction: column;
    margin: 0;
    max-height: 12.5rem;
    max-width: 12.5rem;
    min-height: 12.5rem;
    min-width: 12.5rem;
    padding: 0.5rem;
    position: relative;
}
.joined-room__attachment-bar__media-preview {
    display: flex;
    flex-direction: column;
    flex-grow: 1;
    height: 100%;
    background-color: var(--background-surface-highest);
    border-radius: 0.375rem;
    object-fit: contain;
    overflow: hidden;
    position: relative;

    > img, > video {
        display: flex;
        flex-grow: 1;
        height: 100%;
        border-radius: 0.375rem;
        object-fit: contain;
        width: 100%;
    }
}
.joined-room__attachment-bar__media-icon {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex-grow: 1;
    height: 100%;
    color: var(--blurple-14);
    --p-icon-size: 5rem;
}
.joined-room__attachment-bar__media-preview__spoiler-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    cursor: pointer;
    z-index: 1;

    ~ img, ~ video {
        filter: blur(2.75rem);
    }

    &:hover {
        .joined-room__attachment-bar__media-preview__spoiler-overlay__label {
            background-color: color-mix(in oklab, var(--spoiler-hidden-background-hover) 60%, rgba(0, 0, 0, 0.8));
        }
    }
}
.joined-room__attachment-bar__media-preview__spoiler-overlay__label {
    background-color: color-mix(in oklab, var(--spoiler-hidden-background) 60%, rgba(0, 0, 0, 0.8));
    border-radius: 20px;
    cursor: pointer;
    font-size: 15px;
    font-weight: 600;
    letter-spacing: .5px;
    text-transform: uppercase;
    align-items: center;
    color: var(--spoiler-hidden-color);
    display: flex;
    flex-direction: column;
    inset-inline-start: 50%;
    line-height: 1;
    padding: 0.5rem 0.75rem;
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    user-select: none;
    z-index: 1;
}
.joined-room__attachment-bar__attachment__filename {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 0.875rem;
    font-weight: 400;
    margin-top: 0.5rem;
    flex-shrink: 0;
}
.joined-room__attachment-bar__controls {
    position: absolute;
    top: 0;
    right: -1.25rem;
    align-items: center;
    background-color: var(--background-surface-highest);
    border-radius: 0.25rem;
    box-shadow: var(--shadow-border), var(--shadow-low);
    box-sizing: border-box;
    display: grid;
    grid-auto-flow: column;
    height: 32px;
    justify-content: flex-start;
    overflow: hidden;
    user-select: none;
    width: max-content;
    z-index: 3;

    > .p-button {
        width: 2rem !important;
        height: 2rem !important;
        --p-button-border-radius: 0.25rem;
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