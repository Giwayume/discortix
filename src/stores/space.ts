import { computed, ref, toRaw, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { defineStore, storeToRefs } from 'pinia'
import { createLogger } from '@/composables/logger'

import {
    saveTableKey as saveDiscortixTableKey,
    loadTableKey as loadDiscortixTableKey,
    getAllTableKeys as getAllDiscortixTableKeys,
} from '@/stores/database/discortix'

import { getRoomAvatarUrl, getRoomName, getTopLevelSpace } from '@/utils/room'
import { useRoomStore } from '@/stores/room'

import type {
    InvitedRoom, JoinedRoom, KnockedRoom, LeftRoom,
    SpaceSummary, SpaceClientSettings,
    RoomSummaryCategory, RoomSummary,
    ApiV1RoomHierarchyResponse,
} from '@/types'

const log = createLogger(import.meta.url)

export const useSpaceStore = defineStore('space', () => {
    const { t } = useI18n()
    const route = useRoute()
    const roomStore = useRoomStore()
    const { joined } = storeToRefs(roomStore)

    const spaceRoomSummaries = ref<Record<string, RoomSummary[]>>({})
    const spaceLoadingRoomSummaries = ref<Record<string, boolean>>({})

    const spaceClientSettingsLoading = ref<boolean>(true)
    const spaceClientSettings = ref<Record<string, SpaceClientSettings>>({})

    async function initialize() {
        try {
            const keys: string[][] = await getAllDiscortixTableKeys('clientSettings')
            let loadPromises: Promise<void>[] = []
            for (const key of keys) {
                const [settingType, roomId] = key
                if (settingType === 'space' && roomId != null) {
                    loadPromises.push(
                        loadDiscortixTableKey('clientSettings', key).then((value) => {
                            spaceClientSettings.value[roomId] = value
                        })
                    )
                }
            }
            await Promise.allSettled(loadPromises)
        } catch (error) {
            log.error('Error loading space client settings.', error)
        } finally {
            spaceClientSettingsLoading.value = false
        }
    }
    initialize()

    const currentTopLevelSpace = computed<JoinedRoom | InvitedRoom | KnockedRoom | LeftRoom | undefined>(() => {
        if (route.name !== 'room') return undefined
        const currentRoomId = `${route.params.roomId}`
        const currentRoom = joined.value[currentRoomId]
        if (!currentRoom) return undefined
        return getTopLevelSpace(currentRoom, roomStore)
    })

    const currentTopLevelSpaceId = computed<string | undefined>(() => {
        return currentTopLevelSpace.value?.roomId
    })
    watch(() => currentTopLevelSpaceId.value, (currentTopLevelSpaceId) => {
        if (!currentTopLevelSpaceId) return
        loadDiscortixTableKey('clientSettings', ['space', currentTopLevelSpaceId]).then((value) => {
            spaceClientSettings.value[currentTopLevelSpaceId] = value
        })
    })

    const currentTopLevelSpaceName = computed<string | undefined>(() => {
        if (!currentTopLevelSpace.value) return undefined
        return getRoomName(currentTopLevelSpace.value)
    })

    const currentTopLevelSpaceAvatarUrl = computed<string | undefined>(() => {
        if (!currentTopLevelSpace.value) return undefined
        return getRoomAvatarUrl(currentTopLevelSpace.value)
    })

    const joinedSpaces = computed<SpaceSummary[]>(() => {
        const joinedSpaces: SpaceSummary[] = []
        for (const roomId in joined.value) {
            const room = joined.value[roomId]
            if (!room) continue
            const roomAvatarEvent = room.stateEventsByType['m.room.avatar']?.[0]
            const roomCreateEvent = room.stateEventsByType['m.room.create']?.[0]
            const roomNameEvent = room.stateEventsByType['m.room.name']?.[0]
            if (roomCreateEvent?.content?.type !== 'm.space') continue
            const roomVersion = roomCreateEvent.content.roomVersion ?? '1'
            joinedSpaces.push({
                avatarUrl: roomAvatarEvent?.content?.info?.thumbnailUrl ?? roomAvatarEvent?.content?.url,
                creator: (
                    parseInt(roomVersion) >= 11
                        ? roomCreateEvent.sender
                        : roomCreateEvent.content.creator
                ) ?? '',
                name: roomNameEvent?.content.name ?? '',
                roomId,
                roomVersion,
            })
        }
        return joinedSpaces
    })

    const currentTopLevelSpaceRoomList = computed<RoomSummaryCategory[]>(() => {
        if (!currentTopLevelSpaceId.value) return []
        const roomSummaries = spaceRoomSummaries.value[currentTopLevelSpaceId.value]
        if (!roomSummaries) return []
        const categories: RoomSummaryCategory[] = []
        const encounteredCategoryNames = new Set<string>()
        for (const roomSummary of roomSummaries) {
            const categoryName = roomSummary.categoryName ?? ''
            if (!encounteredCategoryNames.has(categoryName)) {
                categories.push({
                    name: categoryName,
                    collapsed: currentTopLevelSpaceClientSettings.value?.collapsedCategoryNames.includes(categoryName),
                    rooms: [],
                })
                encounteredCategoryNames.add(categoryName)
            }
            const existingCategory = categories.find((category) => category.name === categoryName)
            if (!existingCategory) continue
            existingCategory.rooms.push(roomSummary)
        }
        return categories
    })

    const currentTopLevelSpaceClientSettings = computed<SpaceClientSettings | undefined>(() => {
        if (!currentTopLevelSpaceId.value) return
        return spaceClientSettings.value[currentTopLevelSpaceId.value]
    })

    function getSpaceClientSettings(roomId: string) {
        let clientSettings = spaceClientSettings.value[roomId]
        if (!clientSettings) {
            clientSettings = {
                collapsedCategoryNames: [],
            }
        }
        return clientSettings
    }

    function updateSpaceClientSettings(roomId: string, settings: SpaceClientSettings) {
        spaceClientSettings.value[roomId] = settings
        saveDiscortixTableKey('clientSettings', ['space', roomId], toRaw(settings))
    }

    function populateFromApiV1RoomHierarchyResponse(spaceRoomId: string, rooms: ApiV1RoomHierarchyResponse['rooms']) {
        const roomSummaries: RoomSummary[] = []
        for (const room of rooms) {
            if (room.roomId === spaceRoomId) continue
            const joinedRoom = joined.value[room.roomId]

            let creator = joinedRoom?.stateEventsByType['m.room.create']?.[0]?.sender
            let heroes = joinedRoom?.summary?.['m.heroes'] ?? []

            roomSummaries.push({
                avatarUrl: room.avatarUrl,
                creator,
                heroes,
                joinedMemberCount: room.numJoinedMembers,
                lastMessageTs: 0,
                membershipType: 'joined',
                name: (room.name ?? heroes.join(', ')) || t('layout.unnamedSpace'),
                roomId: room.roomId,
                roomVersion: room.roomVersion,
                tags: {},
            })
        }
        spaceRoomSummaries.value[spaceRoomId] = roomSummaries
    }

    return {
        loading: computed(() => spaceClientSettingsLoading.value),
        currentTopLevelSpace,
        currentTopLevelSpaceId,
        currentTopLevelSpaceName,
        currentTopLevelSpaceAvatarUrl,
        currentTopLevelSpaceClientSettings,
        currentTopLevelSpaceRoomList,
        joinedSpaces,
        spaceRoomSummaries: computed(() => spaceRoomSummaries.value),
        spaceLoadingRoomSummaries,
        spaceClientSettings: computed(() => spaceClientSettings.value),
        getSpaceClientSettings,
        updateSpaceClientSettings,
        populateFromApiV1RoomHierarchyResponse,
    }
})
