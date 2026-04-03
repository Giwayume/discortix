import * as z from 'zod'
import { ApiV3SyncResponseSchema } from './api-events'

export const BroadcastApiV3SyncMessageSchema = z.object({
    fromLeader: z.boolean().optional(),
    fromTabId: z.string().optional(),
    type: z.literal('apiV3Sync'),
    data: ApiV3SyncResponseSchema,
})
export type BroadcastApiV3SyncMessage = z.infer<typeof BroadcastApiV3SyncMessageSchema>

export const BroadcastPopulateAccountDataByTypeMessageSchema = z.object({
    fromLeader: z.boolean().optional(),
    fromTabId: z.string().optional(),
    type: z.literal('populateAccountDataByType'),
    data: z.object({
        type: z.string(),
        data: z.any(),
    })
})
export type BroadcastPopulateAccountDataByTypeMessage = z.infer<typeof BroadcastPopulateAccountDataByTypeMessageSchema>

export const BroadcastPopulateRoomKeysFromMegolmBackupMessageSchema = z.object({
    fromLeader: z.boolean().optional(),
    fromTabId: z.string().optional(),
    type: z.literal('populateRoomKeysFromMegolmBackup'),
    data: z.any(),
})
export type BroadcastPopulateRoomKeysFromMegolmBackupMessage = z.infer<typeof BroadcastPopulateRoomKeysFromMegolmBackupMessageSchema>

export const BroadcastRedactUnsentRoomTimelineEventMessageSchema = z.object({
    fromLeader: z.boolean().optional(),
    fromTabId: z.string().optional(),
    type: z.literal('redactUnsentRoomTimelineEvent'),
    data: z.object({
        roomId: z.string(),
        eventId: z.string(),
    }),
})
export type BroadcastRedactUnsentRoomTimelineEventMessage = z.infer<typeof BroadcastRedactUnsentRoomTimelineEventMessageSchema>

export const BroadcastSyncStatusMessageSchema = z.object({
    fromLeader: z.boolean().optional(),
    fromTabId: z.string().optional(),
    type: z.literal('syncStatus'),
    data: z.object({
        status: z.enum(['online', 'offline']),
    }),
})
export type BroadcastSyncStatusMessage = z.infer<typeof BroadcastSyncStatusMessageSchema>

export const BroadcastUpdateClientSettingMessageSchema = z.object({
    fromLeader: z.boolean().optional(),
    fromTabId: z.string().optional(),
    type: z.literal('updateClientSetting'),
    data: z.object({
        key: z.string(),
        value: z.any(),
    }),
})
export type BroadcastUpdateClientSettingMessage = z.infer<typeof BroadcastUpdateClientSettingMessageSchema>

export const BroadcastUpdateInboundMegolmSessionMessageSchema = z.object({
    fromLeader: z.boolean().optional(),
    fromTabId: z.string().optional(),
    type: z.literal('updateInboundMegolmSession'),
    data: z.object({
        roomId: z.string(),
        sessionId: z.string(),
        senderKey: z.string(),
    }),
})
export type BroadcastUpdateInboundMegolmSessionMessage = z.infer<typeof BroadcastUpdateInboundMegolmSessionMessageSchema>

export const BroadcastUpdateOlmAccountMessageSchema = z.object({
    fromLeader: z.boolean().optional(),
    fromTabId: z.string().optional(),
    type: z.literal('updateOlmAccount'),
    data: z.object().optional(),
})
export type BroadcastUpdateOlmAccountMessage = z.infer<typeof BroadcastUpdateOlmAccountMessageSchema>

export const BroadcastUpdateOlmSessionsMessageSchema = z.object({
    fromLeader: z.boolean().optional(),
    fromTabId: z.string().optional(),
    type: z.literal('updateOlmSessions'),
    data: z.object({
        sessionKey: z.string(),
    }),
})
export type BroadcastUpdateOlmSessionsMessage = z.infer<typeof BroadcastUpdateOlmSessionsMessageSchema>

export const BroadcastUpdateOutboundMegolmSessionMessageSchema = z.object({
    fromLeader: z.boolean().optional(),
    fromTabId: z.string().optional(),
    type: z.literal('updateOutboundMegolmSession'),
    data: z.object({
        roomId: z.string(),
        sessionId: z.string(),
    }),
})
export type BroadcastUpdateOutboundMegolmSessionMessage = z.infer<typeof BroadcastUpdateOutboundMegolmSessionMessageSchema>

export const BroadcastUpdateRoomMegolmMetadataMessageSchema = z.object({
    fromLeader: z.boolean().optional(),
    fromTabId: z.string().optional(),
    type: z.literal('updateRoomMegolmMetadata'),
    data: z.object({
        roomId: z.string(),
    }),
})
export type BroadcastUpdateRoomMegolmMetadataMessage = z.infer<typeof BroadcastUpdateRoomMegolmMetadataMessageSchema>

export const BroadcastUpdateToDeviceErroredEventsMessageSchema = z.object({
    fromLeader: z.boolean().optional(),
    fromTabId: z.string().optional(),
    type: z.literal('updateToDeviceErroredEvents'),
    data: z.object().optional(),
})
export type BroadcastUpdateToDeviceErroredEventsMessage = z.infer<typeof BroadcastUpdateToDeviceErroredEventsMessageSchema>

export const broadcastMessageSchemaByType = {
    'apiV3Sync': BroadcastApiV3SyncMessageSchema,
    'populateAccountDataByType': BroadcastPopulateAccountDataByTypeMessageSchema,
    'populateRoomKeysFromMegolmBackup': BroadcastPopulateRoomKeysFromMegolmBackupMessageSchema,
    'redactUnsentRoomTimelineEvent': BroadcastRedactUnsentRoomTimelineEventMessageSchema,
    'syncStatus': BroadcastSyncStatusMessageSchema,
    'updateClientSetting': BroadcastUpdateClientSettingMessageSchema,
    'updateInboundMegolmSession': BroadcastUpdateInboundMegolmSessionMessageSchema,
    'updateOlmAccount': BroadcastUpdateOlmAccountMessageSchema,
    'updateOlmSessions': BroadcastUpdateOlmSessionsMessageSchema,
    'updateOutboundMegolmSession': BroadcastUpdateOutboundMegolmSessionMessageSchema,
    'updateRoomMegolmMetadata': BroadcastUpdateRoomMegolmMetadataMessageSchema,
    'updateToDeviceErroredEvents': BroadcastUpdateToDeviceErroredEventsMessageSchema,
}

export type BroadcastMessage = (
    BroadcastApiV3SyncMessage
    | BroadcastPopulateAccountDataByTypeMessage
    | BroadcastPopulateRoomKeysFromMegolmBackupMessage
    | BroadcastRedactUnsentRoomTimelineEventMessage
    | BroadcastSyncStatusMessage
    | BroadcastUpdateClientSettingMessage
    | BroadcastUpdateInboundMegolmSessionMessage
    | BroadcastUpdateOlmAccountMessage
    | BroadcastUpdateOlmSessionsMessage
    | BroadcastUpdateOutboundMegolmSessionMessage
    | BroadcastUpdateRoomMegolmMetadataMessage
    | BroadcastUpdateToDeviceErroredEventsMessage
)
