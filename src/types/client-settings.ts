import * as z from 'zod'

export const ClientSettingsSchema = z.object({
    isDeveloperMode: z.boolean(),
})
export type ClientSettings = z.infer<typeof ClientSettingsSchema>
