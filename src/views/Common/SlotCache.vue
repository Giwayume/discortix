<template>
    <div ref="root"><slot /></div>
</template>

<script lang="ts">
import { defineComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

interface SlotCacheInfo {
    fragment: DocumentFragment;
    unmountedTs: number;
}

const slotCacheMap = new Map<string, SlotCacheInfo>()

export default defineComponent({
    props: {
        cacheId: {
            type: String,
            required: true,
        },
    },
    setup(props) {
        const root = ref<HTMLDivElement>()
        let originalFragment: DocumentFragment | undefined = undefined
        
        onMounted(async () => {
            if (!root.value) return

            // Remove old unused cached fragments
            const performanceNow = window.performance.now()
            for (const otherCacheId of slotCacheMap.keys()) {
                const unmountedTs = slotCacheMap.get(otherCacheId)?.unmountedTs
                if (unmountedTs && unmountedTs < performanceNow - 1000) {
                    slotCacheMap.delete(otherCacheId)
                }
            }

            await nextTick()
            if (!root.value) return
            if (slotCacheMap.has(props.cacheId)) {
                if (slotCacheMap.has(props.cacheId)) {
                    const { fragment } = slotCacheMap.get(props.cacheId)!
                    if (fragment) {
                        root.value.innerHTML = ''
                        root.value.appendChild(fragment)
                    }
                }
                slotCacheMap.delete(props.cacheId)
            } else {
                originalFragment = document.createDocumentFragment()
                while (root.value.firstChild) {
                    originalFragment.appendChild(root.value.firstChild)
                }
                slotCacheMap.set(props.cacheId, { fragment: originalFragment, unmountedTs: Infinity })
                root.value.appendChild(originalFragment.cloneNode(true))
            }
        })

        onBeforeUnmount(() => {
            if (!root.value) return
            const fragment = document.createDocumentFragment()
            while (root.value.firstChild) {
                fragment.appendChild(root.value.firstChild)
            }
            slotCacheMap.set(props.cacheId, { fragment, unmountedTs: window.performance.now() })
        })

        watch(() => props.cacheId, (newId, oldId) => {
            if (oldId && slotCacheMap.has(oldId)) {
                slotCacheMap.delete(oldId)
            }
        })

        return {
            root,
        }
    }
})
</script>