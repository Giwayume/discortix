import * as z from 'zod'
import { camelizeSchema, camelizeSchemaWithoutTransform } from '@/utils/zod'

/** @see https://spec.matrix.org/v1.17/client-server-api/#get_matrixclientv3capabilities */
const BooleanCapabilitySchema = camelizeSchemaWithoutTransform(z.object({
    enabled: z.boolean(),
}))
const ProfileFieldsCapabilitySchema = camelizeSchemaWithoutTransform(z.object({
    allowed: z.array(z.string()).optional(),
    disallowed: z.array(z.string()).optional(),
    enabled: z.boolean(),
}))
const RoomVersionsCapabilitySchema = camelizeSchemaWithoutTransform(z.object({
    available: z.record(z.string(), z.string()),
    default: z.string(),
}))
export const ApiV3CapabilitiesResponseSchema = camelizeSchema(z.object({
    capabilities: z.object({
        'm.3pid_changes': BooleanCapabilitySchema.optional(),
        'm.change_password': BooleanCapabilitySchema.optional(),
        'm.get_login_token': BooleanCapabilitySchema.optional(),
        'm.profile_fields': ProfileFieldsCapabilitySchema.optional(),
        'm.room_versions': RoomVersionsCapabilitySchema.optional(),
        'm.set_avatar_url': BooleanCapabilitySchema.optional(),
        'm.set_displayname': BooleanCapabilitySchema.optional(),
    })
}))
export type ApiV3CapabilitiesResponse = z.infer<typeof ApiV3CapabilitiesResponseSchema>
