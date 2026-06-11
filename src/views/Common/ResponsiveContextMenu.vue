<template>
    <Drawer
        v-if="isTouchEventsDetected"
        ref="drawer"
        v-model:visible="drawerVisible"
        position="bottom"
        class="responsive-context-menu"
        :class="{
            'responsive-context-menu--animate-drawer': isAnimatingDrawerOffset,
        }"
        :style="{
            '--drawer-drag-offset': (drawerDragOffset) + 'px',
            height: 'calc(50dvh - var(--drawer-drag-offset))',
            maxHeight: '100dvh',
        }"
    >
        <template #header>
            <div
                class="px-6 py-4 w-full"
                @pointerdown="onPointerStartDrawerHeader"
                @pointercancel="onPointerCancelDrawerHeader"
                @pointermove="onPointerMoveDrawerHeader"
                @pointerup="onPointerUpDrawerHeader"
            />
        </template>
        <ScrollPanel>
            <div class="px-4">
                <Menu :model="model">
                    <template v-if="slots.item" #item="item">
                        <slot name="item" v-bind="item" />
                    </template>
                </Menu>
            </div>
        </ScrollPanel>
    </Drawer>
    <ContextMenu
        v-else
        ref="contextMenu"
        :model="model"
        @hide="emit('hide')"
        @show="emit('show')"
    >
        <template v-if="slots.item" #item="item">
            <slot name="item" v-bind="item" />
        </template>
    </ContextMenu>
</template>

<script setup lang="ts">
import {
    ref,
    useSlots,
    type PropType,
} from 'vue'

import { useApplication } from '@/composables/application'

import ContextMenu from 'primevue/contextmenu'
import Drawer from 'primevue/drawer'
import Menu from 'primevue/menu'
import ScrollPanel from 'primevue/scrollpanel'

import type { MenuItem } from 'primevue/menuitem'

const { isTouchEventsDetected } = useApplication()

const props = defineProps({
    model: {
        type: Array as PropType<MenuItem[]>,
        default: [],
    },
})

const emit = defineEmits<{
    (e: 'hide'): void;
    (e: 'show'): void;
}>()

const slots = useSlots()

const contextMenu = ref<InstanceType<typeof ContextMenu>>()
const drawerVisible = ref<boolean>(false)

let headerPointerStartId: number = -1
let headerPointerStartY: number = 0
let headerPointerMoveY: number = 0
let initialDragOffset: number = 0
let safeAreaTop: number = 0
const drawerDragOffset = ref<number>(0)
const isAnimatingDrawerOffset = ref<boolean>(false)

function onPointerStartDrawerHeader(event: PointerEvent) {
    if (headerPointerStartId === -1 && event.button === 0) {
        headerPointerStartId = event.pointerId
        headerPointerStartY = event.pageY
        headerPointerMoveY = event.pageY
        initialDragOffset = drawerDragOffset.value
        safeAreaTop = parseFloat(
            getComputedStyle(document.documentElement)
                .getPropertyValue('--safe-area-top')
                .replace('px', '')
        )
        if (isNaN(safeAreaTop)) {
            safeAreaTop = 0
        }
    }
}

function onPointerCancelDrawerHeader(event: PointerEvent) {
    if (event.pointerId === headerPointerStartId) {
        headerPointerStartId = -1
        headerPointerStartY = 0
        headerPointerMoveY = 0
        isAnimatingDrawerOffset.value = true
        drawerDragOffset.value = 0
        setTimeout(() => {
            isAnimatingDrawerOffset.value = false
        }, 500)
    }
}

function onPointerMoveDrawerHeader(event: PointerEvent) {
    if (event.pointerId === headerPointerStartId) {
        headerPointerMoveY = event.pageY
        drawerDragOffset.value = initialDragOffset + (headerPointerMoveY - headerPointerStartY)
    }
}

function onPointerUpDrawerHeader(event: PointerEvent) {
    if (event.pointerId === headerPointerStartId) {
        headerPointerStartId = -1
        headerPointerStartY = 0
        headerPointerMoveY = 0
        if (drawerDragOffset.value < -window.innerHeight / 4) {
            drawerDragOffset.value = safeAreaTop + (-window.innerHeight / 2) + 32
        } else if (drawerDragOffset.value > window.innerHeight / 4) {
            drawerDragOffset.value = 0
            drawerVisible.value = false
        } else {
            drawerDragOffset.value = 0
        }
        isAnimatingDrawerOffset.value = true
        setTimeout(() => {
            isAnimatingDrawerOffset.value = false
        }, 500)
    }
}

function hide() {
    if (isTouchEventsDetected.value) {
        drawerVisible.value = false
    } else if (contextMenu.value) {
        contextMenu.value.hide()
    }
}

function show(event: Event) {
    if (isTouchEventsDetected.value) {
        drawerVisible.value = true
        drawerDragOffset.value = 0
        isAnimatingDrawerOffset.value = false
    } else if (contextMenu.value) {
        contextMenu.value.show(event)
    }
}

defineExpose({
    hide,
    show,
})
</script>

<style lang="scss">
.responsive-context-menu .p-menu-submenu-label {
    display: none !important;
}
.responsive-context-menu--animate-drawer {
    transition: height 0.4s !important;
}
</style>