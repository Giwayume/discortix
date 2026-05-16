import { getCurrentInstance, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useSessionStore } from '@/stores/session'
import { decryptFile } from '@/utils/crypto'
import { fetch, HttpError } from '@/utils/fetch'

import type { EncryptedFile } from '@/types'

const mxcObjectUrlRequests = new Map<string, Promise<Blob>>()
const mxcObjectUrls = new Map<string, string>()
const mxcObjectUrlUserCount = new Map<string, number>()

interface MxcUrlParts {
    serverName: string | null;
    mediaId: string | null;
}

const mxcUriRegex = /^mxc:\/\/([^\/]+)\/([^\/]+)$/
function parseMxcUri(mxcUri: string): MxcUrlParts {
    if (!mxcUriRegex.test(mxcUri)) return { serverName: null, mediaId: null }
    const slashPosition = mxcUri.indexOf('/', 6)
    return {
        serverName: mxcUri.slice(6, slashPosition),
        mediaId: mxcUri.slice(slashPosition + 1),
    }
}

export interface GetMxcObjectUrlOptions {
    type?: 'thumbnail' | 'download';
    width?: number;
    height?: number;
    method?: 'crop' | 'scale';
    animated?: boolean;
    mimetype?: string;
}

export function useMediaCache() {
    const { homeserverBaseUrl } = storeToRefs(useSessionStore())
    const usedMxcUris = new Set<string>()

    async function getMxcBlob(
        mxcUriOrFile: EncryptedFile | string,
        options: GetMxcObjectUrlOptions,
        abortController?: AbortController,
    ): Promise<Blob> {
        if (!options.type) options.type = 'download'
        const mxcUri = typeof mxcUriOrFile === 'string' ? mxcUriOrFile : mxcUriOrFile.url
        const encryptionInfo: EncryptedFile | undefined = typeof mxcUriOrFile === 'string' ? undefined : mxcUriOrFile
        let blob: Blob | undefined = undefined
        fetchMedia:
        if (!blob) {
            const { serverName, mediaId } = parseMxcUri(mxcUri)
            if (!serverName || !mediaId) break fetchMedia
            const mimetype = options.mimetype
            delete options.mimetype
            const queryParams: Record<string, any> = { ...options }
            delete queryParams.type
            let response: Response
            if (options.type === 'thumbnail') {
                response = await fetch(
                    `${homeserverBaseUrl.value}/_matrix/client/v1/media/thumbnail/${
                        encodeURIComponent(serverName)
                    }/${
                        encodeURIComponent(mediaId)
                    }?${
                        new URLSearchParams(queryParams)
                    }`, {
                        signal: abortController?.signal,
                        useAuthorization: true,
                    },
                )
            } else { // Full image.
                response = await fetch(
                    `${homeserverBaseUrl.value}/_matrix/client/v1/media/download/${
                        encodeURIComponent(serverName)
                    }/${
                        encodeURIComponent(mediaId)
                    }?${
                        new URLSearchParams(queryParams)
                    }`, {
                        signal: abortController?.signal,
                        useAuthorization: true,
                    },
                )
            }
            if (abortController?.signal?.aborted) break fetchMedia
            if (!response.ok) throw new HttpError(response)
            if (abortController?.signal?.aborted) break fetchMedia

            if (encryptionInfo) {
                const encryptedData = new Uint8Array(await response.arrayBuffer())
                if (abortController?.signal?.aborted) break fetchMedia
                blob = await decryptFile(encryptedData, encryptionInfo, mimetype)
                if (abortController?.signal?.aborted) break fetchMedia
            } else {
                blob = await response.blob()
            }
        }
        if (!blob) throw new DOMException('Unable to find the media.')
        return blob
    }

    /** Fetch media from the server and store the blob as an object URL */
    async function getMxcObjectUrl(
        mxcUriOrFile: EncryptedFile | string,
        options: GetMxcObjectUrlOptions,
        abortController?: AbortController,
    ): Promise<string> {
        if (!options.type) options.type = 'download'
        const optionsId = JSON.stringify(options)
        const mxcUri = typeof mxcUriOrFile === 'string' ? mxcUriOrFile : mxcUriOrFile.url
        const mxcStoreId = mxcUri + '::' + optionsId
        let objectUrl = mxcObjectUrls.get(mxcStoreId)
        try {
            if (!objectUrl) {
                const objectUrlRequest = mxcObjectUrlRequests.get(mxcStoreId)
                if (objectUrlRequest) {
                    const [settleResult] = await Promise.allSettled([objectUrlRequest])
                    await new Promise((resolve) => setTimeout(resolve, 1))
                    if (settleResult.status === 'fulfilled') {
                        objectUrl = URL.createObjectURL(settleResult.value)
                    }
                } else {
                    const request = getMxcBlob(mxcUriOrFile, options, abortController)
                    mxcObjectUrlRequests.set(mxcStoreId, request)
                    const blob = await request
                    objectUrl = URL.createObjectURL(blob)
                    mxcObjectUrls.set(mxcStoreId, objectUrl)
                }
            }
            if (objectUrl && !usedMxcUris.has(mxcStoreId)) {
                mxcObjectUrlUserCount.set(mxcStoreId, (mxcObjectUrlUserCount.get(mxcStoreId) ?? 0) + 1)
                usedMxcUris.add(mxcStoreId)
            }
            if (!objectUrl) throw new DOMException('Unable to find the media.')
        } finally {
            mxcObjectUrlRequests.delete(mxcStoreId)
        }
        return objectUrl
    }

    function clearUsers() {
        for (const mxcStoreId of usedMxcUris) {
            const userCount = Math.max(0, (mxcObjectUrlUserCount.get(mxcStoreId) ?? 0) - 1)
            mxcObjectUrlUserCount.set(mxcStoreId, userCount)
            if (userCount === 0) {
                const objectUrl = mxcObjectUrls.get(mxcStoreId)
                mxcObjectUrlRequests.delete(mxcStoreId)
                mxcObjectUrls.delete(mxcStoreId)
                mxcObjectUrlUserCount.delete(mxcStoreId)
                if (!objectUrl) continue
                URL.revokeObjectURL(objectUrl)
            }
        }
    }

    if (getCurrentInstance()) {
        onUnmounted(() => {
            setTimeout(clearUsers, 500)
        })
    }

    return {
        getMxcBlob,
        getMxcObjectUrl,
        clearUsers,
    }
}
