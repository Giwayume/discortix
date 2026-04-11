<template>
    <slot v-if="!hasErrorSlot || !loadError" :src="src" :poster="poster" :error="loadError"></slot>
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
    thumbnailMxcUri: {
        type: String,
        default: '',
    },
    thumbnailEncryptedFile: {
        type: Object as PropType<EncryptedFile>,
        default: undefined,
    },
    mimetype: {
        type: String,
        default: undefined,
    },
    thumbnailMimetype: {
        type: String,
        default: undefined,
    },
    width: {
        type: Number,
        default: undefined,
    },
    height: {
        type: Number,
        default: undefined,
    },
})

const slots = useSlots()

const hasErrorSlot = computed(() => !!slots.error?.().length)

let videoFetchAbortController: AbortController | undefined
let thumbnailFetchAbortController: AbortController | undefined

const loading = ref<boolean>(false)
const loadError = ref<Error | null>(null)
const loadingThumbnail = ref<boolean>(false)
const loadThumbnailError = ref<Error | null>(null)
const src = ref<string | undefined>('')
const poster = ref<string | undefined>('/assets/images/image-loading.png')

watch(() => props.mxcUri, (mxcUri) => {
    loading.value = true
    loadError.value = null
    videoFetchAbortController?.abort()
    videoFetchAbortController = new AbortController()

    if (!mxcUri) {
        loading.value = false
        if (!props.encryptedFile) {
            loadError.value = new Error('Missing URI')
        }
        return
    }

    const options: GetMxcObjectUrlOptions = {}
    getMxcObjectUrl(mxcUri, options, videoFetchAbortController).then((url) => {
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
    videoFetchAbortController?.abort()
    videoFetchAbortController = new AbortController()

    if (!encryptedFile.url) {
        loading.value = false
        loadError.value = new Error('Missing URI')
        return
    }

    const options: GetMxcObjectUrlOptions = {}
    if (props.mimetype) {
        options.mimetype = props.mimetype
    }
    getMxcObjectUrl(encryptedFile, options, videoFetchAbortController).then((url) => {
        src.value = url
    }).catch((error) => {
        src.value = ''
        loadError.value = error
    }).finally(() => {
        loading.value = false
    })
}, { immediate: true })

watch(() => props.thumbnailMxcUri, (thumbnailMxcUri) => {
    loadingThumbnail.value = true
    loadThumbnailError.value = null
    thumbnailFetchAbortController?.abort()
    thumbnailFetchAbortController = new AbortController()

    if (!thumbnailMxcUri) {
        loadingThumbnail.value = false
        if (!props.encryptedFile) {
            loadThumbnailError.value = new Error('Missing URI')
        }
        return
    }

    const options: GetMxcObjectUrlOptions = {}
    getMxcObjectUrl(thumbnailMxcUri, options, thumbnailFetchAbortController).then((url) => {
        poster.value = url
    }).catch((error) => {
        poster.value = '/assets/images/image-load-error.svg'
        loadThumbnailError.value = error
    }).finally(() => {
        loadingThumbnail.value = false
    })
}, { immediate: true })

watch(() => props.thumbnailEncryptedFile, (thumbnailEncryptedFile) => {
    if (!thumbnailEncryptedFile) return
    loadingThumbnail.value = true
    loadThumbnailError.value = null
    thumbnailFetchAbortController?.abort()
    thumbnailFetchAbortController = new AbortController()

    if (!thumbnailEncryptedFile.url) {
        loadingThumbnail.value = false
        loadThumbnailError.value = new Error('Missing URI')
        return
    }

    const options: GetMxcObjectUrlOptions = {}
    if (props.thumbnailMimetype) {
        options.mimetype = props.thumbnailMimetype
    }
    getMxcObjectUrl(thumbnailEncryptedFile, options, thumbnailFetchAbortController).then((url) => {
        poster.value = url
    }).catch((error) => {
        poster.value = '/assets/images/image-load-error.svg'
        loadThumbnailError.value = error
    }).finally(() => {
        loadingThumbnail.value = false
    })
}, { immediate: true })

</script>