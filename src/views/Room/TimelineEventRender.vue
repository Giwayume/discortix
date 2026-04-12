<template>
    <div v-if="e.currentDateDivider && e.event.type !== 'm.room.create'" class="p-chattimeline-date-heading">
        <time :datetime="e.isoTimestamp">{{ e.currentDateDivider }}</time>
    </div>
    <div
        v-if="e.category === 'message'"
        class="p-chattimeline-event"
        :class="{
            'p-chattimeline-event--groupstart': e.displayHeader,
            'p-chattimeline-event--sending': !!e.event.txnId,
            'p-chattimeline-event--hover': messageActionsTargetEventId === e.event.eventId || messageActionsContextMenuTargetEventId === e.event.eventId,
            'p-chattimeline-event--flash': highlightEventId === e.event.eventId,
            'p-chattimeline-event--reference': referenceEventId === e.event.eventId,
        }"
        :data-event-id="e.event.eventId"
        :data-event-sender="e.event.sender"
    >
        <!-- Message type events (most common) -->

        <!-- Reply to header -->
        <div v-if="e.replyTo" class="p-chattimeline-replyto">
            <span data-link-id="jumpToMessage" :data-jump-to-event-id="e.replyTo.eventId" class="p-chattimeline-replyto-spine" />
            <span data-link-id="viewUserProfile" :data-user-id="e.replyTo.userId" class="link" role="button" tabindex="0">
                <div class="p-avatar p-avatar-circle p-avatar-sm">
                    <AuthenticatedImage :mxcUri="e.replyTo.avatarUrl" type="thumbnail" :width="48" :height="48" method="scale">
                        <template v-slot="{ src }">
                            <img :src="src" class="w-full h-full">
                        </template>
                        <template #error>
                            <span class="p-avatar-icon pi pi-user" />
                        </template>
                    </AuthenticatedImage>
                </div>
                <span>{{ e.replyTo.displayname ?? i18nText.unknownUserDisplayname }}</span>
            </span>
            <span role="button" tabindex="0" data-link-id="jumpToMessage" :data-jump-to-event-id="e.replyTo.eventId">
                <template v-if="e.replyTo.bodyPreview">
                    {{ e.replyTo.bodyPreview }}
                </template>
                <em v-else>
                    {{ e.replyTo.isAttachment ? i18nText.replyToNoAttachmentPreview : i18nText.replyToNoMessagePreview }}
                </em>
                <span v-if="e.replyTo.isAttachment" class="pi pi-image" aria-hidden="true" />
            </span>
        </div>
        <!-- Username / Avatar Header -->
        <template v-if="e.displayHeader">
            <h3 class="p-chattimeline-event-header">
                <span class="link" data-link-id="viewUserProfile" :data-user-id="e.event.sender" role="button" tabindex="0">{{ e.displayname }}</span>
                <span v-if="e.event.content?.msgtype === 'm.notice'" class="p-chattimeline-notice-tag">
                    <span class="pi pi-megaphone" aria-hidden="true" />
                    {{ i18nText.noticeTag }}
                </span>
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
        <template v-if="e.event.type === 'm.room.message' && e.event.content">
            <!-- Message -->
            <div v-if="e.event.content.msgtype === 'm.text' || (e.event.content.body && e.event.content.filename && e.event.content.body !== e.event.content.filename)" class="p-chattimeline-event-content">
                <SlotCache
                    v-if="formattedBody"
                    :cacheId="`${e.event.eventId}_body`"
                    :class="e.event.content.format === 'org.matrix.custom.html' ? 'p-chattimeline-event-content-formatted' : ''"
                    :untrustedHtml="formattedBody"
                />
                <template v-else>{{ e.event.content.body }}</template>
                <span v-if="e.replacementEvent" v-tooltip.top="{ value: isTouchEventsDetected ? undefined : e.replacementDate }" class="p-chattimeline-edited">{{ i18nText.messageEditedIndicator }}</span>
            </div>
            <template v-if="e.event.content.msgtype === 'm.audio'">
                <!-- Audio -->
                 <div class="p-chattimeline-event-audio">
                    <div class="flex overflow-hidden">
                        <span class="pi pi-headphones text-4xl! mr-2" aria-hidden="true" />
                        <div class="flex flex-col justify-center overflow-hidden">
                            <div data-link-id="downloadFile" class="link block overflow-hidden text-nowrap text-ellipsis" role="button" tabindex="0">{{ e.event.content.filename }}</div>
                            <span class="block text-muted text-nowrap text-xs leading-3">{{ formatBytes(e.event.content.info?.size) }}</span>
                        </div>
                    </div>
                    <AuthenticatedAudio
                        :mxcUri="e.event.content.url"
                        :encryptedFile="e.event.content.info?.thumbnailFile || e.event.content.file"
                        :mimetype="e.event.content.info?.mimetype"
                    >
                        <template v-slot="{ src }">
                            <SlotCache
                                v-if="src"
                                :cacheId="`${e.event.eventId}_audio`"
                            >
                                <audio :key="`${e.event.eventId}_loadedAudio`" controls>
                                    <source :src="src" :type="e.event.content.info?.mimetype" />
                                </audio>
                            </SlotCache>
                            <audio v-else key="audioPlaceholder" controls />
                        </template>
                        <template #error>
                            <div class="mt-2">
                                <span class="pi pi-exclamation-triangle mr-2 !text-sm" aria-hidden="true" /><span class="text-(--channels-default)">{{ i18nText.audioLoadFailed }}</span>
                            </div>
                        </template>
                    </AuthenticatedAudio>
                </div>
            </template>
            <template v-else-if="e.event.content.msgtype === 'm.file'">
                <!-- File -->
                <div class="p-chattimeline-event-file">
                    <span class="pi pi-file text-4xl! mr-2" aria-hidden="true" />
                    <div class="flex flex-col justify-center overflow-hidden">
                        <div data-link-id="downloadFile" class="link block overflow-hidden text-nowrap text-ellipsis" role="button" tabindex="0">{{ e.event.content.filename }}</div>
                        <span class="block text-muted text-nowrap text-xs leading-3">{{ formatBytes(e.event.content.info?.size) }}</span>
                    </div>
                    <div data-link-id="downloadFile" role="button" tabindex="0" class="p-chattimeline-event-file-download">
                        <span class="pi pi-download" aria-hidden="true" />
                    </div>
                </div>
            </template>
            <template v-else-if="e.event.content.msgtype === 'm.image'">
                <!-- Image -->
                <AuthenticatedImage
                    :mxcUri="e.event.content.url"
                    :encryptedFile="e.event.content.info?.thumbnailFile || e.event.content.file"
                    :mimetype="e.event.content.info?.mimetype"
                    type="download"
                >
                    <template v-slot="{ src }">
                        <div
                            class="p-chattimeline-event-image"
                            :class="{
                                'p-chattimeline-spoiler': e.isSpoiler,
                                'p-chattimeline-spoiler-visible': spoilersMarkedVisible.has(`${e.event.eventId}_image`),
                            }"
                            :style="{
                                '--image-target-height': (e.event.content.info?.thumbnailInfo?.h || e.event.content.info?.h || 16) + 'px',
                                '--image-aspect-ratio': (e.event.content.info?.thumbnailInfo?.w || e.event.content.info?.w || 16) / (e.event.content.info?.thumbnailInfo?.h || e.event.content.info?.h || 16),
                            }"
                            @click="spoilersMarkedVisible.add(`${e.event.eventId}_image`)"
                        >
                            <img
                                :src="src"
                                :alt="e.event.content.body"
                                tabindex="0"
                                @dragstart.prevent
                                @click="emit('viewPhoto', e.event)"
                            >
                        </div>
                    </template>
                    <template #error></template>
                </AuthenticatedImage>
            </template>
            <template v-else-if="e.event.content.msgtype === 'm.text' || e.event.content.msgtype === 'm.notice'">
                <!-- Text -->
            </template>
            <template v-else-if="e.event.content.msgtype === 'm.video'">
                <!-- Video -->
                <AuthenticatedVideo
                    :mxcUri="e.event.content.url"
                    :encryptedFile="e.event.content.file"
                    :mimetype="e.event.content.info?.mimetype"
                    :thumbnailMxcUri="e.event.content.info?.thumbnailUrl"
                    :thumbnailEncryptedFile="e.event.content.info?.thumbnailFile"
                    :thumbnailMimetype="e.event.content.info?.thumbnailInfo?.mimetype"
                >
                    <template v-slot="{ src, poster }">
                        <div
                            class="p-chattimeline-event-video"
                            :class="{
                                'p-chattimeline-spoiler': e.isSpoiler,
                                'p-chattimeline-spoiler-visible': spoilersMarkedVisible.has(`${e.event.eventId}_video`),
                            }"
                            :style="{
                                '--video-target-height': (e.event.content.info?.thumbnailInfo?.h || e.event.content.info?.h || 16) + 'px',
                                '--video-aspect-ratio': (e.event.content.info?.thumbnailInfo?.w || e.event.content.info?.w || 16) / (e.event.content.info?.thumbnailInfo?.h || e.event.content.info?.h || 16),
                            }"
                            @click="spoilersMarkedVisible.add(`${e.event.eventId}_video`)"
                        >
                            <SlotCache
                                v-if="src"
                                ref="videoSlotCache"
                                :cacheId="`${e.event.eventId}_video`"
                            >
                                <video
                                    controls
                                    :poster="poster"
                                >
                                    <source :src="src" :type="e.event.content.info?.mimetype" />
                                </video>
                            </SlotCache>
                            <img v-else-if="poster" :src="poster" class="p-chattimeline-video-placeholder">
                            <div v-else class="p-chattimeline-video-placeholder" />
                        </div>
                    </template>
                </AuthenticatedVideo>
            </template>
        </template>
        <template v-else-if="e.event.type === 'm.sticker'">
            <!-- Sticker -->
            <AuthenticatedImage
                :mxcUri="e.event.content?.url"
                type="download"
            >
                <template v-slot="{ src }">
                    <img
                        :src="src"
                        :alt="e.event.content?.body"
                        :title="e.event.content?.body"
                        class="p-chattimeline-event-sticker"
                        tabindex="0"
                        @dragstart.prevent
                    >
                </template>
            </AuthenticatedImage>
        </template>
        <!-- Encrypted Event -->
        <div v-else-if="e.event.type === 'm.room.encrypted'" class="text-(--channels-default)">
            <span class="pi pi-exclamation-triangle mr-1 !text-sm" aria-hidden="true" />{{ i18nText.unableToDecryptMessage }}
            <span data-link-id="fixDecrypt" class="link" role="button" tabindex="0">{{ i18nText.learnFixDecrypt }}</span>
        </div>
        <!-- Display time -->
        <time v-if="!e.displayHeader" class="p-chattimeline-asidetime" :datetime="e.isoTimestamp">{{ e.time }}</time>
        <!-- Unencrypted Warning -->
        <div v-if="e.showUnencryptedWarning" class="text-(--channels-default)">
            <span class="pi pi-exclamation-triangle mr-1 !text-sm" aria-hidden="true" />{{ i18nText.messageUnencryptedWarning }}
            <span data-link-id="fixDecrypt" class="link" role="button" tabindex="0">
                {{ i18nText.messageUnencryptedWarningLearnMoreLink }}
            </span>
        </div>
        <!-- Reactions -->
        <div v-if="e.reactions.length > 0" class="flex flex-wrap">
            <span
                v-for="reaction of e.reactions"
                :key="reaction.key"
                role="button"
                tabindex="0"
                class="p-chattimeline-event-reaction"
                :class="{ 'p-chattimeline-event-reaction--self': reaction.highlighted }"
                data-link-id="addReaction"
                :data-reaction-key="reaction.key"
            >
                <template v-if="reaction.key?.[0] === ':'">
                    <AuthenticatedImage :mxcUri="currentRoomCustomEmojiByCode[reaction.key]?.image?.url">
                        <template v-slot="{ src }">
                            <img
                                :src="src"
                                :alt="reaction.key"
                            >
                        </template>
                        <template #error>
                            {{ reaction.key }}
                        </template>
                    </AuthenticatedImage>
                </template>
                <template v-else>
                    {{ reaction.key }}
                </template>
                <span class="p-chattimeline-event-reaction-count">{{ reaction.displaynames.length }}</span>
            </span>
            <span
                v-tooltip.top="{ value: isTouchEventsDetected ? undefined : i18nText.addReaction }"
                role="button"
                tabindex="0"
                class="p-chattimeline-event-reaction"
                data-link-id="addReaction"
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
            'p-chattimeline-event--hover': messageActionsTargetEventId === e.event.eventId || messageActionsContextMenuTargetEventId === e.event.eventId,
            'p-chattimeline-event--flash': highlightEventId === e.event.eventId,
            'p-chattimeline-event--reference': referenceEventId === e.event.eventId,
        }"
        :data-event-id="e.event.eventId"
    >
        <!-- Settings type events (less common) -->
        <template v-if="e.event.type === 'm.room.avatar'">
            <!-- Chat room icon/avatar changed -->
            <span class="p-chattimeline-event-icon pi pi-pencil" aria-hidden="true" />
            <strong>
                <span class="link" data-link-id="viewUserProfile" :data-user-id="e.event.sender" role="button" tabindex="0">{{ e.displayname }}</span>
            </strong>
            {{ ' ' + i18nText.changedGroupIcon + ' ' }}
            <span
                v-if="currentRoomPermissions.changeRoomAvatar || currentRoomPermissions.changeRoomName"
                data-link-id="editGroup" class="link" role="button" tabindex="0"
            >{{ i18nText.editGroupButton }}</span>
            <time :datetime="e.isoTimestamp">{{ e.headerTime }}</time>
        </template>
        <template v-else-if="e.event.type === 'm.room.member' && e.event.content">
            <!-- Member Join/Leave room -->
            <span class="p-chattimeline-event-icon pi" :class="[e.event.content.membership === 'join' ? 'pi-arrow-right' : 'pi-info-circle']" aria-hidden="true" />
            <span v-if="e.event.content.membership === 'join'" class="mr-1">
                {{ i18nText.joinedTheRoomPrefix }}<strong><span class="link" data-link-id="viewUserProfile" :data-user-id="e.event.sender" role="button" tabindex="0">{{ e.displayname }}</span></strong>{{ i18nText.joinedTheRoomSuffix }}
            </span>
            <template v-else>
                <strong class="mr-1">
                    <span class="link" data-link-id="viewUserProfile" :data-user-id="e.event.sender" role="button" tabindex="0">{{ e.displayname }}</span>
                </strong>
                <span v-if="e.event.content.membership === 'leave'">
                    <template v-if="e.event.unsigned?.prevContent?.membership === 'invite'">
                        {{ i18nText.rejectedAnInvite }}
                    </template>
                    <template v-else>{{ i18nText.leftTheRoom }}</template>
                </span>
                <span v-if="e.event.content.membership === 'ban'">{{ i18nText.bannedFromTheRoom }}</span>
            </template>
            <time :datetime="e.isoTimestamp">{{ e.headerTime }}</time>
        </template>
        <template v-else-if="e.event.type === 'm.room.name' && e.event.content">
            <!-- Chat group name changed -->
            <span class="p-chattimeline-event-icon pi pi-pencil" aria-hidden="true" />
            <strong>
                <span class="link" data-link-id="viewUserProfile" :data-user-id="e.event.sender" role="button" tabindex="0">{{ e.displayname }}</span>
            </strong>
            {{ ' ' }}
            <template v-if="e.event.content.name">
                {{ i18nText.changedGroupNamePrefix }}<strong>{{ e.event.content.name }}</strong>{{ i18nText.changedGroupNameSuffix }}
            </template>
            <template v-else>{{ i18nText.removedGroupName }}</template>
            {{ ' ' }}
            <span
                v-if="currentRoomPermissions.changeRoomAvatar || currentRoomPermissions.changeRoomName"
                data-link-id="editGroup" class="link" role="button" tabindex="0"
            >{{ i18nText.editGroupButton }}</span>
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
        @inviteUsers="emit('inviteUsers')"
    />
</template>

<script setup lang="ts">
import { computed, inject, nextTick, onUnmounted, ref, type PropType, type Ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import 'linkifyjs'
import linkifyHtml from 'linkify-html'

import '@/utils/linkify'
import { formatBytes } from '@/utils/message'

import { useApplication } from '@/composables/application'

import { useRoomStore } from '@/stores/room'

import AuthenticatedAudio from '@/views/Common/AuthenticatedAudio.vue'
import AuthenticatedImage from '@/views/Common/AuthenticatedImage.vue'
import AuthenticatedVideo from '@/views/Common/AuthenticatedVideo.vue'
import MessageBeginning from './MessageBeginning.vue'
import SlotCache from '@/views/Common/SlotCache.vue'

import Message from 'primevue/message'
import vTooltip from 'primevue/tooltip'

import {
    type ApiV3SyncClientEventWithoutRoomId,
    type JoinedRoom,
    type EventWithRenderInfo,
    type EmojiPickerEmojiItem,
} from '@/types'

const { isTouchEventsDetected } = useApplication()
const roomStore = useRoomStore()
const { spoilersMarkedVisible } = storeToRefs(roomStore)
const { currentRoomPermissions } = roomStore

// This component intentionally relies on the parent component to populate a lot of data,
// because it needs to set up and render as quickly as possible in order to avoid main thread freeze.
const props = defineProps({
    room: {
        type: Object as PropType<JoinedRoom>,
        required: true,
    },
    e: {
        type: Object as PropType<EventWithRenderInfo>,
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
    messageActionsContextMenuTargetEventId: {
        type: String,
        default: undefined,
    },
    highlightEventId: {
        type: String,
        default: undefined,
    },
    referenceEventId: {
        type: String,
        default: undefined,
    },
    currentRoomCustomEmojiByCode: {
        type: Object as PropType<Record<string, EmojiPickerEmojiItem>>,
        default: () => {},
    }
})

const emit = defineEmits<{
    (e: 'inviteUsers'): void
    (e: 'viewPhoto', event: ApiV3SyncClientEventWithoutRoomId): void
}>()

/*--------------*\
|                |
|   Formatting   |
|                |
\*--------------*/

const spoilerVisible = ref<boolean>(false)

const formattedBody = computed<string | undefined>(() => {
    if (
        props.e.event.type === 'm.room.message'
        && (
            props.e.event.content?.msgtype === 'm.text'
            || props.e.event.content?.msgtype === 'm.notice'
        )
    ) {
        if (props.e.event.content.format === 'org.matrix.custom.html') {
            return props.e.event.content.formattedBody
        } else if (props.e.event.content?.body) {
            return linkifyHtml(
                props.e.event.content.body.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&/g, '&amp;'),
            )
        }
    }
})

/*----------------------------*\
|                              |
|   Pause Videos Out of View   |
|                              |
\*----------------------------*/

const videoIntersectionObserver: Ref<IntersectionObserver> | undefined = inject('videoIntersectionObserver')
const videoSlotCache = ref<InstanceType<typeof SlotCache>>()

watch(() => videoSlotCache.value, async (newSlotCache, oldSlotCache) => {
    if (!videoIntersectionObserver?.value) return
    if (oldSlotCache) {
        const video = oldSlotCache.$el?.querySelector?.('video')
        if (video) {
            videoIntersectionObserver.value.unobserve(video)
        }
    }
    await nextTick()
    await nextTick()
    if (newSlotCache) {
        const video = newSlotCache.$el?.querySelector?.('video')
        if (video) {
            videoIntersectionObserver.value.observe(video)
        }
    }
})

onUnmounted(() => {
    if (videoIntersectionObserver?.value && videoSlotCache.value) {
        const video = videoSlotCache.value.$el?.querySelector?.('video')
        if (video) {
            videoIntersectionObserver.value.unobserve(video)
        }
    }
})
</script>