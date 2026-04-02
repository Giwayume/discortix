import type { Session, GroupSession, InboundGroupSession } from 'vodozemac-wasm-bindings'
import type { ApiV3SyncToDeviceEvent } from '@/types/api-events'

import * as z from 'zod'

/** @see https://spec.matrix.org/v1.17/client-server-api/#sending-encrypted-attachments */
export const EncryptedFileJsonWebKeySchema = z.object({
    kty: z.enum(['oct']),
    keyOps: z.array(z.string()),
    alg: z.enum(['A256CTR']),
    k: z.string(),
    ext: z.boolean(),
})
export type EncryptedFileJsonWebKey = z.infer<typeof EncryptedFileJsonWebKeySchema>

/** @see https://spec.matrix.org/v1.17/client-server-api/#sending-encrypted-attachments */
export const EncryptedFileSchema = z.object({
    url: z.string(),
    key: EncryptedFileJsonWebKeySchema,
    iv: z.string(),
    hashes: z.record(
        z.string(), // Algorithm name
        z.string(), // Hash of cipher text
    ),
    v: z.enum(['v2']),
})
export type EncryptedFile = z.infer<typeof EncryptedFileSchema>

export interface InboundMegolmSessionWithUsage {
    forwardingCurve25519KeyChain: string[];
    senderClaimedEd25519Key: string;
    session: InboundGroupSession;
}

export interface OutboundMegolmSessionWithUsage {
    session: GroupSession;
}

export interface ToDeviceErroredEvent {
    receivedTs: number;
    event: ApiV3SyncToDeviceEvent;
}

export interface OlmSessionWithUsage {
    lastInboundActivityTs: number;
    isConfirmed?: boolean; // The other side sent an OLM message back
    session: Session;
}

export interface PickledOlmSessionWithUsage {
    lastInboundActivityTs: number;
    isConfirmed?: boolean;
    pickle: string;
}
