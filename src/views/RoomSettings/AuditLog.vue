<template>
    <h2 class="text-strong text-xl">
        {{ t('roomSettings.menu.auditLog') }}
    </h2>
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