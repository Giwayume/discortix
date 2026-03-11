import { ref } from 'vue'

const isCtrlKeyPressed = ref<boolean>(false)
const isMetaKeyPressed = ref<boolean>(false)
const isCtrlOrMetaKeyPressed = ref<boolean>(false)
const isShiftKeyPressed = ref<boolean>(false)
const isAltKeyPressed = ref<boolean>(false)
const isAnyModifierKeyPressed = ref<boolean>(false)

let windowBlurResetTimeoutHandle: number | undefined = undefined

function onDocumentKeyDown(e: KeyboardEvent) {
    if (e.key === 'Control') {
        isCtrlKeyPressed.value = true
        isCtrlOrMetaKeyPressed.value = true
        isAnyModifierKeyPressed.value = true
    } else if (e.key === 'Meta') {
        isMetaKeyPressed.value = true
        isCtrlOrMetaKeyPressed.value = true
        isAnyModifierKeyPressed.value = true
    } else if (e.key === 'Shift') {
        isShiftKeyPressed.value = true
        isAnyModifierKeyPressed.value = true
    } else if (e.key === 'Alt') {
        isAltKeyPressed.value = true
        isAnyModifierKeyPressed.value = true
    }
}

function onDocumentKeyUp(e: KeyboardEvent) {
    if (e.key === 'Control') {
        isCtrlKeyPressed.value = false
    } else if (e.key === 'Meta') {
        isMetaKeyPressed.value = false
    } else if (e.key === 'Shift') {
        isShiftKeyPressed.value = false
    } else if (e.key === 'Alt') {
        isAltKeyPressed.value = false
    }
    if (!isCtrlKeyPressed.value && !isMetaKeyPressed.value) {
        isCtrlOrMetaKeyPressed.value = false
    }
    if (!isCtrlKeyPressed.value && !isMetaKeyPressed.value && !isShiftKeyPressed.value && !isAltKeyPressed.value) {
        isAnyModifierKeyPressed.value = false
    }
}

function onWindowFocus() {
    clearTimeout(windowBlurResetTimeoutHandle)
    windowBlurResetTimeoutHandle = undefined
}

function onWindowBlur() {
    clearTimeout(windowBlurResetTimeoutHandle)
    windowBlurResetTimeoutHandle = setTimeout(() => {
        isCtrlKeyPressed.value = false
        isMetaKeyPressed.value = false
        isShiftKeyPressed.value = false
        isAltKeyPressed.value = false
        isCtrlOrMetaKeyPressed.value = false
        isAnyModifierKeyPressed.value = false
        windowBlurResetTimeoutHandle = undefined
    }, 500)
}

window.addEventListener('focus', onWindowFocus, true)
window.addEventListener('blur', onWindowBlur, true)
document.addEventListener('keydown', onDocumentKeyDown, true)
document.addEventListener('keyup', onDocumentKeyUp, true)

export function useKeyboard() {
    return {
        isCtrlKeyPressed,
        isMetaKeyPressed,
        isCtrlOrMetaKeyPressed,
        isShiftKeyPressed,
        isAltKeyPressed,
        isAnyModifierKeyPressed,
    }
}
