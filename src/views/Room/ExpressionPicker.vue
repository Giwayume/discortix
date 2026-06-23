<template>
    <div
        v-if="visible && !inline"
        ref="popoverOverlay"
        class="expression-picker-popover-overlay"
        :style="{ '--expression-picker-z-index': zIndex - 1 }"
        @click="onClickOverlay"
    />
    <div
        v-if="visible || inline"
        ref="popoverContainer"
        class="expression-picker"
        :class="{
            'expression-picker--mobile': isMobileView,
            'expression-picker--inline': inline,
        }"
        role="dialog"
        :aria-label="t('expressionPicker.title')"
        :style="{
            '--expression-picker-height': expressionPickerHeight,
            '--expression-picker-z-index': zIndex,
            ...(isMobileView || inline ? {} : floatingStyles),
        }"
    >
        <a ref="dialogFocusStartAnchor" tabindex="0" class="outline-0!" />
        <nav v-if="!props.emojiOnly" class="expression-picker__nav">
            <!-- <Button :label="t('expressionPicker.gifs')" severity="secondary" variant="text" size="small" :aria-pressed="selectedNav === 'gifs'" @click="selectedNav = 'gifs'" /> -->
            <Button :label="t('expressionPicker.stickers')" severity="secondary" variant="text" size="small" :aria-pressed="selectedNav === 'stickers'" @click="selectedNav = 'stickers'" />
            <Button :label="t('expressionPicker.emoji')" severity="secondary" variant="text" size="small" :aria-pressed="selectedNav === 'emoji'" @click="selectedNav = 'emoji'" />
        </nav>
        <div v-if="selectedNav === 'gifs'">TODO</div>
        <StickerPicker v-if="selectedNav === 'stickers'" @selectSticker="emit('selectSticker', $event)" />
        <EmojiPicker v-if="selectedNav === 'emoji'" :allowCustomEmoji="allowCustomEmoji" @selectEmoji="emit('selectEmoji', $event)" />
    </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import {
    useFloating,
    autoPlacement as floatingAutoPlacement,
    shift as floatingShift,
    limitShift as floatingLimitShift,
} from '@floating-ui/vue'

import { useApplication } from '@/composables/application'
import { onHistoryNavigation, useRouterHistory } from '@/composables/router-history'

import { useClientSettingsStore } from '@/stores/client-settings'

import EmojiPicker from '@/views/Room/EmojiPicker.vue'
import StickerPicker from '@/views/Room/StickerPicker.vue'

import Button from 'primevue/button'

import type { EmojiPickerEmojiItem } from '@/types'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const { isMobileView, viewportHeight } = useApplication()
const {
    pushRouteHashCategory,
    popRouteHashCategory,
    routeHashCategoryExists,
} = useRouterHistory()

const { settings } = useClientSettingsStore()

const props = defineProps({
    allowCustomEmoji: {
        type: Boolean,
        default: true,
    },
    emojiOnly: {
        type: Boolean,
        default: false,
    },
    inline: {
        type: Boolean,
        default: false,
    },
    zIndex: {
        type: Number,
        default: 20,
    },
})
watch(() => props.emojiOnly, (emojiOnly) => {
    if (emojiOnly) {
        selectedNav.value = 'emoji'
    }
})

const emit = defineEmits<{
    (e: 'selectEmoji', emoji: EmojiPickerEmojiItem): void
    (e: 'selectSticker', sticker: EmojiPickerEmojiItem): void
    (e: 'hidden'): void
}>()

const visible = ref<boolean>(false)
watch(() => visible.value, (visible, wasVisible) => {
    if (visible && !wasVisible) {
        if (!props.inline && !routeHashCategoryExists(route, 'expression-picker')) {
            pushRouteHashCategory(router, 'expression-picker')
        }
    } else if (!visible && wasVisible) {
        emit('hidden')
        if (!props.inline && routeHashCategoryExists(route, 'expression-picker')) {
            popRouteHashCategory(router, 'expression-picker')
        }
    }
})

const selectedNav = ref<'gifs' | 'stickers' | 'emoji'>('emoji')

const targetElement = ref<HTMLElement>()
const popoverContainer = ref<HTMLDivElement>()
const popoverOverlay = ref<HTMLDivElement>()
const dialogFocusStartAnchor = ref<HTMLAnchorElement>()
const expressionPickerHeight = ref<string>()
let lastShownTime: number = 0

const { floatingStyles, update: updateFloatingPosition } = useFloating(
    targetElement, popoverContainer, {
        transform: false,
        middleware: [
            floatingAutoPlacement({
                alignment: 'end',
                allowedPlacements: ['top-end', 'bottom-end', 'top-start', 'bottom-start'],
            }),
            floatingShift({
                limiter: floatingLimitShift({
                    offset: 32,
                })
            }),
        ]
    }
)

function onKeydownDocument(event: KeyboardEvent) {
    if (visible.value && event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        visible.value = false
    }
}

onMounted(() => {
    document.addEventListener('keydown', onKeydownDocument, true)
})

onUnmounted(() => {
    document.removeEventListener('keydown', onKeydownDocument, true)
})

function onClickOverlay(event: MouseEvent) {
    if (window.performance.now() - lastShownTime > settings.pointerClickTimeout) {
        let passthroughFocusTarget: HTMLElement | null = null
        if (popoverOverlay.value) {
            popoverOverlay.value.style.display = 'none'
            const target = document.elementFromPoint(event.pageX, event.pageY)
            popoverOverlay.value.style.display = ''
            if (target?.tagName === 'TEXTAREA' || target?.tagName === 'INPUT') {
                passthroughFocusTarget = target as HTMLElement
            }
        }
        hide()
        if (passthroughFocusTarget) {
            requestAnimationFrame(() => {
                passthroughFocusTarget.focus()
            })
        }
    }
}

function hide() {
    visible.value = false
}

function show(event: Event) {
    lastShownTime = window.performance.now()
    if (event.target) {
        targetElement.value = event.target as HTMLElement
    }
    expressionPickerHeight.value = (viewportHeight.value / 2) + 'px'
    visible.value = true
    nextTick(() => {
        updateFloatingPosition()
        dialogFocusStartAnchor.value?.focus()
    })
}

function toggle(event: Event) {
    if (visible.value) {
        hide()
    } else {
        show(event)
    }
}

onHistoryNavigation((to, from, info) => {
    if (props.inline) return
    if (info.source === 'browser') {
        if (routeHashCategoryExists(to, 'expression-picker')) {
            show(new Event('click'))
        } else {
            hide()
        }
    }
})

defineExpose({
    show,
    hide,
    toggle,
})

</script>

<style lang="scss" scoped>
.expression-picker-popover-overlay {
    --expression-picker-z-index: 19;

    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: var(--expression-picker-z-index, 19);
}
@keyframes expression-picker-show-mobile {
    0% {
        height: 0;
    }
    100% {
        height: var(--expression-picker-height, 50dvh);
    }
}
.expression-picker {
    --expression-picker-z-index: 20;
    --expression-picker-height: 50dvh;

    display: flex;
    flex-direction: column;
    position: absolute;
    top: 0;
    left: 0;
    height: var(--expression-picker-height, 50dvh);
    max-height: var(--expression-picker-height, 50dvh);
    width: calc(100dvw - 2rem);
    max-width: 31rem;
    background-color: var(--background-surface-high);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-high);
    padding: 1rem 0 0 0;
    overflow: hidden;
    z-index: var(--expression-picker-z-index, 20);

    &.expression-picker--mobile {
        position: relative;
        width: 100%;
        max-width: none;
        height: 0;
        animation: expression-picker-show-mobile 0.3s forwards;
    }

    &.expression-picker--inline {
        position: relative;
        width: 100%;
        max-width: none;
        height: 0;
        border: none;
        border-top-left-radius: 0;
        border-top-right-radius: 0;
        height: var(--expression-picker-height, 50dvh);
    }
}
.expression-picker__nav {
    display: flex;
    gap: 0.5rem;
    padding: 0 1rem 1rem 1rem;
}
</style>