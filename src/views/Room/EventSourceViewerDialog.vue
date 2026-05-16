<template>
    <Dialog
        :visible="props.visible"
        modal
        :draggable="false"
        :style="{
            width: 'calc(100% - 1rem)',
            maxWidth: '40rem',
        }"
        @update:visible="emit('update:visible', $event)"
    >
        <template #header>
            <div class="flex flex-col">
                <div class="p-dialog-title">{{ t('eventSourceViewerDialog.title') }}</div>
            </div>
        </template>
        <pre v-if="source" class="p-4 bg-(--background-mod-subtle) overflow-auto">{{ source }}</pre>
        <template v-else>{{ t('eventSourceViewerDialog.sourceMissing') }}</template>
        <template #footer>
            <Button :label="t('eventSourceViewerDialog.doneButton')" severity="secondary" @click="emit('update:visible', false)" autofocus />
        </template>
    </Dialog>
</template>

<script setup lang="ts">
import { computed, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'

import Button from 'primevue/button'
import Dialog from 'primevue/dialog'

import {
    type EventWithRenderInfo,
} from '@/types'

const { t } = useI18n()

const props = defineProps({
    visible: {
        type: Boolean,
        default: false,
    },
    eventRenderInfo: {
        type: Object as PropType<EventWithRenderInfo>,
        default: undefined,
    },
})

const emit = defineEmits<{
    (e: 'update:visible', visible: boolean): void
    (e: 'deleteConfirmed'): void
}>()

const source = computed(() => {
    return props.eventRenderInfo?.event ? JSON.stringify(props.eventRenderInfo?.event, null, '    ') : null
})
</script>

<style scoped lang="scss">
pre {
    max-height: calc(100dvh - 13rem);
}
</style>