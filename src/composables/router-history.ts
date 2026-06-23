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

/**
 * Returns true if the specified route hash has the specified category
 * 
 * ```
 * Examples checking for "category-a":
 * # -> false
 * #category-a -> true
 * #category-a.a.b -> true
 * #category-b~category-a -> true
 * ```
 */
function routeHashCategoryExists(routeOrHash: RouteLocationNormalizedLoadedGeneric | string, category: string): boolean {
    const hash = ((routeOrHash as RouteLocationNormalizedLoadedGeneric).hash != null
        ? (routeOrHash as RouteLocationNormalizedLoadedGeneric).hash : routeOrHash as string).replace(/^#/, '')
    const categoriesWithState = hash.split('~').filter((str) => !!str)
    for (const categoryWithState of categoriesWithState) {
        if (categoryWithState === category || categoryWithState.startsWith(category + '.')) {
            return true
        }
    }
    return false
}

/**
 * Returns true if the specified route hash has the specified category and it also has state.
 * 
 * ```
 * Examples checking for "category-a":
 * # -> false
 * #category-a -> false
 * #category-a.a.b -> true
 * #category-b~category-a -> false
 * ```
 */
function routeHashCategoryExistsWithState(routeOrHash: RouteLocationNormalizedLoadedGeneric | string, category: string): boolean {
    const hash = ((routeOrHash as RouteLocationNormalizedLoadedGeneric).hash != null
        ? (routeOrHash as RouteLocationNormalizedLoadedGeneric).hash : routeOrHash as string).replace(/^#/, '')
    const categoriesWithState = hash.split('~').filter((str) => !!str)
    for (const categoryWithState of categoriesWithState) {
        if (categoryWithState.startsWith(category + '.')) {
            return true
        }
    }
    return false
}

/**
 * Returns the state part of the category hash.
 * 
 * ```
 * Example retrieving state for "category-a":
 * #category-a.a.b -> ["a", "b"]
 * ```
 */
function getRouteHashCategoryState(routeOrHash: RouteLocationNormalizedLoadedGeneric | string, category: string): string[] {
    const hash = ((routeOrHash as RouteLocationNormalizedLoadedGeneric).hash != null
        ? (routeOrHash as RouteLocationNormalizedLoadedGeneric).hash : routeOrHash as string).replace(/^#/, '')
    const categoriesWithState = hash.split('~').filter((str) => !!str)
    for (const categoryWithState of categoriesWithState) {
        if (categoryWithState.startsWith(category + '.')) {
            return categoryWithState.split('.').slice(1)
        }
    }
    return []
}

/**
 * Adds the category (with optional state) to the current route hash.
 * 
 * ```
 * Examples adding "category-a":
 * # -> #category-a
 * #category-b -> #category-b~category-a
 * #category-a -> #category-a
 * 
 * Example with state ["a", "b"]:
 * # -> #category-a.a.b
 * ```
 */
async function pushRouteHashCategory(
    router: Router,
    category: string,
    state: string[] = [],
    routerMethod: 'push' | 'replace' = 'push'
) {
    const oldHash = router.currentRoute.value.hash
    const categoriesWithState = oldHash.replace(/^#/, '').split('~').filter((str) => !!str)

    let isCategoryFound = false
    for (const [categoryWithStateIndex, categoryWithState] of categoriesWithState.entries()) {
        if (categoryWithState === category || categoryWithState.startsWith(category + '.')) {
            categoriesWithState[categoryWithStateIndex] = [category, ...state].join('.')
            isCategoryFound = true
            break
        }
    }
    if (!isCategoryFound) {
        categoriesWithState.push([category, ...state].join('.'))
    }
    const newHash = '#' + categoriesWithState.join('~')
    if (newHash !== oldHash) {
        if (routerMethod === 'push') {
            await router.push(newHash)
        } else {
            await router.replace(newHash)
        }
    }
}

/** 
 * Returns to the last browser history state that doesn't have this category in the hash,
 * or replaces the current history state if no such past state exists.
 * 
 * ```
 * Examples removing "category-a":
 * # -> #
 * #category-a -> #
 * #category-a.a.b -> #
 * #category-b~category-a -> #category-b
 * ```
 */
async function popRouteHashCategory(router: Router, category: string) {
    let delta = 0
    let isNonCategoryHistoryFound = false
    for (let position = historyPosition.value; position >= 0; position--) {
        const current = historyStack.value[position]?.current
        if (!current) break
        const hash = current.split('#')[1] ?? ''
        if (!routeHashCategoryExists(hash, category)) {
            isNonCategoryHistoryFound = true
            break
        }
        delta--
    }
    if (isNonCategoryHistoryFound && delta < 0) {
        router.go(delta)
    } else {
        const categories = router.currentRoute.value.hash
            .replace(/^#/, '')
            .split('~')
            .filter((str) => {
                if (!str) return false
                if (str === category || str.startsWith(category + '.')) return false
                return true
            })
        await router.replace('#' + categories.join('~'))
    }
}

/** 
 * Returns to the last browser history state that doesn't have any state for the category in the hash,
 * or replaces the current history state if no such past state exists.
 * 
 * ```
 * Examples removing state for "category-a":
 * # -> #category-a
 * #category-a -> #category-a
 * #category-a.a.b -> #category-a
 * #category-b~category-a -> #category-b~category-a
 * ```
 */
async function popRouteHashCategoryState(router: Router, category: string) {
    let delta = 0
    let isUserSettingsHistoryFound = false
    for (let position = historyPosition.value; position >= 0; position--) {
        const current = historyStack.value[position]?.current
        if (!current) {
            if (delta < 0) delta++
            break
        }
        const hash = current.split('#')[1] ?? ''

        const categoryExists = routeHashCategoryExists(hash, category)
        const categoryHasState = routeHashCategoryExistsWithState(hash, category)

        if (categoryExists && !categoryHasState) {
            isUserSettingsHistoryFound = true
        }
        if (!categoryExists) {
            if (isUserSettingsHistoryFound) {
                delta++
            }
            break
        }
        delta--
    }
    if (isUserSettingsHistoryFound && delta < 0) {
        router.go(delta)
    } else {
        await router.replace('#' + category)
    }
}

export function useRouterHistory() {
    return {
        routeHashCategoryExists,
        routeHashCategoryExistsWithState,
        getRouteHashCategoryState,
        pushRouteHashCategory,
        popRouteHashCategory,
        popRouteHashCategoryState,
        historyStack: readonly(historyStack),
        historyPosition: readonly(historyPosition),
        lastNavigationDirection: readonly(lastNavigationDirection),
        lastNavigationDelta: readonly(lastNavigationDelta),
        lastNavigationSource: readonly(lastNavigationSource),
    }
}
