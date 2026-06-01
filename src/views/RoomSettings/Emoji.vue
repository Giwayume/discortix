<template>
    <h2 class="text-strong text-xl">
        {{ t('roomSettings.menu.emoji') }}
    </h2>
    <p class="text-sm mt-2">
        {{ t(isSpace ? 'roomSettings.emoji.summary.space' : 'roomSettings.emoji.summary.room') }}
    </p>

    <div class="border-t border-(--border-subtle) my-10" />

    <h3 class="text-strong text-lg">
        {{ t('roomSettings.emoji.imagePacksHeading') }}
    </h3>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia';

import { useSpaceStore } from '@/stores/space';

const { t } = useI18n()

const { currentTopLevelSpaceId } = storeToRefs(useSpaceStore())

const props = defineProps({
    roomId: {
        type: String,
        default: undefined,
    }
})

const isSpace = computed(() => {
    return currentTopLevelSpaceId.value === props.roomId
})
</script>