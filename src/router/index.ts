import { nextTick, ref } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
        {
            name: 'create-room',
            path: '/create-room',
            component: () => import('@/views/Room/CreateRoom.vue'),
        },
        {
            name: 'discover',
            path: '/discover',
            component: () => import('@/views/Discover.vue'),
            redirect: '/discover/spaces',
            children: [
                {
                    name: 'discover-spaces',
                    path: 'spaces',
                    component: () => import('@/views/Discover/DiscoverMain.vue'),
                },
                {
                    name: 'discover-rooms',
                    path: 'rooms',
                    component: () => import('@/views/Discover/DiscoverMain.vue'),
                },
            ],
        },
        {
            name: 'landing',
            path: '/',
            component: () => import('@/views/Landing.vue'),
        },
        {
            name: 'login',
            path: '/login',
            component: () => import('@/views/Login.vue'),
        },
        {
            name: 'register',
            path: '/register',
            component: () => import('@/views/Register.vue'),
        },
        {
            name: 'forgot-password',
            path: '/forgot-password',
            component: () => import('@/views/ForgotPassword.vue'),
        },
        {
            name: 'home',
            path: '/home',
            component: () => import('@/views/Home.vue'),
        },
        {
            name: 'message-requests',
            path: '/message-requests',
            component: () => import('@/views/MessageRequests.vue'),
        },
        {
            name: 'room',
            path: '/room/:roomId',
            component: () => import('@/views/Room.vue'),
            props: (route) => {
                return {
                    roomId: route.params.roomId,
                }
            },
        },
    ],
})

let isJustNavigatedViaApi = false
let isNavigating = false

let nextTickPromiseResolves: Array<() => void> = []
function resolveNextTickPromises() {
    for (const resolve of nextTickPromiseResolves) {
        try {
            resolve()
        } catch (error) {}
    }
    nextTickPromiseResolves = []
}

const routerGo = router.go
router.go = async function() {
    isJustNavigatedViaApi = true
    isNavigating = true
    try {
        const response = routerGo.apply(this, arguments as never)
        await new Promise((resolve) => setTimeout(resolve, 100))
        return response
    } finally {
        isNavigating = false
        resolveNextTickPromises()
    }
}

const routerPush = router.push
router.push = async function() {
    isJustNavigatedViaApi = true
    isNavigating = true
    try {
        return await routerPush.apply(this, arguments as never)
    } finally {
        isNavigating = false
        resolveNextTickPromises()
    }
}

const routerBack = router.back
router.back = async function() {
    isJustNavigatedViaApi = true
    isNavigating = true
    try {
        const response = routerBack.apply(this, arguments as never)
        await new Promise((resolve) => setTimeout(resolve, 100))
        return response
    } finally {
        isNavigating = false
        resolveNextTickPromises()
    }
}

const routerForward = router.forward
router.forward = async function() {
    isJustNavigatedViaApi = true
    isNavigating = false
    try {
        const response = routerForward.apply(this, arguments as never)
        await new Promise((resolve) => setTimeout(resolve, 100))
        return response
    } finally {
        isNavigating = false
        resolveNextTickPromises()
    }
}

const routerReplace = router.replace
router.replace = async function() {
    isJustNavigatedViaApi = true
    isNavigating = false
    try {
        return await routerReplace.apply(this, arguments as never)
    } finally {
        isNavigating = false
        resolveNextTickPromises()
    }
}

router.nextTick = async function() {
    await nextTick()
    if (isNavigating) {
        await new Promise<void>((resolve) => {
            nextTickPromiseResolves.push(resolve)
        })
    }
}

router.lastNavigationSource = ref<'browser' | 'api'>('browser')

router.afterEach(() => {
    if (isJustNavigatedViaApi) {
        router.lastNavigationSource.value = 'api'
    } else {
        router.lastNavigationSource.value = 'browser'
    }
    isJustNavigatedViaApi = false
})

export default router