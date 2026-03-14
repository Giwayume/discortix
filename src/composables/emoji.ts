import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

import { useAccountDataStore } from '@/stores/account-data'
import { useRoomStore } from '@/stores/room'
import { useSpaceStore } from '@/stores/space'

import {
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
    const { currentTopLevelSpace, currentTopLevelSpaceName } = storeToRefs(useSpaceStore())

    const currentRoomCustomEmoji = computed<EmojiPickerCategory[]>(() => {
        const emojiCategories: EmojiPickerCategory[] = []

        const userEmoji: EventImPoniesUserEmotesContent = accountData.value['im.ponies.user_emotes']
        if (userEmoji?.images) {
            const category: EmojiPickerCategory = {
                id: 'yourEmoji',
                category: t('emojiPicker.yourEmoji'),
                emoji: [],
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
        const roomEmoji: EventImPoniesRoomEmotesContent | undefined = currentRoom?.stateEventsByType['im.ponies.room_emotes']?.[0]?.content
        if (roomEmoji?.images && currentRoomId !== currentTopLevelSpace.value?.roomId) {
            const category: EmojiPickerCategory = {
                id: 'roomEmoji',
                category: currentRoom?.stateEventsByType['m.room.name']?.[0]?.content.name ?? t('emojiPicker.roomEmoji'),
                emoji: [],
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

        const spaceEmoji: EventImPoniesRoomEmotesContent | undefined = currentTopLevelSpace.value?.stateEventsByType['im.ponies.room_emotes']?.[0]?.content
        if (spaceEmoji?.images) {
            const category: EmojiPickerCategory = {
                id: 'spaceEmoji',
                category: currentTopLevelSpaceName.value ?? t('emojiPicker.spaceEmoji'),
                emoji: [],
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