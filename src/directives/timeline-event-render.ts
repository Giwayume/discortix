/**
 * This was a Vue component, but it was extremely slow to load (1s+ for 100 events) on large chats.
 * So it has been converted to direct DOM manipulation.
 */

import 'linkifyjs'
import '@/utils/linkify'
import linkifyHtml from 'linkify-html'
import dompurify from 'dompurify'
import { storeToRefs } from 'pinia'
import { v4 as uuidv4 } from 'uuid'

import { formatBytes } from '@/utils/message'

import { useMediaCache, type GetMxcObjectUrlOptions } from '@/composables/media-cache'

import { useRoomStore } from '@/stores/room'

import type { DirectiveBinding, ObjectDirective } from 'vue'
import type {
    EmojiPickerEmojiItem,
    EventWithRenderInfo
} from '@/types'

export interface EventChunk {
    id: string;
    loading: boolean;
    events: EventWithRenderInfo[];
}

interface RenderBinding {
    isVisible: boolean;
    eventChunkList: EventChunk[];
    i18nText: Record<string, string>;
    messageActionsTargetEventId?: string;
    messageActionsContextMenuTargetEventId?: string;
    highlightEventId?: string;
    referenceEventId?: string;
    currentRoomCustomEmojiByCode: Record<string, EmojiPickerEmojiItem>;
    useMediaCache?: boolean;
}

const roomStore = useRoomStore()
const { currentRoomPermissions, decryptedRoomEvents, spoilersMarkedVisible } = storeToRefs(roomStore)

dompurify.addHook('uponSanitizeElement' as never, function (currentNode: HTMLElement) {
    if (currentNode?.tagName === 'IMG') {
        const mxcUri = currentNode.getAttribute('src')
        if (!mxcUri?.startsWith('mxc://')) return
        const imageId = `sanitized-img-${uuidv4()}`
        currentNode.setAttribute('data-mxc-uri', mxcUri)
        currentNode.setAttribute('id', imageId)
        currentNode.setAttribute('src', '/assets/images/image-loading.png')
    } else if (currentNode?.tagName === 'SPAN') {
        if (currentNode.getAttribute('data-mx-spoiler') != null) {
            currentNode.setAttribute('role', 'button')
            currentNode.setAttribute('tabindex', '0')
            currentNode.setAttribute('aria-label', 'Spoiler')
            currentNode.setAttribute('aria-expanded', 'false')
        }
    }
} as never)

dompurify.setConfig({
    ALLOWED_TAGS: ['del', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'p', 'a', 'ul', 'ol', 'sup', 'sub', 'li', 'b', 'i', 'u', 'strong', 'em', 's', 'code', 'hr', 'br', 'div', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'caption', 'pre', 'span', 'img', 'details', 'summary', 'mx-reply'],
    ADD_ATTR: (attributeName: string, tagName: string) => {
        return attributeName !== 'style' && attributeName !== 'class'
    },
})

const mediaCacheByTimelineId: Record<string, ReturnType<typeof useMediaCache>> = {}
const elementBindingFragments = new WeakMap<HTMLElement, Map<string, DocumentFragment>>()
const elementBindingFragmentCacheIds = new WeakMap<DocumentFragment, string>()
const mediaElementCache = new Map<string | null | undefined, HTMLImageElement | HTMLVideoElement | HTMLAudioElement>()
const imageIntersectionObservers = new WeakMap<HTMLElement, IntersectionObserver>()

function createEventNodeFragment(e: EventWithRenderInfo, binding: RenderBinding, cacheId: string): DocumentFragment {
    const i18nText = binding.i18nText
    const eventNodeFragment = document.createDocumentFragment()
    const eventNodeRoot = document.createElement('div')
    eventNodeRoot.setAttribute('data-event-id', e.event.eventId)
    eventNodeRoot.setAttribute('data-event-sender', e.event.sender)
    eventNodeRoot.classList.add('p-chattimeline-event')

    let eventContent = e.event.content
    if (decryptedRoomEvents.value[e.event.eventId]?.content['m.new_content']) {
        eventContent = decryptedRoomEvents.value[e.event.eventId]!.content['m.new_content']
    }

    if (e.category === 'message') {
        if (!!e.event.txnId) {
            eventNodeRoot.classList.add('p-chattimeline-event--sending')
        }
    } else if (e.category === 'settings') {
        eventNodeRoot.classList.add('p-chattimeline-event-settings')
    }
    if (e.displayHeader) {
        eventNodeRoot.classList.add('p-chattimeline-event--groupstart')
    }

    // Reply To Header
    if (e.category === 'message' && e.replyTo) {
        const replyToHeaderDiv = document.createElement('div')
        replyToHeaderDiv.className = 'p-chattimeline-replyto'

        const jumpToMessageLink = document.createElement('span')
        jumpToMessageLink.className = 'p-chattimeline-replyto-spine'
        jumpToMessageLink.setAttribute('data-link-id', 'jumpToMessage')
        jumpToMessageLink.setAttribute('data-jump-to-event-id', e.replyTo.eventId)
        replyToHeaderDiv.append(jumpToMessageLink)

        const viewUserProfileLink = document.createElement('span')
        viewUserProfileLink.className = 'class'
        viewUserProfileLink.setAttribute('data-link-id', 'viewUserProfile')
        viewUserProfileLink.setAttribute('data-user-id', e.replyTo.userId ?? '')
        viewUserProfileLink.setAttribute('role', 'button')
        viewUserProfileLink.setAttribute('tabindex', '0')
        replyToHeaderDiv.append(viewUserProfileLink)

        const viewUserProfileLinkAvatar = document.createElement('div')
        viewUserProfileLinkAvatar.className = 'p-avatar p-avatar-circle p-avatar-sm'
        if (e.replyTo.avatarUrl) {
            viewUserProfileLinkAvatar.setAttribute('data-avatar-mxc-uri', e.replyTo.avatarUrl)
        }
        viewUserProfileLink.append(viewUserProfileLinkAvatar)

        const viewUserProfileLinkAvatarIcon = document.createElement('span')
        viewUserProfileLinkAvatarIcon.className = 'p-avatar-icon pi pi-user'
        viewUserProfileLinkAvatar.append(viewUserProfileLinkAvatarIcon)

        const viewUserProfileLinkDisplayName = document.createElement('span')
        viewUserProfileLinkDisplayName.textContent = e.replyTo.displayname ?? i18nText.unknownUserDisplayname!
        viewUserProfileLink.append(viewUserProfileLinkDisplayName)

        const replyToHeaderBodyPreview = document.createElement('span')
        replyToHeaderBodyPreview.setAttribute('role', 'button')
        replyToHeaderBodyPreview.setAttribute('tabindex', '0')
        replyToHeaderBodyPreview.setAttribute('data-link-id', 'jumpToMessage')
        replyToHeaderBodyPreview.setAttribute('data-jump-to-event-id', e.replyTo.eventId)
        if (e.replyTo.bodyPreview) {
            replyToHeaderBodyPreview.textContent = e.replyTo.bodyPreview
        } else {
            const replyToHeaderBodyPreviewEm = document.createElement('em')
            replyToHeaderBodyPreviewEm.textContent = (e.replyTo.isAttachment ? i18nText.replyToNoAttachmentPreview : i18nText.replyToNoMessagePreview) ?? ''
            replyToHeaderBodyPreview.append(replyToHeaderBodyPreviewEm)
        }
        if (e.replyTo.isAttachment) {
            const replyToHeaderBodyPreviewAttachmentIcon = document.createElement('span')
            replyToHeaderBodyPreviewAttachmentIcon.className = 'pi pi-image'
            replyToHeaderBodyPreviewAttachmentIcon.setAttribute('aria-hidden', 'true')
            replyToHeaderBodyPreview.append(replyToHeaderBodyPreviewAttachmentIcon)
        }
        jumpToMessageLink.setAttribute('data-jump-to-event-id', e.replyTo.eventId)

        replyToHeaderDiv.append(replyToHeaderBodyPreview)

        eventNodeRoot.append(replyToHeaderDiv)
    }

    // Avatar Header
    if (e.category === 'message' && e.displayHeader) {
        const avatarHeading = document.createElement('h3')
        avatarHeading.className = 'p-chattimeline-event-header'
        eventNodeRoot.append(avatarHeading)

        const avatarHeadingDisplayname = document.createElement('span')
        avatarHeadingDisplayname.className = 'link'
        avatarHeadingDisplayname.setAttribute('data-link-id', 'viewUserProfile')
        avatarHeadingDisplayname.setAttribute('data-user-id', e.event.sender)
        avatarHeadingDisplayname.setAttribute('role', 'button')
        avatarHeadingDisplayname.setAttribute('tabindex', '0')
        avatarHeadingDisplayname.textContent = e.displayname
        avatarHeading.append(avatarHeadingDisplayname)

        if (eventContent?.msgtype === 'm.notice') {
            const avatarHeadingNoticeTag = document.createElement('span')
            avatarHeadingNoticeTag.className = 'p-chattimeline-notice-tag'
            avatarHeading.append(avatarHeadingNoticeTag)

            const avatarHeadingNoticeTagIcon = document.createElement('span')
            avatarHeadingNoticeTagIcon.className = 'pi pi-megaphone'
            avatarHeadingNoticeTagIcon.setAttribute('aria-hidden', 'true')
            avatarHeadingNoticeTag.append(avatarHeadingNoticeTagIcon)
            avatarHeadingNoticeTag.append(document.createTextNode(i18nText.noticeTag ?? ''))
        }

        const avatarHeadingTime = document.createElement('time')
        avatarHeadingTime.setAttribute('datetime', e.isoTimestamp)
        avatarHeadingTime.textContent = e.headerTime
        avatarHeading.append(avatarHeadingTime)

        const avatarImageContainer = document.createElement('div')
        avatarImageContainer.className = 'p-avatar p-avatar-circle p-avatar-chat'
        if (e.avatarUrl) {
            avatarImageContainer.setAttribute('data-avatar-mxc-uri', e.avatarUrl)
        }
        eventNodeRoot.append(avatarImageContainer)

        const avatarImageContainerIcon = document.createElement('span')
        avatarImageContainerIcon.className = 'p-avatar-icon pi pi-user'
        avatarImageContainerIcon.setAttribute('aria-hidden', 'true')
        avatarImageContainer.append(avatarImageContainerIcon)
    }

    // Message Type Event
    if (e.category === 'message') {
        if (e.event.type === 'm.room.message' && eventContent) {
            // Message Text
            if (
                eventContent.msgtype === 'm.text'
                || eventContent.msgtype === 'm.notice'
                || (eventContent.body && eventContent.filename && eventContent.body !== eventContent.filename)
            ) {
                const eventContentDiv = document.createElement('div')
                eventContentDiv.className = 'p-chattimeline-event-content'
                eventNodeRoot.append(eventContentDiv)

                let formattedBody: string | undefined = undefined
                if (
                    e.event.type === 'm.room.message'
                    && (
                        eventContent?.msgtype === 'm.text'
                        || eventContent?.msgtype === 'm.notice'
                    )
                ) {
                    if (eventContent.format === 'org.matrix.custom.html') {
                        formattedBody = eventContent.formattedBody
                    } else if (eventContent?.body) {
                        formattedBody = linkifyHtml(
                            eventContent.body.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&/g, '&amp;'),
                        )
                    }
                }

                if (formattedBody) {
                    const slotCacheId = `${e.event.eventId}_body`
                    const formattedBodyContainer = document.createElement('div')
                    formattedBodyContainer.className = eventContent.format === 'org.matrix.custom.html'
                        ? 'p-chattimeline-event-content-formatted' : ''
                    formattedBodyContainer.innerHTML = dompurify.sanitize(formattedBody)
                    eventContentDiv.append(formattedBodyContainer)

                    for (const [spoilerIndex, spoilerLink] of formattedBodyContainer.querySelectorAll('[data-mx-spoiler]').entries()) {
                        const spoilerId = `${e.event.eventId}_body_spoiler_${spoilerIndex}`
                        if (spoilersMarkedVisible.value.has(spoilerId)) {
                            spoilerLink.setAttribute('aria-expanded', 'true')
                        }
                    }
                } else {
                    eventContentDiv.append(document.createTextNode(eventContent.body))
                }
                if (e.replacementEvent) {
                    const editedIndicator = document.createElement('span')
                    editedIndicator.className = 'p-chattimeline-edited'
                    if (e.replacementDate) {
                        editedIndicator.setAttribute('title', e.replacementDate)
                    }
                    editedIndicator.textContent = i18nText.messageEditedIndicator!
                    eventContentDiv.append(editedIndicator)
                }
            }

            if (eventContent.msgtype === 'm.audio') {
                const audioContainer = document.createElement('div')
                audioContainer.className = 'p-chattimeline-event-audio'
                eventNodeRoot.append(audioContainer)

                const audioContainerFlex = document.createElement('div')
                audioContainerFlex.className = 'flex overflow-hidden'
                audioContainer.append(audioContainerFlex)

                const audioContainerFlexIcon = document.createElement('span')
                audioContainerFlexIcon.className = 'pi pi-headphones text-4xl! mr-2'
                audioContainerFlexIcon.setAttribute('aria-hidden', 'true')
                audioContainerFlex.append(audioContainerFlexIcon)

                const audioContainerMetaContainer = document.createElement('div')
                audioContainerMetaContainer.className = 'flex flex-col justify-center overflow-hidden'
                audioContainerFlex.append(audioContainerMetaContainer)

                const audioContainerMetaFilename = document.createElement('div')
                audioContainerMetaFilename.className = 'link block overflow-hidden text-nowrap text-ellipsis'
                audioContainerMetaFilename.setAttribute('data-link-id', 'downloadFile')
                audioContainerMetaFilename.setAttribute('role', 'button')
                audioContainerMetaFilename.setAttribute('tabindex', '0')
                audioContainerMetaFilename.textContent = eventContent.filename
                audioContainerMetaContainer.append(audioContainerMetaFilename)

                const audioContainerMetaFilesize = document.createElement('span')
                audioContainerMetaFilesize.className = 'block text-muted text-nowrap text-xs leading-3'
                audioContainerMetaFilesize.textContent = formatBytes(eventContent.info?.size)
                audioContainerMetaContainer.append(audioContainerMetaFilesize)

                const audioPlaceholder = document.createElement('audio')
                audioPlaceholder.setAttribute('controls', '')
                if (eventContent.url) {
                    audioPlaceholder.setAttribute('data-mxc-uri', eventContent.url)
                }
                if (eventContent.info?.thumbnailFile || eventContent.file) {
                    audioPlaceholder.setAttribute('data-encrypted-file', JSON.stringify(eventContent.info?.thumbnailFile || eventContent.file))
                }
                if (eventContent.info?.mimetype) {
                    audioPlaceholder.setAttribute('data-mimetype', eventContent.info?.mimetype)
                }
                audioContainer.append(audioPlaceholder)
            } else if (eventContent.msgtype === 'm.file') {
                const fileContainer = document.createElement('div')
                fileContainer.className = 'p-chattimeline-event-file'
                eventNodeRoot.append(fileContainer)

                const fileIcon = document.createElement('span')
                fileIcon.className = 'pi pi-file text-4xl! mr-2'
                fileIcon.setAttribute('aria-hidden', 'true')
                fileContainer.append(fileIcon)
                
                const fileMetaContainer = document.createElement('div')
                fileMetaContainer.className = 'flex flex-col justify-center overflow-hidden'
                fileContainer.append(fileMetaContainer)

                const fileMetaFilename = document.createElement('div')
                fileMetaFilename.className = 'link block overflow-hidden text-nowrap text-ellipsis'
                fileMetaFilename.setAttribute('data-link-id', 'downloadFile')
                fileMetaFilename.setAttribute('role', 'button')
                fileMetaFilename.setAttribute('tabindex', '0')
                fileMetaFilename.textContent = eventContent.filename
                fileMetaContainer.append(fileMetaFilename)

                const fileMetaFilesize = document.createElement('span')
                fileMetaFilesize.className = 'block text-muted text-nowrap text-xs leading-3'
                fileMetaFilesize.textContent = formatBytes(eventContent.info?.size)
                fileMetaContainer.append(fileMetaFilesize)
                
                const fileDownloadButton = document.createElement('div')
                fileDownloadButton.className = 'p-chattimeline-event-file-download'
                fileDownloadButton.setAttribute('data-link-id', 'downloadFile')
                fileDownloadButton.setAttribute('role', 'button')
                fileDownloadButton.setAttribute('tabindex', '0')
                fileContainer.append(fileDownloadButton)

                const fileDownloadButtonIcon = document.createElement('span')
                fileDownloadButtonIcon.className = 'pi pi-download'
                fileDownloadButtonIcon.setAttribute('aria-hidden', 'true')
                fileDownloadButton.append(fileDownloadButtonIcon)
            } else if (eventContent.msgtype === 'm.image') {
                const imageContainer = document.createElement('div')
                imageContainer.className = 'p-chattimeline-event-image'
                if (e.isSpoiler) {
                    imageContainer.classList.add('p-chattimeline-spoiler')
                    if (spoilersMarkedVisible.value.has(`${e.event.eventId}_image`)) {
                        imageContainer.classList.add('p-chattimeline-spoiler-visible')
                    }
                    imageContainer.setAttribute('data-link-id', 'removeMediaSpoiler')
                }
                imageContainer.style.setProperty('--image-target-height',
                    (eventContent.info?.thumbnailInfo?.h || eventContent.info?.h || 16) + 'px')
                imageContainer.style.setProperty('--image-aspect-ratio',
                    (eventContent.info?.thumbnailInfo?.w || eventContent.info?.w || 16) / (eventContent.info?.thumbnailInfo?.h || eventContent.info?.h || 16) + '')
                eventNodeRoot.append(imageContainer)

                const image = document.createElement('img')
                if (eventContent.url) {
                    image.setAttribute('data-mxc-uri', eventContent.url)
                }
                if (eventContent.info?.thumbnailFile || eventContent.file) {
                    image.setAttribute('data-encrypted-file', JSON.stringify(eventContent.info?.thumbnailFile || eventContent.file))
                }
                if (eventContent.info?.mimetype) {
                    image.setAttribute('data-mimetype', eventContent.info?.mimetype)
                }
                image.setAttribute('src', '/assets/images/image-loading.png')
                image.setAttribute('alt', eventContent.body)
                image.setAttribute('tabindex', '0')
                image.setAttribute('data-link-id', 'viewFullImage')
                imageContainer.append(image)
            } else if (eventContent.msgtype === 'm.video') {
                const videoContainer = document.createElement('div')
                videoContainer.className = 'p-chattimeline-event-video'
                if (e.isSpoiler) {
                    videoContainer.classList.add('p-chattimeline-spoiler')
                    if (spoilersMarkedVisible.value.has(`${e.event.eventId}_video`)) {
                        videoContainer.classList.add('p-chattimeline-spoiler-visible')
                    }
                    videoContainer.setAttribute('data-link-id', 'removeMediaSpoiler')
                }
                videoContainer.style.setProperty('--video-target-height',
                    (eventContent.info?.thumbnailInfo?.h || eventContent.info?.h || 16) + 'px')
                videoContainer.style.setProperty('--video-aspect-ratio',
                    (eventContent.info?.thumbnailInfo?.w || eventContent.info?.w || 16) / (eventContent.info?.thumbnailInfo?.h || eventContent.info?.h || 16) + '')
                eventNodeRoot.append(videoContainer)

                const videoPlaceholder = document.createElement('div')
                videoPlaceholder.className = 'p-chattimeline-video-placeholder'
                if (eventContent.url) {
                    videoPlaceholder.setAttribute('data-mxc-uri', eventContent.url)
                }
                if (eventContent.file) {
                    videoPlaceholder.setAttribute('data-encrypted-file', JSON.stringify(eventContent.file))
                }
                if (eventContent.info?.mimetype) {
                    videoPlaceholder.setAttribute('data-mimetype', eventContent.info?.mimetype)
                }
                if (eventContent.info?.thumbnailUrl) {
                    videoPlaceholder.setAttribute('data-thumbnail-mxc-uri', eventContent.info?.thumbnailUrl)
                }
                if (eventContent.info?.thumbnailFile) {
                    videoPlaceholder.setAttribute('data-thumbnail-encrypted-file', JSON.stringify(eventContent.info?.thumbnailFile))
                }
                if (eventContent.info?.thumbnailInfo?.mimetype) {
                    videoPlaceholder.setAttribute('data-thumbnail-mimetype', eventContent.info?.thumbnailInfo?.mimetype)
                }
                videoContainer.append(videoPlaceholder)
            }
        } else if (e.event.type === 'm.sticker') {
            const stickerImage = document.createElement('img')
            stickerImage.className = 'p-chattimeline-event-sticker'
            stickerImage.setAttribute('data-mxc-uri', eventContent?.url)
            stickerImage.setAttribute('src', '/assets/images/image-loading.png')
            stickerImage.setAttribute('alt', eventContent?.body)
            stickerImage.setAttribute('title', eventContent?.body)
            stickerImage.setAttribute('tabindex', '0')
            eventNodeRoot.append(stickerImage)
        } else if (e.event.type === 'm.room.encrypted') {
            const encryptedNotice = document.createElement('div')
            encryptedNotice.className = 'text-(--channels-default)'
            eventNodeRoot.append(encryptedNotice)

            const encryptedNoticeIcon = document.createElement('span')
            encryptedNoticeIcon.className = 'pi pi-exclamation-triangle mr-1 !text-sm'
            encryptedNoticeIcon.setAttribute('aria-hidden', 'true')
            encryptedNotice.append(encryptedNoticeIcon)

            encryptedNotice.append(document.createTextNode(i18nText.unableToDecryptMessage!))

            const encryptedNoticeFixLink = document.createElement('span')
            encryptedNoticeFixLink.className = 'link ml-1'
            encryptedNoticeFixLink.setAttribute('data-link-id', 'fixDecrypt')
            encryptedNoticeFixLink.setAttribute('role', 'button')
            encryptedNoticeFixLink.setAttribute('tabindex', '0')
            encryptedNoticeFixLink.textContent = i18nText.learnFixDecrypt!
            encryptedNotice.append(encryptedNoticeFixLink)
        }

        // Display Time
        if (!e.displayHeader) {
            const displayTime = document.createElement('time')
            displayTime.className = 'p-chattimeline-asidetime'
            displayTime.setAttribute('datetime', e.isoTimestamp)
            displayTime.textContent = e.time
            eventNodeRoot.append(displayTime)
        }

        // Unencrypted Warning
        if (e.showUnencryptedWarning) {
            const unencryptedWarning = document.createElement('div')
            unencryptedWarning.className = 'text-(--channels-default)'
            eventNodeRoot.append(unencryptedWarning)

            const unencryptedWarningIcon = document.createElement('span')
            unencryptedWarningIcon.className = 'pi pi-exclamation-triangle mr-1 !text-sm'
            unencryptedWarningIcon.setAttribute('aria-hidden', 'true')
            unencryptedWarning.append(unencryptedWarningIcon)

            unencryptedWarning.append(document.createTextNode(i18nText.messageUnencryptedWarning!))

            const unencryptedWarningFixLink = document.createElement('span')
            unencryptedWarningFixLink.className = 'link'
            unencryptedWarningFixLink.setAttribute('data-link-id', 'fixDecrypt')
            unencryptedWarningFixLink.setAttribute('role', 'button')
            unencryptedWarningFixLink.setAttribute('tabindex', '0')
            unencryptedWarningFixLink.textContent = i18nText.messageUnencryptedWarningLearnMoreLink!
            unencryptedWarning.append(unencryptedWarningFixLink)
        }

        // Reactions
        if (e.reactions.length > 0) {
            const reactionsContainer = document.createElement('div')
            reactionsContainer.className = 'flex flex-wrap'
            eventNodeRoot.append(reactionsContainer)
            for (const reaction of e.reactions) {
                const reactionButton = document.createElement('span')
                reactionButton.className = 'p-chattimeline-event-reaction'
                if (reaction.highlighted) {
                    reactionButton.classList.add('p-chattimeline-event-reaction--self')
                }
                reactionButton.setAttribute('role', 'button')
                reactionButton.setAttribute('tabindex', '0')
                reactionButton.setAttribute('data-link-id', 'addReaction')
                reactionButton.setAttribute('data-reaction-key', reaction.key)
                reactionsContainer.append(reactionButton)

                if (reaction.key?.[0] === ':') {
                    const reactionImage = document.createElement('img')
                    reactionImage.setAttribute('data-mxc-uri', binding.currentRoomCustomEmojiByCode[reaction.key]?.image?.url ?? '')
                    reactionImage.setAttribute('src', '/assets/images/image-loading.png')
                    reactionImage.setAttribute('alt', reaction.key)
                    reactionImage.setAttribute('title', reaction.key)
                    reactionButton.append(reactionImage)
                } else {
                    reactionButton.textContent = reaction.key
                }

                const reactionCount = document.createElement('span')
                reactionCount.className = 'p-chattimeline-event-reaction-count'
                reactionCount.textContent = `${reaction.displaynames.length}`
                reactionButton.append(reactionCount)
            }

            const addReactionButton = document.createElement('span')
            addReactionButton.className = 'p-chattimeline-event-reaction'
            addReactionButton.setAttribute('role', 'button')
            addReactionButton.setAttribute('tabindex', '0')
            addReactionButton.setAttribute('data-link-id', 'addReaction')
            addReactionButton.setAttribute('aria-label', i18nText.addReaction!)
            addReactionButton.setAttribute('title', i18nText.addReaction!)
            reactionsContainer.append(addReactionButton)

            const addReactionButtonIcon = document.createElement('span')
            addReactionButtonIcon.className = 'pi pi-face-smile'
            addReactionButtonIcon.setAttribute('aria-hidden', 'true')
            addReactionButton.append(addReactionButtonIcon)
        }

        // Send Error
        if (e.event.sendError) {
            const errorMessage = document.createElement('div')
            errorMessage.className = 'p-message p-component p-message-error p-message-simple my-6'
            errorMessage.setAttribute('role', 'alert')
            errorMessage.setAttribute('aria-live', 'assertive')
            eventNodeRoot.append(errorMessage)

            const errorMessageContentWrapper = document.createElement('div')
            errorMessageContentWrapper.className = 'p-message-content-wrapper'
            errorMessage.append(errorMessageContentWrapper)

            const errorMessageContent = document.createElement('div')
            errorMessageContent.className = 'p-message-content'
            errorMessageContentWrapper.append(errorMessageContent)

            const errorMessageIcon = document.createElement('div')
            errorMessageIcon.className = 'pi pi-exclamation-circle !text-md !leading-3 -mt-[1px] mr-1'
            errorMessageIcon.setAttribute('aria-hidden', 'true')
            errorMessageContent.append(errorMessageIcon)

            const errorMessageText = document.createElement('div')
            errorMessageText.className = 'p-message-text'
            errorMessageText.textContent = i18nText.messageSendError!
            errorMessageContent.append(errorMessageText)
            
            const errorMessageRetryLink = document.createElement('span')
            errorMessageRetryLink.className = 'link'
            errorMessageRetryLink.setAttribute('role', 'button')
            errorMessageRetryLink.setAttribute('tabindex', '0')
            errorMessageRetryLink.setAttribute('data-link-id', 'retrySendMessage')
            errorMessageRetryLink.textContent = i18nText.messageSendRetry!
        }
    }
    // Settings Type Event
    else if (e.category === 'settings') {
        // Avatar
        if (e.event.type === 'm.room.avatar') {
            const eventIcon = document.createElement('span')
            eventIcon.className = 'p-chattimeline-event-icon pi pi-pencil'
            eventIcon.setAttribute('aria-hidden', 'true')
            eventNodeRoot.append(eventIcon)

            const eventProfileStrong = document.createElement('strong')
            eventNodeRoot.append(eventProfileStrong)

            const eventProfileLink = document.createElement('span')
            eventProfileLink.className = 'link'
            eventProfileLink.setAttribute('data-link-id', 'viewUserProfile')
            eventProfileLink.setAttribute('data-user-id', e.event.sender)
            eventProfileLink.setAttribute('role', 'button')
            eventProfileLink.setAttribute('tabindex', '0')
            eventProfileLink.textContent = e.displayname
            eventProfileStrong.append(eventProfileLink)

            eventNodeRoot.append(document.createTextNode(' ' + i18nText.changedGroupIcon + ' '))

            if (currentRoomPermissions.value.changeRoomAvatar || currentRoomPermissions.value.changeRoomName) {
                const editGroupLink = document.createElement('span')
                editGroupLink.className = 'link'
                editGroupLink.setAttribute('data-link-id', 'editGroup')
                editGroupLink.setAttribute('role', 'button')
                editGroupLink.setAttribute('tabindex', '0')
                editGroupLink.textContent = i18nText.editGroupButton!
                eventNodeRoot.append(editGroupLink)
            }

            const eventTime = document.createElement('time')
            eventTime.setAttribute('datetime', e.isoTimestamp)
            eventTime.textContent = e.headerTime
            eventNodeRoot.append(eventTime)
        }
        // Member
        else if (e.event.type === 'm.room.member') {
            const eventIcon = document.createElement('span')
            eventIcon.className = 'p-chattimeline-event-icon pi'
            if (eventContent.membership === 'join') {
                eventIcon.classList.add('pi-arrow-right')
            } else {
                eventIcon.classList.add('pi-info-circle')
            }
            eventIcon.setAttribute('aria-hidden', 'true')
            eventNodeRoot.append(eventIcon)

            if (eventContent.membership === 'join') {
                const container = document.createElement('span')
                container.className = 'mr-1'
                eventNodeRoot.append(container)

                container.append(document.createTextNode(i18nText.joinedTheRoomPrefix!))

                const eventProfileStrong = document.createElement('strong')
                container.append(eventProfileStrong)

                const eventProfileLink = document.createElement('span')
                eventProfileLink.className = 'link'
                eventProfileLink.setAttribute('data-link-id', 'viewUserProfile')
                eventProfileLink.setAttribute('data-user-id', e.event.sender)
                eventProfileLink.setAttribute('role', 'button')
                eventProfileLink.setAttribute('tabindex', '0')
                eventProfileLink.textContent = e.displayname
                eventProfileStrong.append(eventProfileLink)

                container.append(document.createTextNode(i18nText.joinedTheRoomSuffix!))
            } else {
                const eventProfileStrong = document.createElement('strong')
                eventProfileStrong.className = 'mr-1'
                eventNodeRoot.append(eventProfileStrong)

                const eventProfileLink = document.createElement('span')
                eventProfileLink.className = 'link'
                eventProfileLink.setAttribute('data-link-id', 'viewUserProfile')
                eventProfileLink.setAttribute('data-user-id', e.event.sender)
                eventProfileLink.setAttribute('role', 'button')
                eventProfileLink.setAttribute('tabindex', '0')
                eventProfileLink.textContent = e.displayname
                eventProfileStrong.append(eventProfileLink)

                const eventDescriptionSpan = document.createElement('span')
                eventNodeRoot.append(eventDescriptionSpan)

                if (eventContent.membership === 'leave') {
                    if (e.event.unsigned?.prevContent?.membership === 'invite') {
                        eventDescriptionSpan.append(document.createTextNode(i18nText.rejectedAnInvite!))
                    }
                    eventDescriptionSpan.append(document.createTextNode(i18nText.leftTheRoom!))
                } else if (eventContent.membership === 'ban') {
                    eventDescriptionSpan.textContent = i18nText.bannedFromTheRoom!
                }
            }
            
            const eventTime = document.createElement('time')
            eventTime.setAttribute('datetime', e.isoTimestamp)
            eventTime.textContent = e.headerTime
            eventNodeRoot.append(eventTime)
        }
        // Name
        else if (e.event.type === 'm.room.name') {
            const eventIcon = document.createElement('span')
            eventIcon.className = 'p-chattimeline-event-icon pi pi-pencil'
            eventIcon.setAttribute('aria-hidden', 'true')
            eventNodeRoot.append(eventIcon)

            const eventProfileStrong = document.createElement('strong')
            eventNodeRoot.append(eventProfileStrong)

            const eventProfileLink = document.createElement('span')
            eventProfileLink.className = 'link'
            eventProfileLink.setAttribute('data-link-id', 'viewUserProfile')
            eventProfileLink.setAttribute('data-user-id', e.event.sender)
            eventProfileLink.setAttribute('role', 'button')
            eventProfileLink.setAttribute('tabindex', '0')
            eventProfileLink.textContent = e.displayname
            eventProfileStrong.append(eventProfileLink)

            eventNodeRoot.append(document.createTextNode(' '))
            if (eventContent.name) {
                eventNodeRoot.append(document.createTextNode(i18nText.changedGroupNamePrefix!))
                const eventContentStrong = document.createElement('strong')
                eventContentStrong.textContent = eventContent.name
                eventNodeRoot.append(eventContentStrong)
                eventNodeRoot.append(document.createTextNode(i18nText.changedGroupNameSuffix!))
            } else {
                eventNodeRoot.append(document.createTextNode(i18nText.removedGroupName!))
            }
            eventNodeRoot.append(document.createTextNode(' '))

            if (currentRoomPermissions.value.changeRoomAvatar || currentRoomPermissions.value.changeRoomName) {
                const editGroupLink = document.createElement('span')
                editGroupLink.className = 'link'
                editGroupLink.setAttribute('data-link-id', 'editGroup')
                editGroupLink.setAttribute('role', 'button')
                editGroupLink.setAttribute('tabindex', '0')
                editGroupLink.textContent = i18nText.editGroupButton!
                eventNodeRoot.append(editGroupLink)
            }

            const eventTime = document.createElement('time')
            eventTime.setAttribute('datetime', e.isoTimestamp)
            eventTime.textContent = e.headerTime
            eventNodeRoot.append(eventTime)
        }
        // Encryption
        else if (e.event.type === 'm.room.encryption') {
            const encryptedNotice = document.createElement('div')
            encryptedNotice.className = 'text-(--channels-default)'
            eventNodeRoot.append(encryptedNotice)

            const encryptedNoticeIcon = document.createElement('span')
            encryptedNoticeIcon.className = 'pi pi-exclamation-triangle mr-1 !text-sm'
            encryptedNoticeIcon.setAttribute('aria-hidden', 'true')
            encryptedNotice.append(encryptedNoticeIcon)

            encryptedNotice.append(document.createTextNode(i18nText.unableToDecryptMessage!))

            const encryptedNoticeFixLink = document.createElement('span')
            encryptedNoticeFixLink.className = 'link ml-1'
            encryptedNoticeFixLink.setAttribute('data-link-id', 'fixDecrypt')
            encryptedNoticeFixLink.setAttribute('role', 'button')
            encryptedNoticeFixLink.setAttribute('tabindex', '0')
            encryptedNoticeFixLink.textContent = i18nText.learnFixDecrypt!
            encryptedNotice.append(encryptedNoticeFixLink)
        }
    }

    eventNodeFragment.append(eventNodeRoot)

    elementBindingFragmentCacheIds.set(eventNodeFragment, cacheId)
    return eventNodeFragment
}

function render(el: HTMLElement, binding: DirectiveBinding<RenderBinding>) {
    let eventNodeFragments = elementBindingFragments.get(el)
    if (!eventNodeFragments) {
        eventNodeFragments = new Map()
        elementBindingFragments.set(el, eventNodeFragments)
    }
    const listFragment = document.createDocumentFragment()
    for (const eventChunk of binding.value.eventChunkList) {
        for (const e of eventChunk.events) {
            if (e.event.type === 'm.room.create') continue
            
            // Heading for current day
            if (e.currentDateDivider && e.event.type !== 'm.room.create') {
                const dateHeadingDiv = document.createElement('div')
                dateHeadingDiv.className = 'p-chattimeline-date-heading'
                const dateHeadingTime = document.createElement('time')
                dateHeadingTime.setAttribute('datetime', e.isoTimestamp)
                dateHeadingTime.textContent = e.currentDateDivider
                dateHeadingDiv.append(dateHeadingTime)
                listFragment.append(dateHeadingDiv)
            }

            let fragmentCacheId = `${
                    e.event.type
                }_${
                    e.reactions.map((reaction) => reaction.key + '_' + reaction.displaynames.length).join(',')
                }_${
                    e.event.content?.msgtype === 'm.image' && mediaElementCache.has(e.event.eventId)
                }`
            let eventNodeFragment = eventNodeFragments.get(e.event.eventId)
            if (!eventNodeFragment || elementBindingFragmentCacheIds.get(eventNodeFragment) !== fragmentCacheId) {
                eventNodeFragment = createEventNodeFragment(e, binding.value, fragmentCacheId)
                eventNodeFragments.set(e.event.eventId, eventNodeFragment)
            }

            listFragment.append(
                eventNodeFragment.cloneNode(true)
            )
        }
    }

    el.innerHTML = ''
    el.append(listFragment)

    if (binding.value.isVisible) {
        loadMedia(el, binding.value.i18nText, binding.value.useMediaCache ?? false)
    }
}

function loadMedia(el: HTMLElement, i18nText: Record<string, string>, useElementCache: boolean) {
    const timelineId = document.querySelector('[data-timeline-id]')?.getAttribute('data-timeline-id')
    if (!timelineId) return
    let mediaCacheEntries = mediaCacheByTimelineId[timelineId]
    if (!mediaCacheEntries) {
        mediaCacheByTimelineId[timelineId] = useMediaCache()
        mediaCacheEntries = mediaCacheByTimelineId[timelineId]
    }
    const imageIntersectionObserver = imageIntersectionObservers.get(el)
    imageIntersectionObserver?.disconnect()

    const images = el.querySelectorAll('img[data-mxc-uri],img[data-encrypted-file],[data-avatar-mxc-uri]')
    for (const image of images) {
        if (imageIntersectionObserver) {
            imageIntersectionObserver.observe(image)
        } else {
            loadImage(image, mediaCacheEntries, useElementCache)
        }
    }

    const audioPlaceholders = el.querySelectorAll('audio[data-mxc-uri],audio[data-encrypted-file]')
    for (const audioPlaceholder of audioPlaceholders) {
        const eventId = audioPlaceholder.closest('[data-event-id]')?.getAttribute('data-event-id')
        if (useElementCache && eventId && mediaElementCache.has(eventId)) {
            audioPlaceholder.after(mediaElementCache.get(eventId)!)
            audioPlaceholder.remove()
            continue
        }

        const mxcUriOrFile = audioPlaceholder.getAttribute('data-mxc-uri')
            || JSON.parse(audioPlaceholder.getAttribute('data-encrypted-file') ?? '{}')
        const mimetype = audioPlaceholder.getAttribute('data-mimetype')
        const options: GetMxcObjectUrlOptions = {}
        if (mimetype) {
            options.mimetype = mimetype
        }
        mediaCacheEntries.getMxcObjectUrl(mxcUriOrFile, options).then((src) => {
            const newAudio = document.createElement('audio')
            newAudio.setAttribute('controls', '')
            const audioSource = document.createElement('source')
            audioSource.setAttribute('src', src)
            if (mimetype) {
                audioSource.setAttribute('type', mimetype)
            }
            newAudio.append(audioSource)
            audioPlaceholder.after(newAudio)
            audioPlaceholder.remove()

            useElementCache && mediaElementCache.set(eventId, newAudio)
        }).catch(() => {
            const errorContainer = document.createElement('div')
            errorContainer.className = 'mt-2'
            const errorIcon = document.createElement('span')
            errorIcon.className = 'pi pi-exclamation-triangle mr-2 !text-sm'
            errorIcon.setAttribute('aria-hidden', 'true')
            errorContainer.append(errorIcon)
            const errorText = document.createElement('span')
            errorText.className = 'text-(--channels-default)'
            errorText.textContent = i18nText.audioLoadFailed!
            errorContainer.append(errorText)
            audioPlaceholder.after(errorContainer)
            audioPlaceholder.remove()
        })
    }

    const videoPlaceholders = el.querySelectorAll('.p-chattimeline-video-placeholder[data-mxc-uri],.p-chattimeline-video-placeholder[data-encrypted-file]')
    for (let videoPlaceholder of videoPlaceholders) {
        const eventId = videoPlaceholder.closest('[data-event-id]')?.getAttribute('data-event-id')
        if (useElementCache && eventId && mediaElementCache.has(eventId)) {
            videoPlaceholder.after(mediaElementCache.get(eventId)!)
            videoPlaceholder.remove()
            continue
        }

        const videoMxcUriOrFile = videoPlaceholder.getAttribute('data-mxc-uri')
            || JSON.parse(videoPlaceholder.getAttribute('data-encrypted-file') ?? '{}')
        const videoMimetype = videoPlaceholder.getAttribute('data-mimetype')
        const posterMxcUriOrFile = videoPlaceholder.getAttribute('data-thumbnail-mxc-uri')
            || JSON.parse(videoPlaceholder.getAttribute('data-thumbnail-encrypted-file') ?? '{}')
        const posterMimetype = videoPlaceholder.getAttribute('data-thumbnail-mimetype')

        const videoOptions: GetMxcObjectUrlOptions = {}
        if (videoMimetype) {
            videoOptions.mimetype = videoMimetype
        }
        const posterOptions: GetMxcObjectUrlOptions = {}
        if (posterMimetype) {
            posterOptions.mimetype = posterMimetype
        }
        let posterSrc: string | undefined = undefined
        let videoSrc: string | undefined = undefined
        Promise.allSettled([
            mediaCacheEntries.getMxcObjectUrl(posterMxcUriOrFile, posterOptions).then((src) => {
                posterSrc = src
                if (!videoSrc) {
                    const posterImagePlaceholder = document.createElement('img')
                    posterImagePlaceholder.className = 'p-chattimeline-video-placeholder'
                    posterImagePlaceholder.setAttribute('src', posterSrc)
                    videoPlaceholder.after(posterImagePlaceholder)
                    videoPlaceholder.remove()
                    videoPlaceholder = posterImagePlaceholder
                }
            }).catch(() => {
                posterSrc = '/assets/images/image-load-error.svg'
            }),
            mediaCacheEntries.getMxcObjectUrl(videoMxcUriOrFile, videoOptions).then((src) => {
                videoSrc = src
            }).catch(() => {
                videoSrc = ''
            }),
        ]).then(() => {
            const video = document.createElement('video')
            video.setAttribute('controls', '')
            if (posterSrc) {
                video.setAttribute('poster', posterSrc)
            }
            const videoSource = document.createElement('source')
            if (videoSrc) videoSource.setAttribute('src', videoSrc)
            if (videoMimetype) videoSource.setAttribute('mimetype', videoMimetype)
            video.append(videoSource)
            videoPlaceholder.after(video)
            videoPlaceholder.remove()

            useElementCache && mediaElementCache.set(eventId, video)
        })
    }

}

function loadImage(image: Element, mediaCacheEntries: ReturnType<typeof useMediaCache>, useElementCache: boolean) {
    const eventId = image.closest('[data-event-id]')?.getAttribute('data-event-id')
    const isMainEventImage = image.parentElement?.classList?.contains('p-chattimeline-event-image')
    if (useElementCache && eventId && isMainEventImage && mediaElementCache.has(eventId)) {
        image.after(mediaElementCache.get(eventId)!)
        image.remove()
        return
    }

    const mxcUriOrFile = image.getAttribute('data-mxc-uri')
        || image.getAttribute('data-avatar-mxc-uri')
        || JSON.parse(image.getAttribute('data-encrypted-file') ?? '{}')
    const fetchImageOptions: GetMxcObjectUrlOptions = image.hasAttribute('data-avatar-mxc-uri')
        ? { type: 'thumbnail', width: 96, height: 96, method: 'scale' }
        : { type: 'download' }
    if (image) {
        const hasOnlyImg = image.parentElement?.childElementCount === 1 &&
            image.parentElement.firstElementChild?.tagName === 'IMG' &&
            image.parentElement.textContent.trim() === '' &&
            image.hasAttribute('data-mx-emoticon')
        image.classList.toggle('p-chattimeline-event-jumbo-emoji', hasOnlyImg)
    }
    mediaCacheEntries.getMxcObjectUrl(mxcUriOrFile, fetchImageOptions).then((src) => {
        if (image.hasAttribute('data-avatar-mxc-uri')) {
            image.innerHTML = ''
            const innerImage = document.createElement('img')
            innerImage.setAttribute('src', src)
            innerImage.className = 'w-full h-full'
            image.append(innerImage)
        } else {
            image.setAttribute('src', src)
            useElementCache && isMainEventImage && mediaElementCache.set(eventId, image as HTMLImageElement)
        }
        image.removeAttribute('data-mxc-uri')
        image.removeAttribute('data-avatar-mxc-uri')
        image.removeAttribute('data-encrypted-file')
    }).catch(() => {
        if (!image.hasAttribute('data-avatar-mxc-uri')) {
            image.setAttribute('src', '/assets/images/image-load-error.svg')
        }
    })
}

function onIntersectImagePlaceholder(this: HTMLElement, entries: IntersectionObserverEntry[]) {
    const timelineId = document.querySelector('[data-timeline-id]')?.getAttribute('data-timeline-id')
    if (!timelineId) return
    let mediaCacheEntries = mediaCacheByTimelineId[timelineId]
    if (!mediaCacheEntries) return
    for (const entry of entries) {
        if (entry.isIntersecting) {
            imageIntersectionObservers.get(this)?.unobserve(entry.target)
            loadImage(entry.target, mediaCacheEntries, true)
        }
    }
}

export const vTimelineEventRender: ObjectDirective<any, RenderBinding> = {
    mounted(el: HTMLElement, binding: DirectiveBinding<RenderBinding>) {
        render(el, binding)
        imageIntersectionObservers.set(el, new IntersectionObserver(onIntersectImagePlaceholder.bind(el), {
            root: el.closest('.application__main__body'),
            rootMargin: '100px',
            threshold: 0.0,

            
        }))
    },
    updated(el: HTMLElement, binding: DirectiveBinding<RenderBinding>) {
        if (binding.value.eventChunkList !== binding.oldValue?.eventChunkList) {
            render(el, binding)
        } else if (binding.value.isVisible && !binding.oldValue.isVisible) {
            loadMedia(el, binding.value.i18nText, binding.value.useMediaCache ?? false)
        }
        if (
            binding.value.messageActionsTargetEventId !== binding.oldValue?.messageActionsTargetEventId
            || binding.value.messageActionsContextMenuTargetEventId !== binding.oldValue?.messageActionsContextMenuTargetEventId
        ) {
            el.querySelector(`[data-event-id="${binding.oldValue?.messageActionsTargetEventId}"]`)?.classList.remove('p-chattimeline-event--hover')
            el.querySelector(`[data-event-id="${binding.oldValue?.messageActionsContextMenuTargetEventId}"]`)?.classList.remove('p-chattimeline-event--hover')
            el.querySelector(`[data-event-id="${binding.value.messageActionsTargetEventId}"]`)?.classList.add('p-chattimeline-event--hover')
            el.querySelector(`[data-event-id="${binding.value.messageActionsContextMenuTargetEventId}"]`)?.classList.add('p-chattimeline-event--hover')
        }
        if (binding.value.highlightEventId !== binding.oldValue?.highlightEventId) {
            el.querySelector(`[data-event-id="${binding.oldValue?.highlightEventId}"]`)?.classList.remove('p-chattimeline-event--flash')
            el.querySelector(`[data-event-id="${binding.value.highlightEventId}"]`)?.classList.add('p-chattimeline-event--flash')
        }
        if (binding.value.referenceEventId !== binding.oldValue?.referenceEventId) {
            el.querySelector(`[data-event-id="${binding.oldValue?.referenceEventId}"]`)?.classList.remove('p-chattimeline-event--reference')
            el.querySelector(`[data-event-id="${binding.value.referenceEventId}"]`)?.classList.add('p-chattimeline-event--reference')
        }
    },
    beforeUnmount(el: HTMLElement) {
        mediaElementCache.clear()
    },
    unmounted(el: HTMLElement) {
        imageIntersectionObservers.get(el)?.disconnect()
        imageIntersectionObservers.delete(el)
        let eventNodeFragments = elementBindingFragments.get(el)
        if (eventNodeFragments) {
            for (const fragment of eventNodeFragments.values()) {
                elementBindingFragmentCacheIds.delete(fragment)
            }
        }
        elementBindingFragments.delete(el)
    },
}

window.addEventListener('discortix-timeline-unmounted', (event: Event) => {
    if (!(event instanceof CustomEvent)) return
    if (!event.detail.id) return
    let mediaCacheEntries = mediaCacheByTimelineId[event.detail.id]
    if (!mediaCacheEntries) return
    delete mediaCacheByTimelineId[event.detail.id]
    setTimeout(() => {
        mediaCacheEntries.clearUsers()
    }, 500)
})
