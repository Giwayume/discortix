import * as z from 'zod'

export const ClientSettingsSchema = z.object({
    discoveryServers: z.array(z.string()),
    isDeveloperMode: z.boolean(),
    pointerClickTimeout: z.number(),
    pointerMoveRadius: z.number(),
    pointerPressTimeout: z.number(),
    prefersEnableEncryption: z.boolean(),
    sendReadReceipts: z.boolean(),
    sendTypingIndicators: z.boolean(),
    showChatAside: z.boolean(),
    warnUnencryptedMessageInEncryptedRoom: z.boolean(),
})
export type ClientSettings = z.infer<typeof ClientSettingsSchema>
