import { isProxy, isReactive, isRef, toRaw, watch, type WatchHandle } from 'vue'

export function deepToRaw<T>(sourceObj: T): T {
    const objectIterator = (input: any): any => {
        if (Array.isArray(input)) {
            return input.map((item) => objectIterator(item));
        }
        if (isRef(input) || isReactive(input) || isProxy(input)) {
            return objectIterator(toRaw(input));
        }
        if (input && typeof input === 'object') {
            return Object.keys(input).reduce((acc, key) => {
                acc[key as keyof typeof acc] = objectIterator(input[key]);
                return acc;
            }, {} as T);
        }
        return input;
    };

    if (['[object Object]', '[object Array]'].includes(Object.prototype.toString.call(sourceObj))) {
        return objectIterator(sourceObj)
    }
    return toRaw(sourceObj)
}

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
