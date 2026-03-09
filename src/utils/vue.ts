import { watch, type WatchHandle } from 'vue'

export function until(predicate: () => boolean, timeout?: number): Promise<void> {
    let stop: WatchHandle | undefined
    let timeoutHandle: number | undefined
    return new Promise((resolve) => {
        if (timeout) {
            timeoutHandle = setTimeout(() => {
                stop?.()
                resolve()
            }, timeout)
        }
        stop = watch(
            predicate,
            (now) => {
                if (now) {
                    clearTimeout(timeoutHandle)
                    stop?.()
                    resolve()
                }
            },
            { immediate: true }
        )
    })
}
