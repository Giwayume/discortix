import { onMounted, onUnmounted, ref } from 'vue'
import mitt from 'mitt'

import { useClientSettingsStore } from '@/stores/client-settings'

const emitter = mitt()

const isMobileView = ref<boolean>(window.innerWidth <= 800)
const isTouchEventsDetected = ref<boolean>(false)

const applicationContainer = ref<HTMLDivElement>()
const isAnimatingSidebarToggle = ref<boolean>(false)
const sidebarOpenRightPadding = 0
const sidebarOpenOffset = ref<number>(window.innerWidth - sidebarOpenRightPadding)

let clientSettingsStore: ReturnType<typeof useClientSettingsStore> | undefined = undefined

function toggleApplicationSidebar(visible?: boolean) {
    isAnimatingSidebarToggle.value = true

    if (applicationContainer.value) {
        applicationContainer.value.scrollLeft = 0
        applicationContainer.value.scrollTop = 0
    }

    let isClosingSidebar = false
    if (visible == null) {
        if (sidebarOpenOffset.value > 0) {
            isClosingSidebar = true
            sidebarOpenOffset.value = 0
        } else {
            sidebarOpenOffset.value = window.innerWidth - sidebarOpenRightPadding
        }
    } else if (visible) {
        sidebarOpenOffset.value = window.innerWidth - sidebarOpenRightPadding
    } else {
        isClosingSidebar = true
        sidebarOpenOffset.value = 0
    }

    if (isMobileView.value && isClosingSidebar) {
        if (!clientSettingsStore) {
            clientSettingsStore = useClientSettingsStore()
        }
        clientSettingsStore.settings.showChatAside = false
    }

    setTimeout(() => {
        isAnimatingSidebarToggle.value = false
    }, 300)
}

function openUserSettings(menuItemKey: string) {
    emitter.emit('openUserSettings', menuItemKey)
}

function onOpenUserSettings(callback: (menuItemKey: string) => void) {
    onMounted(() => {
        emitter.on('openUserSettings', callback as never)
    })
    onUnmounted(() => {
        emitter.off('openUserSettings', callback as never)
    })
}

export function useApplication() {
    return {
        isMobileView,
        isTouchEventsDetected,
        isAnimatingSidebarToggle,
        sidebarOpenRightPadding,
        sidebarOpenOffset,
        toggleApplicationSidebar,
        openUserSettings,
        onOpenUserSettings,
    }
}