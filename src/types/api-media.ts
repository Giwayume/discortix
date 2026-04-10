import * as z from 'zod'
import { camelizeSchema } from '@/utils/zod'
import type { EncryptedFile } from '@/types/encryption'
import type { EventAudioContent, EventFileContent, EventImageContent, EventVideoContent } from '@/types/api-events'

/** @see https://spec.matrix.org/v1.18/client-server-api/#get_matrixclientv1mediaconfig */
export const ApiV1MediaConfigResponseSchema = camelizeSchema(z.object({
    'm.upload.size': z.number().nullable().optional(),
}))
export type ApiV1MediaConfigResponse = z.infer<typeof ApiV1MediaConfigResponseSchema>

/** @see https://spec.matrix.org/v1.17/client-server-api/#post_matrixmediav1create */
export const ApiV3MediaCreateResponseSchema = camelizeSchema(z.object({
    content_uri: z.string(),
    unused_expires_at: z.number().optional(),
}))
export type ApiV3MediaCreateResponse = z.infer<typeof ApiV3MediaCreateResponseSchema>

/** @see https://spec.matrix.org/v1.17/client-server-api/#post_matrixmediav3upload */
export const ApiV3MediaUploadResponseSchema = camelizeSchema(z.object({
    content_uri: z.string(),
}))
export type ApiV3MediaUploadResponse = z.infer<typeof ApiV3MediaUploadResponseSchema>

export interface MediaAudioInfo {
    type: 'audio';
    info: EventAudioContent['info'];
}
export interface MediaImageInfo {
    type: 'image';
    info: EventImageContent['info'];
    thumbnailBlob?: Blob;
}
export interface MediaVideoInfo {
    type: 'video';
    info: EventVideoContent['info'];
    thumbnailBlob?: Blob;
}
export interface MediaUnknownInfo {
    type: 'unknown';
    info: EventFileContent['info'];
}
export type MediaInfo = MediaAudioInfo | MediaImageInfo | MediaVideoInfo | MediaUnknownInfo

export interface MediaAttachmentPendingUpload {
    description: string;
    id: string;
    file: File;
    encryptedFile?: EncryptedFile;
    encryptedFileBlob?: Blob;
    encryptedThumbnailFile?: EncryptedFile;
    encryptedThumbnailFileBlob?: Blob;
    filename: string;
    mediaInfo: MediaInfo;
    previewObjectUrl: string;
    spoiler: boolean;
    fileUploaded?: boolean;
    thumbnailUploaded?: boolean;
    contentUri?: string;
    thumbnailContentUri?: string;
}
