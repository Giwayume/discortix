<template>
    <div class="emoji-picker">
        <header class="emoji-picker__header">
            <IconField class="grow-1">
                <InputIcon class="pi pi-search" />
                <InputText v-model.trim="searchText" class="w-full" :placeholder="selectedEmoji?.codes[0]" @input="onInputSearch" />
                <Button
                    v-if="searchText" icon="pi pi-times-circle" class="!absolute right-1 top-[50%] -translate-y-[50%]"
                    rounded severity="secondary" variant="text" :aria-label="t('emojiPicker.clearSearchButton')"
                    @click="clearSearchText()"
                />
            </IconField>
            <Button :label="t('emojiPicker.addEmojiButton')" severity="secondary" class="shrink-0" />
        </header>
        <div class="emoji-picker__body">
            <div class="emoji-picker__categories">
                <ScrollPanel>
                    <div class="emoji-picker__category-items">
                        <template v-for="category of defaultEmojiCategories" :key="category.id">
                            <Button :icon="getCategoryIcon(category.id)" severity="secondary" variant="text" @click="scrollToCategory(category.id)" />
                        </template>
                    </div>
                </ScrollPanel>
            </div>
            <div
                class="emoji-picker__emojis"
                @mouseover="onMouseoverEmojis"
                @pointerdown="onPointerDownEmojis"
                @pointerup="onPointerUpEmojis"
            >
                <ScrollPanel>
                    <div ref="emojiContainer" class="relative">
                        <template v-for="(category, categoryIndex) of emojiCategories" :key="category.id">
                            <a :data-category-header-id="category.id" />
                            <div class="emoji-picker__category-header" :hidden="searchText !== ''">
                                <Button severity="secondary" variant="text" size="small" @click="category.hidden = !category.hidden">
                                    <div class="p-button-label">
                                        <span :class="getCategoryIcon(category.id)" aria-hidden="true" />
                                        {{ category.category }}
                                        <span class="pi" :class="{ 'pi-chevron-down': !category.hidden, 'pi-chevron-up': category.hidden }" aria-hidden="true" />
                                    </div>
                                </Button>
                            </div>
                            <div class="emoji-picker__emoji-list" :hidden="category.hidden">
                                <div
                                    v-for="(emoji, emojiIndex) of category.emoji"
                                    :key="emoji.emoji"
                                    class="emoji-picker__emoji-item"
                                    :data-category-index="categoryIndex"
                                    :data-emoji-index="emojiIndex"
                                    :hidden="emoji.hidden"
                                    role="button"
                                    tabindex="0"
                                >
                                    {{ emoji.emoji }}
                                </div>
                            </div>
                        </template>
                    </div>
                </ScrollPanel>
                <div class="emoji-picker__emoji-code">
                    <div class="emoji-picker__selected-emoji-preview">{{ selectedEmoji?.emoji }}</div>
                    <span v-for="code of selectedEmoji?.codes" class="mr-1">
                        {{ code }}
                    </span>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import defaultEmojiCategories from '@/i18n/default-emoji/default-emoji.en.json'

import { throttle } from '@/utils/timing'

import { useClientSettingsStore } from '@/stores/client-settings'

import Button from 'primevue/button'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import InputText from 'primevue/inputtext'
import ScrollPanel from 'primevue/scrollpanel'

import { type EmojiPickerCategory, type EmojiPickerEmojiItem } from '@/types'

const { t } = useI18n()
const { settings } = useClientSettingsStore()

const emit = defineEmits<{
    (e: 'selectEmoji', emoji: EmojiPickerEmojiItem): void
}>()

const emojiCategories = computed<EmojiPickerCategory[]>(() => {
    return reactive(defaultEmojiCategories)
})

const emojiContainer = ref<HTMLDivElement>()
const selectedEmoji = ref<EmojiPickerEmojiItem | undefined>(emojiCategories.value[0]?.emoji[0])
const searchText = ref<string>('')

function getCategoryIcon(categoryId: string) {
    switch (categoryId) {
        case 'people': return 'pi pi-face-smile'
        case 'nature': return 'pi pi-sun'
        case 'food': return 'pi pi-shopping-cart'
        case 'travel': return 'pi pi-truck'
        case 'activities': return 'pi pi-headphones'
        case 'objects': return 'pi pi-box'
        case 'symbols': return 'pi pi-heart'
        case 'flags': return 'pi pi-flag'

    }
}

function onMouseoverEmojis(event: MouseEvent) {
    if (!event.target) return
    const hoverItem = (event.target as HTMLElement).closest<HTMLElement>('[data-category-index]')
    if (!hoverItem) return
    const categoryIndex = parseInt(hoverItem.getAttribute('data-category-index') ?? '0')
    const emojiIndex = parseInt(hoverItem.getAttribute('data-emoji-index') ?? '0')
    selectedEmoji.value = emojiCategories.value[categoryIndex]?.emoji[emojiIndex]
}

let pointerDownEmojisTarget: HTMLElement | null
let pointerDownEmojisItemX: number = 0
let pointerDownEmojisItemY: number = 0
let pointerDownEmojisTimestamp: number = 0

function onPointerDownEmojis(event: PointerEvent) {
    if (event.button === 0) {
        pointerDownEmojisTarget = event.target as HTMLElement
        pointerDownEmojisItemX = event.pageX
        pointerDownEmojisItemY = event.pageY
        pointerDownEmojisTimestamp = window.performance.now()
    }
}

function onPointerUpEmojis(event: PointerEvent) {
    // "Click" / "Tap" simulation. Need to do this because of the Safari "double tap with hover states" issue.
    if (
        event.button === 0
        && event.target && event.target === pointerDownEmojisTarget
        && window.performance.now() - pointerDownEmojisTimestamp <= settings.pointerClickTimeout
        && Math.abs(event.pageX - pointerDownEmojisItemX) < settings.pointerMoveRadius
        && Math.abs(event.pageY - pointerDownEmojisItemY) < settings.pointerMoveRadius
    ) {
        const emojiItem = (event.target as HTMLElement).closest<HTMLElement>('[data-category-index]')
        if (!emojiItem) return
        const categoryIndex = parseInt(emojiItem.getAttribute('data-category-index') ?? '0')
        const emojiIndex = parseInt(emojiItem.getAttribute('data-emoji-index') ?? '0')
        const emoji = emojiCategories.value[categoryIndex]?.emoji[emojiIndex]
        if (emoji) {
            emit('selectEmoji', emoji)
        }
    }
}

function clearSearchText() {
    if (searchText.value !== '') {
        searchText.value = ''
        for (const category of emojiCategories.value) {
            for (const emoji of category.emoji) {
                emoji.hidden = false
            }
        }
    }
}

async function scrollToCategory(categoryId: string) {
    clearSearchText()
    await nextTick()

    if (!emojiContainer.value) return
    const categoryHeader = emojiContainer.value.querySelector<HTMLElement>(`[data-category-header-id="${categoryId}"]`)
    if (!categoryHeader) return
    const scrollPanelContent = categoryHeader.closest<HTMLElement>('.p-scrollpanel-content')
    if (!scrollPanelContent) return
    scrollPanelContent.scrollTop = categoryHeader.offsetTop
}

const onInputSearch = throttle(() => {
    const searchTerms = searchText.value.toLowerCase().split(' ')
    let allSearchTermsFound = false
    let termFoundInCodesOrDescription = false
    let foundFirstVisibleEmoji = false
    for (const category of emojiCategories.value) {
        for (const emoji of category.emoji) {
            allSearchTermsFound = true
            for (const searchTerm of searchTerms) {
                termFoundInCodesOrDescription = false
                for (const code of emoji.codes) {
                    if (code.includes(searchTerm)) {
                        termFoundInCodesOrDescription = true
                        break
                    }
                }
                if (!termFoundInCodesOrDescription && emoji.description.includes(searchTerm)) {
                    termFoundInCodesOrDescription = true
                }
                if (!termFoundInCodesOrDescription) {
                    allSearchTermsFound = false
                    break
                }    
            }
            emoji.hidden = !allSearchTermsFound
            if (!emoji.hidden && !foundFirstVisibleEmoji) {
                foundFirstVisibleEmoji = true
                selectedEmoji.value = emoji
            }
        }
    }
}, 250)

</script>

<style lang="scss" scoped>
.emoji-picker {
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
}

.emoji-picker__header {
    display: flex;
    gap: 1rem;
    padding: 0 1rem 0.75rem 1rem;
    border-bottom: 1px solid var(--border-subtle);
}
.emoji-picker__body {
    display: flex;
    flex-grow: 1;
    flex-shrink: 1;
    overflow: hidden;
}
.emoji-picker__categories {
    width: 3rem;
    flex-shrink: 0;
    background-color: var(--background-base-lower);
}
.emoji-picker__category-items {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.5rem 0;
    gap: 0.25rem;
    width: 100%;

    .p-button {
        padding: 0.25rem;
        width: 2rem;
        height: 2rem;
        --p-icon-size: 1.25rem;
    }
}
.emoji-picker__emojis {
    display: flex;
    flex-direction: column;
    flex-grow: 1;
    min-width: 0;

    > .p-scrollpanel {
        flex-grow: 1;
        overflow: hidden;
    }

    > .emoji-picker__emoji-code {
        display: flex;
        align-items: center;
        flex-shrink: 0;
        height: 3rem;
        background-color: var(--background-base-lower);
        border-top: 1px solid var(--border-normal);
        padding: 0 1rem;
        font-weight: 600;
        line-height: 1.25;
        overflow: hidden;
        white-space: nowrap;

        > .emoji-picker__selected-emoji-preview {
            display: inline-block;
            font-size: 1.5rem;
            width: 1.75rem;
            height: 1.75rem;
            margin-right: 0.5rem;
        }
    }
}
.emoji-picker__category-header {
    display: flex;
    align-items: center;
    background-color: var(--background-surface-high);
    height: 2rem;
    padding: 0 0.25rem 0 0.5rem;
    position: sticky;
    top: 0;
    width: 100%;

    .p-button {
        --p-button-font-size: 0.875rem;
        --p-button-sm-padding-x: 0;
        --p-button-sm-padding-y: 0;
        --p-button-text-secondary-color: var(--text-default);
        --p-button-text-secondary-hover-background: transparent;
        --p-icon-size: 0.875rem;

        :deep(.p-button-label) {
            display: flex;
            align-items: center;
            gap: 0.25rem;

            .pi.pi-chevron-down,
            .pi.pi-chevron-up {
                --p-icon-size: 0.625rem;
                margin-left: 0.25rem;
            }
        }
    }
}
.emoji-picker__emoji-list {
    display: flex;
    flex-wrap: wrap;
    padding: 0 0.25rem 0 0.5rem;
}
.emoji-picker__emoji-item {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 3rem;
    height: 3rem;
    padding: 0.25rem;
    border-radius: 0.25rem;
    font-size: 2rem;
    cursor: pointer;
    user-select: none;

    &:hover {
        background-color: var(--interactive-background-selected);
    }
}
</style>