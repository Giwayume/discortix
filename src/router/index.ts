import { ref } from 'vue'
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

const routerGo = router.go
router.go = function() {
    isJustNavigatedViaApi = true
    return routerGo.apply(this, arguments as never)
}

const routerPush = router.push
router.push = function() {
    isJustNavigatedViaApi = true
    return routerPush.apply(this, arguments as never)
}

const routerBack = router.back
router.back = function() {
    isJustNavigatedViaApi = true
    return routerBack.apply(this, arguments as never)
}

const routerForward = router.forward
router.forward = function() {
    isJustNavigatedViaApi = true
    return routerForward.apply(this, arguments as never)
}

const routerReplace = router.replace
router.replace = function() {
    isJustNavigatedViaApi = true
    return routerReplace.apply(this, arguments as never)
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