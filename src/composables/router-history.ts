import { onMounted, onUnmounted, readonly, ref, getCurrentInstance } from 'vue'
import { useRouter, type Router, type NavigationHookAfter, type RouteLocationNormalizedLoadedGeneric } from 'vue-router'

let router: Router | undefined = undefined
let registeredCount: number = 0
let unregisterAferEach: (() => void) | undefined = undefined

interface NavigationInformation {
    direction: 'back' | 'forward' | 'replace';
    delta: number;
    source: 'browser' | 'api';
}

interface VueRouterHistoryState {
    back: string;
    current: string;
    forward: string;
    position: number;
    replaced: boolean;
    scroll: {
        left: number;
        top: number;
    }
}

type NavigationCallback = (to: RouteLocationNormalizedLoadedGeneric, from: RouteLocationNormalizedLoadedGeneric, info: NavigationInformation) => void

const historyStack = ref<Array<VueRouterHistoryState | undefined>>([])
const historyPosition = ref<number>(-1)
const lastNavigationDirection = ref<'back' | 'forward' | 'replace'>('replace')
const lastNavigationDelta = ref<number>(0)

const navigationCallbacks: NavigationCallback[] = []
let lastNavigationSource = ref<'browser' | 'api'>('browser')

let previousHistoryState: VueRouterHistoryState | undefined = window.history.state
const onRouterAfterEach: NavigationHookAfter = (to, from) => {
    if (!previousHistoryState) return
    const currentHistoryState: VueRouterHistoryState = window.history.state
    historyPosition.value = currentHistoryState.position
    if (currentHistoryState.position > previousHistoryState.position) {
        historyStack.value = historyStack.value.slice(0, currentHistoryState.position)
        lastNavigationDirection.value = 'forward'
    } else if (currentHistoryState.position < previousHistoryState.position) {
        lastNavigationDirection.value = 'back'
    } else {
        lastNavigationDirection.value = 'replace'
    }
    lastNavigationDelta.value = currentHistoryState.position - previousHistoryState.position
    historyStack.value[currentHistoryState.position] = currentHistoryState
    previousHistoryState = window.history.state

    for (const callback of navigationCallbacks) {
        callback(to, from, {
            direction: lastNavigationDirection.value,
            delta: lastNavigationDelta.value,
            source: router?.lastNavigationSource.value ?? 'browser',
        })
    }
}

function setup() {
    router = useRouter()
    if (registeredCount === 0) {
        previousHistoryState = window.history.state
        if (previousHistoryState) {
            historyPosition.value = previousHistoryState.position
            historyStack.value[historyPosition.value] = previousHistoryState
        }
        unregisterAferEach = router.afterEach(onRouterAfterEach)
    }
    registeredCount++
}

function teardown() {
    registeredCount--
    if (registeredCount <= 0) {
        registeredCount = 0
        unregisterAferEach?.()
    }
}

export function onHistoryNavigation(callback: NavigationCallback) {
    if (getCurrentInstance()) {
        setup()
    }
    onMounted(() => {
        navigationCallbacks.push(callback)
    })
    onUnmounted(() => {
        const callbackIndex = navigationCallbacks.findIndex((otherCallback) => callback === otherCallback)
        navigationCallbacks.splice(callbackIndex, 1)

        teardown()
    })
}

export function useRouterHistory() {
    return {
        historyStack: readonly(historyStack),
        historyPosition: readonly(historyPosition),
        lastNavigationDirection: readonly(lastNavigationDirection),
        lastNavigationDelta: readonly(lastNavigationDelta),
        lastNavigationSource: readonly(lastNavigationSource),
    }
}
