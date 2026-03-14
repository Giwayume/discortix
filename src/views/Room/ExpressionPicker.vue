<template>
    <div v-if="visible" class="expression-picker-popover-overlay" @click="hide()" />
    <div v-if="visible" ref="popoverContainer" class="expression-picker" role="dialog" :aria-label="t('expressionPicker.title')" :style="floatingStyles">
        <a ref="dialogFocusStartAnchor" tabindex="0" />
        <nav v-if="!props.emojiOnly" class="expression-picker__nav">
            <Button :label="t('expressionPicker.gifs')" severity="secondary" variant="text" size="small" :aria-pressed="selectedNav === 'gifs'" @click="selectedNav = 'gifs'" />
            <Button :label="t('expressionPicker.stickers')" severity="secondary" variant="text" size="small" :aria-pressed="selectedNav === 'stickers'" @click="selectedNav = 'stickers'" />
            <Button :label="t('expressionPicker.emoji')" severity="secondary" variant="text" size="small" :aria-pressed="selectedNav === 'emoji'" @click="selectedNav = 'emoji'" />
        </nav>
        <div v-if="selectedNav === 'gifs'">TODO</div>
        <div v-if="selectedNav === 'stickers'">TODO</div>
        <EmojiPicker v-if="selectedNav === 'emoji'" @selectEmoji="emit('selectEmoji', $event)" />
    </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
    useFloating,
    autoPlacement as floatingAutoPlacement,
    shift as floatingShift,
    limitShift as floatingLimitShift,
} from '@floating-ui/vue'

import EmojiPicker from '@/views/Room/EmojiPicker.vue'

import Button from 'primevue/button'

import type { EmojiPickerEmojiItem } from '@/types'

const { t } = useI18n()

const props = defineProps({
    emojiOnly: {
        type: Boolean,
        default: false,
    }
})
watch(() => props.emojiOnly, (emojiOnly) => {
    if (emojiOnly) {
        selectedNav.value = 'emoji'
    }
})

const emit = defineEmits<{
    (e: 'selectEmoji', emoji: EmojiPickerEmojiItem): void
    (e: 'hidden'): void
}>()

const visible = ref<boolean>(false)
watch(() => visible.value, (visible) => {
    if (!visible) emit('hidden')
})

const selectedNav = ref<'gifs' | 'stickers' | 'emoji'>('emoji')

const targetElement = ref<HTMLElement>()
const popoverContainer = ref<HTMLDivElement>()
const dialogFocusStartAnchor = ref<HTMLAnchorElement>()

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

function hide() {
    visible.value = false
}

function show(event: Event) {
    if (!event.target) return
    targetElement.value = event.target as HTMLElement
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

defineExpose({
    show,
    hide,
    toggle,
})

</script>

<style lang="scss" scoped>
.expression-picker-popover-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 19;
}
.expression-picker {
    display: flex;
    flex-direction: column;
    position: absolute;
    top: 0;
    left: 0;
    height: 50dvh;
    width: calc(100dvw - 2rem);
    max-width: 31rem;
    background-color: var(--background-surface-high);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-high);
    padding: 1rem 0 0 0;
    overflow: hidden;
    z-index: 20;
}
.expression-picker__nav {
    display: flex;
    gap: 0.5rem;
    padding: 0 1rem 1rem 1rem;
}
</style>