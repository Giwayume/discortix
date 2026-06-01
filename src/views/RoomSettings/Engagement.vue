<template>
    <h2 class="text-strong text-xl">
        {{ t('roomSettings.menu.engagement') }}
    </h2>
    <p class="text-sm mt-2">
        {{ t('roomSettings.engagement.summary') }}
    </p>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps({
    roomId: {
        type: String,
        default: undefined,
    }
})
</script>