import { getCurrentInstance, onUnmounted } from 'vue'
import { useRouter, type Router } from 'vue-router'
import mitt from 'mitt'

const emitter = mitt()

interface LogoutOptions {
    secure?: boolean;
}

export function useLogout() {

    let router: Router | undefined
    if (getCurrentInstance()) {
        router = useRouter()
    }

    async function logout(options?: LogoutOptions) {
        emitter.emit('logout', options)

        // TODO - probably should show a message when the session expired.
        if (router) {
            router.push({ name: 'login' })
        } else {
            window.location.href = '/login'
        }
    }

    return {
        logout,
    }
}

export function onLogout(callback: (options?: LogoutOptions) => void, options?: { permanent?: boolean }) {
    if (getCurrentInstance() && !options?.permanent) {
        onUnmounted(() => {
            emitter.off('logout', callback as never)
        })
    }
    emitter.on('logout', callback as never)
}
