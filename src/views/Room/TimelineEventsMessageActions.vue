<template>
    <div
        v-if="!isTouchEventsDetected"
        ref="messageActionsContainer"
        :hidden="!targetElement"
        class="timeline-events__message-actions"
        :style="messageActionsFloatingStyles"
        @wheel="onWheelMessageActionsContainer"
    >
        <Button
            v-if="currentRoomPermissions.sendReaction"
            v-tooltip.top="{ value: i18nText.addReaction }"
            icon="pi pi-face-smile" :aria-label="i18nText.addReaction" severity="secondary" variant="text"
            data-link-id="addReaction"
        />
        <Button
            v-if="currentRoomPermissions.sendMessage && messageActionsTargetEventSender === sessionUserId"
            v-tooltip.top="{ value: i18nText.editMessage }"
            icon="pi pi-pencil" :aria-label="i18nText.editMessage" severity="secondary" variant="text"
            data-link-id="editMessage"
        />
        <Button
            v-if="currentRoomPermissions.sendMessage && messageActionsTargetEventSender !== sessionUserId"
            v-tooltip.top="{ value: i18nText.replyMessage }"
            icon="pi pi-reply -scale-x-100" :aria-label="i18nText.replyMessage" severity="secondary" variant="text"
            data-link-id="replyToMessage"
        />
        <Button
            v-tooltip.top="{ value: i18nText.forwardMessage }"
            icon="pi pi-reply" :aria-label="i18nText.forwardMessage" severity="secondary" variant="text"
        />
        <Button
            v-tooltip.top="{ value: i18nText.moreActionsMessage }"
            icon="pi pi-ellipsis-h" :aria-label="i18nText.moreActionsMessage" severity="secondary" variant="text"
            @click="emit('showMoreMessageActions', $event)"
        />
    </div>
</template>

<script setup lang="ts">
import { computed, ref, type PropType } from 'vue'
import { storeToRefs } from 'pinia'
import { useFloating, offset as floatingOffset, autoUpdate as floatingAutoUpdate } from '@floating-ui/vue'

import { useApplication } from '@/composables/application'

import { useRoomStore } from '@/stores/room'
import { useSessionStore } from '@/stores/session'

import Button from 'primevue/button'
import vTooltip from 'primevue/tooltip'

const { isTouchEventsDetected } = useApplication()

const {
    currentRoomPermissions,
} = storeToRefs(useRoomStore())
const {
    userId: sessionUserId,
} = storeToRefs(useSessionStore())

const props = defineProps({
    i18nText: {
        type: Object as PropType<Record<string, string>>,
        required: true,
    },
    messageActionsTargetEventSender: {
        type: String,
        default: undefined,
    },
    scrollPanelContent: {
        type: Object as PropType<HTMLElement>,
        default: undefined,
    },
    targetElement: {
        type: Object as PropType<HTMLElement>,
        default: undefined,
    },
})

const emit = defineEmits<{
    (e: 'showMoreMessageActions', event: MouseEvent): void
}>()

const messageActionsContainer = ref<HTMLElement>()

const { floatingStyles: messageActionsFloatingStyles, update: updateMessageActionsFloating } = useFloating(
    computed(() => props.targetElement),
    messageActionsContainer,
    {
        whileElementsMounted: floatingAutoUpdate,
        transform: false,
        placement: 'top-end',
        middleware: [floatingOffset({ mainAxis: -12, crossAxis: -8 })]
    }
);

function onWheelMessageActionsContainer(e: WheelEvent) {
    e.preventDefault()
    props.scrollPanelContent?.scrollBy({
        left: e.deltaX,
        top: e.deltaY,
        behavior: 'auto',
    })
}

defineExpose({
    updateMessageActionsFloating,
})

</script>

<style lang="scss" scoped>
.timeline-events__message-actions {
    display: flex;
    position: absolute;
    padding: 0.125rem;
    background: var(--background-surface-high);
    border: 1px solid var(--border-muted);
    border-radius: 0.5rem;
    box-shadow: var(--shadow-low);
    width: max-content;
    top: 0;
    left: auto !important;
    right: 0.5rem !important;
    z-index: 5;

    > .p-button {
        padding: 0.125rem !important;
        width: 1.75rem !important;
        height: 1.75rem !important;
    }
}
</style>