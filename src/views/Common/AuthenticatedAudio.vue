<template>
    <slot v-if="!hasErrorSlot || !loadError" :src="src" :error="loadError"></slot>
    <slot v-if="loadError" name="error"></slot>
</template>

<script setup lang="ts">
import { computed, ref, useSlots, watch, type PropType } from 'vue'
import { useMediaCache, type GetMxcObjectUrlOptions } from '@/composables/media-cache'
const { getMxcObjectUrl } = useMediaCache()

import type { EncryptedFile } from '@/types'

const props = defineProps({
    mxcUri: {
        type: String,
        default: '',
    },
    encryptedFile: {
        type: Object as PropType<EncryptedFile>,
        default: undefined,
    },
    mimetype: {
        type: String,
        default: undefined,
    },
})

const slots = useSlots()

const hasErrorSlot = computed(() => !!slots.error?.().length)

let imageFetchAbortController: AbortController | undefined

const loading = ref<boolean>(false)
const loadError = ref<Error | null>(null)
const src = ref<string | undefined>('')

watch(() => props.mxcUri, (mxcUri) => {
    loading.value = true
    loadError.value = null
    imageFetchAbortController?.abort()
    imageFetchAbortController = new AbortController()

    if (!mxcUri) {
        loading.value = false
        if (!props.encryptedFile) {
            loadError.value = new Error('Missing URI')
        }
        return
    }

    const options: GetMxcObjectUrlOptions = {}
    getMxcObjectUrl(mxcUri, options, imageFetchAbortController).then((url) => {
        src.value = url
    }).catch((error) => {
        src.value = ''
        loadError.value = error
    }).finally(() => {
        loading.value = false
    })
}, { immediate: true })

watch(() => props.encryptedFile, (encryptedFile) => {
    if (!encryptedFile) return
    loading.value = true
    loadError.value = null
    imageFetchAbortController?.abort()
    imageFetchAbortController = new AbortController()

    if (!encryptedFile.url) {
        loading.value = false
        loadError.value = new Error('Missing URI')
        return
    }

    const options: GetMxcObjectUrlOptions = {}
    if (props.mimetype) {
        options.mimetype = props.mimetype
    }
    getMxcObjectUrl(encryptedFile, options, imageFetchAbortController).then((url) => {
        src.value = url
    }).catch((error) => {
        src.value = ''
        loadError.value = error
    }).finally(() => {
        loading.value = false
    })
}, { immediate: true })

</script>