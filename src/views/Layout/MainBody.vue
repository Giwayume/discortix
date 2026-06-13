<template>
    <div class="application__main__body">
        <div class="application__main__body-container">
            <div v-if="disableScrollbar" class="application__main__body__content">
                <slot />
            </div>
            <template v-else>
                <ScrollPanel ref="scrollPanel">
                    <slot />
                </ScrollPanel>
            </template>
            <div class="application__main__body__footer">
                <slot name="footer" />
            </div>
        </div>
        <div v-if="asideVisible" class="application__main__body__aside">
            <slot name="aside" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, type ComponentPublicInstance } from 'vue'

import ScrollPanel from 'primevue/scrollpanel'

defineProps({
    disableScrollbar: {
        type: Boolean,
        default: false,
    },
    asideVisible: {
        type: Boolean,
        default: false,
    }
})

const emit = defineEmits<{
    (e: 'scroll', event: Event): void;
}>()

const scrollPanel = ref<ComponentPublicInstance>()

const scrollPanelContent = computed(() => {
    return scrollPanel.value?.$refs.content as HTMLDivElement | undefined
})

onMounted(() => {
    scrollPanelContent.value?.addEventListener('scroll', (event) => {
        emit('scroll', event)
    })
})

</script>

<style lang="scss" scoped>
.application__main__body {
    position: absolute;
    top: 3rem;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    margin: 0;
    color: var(--text-default);
}
.application__main__body-container {
    display: flex;
    flex-direction: column;
    flex-grow: 1;
    align-items: flex-start;
    overflow: hidden;
    width: 100%;

    > .p-scrollpanel {
        width: 100%;
        flex-grow: 1;
        max-width: 100%;
    }
}
.application__main__body__content {
    width: 100%;
    flex-grow: 1;
    flex-shrink: 0;
    flex-basis: 0;
    max-width: 100%;
    overflow: hidden;
}
.application__main__body__footer {
    display: flex;
    flex-direction: column;
    overflow: hidden; // Required for embedded layouts sizing to the correct height.
    flex-grow: 0;
    flex-shrink: 1;
    width: 100%;
}
@keyframes application-main-body-aside-reveal {
    0% {
        transform: translateX(50%);
        opacity: 0;
    }
    100% {
        transform: translateX(0);
        opacity: 1;
    }
}
.application__main__body__aside {
    position: relative;
    border-left: 1px solid var(--border-subtle);

    @media screen and (max-width: 800px) {
        position: absolute;
        top: 0;
        right: 0;
        left: 0;
        bottom: 0;
        background: var(--background-base-lower);
        z-index: 1;
        animation: application-main-body-aside-reveal 0.3s forwards;
    }
}
</style>