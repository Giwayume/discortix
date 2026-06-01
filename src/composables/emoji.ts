import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

import { useAccountDataStore } from '@/stores/account-data'
import { useRoomStore } from '@/stores/room'
import { useSpaceStore } from '@/stores/space'

import {
    type EventRoomImagePackContent,
    type EventImagePackRoomsContent,
    type EventImPoniesUserEmotesContent,
    type EventImPoniesRoomEmotesContent,
    type EmojiPickerCategory,
    type EmojiPickerEmojiItem,
} from '@/types'

export function useEmoji() {
    const route = useRoute()
    const { t } = useI18n()
    const { accountData } = storeToRefs(useAccountDataStore())
    const { joined: joinedRooms } = storeToRefs(useRoomStore())
    const { currentTopLevelSpace, currentTopLevelSpaceId, currentTopLevelSpaceName } = storeToRefs(useSpaceStore())

    const currentRoomCustomEmoji = computed<EmojiPickerCategory[]>(() => {
        const emojiCategories: EmojiPickerCategory[] = []

        const includedEmojiPackIds = new Set<string>()

        // Emoji uploaded to user's profile
        const userEmoji: EventImPoniesUserEmotesContent | undefined = accountData.value['im.ponies.user_emotes']
        if (userEmoji?.images) {
            const category: EmojiPickerCategory = {
                id: 'yourEmoji',
                category: t('emojiPicker.yourEmoji'),
                emoji: [],
                hidden: false,
            }
            for (const key of Object.keys(userEmoji.images)) {
                const emojiKey = `:${key}:`
                category.emoji.push({
                    emoji: emojiKey,
                    description: key,
                    codes: [emojiKey],
                    image: userEmoji.images[key],
                })
            }
            emojiCategories.push(category)
        }

        const currentRoomId = route.name === 'room' ? `${route.params?.roomId}` : ''
        const currentRoom = joinedRooms.value[currentRoomId]

        // Fluffy chat room emoji packs
        for (const fluffyChatRoomEmotes of currentRoom?.stateEventsByType['im.ponies.room_emotes'] ?? []) {
            const stateKey = fluffyChatRoomEmotes.stateKey
            const roomEmoji: EventImPoniesRoomEmotesContent | undefined = fluffyChatRoomEmotes?.content
            if (roomEmoji?.images && currentRoomId !== currentTopLevelSpace.value?.roomId) {
                includedEmojiPackIds.add(`${currentRoomId}|im.ponies.room_emotes|${stateKey}`)
                const category: EmojiPickerCategory = {
                    id: `roomEmoji|${currentRoomId}|im.ponies.room_emotes|${stateKey}`,
                    category: roomEmoji?.pack?.displayName ?? currentRoom?.stateEventsByType['m.room.name']?.[0]?.content.name ?? t('emojiPicker.roomEmoji'),
                    emoji: [],
                    hidden: false,
                }
                for (const key of Object.keys(roomEmoji.images)) {
                    const emojiKey = `:${key}:`
                    category.emoji.push({
                        emoji: emojiKey,
                        description: key,
                        codes: [emojiKey],
                        image: roomEmoji.images[key],
                    })
                }
                emojiCategories.push(category)
            }
        }

        // Matrix room image packs
        for (const roomImagePack of currentRoom?.stateEventsByType['m.room.image_pack'] ?? []) {
            const stateKey = roomImagePack.stateKey
            const roomEmoji: EventRoomImagePackContent | undefined = roomImagePack?.content
            if (roomEmoji?.images && currentRoomId !== currentTopLevelSpace.value?.roomId) {
                includedEmojiPackIds.add(`${currentRoomId}|m.room.image_pack|${stateKey}`)
                const category: EmojiPickerCategory = {
                    id: `roomEmoji|${currentRoomId}|m.room.image_pack|${stateKey}`,
                    category: roomEmoji?.pack?.displayName ?? currentRoom?.stateEventsByType['m.room.name']?.[0]?.content.name ?? t('emojiPicker.roomEmoji'),
                    emoji: [],
                    hidden: false,
                }
                for (const key of Object.keys(roomEmoji.images)) {
                    const emojiKey = `:${key}:`
                    category.emoji.push({
                        emoji: emojiKey,
                        description: key,
                        codes: [emojiKey],
                        image: roomEmoji.images[key],
                    })
                }
                emojiCategories.push(category)
            }
        }

        // Fluffy Chat space emoji packs
        for (const fluffyChatSpaceEmotes of currentTopLevelSpace.value?.stateEventsByType['im.ponies.room_emotes'] ?? []) {
            const stateKey = fluffyChatSpaceEmotes.stateKey
            const spaceEmoji: EventImPoniesRoomEmotesContent | undefined = fluffyChatSpaceEmotes?.content
            if (spaceEmoji?.images) {
                includedEmojiPackIds.add(`${currentTopLevelSpaceId.value}|im.ponies.room_emotes|${stateKey}`)
                const category: EmojiPickerCategory = {
                    id: `spaceEmoji|${currentTopLevelSpaceId.value}|im.ponies.room_emotes|${stateKey}`,
                    category: spaceEmoji?.pack?.displayName ?? currentTopLevelSpaceName.value ?? t('emojiPicker.spaceEmoji'),
                    emoji: [],
                    hidden: false,
                }
                for (const key of Object.keys(spaceEmoji.images)) {
                    const emojiKey = `:${key}:`
                    category.emoji.push({
                        emoji: emojiKey,
                        description: key,
                        codes: [emojiKey],
                        image: spaceEmoji.images[key],
                    })
                }
                emojiCategories.push(category)
            }
        }

        // Matrix space image packs
        for (const spaceImagePack of currentTopLevelSpace.value?.stateEventsByType['m.room.image_pack'] ?? []) {
            const stateKey = spaceImagePack.stateKey
            const spaceEmoji: EventRoomImagePackContent | undefined = spaceImagePack?.content
            if (spaceEmoji?.images) {
                includedEmojiPackIds.add(`${currentTopLevelSpaceId.value}|m.room.image_pack|${stateKey}`)
                const category: EmojiPickerCategory = {
                    id: `spaceEmoji|${currentTopLevelSpaceId.value}|m.room.image_pack|${stateKey}`,
                    category: spaceEmoji?.pack?.displayName ?? currentTopLevelSpaceName.value ?? t('emojiPicker.spaceEmoji'),
                    emoji: [],
                    hidden: false,
                }
                for (const key of Object.keys(spaceEmoji.images)) {
                    const emojiKey = `:${key}:`
                    category.emoji.push({
                        emoji: emojiKey,
                        description: key,
                        codes: [emojiKey],
                        image: spaceEmoji.images[key],
                    })
                }
                emojiCategories.push(category)
            }
        }

        // Global image packs
        const imagePackRooms: EventImagePackRoomsContent | undefined = accountData.value['m.image_pack.rooms']
        if (imagePackRooms) {
            for (const roomId in imagePackRooms.rooms) {
                const roomImagePacks = imagePackRooms.rooms[roomId]
                if (!roomImagePacks) continue
                for (const stateKey in roomImagePacks) {
                    if (includedEmojiPackIds.has(`${roomId}|m.room.image_pack|${stateKey}`)) continue
                    const room = joinedRooms.value[roomId]
                    if (!room) continue
                    const roomImagePack = room.stateEventsByType['m.room.image_pack']?.find((event) => event.stateKey === stateKey)
                    const roomEmoji: EventRoomImagePackContent | undefined = roomImagePack?.content
                    if (roomEmoji?.images && currentRoomId !== currentTopLevelSpace.value?.roomId) {
                        includedEmojiPackIds.add(`${currentRoomId}|m.room.image_pack|${stateKey}`)
                        const category: EmojiPickerCategory = {
                            id: `roomEmoji|${currentRoomId}|m.room.image_pack|${stateKey}`,
                            category: roomEmoji?.pack?.displayName ?? currentRoom?.stateEventsByType['m.room.name']?.[0]?.content.name ?? t('emojiPicker.roomEmoji'),
                            emoji: [],
                            hidden: false,
                        }
                        for (const key of Object.keys(roomEmoji.images)) {
                            const emojiKey = `:${key}:`
                            category.emoji.push({
                                emoji: emojiKey,
                                description: key,
                                codes: [emojiKey],
                                image: roomEmoji.images[key],
                            })
                        }
                        emojiCategories.push(category)
                    }
                }
            }
        }

        return emojiCategories
    })

    const currentRoomCustomEmojiByCode = computed<Record<string, EmojiPickerEmojiItem>>(() => {
        const emojiByCode: Record<string, EmojiPickerEmojiItem> = {}
        for (let categoryIndex = currentRoomCustomEmoji.value.length - 1; categoryIndex >= 0; categoryIndex--) {
            const category = currentRoomCustomEmoji.value[categoryIndex]
            if (!category) continue
            for (const emoji of category.emoji) {
                for (const code of emoji.codes) {
                    emojiByCode[code] = emoji
                }
            }
        }
        return emojiByCode
    })

    return {
        currentRoomCustomEmoji,
        currentRoomCustomEmojiByCode,
    }
}