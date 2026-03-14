import type { DirectiveBinding, ObjectDirective } from 'vue'

import { useClientSettingsStore } from '@/stores/client-settings'

const { settings } = useClientSettingsStore()

interface PointerHandlers {
    click?: (e: PointerEvent) => void
    press?: (e: PointerEvent) => void
}

interface ElementRecord {
    state: {
        startX: number;
        startY: number;
        startTime: number;
        moved: boolean;
        pressTimer: number | null;
    };
    binding: DirectiveBinding<PointerHandlers>;
}

const recordMap = new WeakMap<HTMLElement, ElementRecord>()

function getRecord(el: HTMLElement, binding?: DirectiveBinding<PointerHandlers>) {
    let rec = recordMap.get(el)
    if (!rec) {
        rec = {
            state: {
                startX: 0,
                startY: 0,
                startTime: 0,
                moved: false,
                pressTimer: null,
            },
            binding: binding as DirectiveBinding<PointerHandlers>,
        }
        recordMap.set(el, rec)
    } else if (binding) {
        rec.binding = binding
    }
    return rec
}

function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return

    const el = e.currentTarget as HTMLElement
    const rec = getRecord(el)
    const { state, binding } = rec

    state.startX = e.clientX
    state.startY = e.clientY
    state.startTime = Date.now()
    state.moved = false

    if (typeof binding.value?.press === 'function') {
        state.pressTimer = window.setTimeout(() => {
            if (!state.moved) binding.value!.press!(e)
            state.pressTimer = null
        }, settings.pointerPressTimeout)
    }

    el.setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent) {
    const el = e.currentTarget as HTMLElement
    const rec = recordMap.get(el)
    if (!rec) return
    const { state } = rec

    if (state.moved) return

    const dx = e.clientX - state.startX
    const dy = e.clientY - state.startY
    if (Math.hypot(dx, dy) > settings.pointerMoveRadius) {
        state.moved = true
        if (state.pressTimer !== null) {
            clearTimeout(state.pressTimer)
            state.pressTimer = null
        }
    }
}

function onPointerUp(e: PointerEvent) {
    const el = e.currentTarget as HTMLElement
    const rec = recordMap.get(el)
    if (!rec) return
    const { state, binding } = rec

    el.releasePointerCapture(e.pointerId)

    if (state.pressTimer !== null) {
        clearTimeout(state.pressTimer)
        state.pressTimer = null
    }

    if (state.moved) return

    const elapsed = Date.now() - state.startTime

    if (
        typeof binding.value?.click === 'function' &&
        elapsed <= settings.pointerClickTimeout
    ) {
        binding.value!.click!(e);
    }

    if (
        typeof binding.value?.press === 'function' &&
        elapsed >= settings.pointerPressTimeout &&
        state.pressTimer === null
    ) {
        binding.value!.press!(e)
    }
}


export const vPointer: ObjectDirective = {
    mounted(el: HTMLElement, binding: DirectiveBinding<PointerHandlers>) {
        getRecord(el, binding)
        el.addEventListener('pointerdown', onPointerDown)
        el.addEventListener('pointermove', onPointerMove)
        el.addEventListener('pointerup', onPointerUp)
        el.addEventListener('pointercancel', onPointerUp)
    },
    unmounted(el: HTMLElement) {
        el.removeEventListener('pointerdown', onPointerDown)
        el.removeEventListener('pointermove', onPointerMove)
        el.removeEventListener('pointerup', onPointerUp)
        el.removeEventListener('pointercancel', onPointerUp)
        recordMap.delete(el)
    },
}
