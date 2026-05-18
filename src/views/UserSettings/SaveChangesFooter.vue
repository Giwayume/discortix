<template>
    <div v-if="visible" class="absolute left-0 bottom-0 right-0 p-4">
        <div class="flex items-center justify-between mx-auto max-w-174 p-[0.625rem] pl-4 bg-(--background-surface-highest) border-1 border-(--border-subtle) rounded-(--radius-sm) shadow-(--legacy-elevation-high)">
            <span class="font-medium">{{ t('userSettings.youHaveUnsavedChanges') }}</span>
            <div class="flex items-center gap-4">
                <span
                    class="link text-sm"
                    tabindex="0"
                    role="button"
                    @keydown.enter="emit('reset')"
                    @click="emit('reset')"
                >{{ t('userSettings.resetLink') }}</span>
                <Button
                    severity="success"
                    size="small"
                    :label="t('userSettings.saveChangesButton')"
                    @click="emit('save')"
                />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import Button from 'primevue/button'

const { t } = useI18n()

const props = defineProps({
    visible: {
        type: Boolean,
        default: false,
    },
})

const emit = defineEmits<{
    (e: 'reset'): void;
    (e: 'save'): void;
}>()

</script>