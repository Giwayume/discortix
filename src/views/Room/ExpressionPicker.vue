<template>
    <div class="expression-picker">
        <nav class="expression-picker__nav">
            <Button :label="t('expressionPicker.gifs')" severity="secondary" variant="text" size="small" :aria-pressed="selectedNav === 'gifs'" @click="selectedNav = 'gifs'" />
            <Button :label="t('expressionPicker.stickers')" severity="secondary" variant="text" size="small" :aria-pressed="selectedNav === 'stickers'" @click="selectedNav = 'stickers'" />
            <Button :label="t('expressionPicker.emoji')" severity="secondary" variant="text" size="small" :aria-pressed="selectedNav === 'emoji'" @click="selectedNav = 'emoji'" />
        </nav>
        <div v-if="selectedNav === 'gifs'">TODO</div>
        <div v-if="selectedNav === 'stickers'">TODO</div>
        <EmojiPicker v-if="selectedNav === 'emoji'" />
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import EmojiPicker from '@/views/Room/EmojiPicker.vue'

import Button from 'primevue/button'

const { t } = useI18n()

const selectedNav = ref('emoji')

</script>

<style lang="scss" scoped>
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
    z-index: 10;
}
.expression-picker__nav {
    display: flex;
    gap: 0.5rem;
    padding: 0 1rem 1rem 1rem;
}
</style>