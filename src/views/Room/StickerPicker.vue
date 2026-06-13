<template>
    <div class="sticker-picker">
        <header class="sticker-picker__header">
            <IconField class="grow-1">
                <InputIcon class="pi pi-search" />
                <InputText v-model.trim="searchText" class="w-full" :placeholder="t('stickerPicker.searchPlaceholder')" @input="onInputSearch" />
                <Button
                    v-if="searchText" icon="pi pi-times-circle" class="!absolute right-1 top-[50%] -translate-y-[50%]"
                    rounded severity="secondary" variant="text" :aria-label="t('stickerPicker.clearSearchButton')"
                    @click="clearSearchText()"
                />
            </IconField>
        </header>
        <div class="sticker-picker__body">
            <div class="sticker-picker__categories">
                <ScrollPanel>
                    <div class="sticker-picker__category-items">
                        <template v-for="category of stickerCategories" :key="category.id">
                            <Button :icon="getCategoryIcon(category.id)" severity="secondary" variant="text" @click="scrollToCategory(category.id)" />
                        </template>
                    </div>
                </ScrollPanel>
            </div>
            <div
                class="sticker-picker__stickers"
                @mouseover="onMouseoverStickers"
                @pointerdown="onPointerDownStickers"
                @pointerup="onPointerUpStickers"
            >
                <ScrollPanel>
                    <div ref="stickerContainer" class="relative">
                        <div v-if="stickerCategories.length === 0" class="text-muted p-4">
                            {{ t('stickerPicker.noStickers') }}
                        </div>
                        <template v-for="(category, categoryIndex) of stickerCategories" :key="category.id">
                            <a :data-category-header-id="category.id" />
                            <div class="sticker-picker__category-header" :hidden="searchText !== ''">
                                <Button severity="secondary" variant="text" size="small" @click="toggleHiddenCategory(category.id)">
                                    <div class="p-button-label">
                                        <span :class="getCategoryIcon(category.id)" aria-hidden="true" />
                                        {{ category.category }}
                                        <span
                                            class="pi"
                                            :class="{
                                                'pi-chevron-down': !hiddenCategories[category.id],
                                                'pi-chevron-up': !!hiddenCategories[category.id]
                                            }"
                                            aria-hidden="true"
                                        />
                                    </div>
                                </Button>
                            </div>
                            <div class="sticker-picker__sticker-list" :hidden="!!hiddenCategories[category.id]">
                                <div
                                    v-for="(sticker, stickerIndex) of category.emoji"
                                    :key="sticker.emoji"
                                    class="sticker-picker__sticker-item"
                                    :data-category-index="categoryIndex"
                                    :data-sticker-index="stickerIndex"
                                    :hidden="!!hiddenStickers[categoryIndex]?.[stickerIndex]"
                                    role="button"
                                    tabindex="0"
                                >
                                    <AuthenticatedImage v-if="sticker.image" :mxcUri="sticker.image.url" type="thumbnail" :width="96" :height="96" method="scale">
                                        <template v-slot="{ src }">
                                            <img :src="src" :aria-label="sticker.description"  />
                                        </template>
                                        <template #error>
                                            
                                        </template>
                                    </AuthenticatedImage>
                                    <template v-else>
                                        {{ sticker.emoji }}
                                    </template>
                                </div>
                            </div>
                        </template>
                    </div>
                </ScrollPanel>
                <div class="sticker-picker__sticker-code">
                    <div class="sticker-picker__selected-sticker-preview">
                        <AuthenticatedImage v-if="selectedSticker?.image" :mxcUri="selectedSticker.image.url" type="thumbnail" :width="48" :height="48" method="scale">
                            <template v-slot="{ src }">
                                <img :src="src" :aria-label="selectedSticker.description"  />
                            </template>
                            <template #error>
                                
                            </template>
                        </AuthenticatedImage>
                        <template v-else>
                            {{ selectedSticker?.emoji }}
                        </template>
                    </div>
                    <span v-for="code of selectedSticker?.codes" class="mr-1">
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

import { throttle } from '@/utils/timing'

import { useEmoji } from '@/composables/emoji'

import { useClientSettingsStore } from '@/stores/client-settings'

import AuthenticatedImage from '@/views/Common/AuthenticatedImage.vue'

import Button from 'primevue/button'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import InputText from 'primevue/inputtext'
import ScrollPanel from 'primevue/scrollpanel'

import { type EmojiPickerCategory, type EmojiPickerEmojiItem } from '@/types'

const { t } = useI18n()
const { settings } = useClientSettingsStore()
const { currentRoomCustomStickers } = useEmoji()

const emit = defineEmits<{
    (e: 'selectSticker', emoji: EmojiPickerEmojiItem): void
}>()

const stickerCategories = computed<EmojiPickerCategory[]>(() => {
    const categories: EmojiPickerCategory[] = []
    for (const category of currentRoomCustomStickers.value) {
        categories.push(category)
    }
    return categories
})

const hiddenCategories = ref<Record<string, boolean>>({})
const hiddenStickers = ref<Record<string, Record<string, boolean>>>({})
const stickerContainer = ref<HTMLDivElement>()
const selectedSticker = ref<EmojiPickerEmojiItem | undefined>(stickerCategories.value[0]?.emoji[0])
const searchText = ref<string>('')

function getCategoryIcon(categoryId: string) {
    if (categoryId.startsWith('yourEmoji')) return 'pi pi-user'
    if (categoryId.startsWith('spaceEmoji')) return 'pi pi-home'
    if (categoryId.startsWith('roomEmoji')) return 'pi pi-home'
}

function onMouseoverStickers(event: MouseEvent) {
    if (!event.target) return
    const hoverItem = (event.target as HTMLElement).closest<HTMLElement>('[data-category-index]')
    if (!hoverItem) return
    const categoryIndex = parseInt(hoverItem.getAttribute('data-category-index') ?? '0')
    const stickerIndex = parseInt(hoverItem.getAttribute('data-sticker-index') ?? '0')
    selectedSticker.value = stickerCategories.value[categoryIndex]?.emoji[stickerIndex]
}

let pointerDownStickerTarget: HTMLElement | null
let pointerDownStickerItemX: number = 0
let pointerDownStickerItemY: number = 0
let pointerDownStickerTimestamp: number = 0

function onPointerDownStickers(event: PointerEvent) {
    if (event.button === 0) {
        pointerDownStickerTarget = event.target as HTMLElement
        pointerDownStickerItemX = event.pageX
        pointerDownStickerItemY = event.pageY
        pointerDownStickerTimestamp = window.performance.now()
    }
}

function onPointerUpStickers(event: PointerEvent) {
    // "Click" / "Tap" simulation. Need to do this because of the Safari "double tap with hover states" issue.
    if (
        event.button === 0
        && event.target && event.target === pointerDownStickerTarget
        && window.performance.now() - pointerDownStickerTimestamp <= settings.pointerClickTimeout
        && Math.abs(event.pageX - pointerDownStickerItemX) < settings.pointerMoveRadius
        && Math.abs(event.pageY - pointerDownStickerItemY) < settings.pointerMoveRadius
    ) {
        const stickerItem = (event.target as HTMLElement).closest<HTMLElement>('[data-category-index]')
        if (!stickerItem) return
        const categoryIndex = parseInt(stickerItem.getAttribute('data-category-index') ?? '0')
        const stickerIndex = parseInt(stickerItem.getAttribute('data-sticker-index') ?? '0')
        const sticker = stickerCategories.value[categoryIndex]?.emoji[stickerIndex]
        if (sticker) {
            emit('selectSticker', sticker)
        }
    }
}

function toggleHiddenCategory(categoryId: string) {
    if (hiddenCategories.value[categoryId]) {
        delete hiddenCategories.value[categoryId]
    } else {
        hiddenCategories.value[categoryId] = true
    }
}

function clearSearchText() {
    if (searchText.value !== '') {
        searchText.value = ''
        hiddenStickers.value = {}
    }
}

async function scrollToCategory(categoryId: string) {
    clearSearchText()
    await nextTick()

    if (!stickerContainer.value) return
    const categoryHeader = stickerContainer.value.querySelector<HTMLElement>(`[data-category-header-id="${categoryId}"]`)
    if (!categoryHeader) return
    const scrollPanelContent = categoryHeader.closest<HTMLElement>('.p-scrollpanel-content')
    if (!scrollPanelContent) return
    scrollPanelContent.scrollTop = categoryHeader.offsetTop
}

const onInputSearch = throttle(() => {
    const searchTerms = searchText.value.toLowerCase().split(' ')
    let allSearchTermsFound = false
    let termFoundInCodesOrDescription = false
    let foundFirstVisibleSticker = false
    for (const [categoryIndex, category] of stickerCategories.value.entries()) {
        if (!hiddenStickers.value[categoryIndex]) {
            hiddenStickers.value[categoryIndex] = {}
        }
        const hiddenCategory = hiddenStickers.value[categoryIndex]
        for (const [stickerIndex, sticker] of category.emoji.entries()) {
            allSearchTermsFound = true
            for (const searchTerm of searchTerms) {
                termFoundInCodesOrDescription = false
                for (const code of sticker.codes) {
                    if (code.toLowerCase().includes(searchTerm)) {
                        termFoundInCodesOrDescription = true
                        break
                    }
                }
                if (!termFoundInCodesOrDescription && sticker.description.includes(searchTerm)) {
                    termFoundInCodesOrDescription = true
                }
                if (!termFoundInCodesOrDescription) {
                    allSearchTermsFound = false
                    break
                }
            }
            const isHidden = !allSearchTermsFound
            if (isHidden) {
                hiddenCategory[stickerIndex] = true
            } else {
                hiddenCategory[stickerIndex] = false
            }
            if (!isHidden && !foundFirstVisibleSticker) {
                foundFirstVisibleSticker = true
                selectedSticker.value = sticker
            }
        }
    }
}, 250, { trailing: true })

</script>

<style lang="scss" scoped>
.sticker-picker {
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
}

.sticker-picker__header {
    display: flex;
    gap: 1rem;
    padding: 0 1rem 0.75rem 1rem;
    border-bottom: 1px solid var(--border-subtle);
}
.sticker-picker__body {
    display: flex;
    flex-grow: 1;
    flex-shrink: 1;
    overflow: hidden;
}
.sticker-picker__categories {
    width: 3rem;
    flex-shrink: 0;
    background-color: var(--background-base-lower);

    .p-scrollpanel {
        height: 100%;
    }
}
.sticker-picker__category-items {
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
.sticker-picker__stickers {
    display: flex;
    flex-direction: column;
    flex-grow: 1;
    min-width: 0;

    > .p-scrollpanel {
        flex-grow: 1;
        overflow: hidden;
    }

    > .sticker-picker__sticker-code {
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

        > .sticker-picker__selected-sticker-preview {
            display: inline-block;
            font-size: 1.5rem;
            width: 1.75rem;
            height: 1.75rem;
            margin-right: 0.5rem;

            img {
                text-indent: -9999px;
                width: 1.75rem;
                height: 1.75rem;
                object-fit: contain;
            }
        }
    }
}
.sticker-picker__category-header {
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
.sticker-picker__sticker-list {
    display: flex;
    flex-wrap: wrap;
    padding: 0 0.25rem 0 0.5rem;
    gap: 0.5rem;
}
.sticker-picker__sticker-item {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 6rem;
    height: 6rem;
    padding: 0.25rem;
    border-radius: 0.25rem;
    font-size: 2rem;
    cursor: pointer;
    user-select: none;
    overflow: hidden;

    &:hover {
        background-color: var(--interactive-background-selected);
        border-radius: 1rem;

        img {
            border-radius: 1.125rem;
        }
    }

    img {
        display: block;
        overflow: hidden;
        text-indent: -9999px;
        width: 6rem;
        height: 6rem;
        object-fit: contain;
    }
}
</style>