import { storeToRefs } from 'pinia'

import { fetchJson, HttpError } from '@/utils/fetch'
import { FileTooBigError } from '@/utils/error'

import { useSessionStore } from '@/stores/session'

import {
    type ApiV1MediaConfigResponse, ApiV1MediaConfigResponseSchema,
    type ApiV3MediaCreateResponse, ApiV3MediaCreateResponseSchema,
    type ApiV3MediaUploadResponse, ApiV3MediaUploadResponseSchema,
    type MediaInfo,
} from '@/types'

// If relevant APIs fail, this gets set to false
let isMsc2246Supported = true

const audioMediaTypes = [
    'audio/aac', 'audio/flac', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm',
]
const imageMediaTypes = [
    'image/apng', 'image/bmp', 'image/gif', 'image/jpeg', 'image/jpg', 'image/png', 'image/svg+xml', 'image/webp',
]
const videoMediaTypes = [
    'video/mp4', 'video/ogg', 'video/quicktime', 'video/webm', 'video/x-matroska',
]

const thumbnailMaxDimension = 800

export async function createMediaInfo(objectUrlOrBlob: string | Blob, generateThumbnail?: boolean): Promise<MediaInfo> {
    let objectUrl = (typeof objectUrlOrBlob === 'string') ? objectUrlOrBlob : undefined
    let blob: Blob | null
    try {
        blob = (typeof objectUrlOrBlob === 'string')
            ? await (await fetch(objectUrlOrBlob)).blob()
            : objectUrlOrBlob
    } catch (error) {
        return { type: 'unknown', info: {} }
    }
    if (!blob) return { type: 'unknown', info: {} }

    let shouldRevokeObjectUrl = false
    if (imageMediaTypes.includes(blob.type)) {
        try {
            const image = await new Promise<HTMLImageElement>((resolve, reject) => {
                const image = new Image()
                const onLoad = () => {
                    image.removeEventListener('load', onLoad)
                    image.removeEventListener('error', onError)
                    resolve(image)
                }
                const onError = () => {
                    image.removeEventListener('load', onLoad)
                    image.removeEventListener('error', onError)
                    reject()
                }
                image.addEventListener('load', onLoad)
                image.addEventListener('error', onError)
                if (!objectUrl) {
                    objectUrl = URL.createObjectURL(blob)
                    shouldRevokeObjectUrl = true
                }
                image.src = objectUrl
            })
            let thumbnailBlob: Blob | undefined = undefined
            let thumbnailWidth: number = 0
            let thumbnailHeight: number = 0
            if (generateThumbnail && Math.max(image.width, image.height) >= thumbnailMaxDimension) {
                const thumbnailScale = thumbnailMaxDimension / Math.max(image.width, image.height)
                const canvas = document.createElement('canvas')
                canvas.width = Math.floor(image.width * thumbnailScale)
                canvas.height = Math.floor(image.height * thumbnailScale)
                thumbnailWidth = canvas.width
                thumbnailHeight = canvas.height
                const ctx = canvas.getContext('2d')
                if (ctx) {
                    ctx.scale(thumbnailScale, thumbnailScale)
                    ctx.drawImage(image, 0, 0)
                }
                thumbnailBlob = await new Promise<Blob | null>((resolve) => {
                    try {
                        canvas.toBlob(resolve, 'image/jpeg', 0.95)
                    } catch (error) {
                        resolve(null)
                    }
                }) ?? undefined
            }
            if (shouldRevokeObjectUrl) {
                URL.revokeObjectURL(objectUrl!)
            }
            const mediaInfo: MediaInfo = {
                type: 'image',
                info: {
                    h: Math.round(image.height),
                    mimetype: blob.type,
                    size: blob.size,
                    w: Math.round(image.width),
                },
                thumbnailBlob,
            }
            if (thumbnailBlob) {
                mediaInfo.info!.thumbnailInfo = {
                    h: Math.round(thumbnailHeight),
                    mimetype: 'image/jpeg',
                    size: thumbnailBlob.size,
                    w: Math.round(thumbnailWidth),
                }
            }
            return mediaInfo
        } catch (error) {
            if (shouldRevokeObjectUrl) {
                URL.revokeObjectURL(objectUrl!)
            }
            return {
                type: 'image',
                info: {
                    mimetype: blob.type,
                    size: blob.size,
                },
            }
        }
    } else if (videoMediaTypes.includes(blob.type)) {
        try {
            const video = await new Promise<HTMLVideoElement>((resolve, reject) => {
                const video = document.createElement('video')
                video.preload = 'metadata'
                if (generateThumbnail) {
                    video.playsInline = true
                }
                const onLoad = () => {
                    video.removeEventListener('loadedmetadata', onLoad)
                    video.removeEventListener('error', onError)
                    resolve(video)
                }
                const onError = () => {
                    video.removeEventListener('loadedmetadata', onLoad)
                    video.removeEventListener('error', onError)
                    reject()
                }
                video.addEventListener('loadedmetadata', onLoad)
                video.addEventListener('error', onError)
                if (!objectUrl) {
                    objectUrl = URL.createObjectURL(blob)
                    shouldRevokeObjectUrl = true
                }
                video.src = objectUrl
            });
            let thumbnailBlob: Blob | undefined = undefined
            let thumbnailWidth: number = 0
            let thumbnailHeight: number = 0
            if (generateThumbnail && Math.max(video.videoWidth, video.videoHeight) >= thumbnailMaxDimension) {
                await new Promise<void>((resolve) => {
                    let isResolved = false
                    function onLoadedData() {
                        if (isResolved) return
                        video.currentTime = 0.001
                        video.addEventListener('seeked', onSeeked, { once: true })
                    }
                    function onSeeked() {
                        if (isResolved) return
                        resolve()
                        isResolved = true
                        video.pause()
                    }
                    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                        onLoadedData()
                    } else {
                        video.addEventListener('loadeddata', onLoadedData, { once: true })
                    }
                    setTimeout(() => {
                        if (isResolved) return
                        resolve()
                        isResolved = true
                    }, 1000)
                })

                const thumbnailScale = thumbnailMaxDimension / Math.max(video.videoWidth, video.videoHeight)
                const canvas = document.createElement('canvas')
                canvas.width = Math.floor(video.videoWidth * thumbnailScale)
                canvas.height = Math.floor(video.videoHeight * thumbnailScale)
                thumbnailWidth = canvas.width
                thumbnailHeight = canvas.height
                const ctx = canvas.getContext('2d')
                if (ctx) {
                    ctx.scale(thumbnailScale, thumbnailScale)
                    ctx.drawImage(video, 0, 0)
                }
                thumbnailBlob = await new Promise<Blob | null>((resolve) => {
                    try {
                        canvas.toBlob(resolve, 'image/jpeg', 0.95)
                    } catch (error) {
                        resolve(null)
                    }
                }) ?? undefined
            }
            if (shouldRevokeObjectUrl) {
                URL.revokeObjectURL(objectUrl!)
            }
            const mediaInfo: MediaInfo = {
                type: 'video',
                info: {
                    duration: Math.round(video.duration * 1000),
                    h: Math.round(video.videoHeight),
                    mimetype: blob.type,
                    size: blob.size,
                    w: Math.round(video.videoWidth),
                },
                thumbnailBlob,
            }
            if (thumbnailBlob) {
                mediaInfo.info!.thumbnailInfo = {
                    h: Math.round(thumbnailHeight),
                    mimetype: 'image/jpeg',
                    size: thumbnailBlob.size,
                    w: Math.round(thumbnailWidth),
                }
            }
            return mediaInfo
        } catch (error) {
            if (shouldRevokeObjectUrl) {
                URL.revokeObjectURL(objectUrl!)
            }
            return {
                type: 'video',
                info: {
                    mimetype: blob.type,
                    size: blob.size,
                },
            }
        }
    } else if (audioMediaTypes.includes(blob.type)) {
        try {
            const audio = await new Promise<HTMLAudioElement>((resolve, reject) => {
                const audio = document.createElement('audio')
                audio.preload = 'metadata'
                const onLoad = () => {
                    audio.removeEventListener('loadedmetadata', onLoad)
                    audio.removeEventListener('error', onError)
                    resolve(audio)
                }
                const onError = () => {
                    audio.removeEventListener('loadedmetadata', onLoad)
                    audio.removeEventListener('error', onError)
                    reject()
                }
                audio.addEventListener('loadedmetadata', onLoad)
                audio.addEventListener('error', onError)
                if (!objectUrl) {
                    objectUrl = URL.createObjectURL(blob)
                    shouldRevokeObjectUrl = true
                }
                audio.src = objectUrl
            })
            if (shouldRevokeObjectUrl) {
                URL.revokeObjectURL(objectUrl!)
            }
            return {
                type: 'audio',
                info: {
                    duration: Math.round(audio.duration * 1000),
                    mimetype: blob.type,
                    size: blob.size,
                },
            }
        } catch (error) {
            if (shouldRevokeObjectUrl) {
                URL.revokeObjectURL(objectUrl!)
            }
            return {
                type: 'audio',
                info: {
                    mimetype: blob.type,
                    size: blob.size,
                },
            }
        }
    }
    return {
        type: 'unknown',
        info: {
            mimetype: blob.type,
            size: blob.size,
        },
    }
}

const maxUploadSizeCheckFrequency = 1.8e+6 // 30 minutes
let lastMaxUploadSizeRequestTimestamp: number = 0
let maxUploadSize: number = Infinity

export function createLazyMediaUpload() {
    const { homeserverBaseUrl } = storeToRefs(useSessionStore())

    let contentUri: string | undefined = undefined
    let unusedExpiresAt: number | undefined = undefined
    let isUploaded: boolean = false

    let queuedBlob: Blob | null = null

    async function useContentUri(uri: string) {
        contentUri = uri
    }

    async function useObjectUrl(objectUrl: string): Promise<string> {
        const blob = await (await fetch(objectUrl)).blob()
        return useBlob(blob)
    }

    async function useBlob(blob: Blob): Promise<string> {
        if (Date.now() - maxUploadSizeCheckFrequency > lastMaxUploadSizeRequestTimestamp) {
            lastMaxUploadSizeRequestTimestamp = Date.now()
            try {
                const response = await fetchJson<ApiV1MediaConfigResponse>(
                    `${homeserverBaseUrl.value}/_matrix/client/v1/media/config`,
                    {
                        useAuthorization: true,
                        jsonSchema: ApiV1MediaConfigResponseSchema,
                    }
                )
                maxUploadSize = response['m.upload.size'] ?? Infinity
            } catch (error) {
                try {
                    // Try the deprecated API
                    const response = await fetchJson<ApiV1MediaConfigResponse>(
                        `${homeserverBaseUrl.value}/_matrix/media/v3/config`,
                        {
                            useAuthorization: true,
                            jsonSchema: ApiV1MediaConfigResponseSchema,
                        }
                    )
                    maxUploadSize = response['m.upload.size'] ?? Infinity
                } catch (error) { /* Ignore */ }
            }
        }

        if (blob.size > maxUploadSize) {
            throw new FileTooBigError()
        }

        if (isMsc2246Supported) {
            try {
                ({ contentUri, unusedExpiresAt } = await fetchJson<ApiV3MediaCreateResponse>(
                    `${homeserverBaseUrl.value}/_matrix/media/v1/create`,
                    {
                        method: 'POST',
                        useAuthorization: true,
                        jsonSchema: ApiV3MediaCreateResponseSchema,
                    }
                ))
                queuedBlob = blob
            } catch (error) {
                if (error instanceof HttpError) {
                    if (error.isMatrixUnrecognized()) {
                        isMsc2246Supported = false
                    } else if (!error.isMatrixRateLimited()) {
                        throw error
                    }
                } else {
                    throw error
                }
            }
        }

        if (!contentUri) {
            // Can't create any more temporary IDs, so upload immediately.
            ({ contentUri } = await fetchJson<ApiV3MediaUploadResponse>(
                `${homeserverBaseUrl.value}/_matrix/media/v1/upload`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': blob.type,
                    },
                    body: blob,
                    useAuthorization: true,
                    jsonSchema: ApiV3MediaUploadResponseSchema,
                }
            ))
            isUploaded = true
        }

        return contentUri
    }

    async function discard() {
        // Matrix protocol does not provide a way to "cancel" asynchronous uploads.
        // Leaving this method in place for potential future implementations.
    }

    /** @returns A new contentUri is only returned if it changed from the initial request */
    async function upload(): Promise<string | undefined> {
        if (isUploaded || !queuedBlob) return

        if ((Date.now() > (unusedExpiresAt ?? Infinity)) || !contentUri) {
            ({ contentUri } = await fetchJson<ApiV3MediaUploadResponse>(
                `${homeserverBaseUrl.value}/_matrix/media/v1/upload`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': queuedBlob.type,
                    },
                    body: queuedBlob,
                    useAuthorization: true,
                    jsonSchema: ApiV3MediaUploadResponseSchema,
                }
            ))
            isUploaded = true
            return contentUri
        } else if (contentUri) {
            const [serverName, mediaId] = contentUri.replace(/^mxc\:\/\//, '').split('/')
            await fetchJson(
                `${homeserverBaseUrl.value}/_matrix/media/v3/upload/${serverName}/${mediaId}.`,
                {
                    method: 'PUT',
                    headers: {
                        'Content-Type': queuedBlob.type,
                    },
                    body: queuedBlob,
                    useAuthorization: true,
                }
            )
            isUploaded = true
        }
    }

    return {
        useContentUri,
        useObjectUrl,
        useBlob,
        discard,
        upload,
    }

}
