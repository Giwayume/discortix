import * as z from 'zod'
import { camelizeSchema } from '@/utils/zod'

export interface MegolmBackupV1Curve25519AesSha2AuthData {
    publicKey: string;
    signatures?: Record<string,
        Record<string, string>
    >;
}

export interface MegolmBackupV1Curve25519AesSha2SessionData {
    algorithm: string;
    forwardingCurve25519KeyChain: string[];
    senderClaimedKeys: Record<string, string>;
    senderKey: string;
    sessionKey: string;
}

export interface MegolmBackupV1Curve25519AesSha2SessionDataEncrypted {
    ciphertext: string;
    ephemeral: string;
    mac: string;
}

export const ApiV3RoomKeyBackedUpSessionDataSchema = camelizeSchema(z.object({
    algorithm: z.enum(['m.megolm.v1.aes-sha2']),
    forwarding_curve25519_key_chain: z.array(z.string()),
    room_id: z.string().optional(),
    sender_claimed_keys: z.record(z.string(), z.string()),
    sender_key: z.string(),
    session_key: z.string(),
    session_id: z.string().optional(),
}))
export type ApiV3RoomKeyBackedUpSessionData = z.infer<typeof ApiV3RoomKeyBackedUpSessionDataSchema>

/**
 * GET /_matrix/client/v3/room_keys/keys
 * @see https://spec.matrix.org/v1.18/client-server-api/#get_matrixclientv3room_keyskeys
 */

export const ApiV3RoomKeyBackupKeysResponseSchema = camelizeSchema(z.object({
    rooms: z.record(
        z.string(), // Room ID
        z.object({
            sessions: z.record(
                z.string(), // Session ID
                z.object({
                    first_message_index: z.number(),
                    forwarded_count: z.number(),
                    is_verified: z.boolean(),
                    session_data: z.any(),
                })
            )
        })
    )
}))
export type ApiV3RoomKeyBackupKeysResponse = z.infer<typeof ApiV3RoomKeyBackupKeysResponseSchema>

/**
 * PUT /_matrix/client/v3/room_keys/keys
 * @see https://spec.matrix.org/v1.18/client-server-api/#put_matrixclientv3room_keyskeys
 */

export interface ApiV3RoomKeyBackupKeysUpdateRequest {
    rooms: Record<string, ApiV3RoomKeyBackupKeysForRoomUpdateRequest>;
}

export const ApiV3RoomKeyBackupKeysUpdateResponseSchema = camelizeSchema(z.object({
    count: z.number(),
    etag: z.string(),
}))

/**
 * DELETE /_matrix/client/v3/room_keys/keys
 * @see https://spec.matrix.org/v1.18/client-server-api/#delete_matrixclientv3room_keyskeys
 */

export const ApiV3RoomKeyBackupKeysDeleteResponseSchema = camelizeSchema(z.object({
    count: z.number(),
    etag: z.string(),
}))

/**
 * GET /_matrix/client/v3/room_keys/keys/{roomId}
 * @see https://spec.matrix.org/v1.18/client-server-api/#get_matrixclientv3room_keyskeysroomid
 */

export const ApiV3RoomKeyBackupKeysForRoomResponseSchema = camelizeSchema(z.object({
    sessions: z.record(
        z.string(), // Session ID
        z.object({
            first_message_index: z.number(),
            forwarded_count: z.number(),
            is_verified: z.boolean(),
            session_data: z.any(),
        })
    )
}))
export type ApiV3RoomKeyBackupKeysForRoomResponse = z.infer<typeof ApiV3RoomKeyBackupKeysForRoomResponseSchema>

/**
 * PUT /_matrix/client/v3/room_keys/keys/{roomId}
 * @see https://spec.matrix.org/v1.18/client-server-api/#put_matrixclientv3room_keyskeysroomid
 */

export interface ApiV3RoomKeyBackupKeysForRoomUpdateRequest {
    sessions: Record<string, ApiV3RoomKeyBackupRoomSessionKeyUpdateRequest>;
}

export const ApiV3RoomKeyBackupKeysForRoomUpdateResponseSchema = camelizeSchema(z.object({
    count: z.number(),
    etag: z.string(),
}))
export type ApiV3RoomKeyBackupKeysForRoomUpdateResponse = z.infer<typeof ApiV3RoomKeyBackupKeysForRoomUpdateResponseSchema>

/**
 * DELETE /_matrix/client/v3/room_keys/keys/{roomId} 
 * @see https://spec.matrix.org/v1.18/client-server-api/#delete_matrixclientv3room_keyskeysroomid
 */

export const ApiV3RoomKeyBackupKeysForRoomDeleteResponseSchema = camelizeSchema(z.object({
    count: z.number(),
    etag: z.string(),
}))
export type ApiV3RoomKeyBackupKeysForRoomDeleteResponse = z.infer<typeof ApiV3RoomKeyBackupKeysForRoomDeleteResponseSchema>

/**
 * GET /_matrix/client/v3/room_keys/keys/{roomId}/{sessionId}
 * @see https://spec.matrix.org/v1.18/client-server-api/#get_matrixclientv3room_keyskeysroomidsessionid
 */

export const ApiV3RoomKeyBackupRoomSessionKeyResponseSchema = camelizeSchema(z.object({
    first_message_index: z.number(),
    forwarded_count: z.number(),
    is_verified: z.boolean(),
    session_data: z.any(),
}))
export type ApiV3RoomKeyBackupRoomSessionKeyResponse = z.infer<typeof ApiV3RoomKeyBackupRoomSessionKeyResponseSchema>

/**
 * PUT /_matrix/client/v3/room_keys/keys/{roomId}/{sessionId}
 * @see https://spec.matrix.org/v1.18/client-server-api/#put_matrixclientv3room_keyskeysroomidsessionid
 */

export interface ApiV3RoomKeyBackupRoomSessionKeyUpdateRequest {
    first_message_index: number;
    forwarded_count: number;
    is_verified: boolean;
    session_data: any;
}

export const ApiV3RoomKeyBackupRoomSessionKeyUpdateResponseSchema = camelizeSchema(z.object({
    count: z.number(),
    etag: z.string(),
}))
export type ApiV3RoomKeyBackupRoomSessionKeyUpdateResponse = z.infer<typeof ApiV3RoomKeyBackupRoomSessionKeyUpdateResponseSchema>

/**
 * DELETE /_matrix/client/v3/room_keys/keys/{roomId}/{sessionId}
 * @see https://spec.matrix.org/v1.18/client-server-api/#delete_matrixclientv3room_keyskeysroomidsessionid
 */

export const ApiV3RoomKeyBackupRoomSessionKeyDeleteResponseSchema = camelizeSchema(z.object({
    count: z.number(),
    etag: z.string(),
}))
export type ApiV3RoomKeyBackupRoomSessionKeyDeleteResponse = z.infer<typeof ApiV3RoomKeyBackupRoomSessionKeyDeleteResponseSchema>

/**
 * GET /_matrix/client/v3/room_keys/version
 * @see https://spec.matrix.org/v1.18/client-server-api/#get_matrixclientv3room_keysversion
 */

export const ApiV3RoomKeyBackupVersionResponseSchema = camelizeSchema(z.object({
    algorithm: z.enum(['m.megolm_backup.v1.curve25519-aes-sha2']),
    auth_data: z.any(),
    count: z.number(),
    etag: z.string(),
    version: z.string(),
}))
export type ApiV3RoomKeyBackupVersionResponse = z.infer<typeof ApiV3RoomKeyBackupVersionResponseSchema>

/**
 * POST /_matrix/client/v3/room_keys/version
 * @see https://spec.matrix.org/v1.18/client-server-api/#post_matrixclientv3room_keysversion
 */

export interface ApiV3RoomKeyBackupVersionUpdateRequest {
    algorithm: 'm.megolm_backup.v1.curve25519-aes-sha2';
    auth_data: {
        public_key: string;
        signatures: Record<string, Record<string, string>>;
    }
}
