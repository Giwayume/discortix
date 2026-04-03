import { storeToRefs } from 'pinia'
import { type ZodType } from 'zod'
import { camelizeApiResponse, snakeCaseApiRequest } from '@/utils/zod'

import { useAccountDataStore } from '@/stores/account-data'
import { useProfileStore } from '@/stores/profile'
import { useSessionStore } from '@/stores/session'

import { fetchJson } from '@/utils/fetch'

import {
    ApiV3ProfileResponseSchema, type ApiV3ProfileResponse,
    eventContentSchemaByType,
    type EventInvalidDiscortixHiddenRoomsContent,
    type EventInvalidDiscortixFriendsContent,
} from '@/types'

export function useAccountData() {
    const { homeserverBaseUrl, userId: sessionUserId, defaultUserIdHomeserver } = storeToRefs(useSessionStore())
    const accountDataStore = useAccountDataStore()
    const { accountData } = storeToRefs(accountDataStore)
    const { populateByType: populateAccountDataByType } = accountDataStore
    const { populateFromApiV3ProfileResponse } = useProfileStore()

    async function getAccountDataByType<T = any>(type: string, schema?: ZodType, camelize?: boolean): Promise<T | undefined> {
        try {
            let response = await fetchJson(
                `${homeserverBaseUrl.value}/_matrix/client/v3/user/${encodeURIComponent(sessionUserId.value + '')}/account_data/${type}`,
                {
                    useAuthorization: true,
                },
            )
            if (camelize !== false) {
                response = camelizeApiResponse(response)
            }
            const validationSchema = schema ?? eventContentSchemaByType[type as keyof typeof eventContentSchemaByType]
            if (validationSchema && !validationSchema.safeParse(response).success) {
                return undefined
            }
            populateAccountDataByType(type, response)
            return response
        } catch (error) {
            return undefined
        }
    }

    async function setAccountDataByType(type: string, data: any): Promise<void> {
        await fetchJson(
            `${homeserverBaseUrl.value}/_matrix/client/v3/user/${encodeURIComponent(sessionUserId.value + '')}/account_data/${type}`,
            {
                method: 'PUT',
                body: JSON.stringify(data),
                useAuthorization: true,
            },
        )
        const camelizedData = camelizeApiResponse(data)
        populateAccountDataByType(type, camelizedData)
    }

    async function toggleRoomVisibility(roomId: string, visible: boolean) {
        const eventContent: EventInvalidDiscortixHiddenRoomsContent = accountData.value['invalid.discortix.hidden_rooms'] ?? {}
        if (!eventContent.hiddenRooms) {
            eventContent.hiddenRooms = {}
        }
        if (visible) {
            delete eventContent.hiddenRooms[roomId]
        } else {
            eventContent.hiddenRooms[roomId] = {
                hiddenAt: Date.now(),
            }
        }
        populateAccountDataByType('invalid.discortix.hidden_rooms', eventContent)
        setAccountDataByType('invalid.discortix.hidden_rooms', snakeCaseApiRequest(eventContent))
    }

    async function addFriend(username: string): Promise<string> {
        let userId = username.replace(/^@/, '')
        if (!userId.includes(':')) {
            userId += ':' + defaultUserIdHomeserver.value
        }
        userId = '@' + userId

        const profile = await fetchJson<ApiV3ProfileResponse>(
            `${homeserverBaseUrl.value}/_matrix/client/v3/profile/${encodeURIComponent(userId)}`,
            {
                useAuthorization: true,
                jsonSchema: ApiV3ProfileResponseSchema,
            },
        )
        populateFromApiV3ProfileResponse(userId, profile)

        const eventContent: EventInvalidDiscortixFriendsContent = accountData.value['invalid.discortix.friends'] ?? { friends: [] }
        if (!eventContent.friends.includes(userId)) {
            eventContent.friends.push(userId)
            eventContent.friends.sort()
        }
        await setAccountDataByType('invalid.discortix.friends', snakeCaseApiRequest(eventContent))

        return userId
    }

    async function removeFriend(userId: string) {
        const eventContent: EventInvalidDiscortixFriendsContent = accountData.value['invalid.discortix.friends'] ?? { friends: [] }
        const friendIndex = eventContent.friends.indexOf(userId)
        eventContent.friends.splice(friendIndex, 1)
        await setAccountDataByType('invalid.discortix.friends', snakeCaseApiRequest(eventContent))
    }

    return {
        addFriend,
        removeFriend,
        getAccountDataByType,
        setAccountDataByType,
        toggleRoomVisibility,
    }
}