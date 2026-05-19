<template>
    <div class="my-16 mx-auto max-w-174">
        <div class="px-3 py-2">
            <div v-html="micromark(t('userSettings.emoji.instructions'))" class="gap-6 text-md"></div>
        </div>
        <div class="px-3 py-2">
            <Button :label="t('userSettings.emoji.uploadButton')" @click="uploadEmoji" />
        </div>
        <div class="border-t border-(--border-subtle) my-10 mx-3" />
        <div class="px-3 py-2">
            <div class="text-strong text-xl mb-3">
                {{ t('userSettings.emoji.table.heading') }}
            </div>
            <div v-if="loadErrorMessage" class="px-3 py-2">
                <Message severity="error" size="small" variant="simple">
                    <template #icon>
                        <span class="pi pi-exclamation-circle !text-xs !leading-3 -mt-[1px]" aria-hidden="true" />
                    </template>
                    {{ loadErrorMessage }}
                </Message>
            </div>
            <ProgressBar v-if="loading" mode="indeterminate" class="mb-4" />
            <DataTable v-else-if="userEmotesRows.length > 0" :value="userEmotesRows">
                <Column
                    field="image"
                    style="width: 5rem"
                >
                    <template #header>
                        <div class="p-datatable-column-title flex items-center justify-center w-full">
                            {{ t('userSettings.emoji.table.image') }}
                        </div>
                    </template>
                    <template #body="{ data }">
                        <div class="flex items-center justify-center">
                            <img v-if="data.previewUrl" :src="data.previewUrl" :alt="data.name" class="w-8! h-8!" />
                            <AuthenticatedImage v-else :mxc-uri="data.mxcUri">
                                <template v-slot="{ src }">
                                    <img :src="src" :alt="data.name" class="w-8! h-8!">
                                </template>
                            </AuthenticatedImage>
                        </div>
                    </template>
                </Column>
                <Column field="name" :header="t('userSettings.emoji.table.name')">
                    <template #body="{ data }">
                        <InputGroup>
                            <InputGroupAddon>:</InputGroupAddon>
                            <InputText v-model="data.name" @input="hasUnsavedChanges = true" @change="sanitizeName(data)" />
                            <InputGroupAddon>:</InputGroupAddon>
                        </InputGroup>
                    </template>
                </Column>
                <Column field="controls">
                    <template #body="{ data }">
                        <div class="text-right text-nowrap">
                            <!--Button
                                v-tooltip.top="{ value: isTouchEventsDetected ? undefined : t('userSettings.emoji.editEmoji') }"
                                severity="secondary"
                                icon="pi pi-pencil"
                                class="w-8! h-8! mr-2"
                            /-->
                            <Button
                                v-tooltip.top="{ value: isTouchEventsDetected ? undefined : t('userSettings.emoji.deleteEmoji') }"
                                severity="secondary"
                                icon="pi pi-trash"
                                class="w-8! h-8! text-feedback-critical!"
                                @click="deleteEmoji(data.name)"
                            />
                        </div>
                    </template>
                </Column>
            </DataTable>
            <div v-else class="text-muted">{{ t('userSettings.emoji.noEmoji') }}</div>
        </div>
    </div>
    <SaveChangesFooter :visible="hasUnsavedChanges" @reset="reset" @save="save" />
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { micromark } from 'micromark'
import { v4 as uuidv4 } from 'uuid'

import { HttpError, RequestTooBigError, ZodError } from '@/utils/error'
import { pickFile } from '@/utils/file-access'

import { createLazyMediaUpload, createMediaInfo } from '@/composables/media'
import { useAccountData } from '@/composables/account-data'
import { useApplication } from '@/composables/application'

import AuthenticatedImage from '@/views/Common/AuthenticatedImage.vue'
import SaveChangesFooter from './SaveChangesFooter.vue'

import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import InputGroup from 'primevue/inputgroup'
import InputGroupAddon from 'primevue/inputgroupaddon'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import ProgressBar from 'primevue/progressbar'
import vTooltip from 'primevue/tooltip'
import { useToast } from 'primevue/usetoast'

import {
    type EventImPoniesUserEmotesContent, EventImPoniesUserEmotesContentSchema,
    type EventImPoniesImage,
} from '@/types'

interface UserEmoteRow {
    originalName: string;
    name: string;
    mxcUri?: string;
    previewUrl?: string;
    imageBlob?: Blob;
    info: EventImPoniesImage['info'];
}

const { t } = useI18n()
const toast = useToast()

const { getAccountDataByType, setAccountDataByType } = useAccountData()
const { isTouchEventsDetected } = useApplication()

const loading = ref<boolean>(true)
const loadError = ref<Error | undefined>()
const userEmotesRows = ref<UserEmoteRow[]>([])
const hasUnsavedChanges = ref<boolean>(false)
const queuedDeletions = ref<Set<string>>(new Set())

const loadErrorMessage = computed<string | undefined>(() => {
    if (!loadError.value) return
    console.log(loadError.value)
    if (loadError.value instanceof ZodError) {
        return t('errors.schemaValidation')
    } else if (loadError.value instanceof RequestTooBigError) {
        return t('userSettings.emoji.loadError.tooManyEmoji')
    }
    return t('userSettings.emoji.loadError.unknown')
})

onMounted(async () => {
    reset()
})

async function reset() {
    hasUnsavedChanges.value = false
    queuedDeletions.value.clear()
    loading.value = true
    loadError.value = undefined
    try {
        for (const row of userEmotesRows.value) {
            if (row.previewUrl) {
                URL.revokeObjectURL(row.previewUrl)
                delete row.imageBlob
                delete row.previewUrl
            }
        }
        const userEmotes = await getAccountDataByType<EventImPoniesUserEmotesContent>(
            'im.ponies.user_emotes',
            EventImPoniesUserEmotesContentSchema,
        )
        userEmotesRows.value = []
        for (const name in userEmotes?.images) {
            const url = userEmotes.images[name]?.url
            const info = userEmotes.images[name]?.info
            if (!url) continue
            userEmotesRows.value.push({
                originalName: name,
                name,
                mxcUri: url,
                info,
            })
        }
        userEmotesRows.value.sort((a, b) => {
            return a.name < b.name ? -1 : 1
        })
    } catch (error) {
        if (error instanceof Error) {
            loadError.value = error
        } else {
            loadError.value = new Error('A non-error object was thrown.')
        }
    } finally {
        loading.value = false
    }
}

function sanitizeName(row: UserEmoteRow) {
    row.name = row.name.replace(/[^a-zA-Z\d]/g, '')
}

async function uploadEmoji() {
    const files = await pickFile({ multiple: true })
    let hasErrors = false
    const reversedFiles = Array.from(files).reverse()
    for (const file of reversedFiles) {
        try {
            const mediaInfo = await createMediaInfo(file, true, 128)
            if (mediaInfo.type !== 'image') {
                throw new Error('Selected file is not an image.')
            }
            const imageBlob = mediaInfo.thumbnailBlob ?? file
            userEmotesRows.value.unshift({
                originalName: uuidv4().slice(6),
                name: uuidv4().slice(0, 8),
                mxcUri: undefined,
                previewUrl: URL.createObjectURL(imageBlob),
                imageBlob,
                info: {
                    h: mediaInfo.info?.thumbnailInfo?.h ?? mediaInfo.info?.h,
                    mimetype: mediaInfo.info?.thumbnailInfo?.mimetype ?? mediaInfo.info?.mimetype,
                    size: mediaInfo.info?.thumbnailInfo?.size ?? mediaInfo.info?.size,
                    w: mediaInfo.info?.thumbnailInfo?.w ?? mediaInfo.info?.w,
                },
            })
            hasUnsavedChanges.value = true
        } catch (error) {
            hasErrors = true
        }
    }
    if (hasErrors) {
        toast.add({ severity: 'error', summary: t('userSettings.emoji.loadError.selectFileFail'), life: 7000 })
    }
}

function deleteEmoji(name: string) {
    queuedDeletions.value.add(name)
    const rowIndex = userEmotesRows.value.findIndex((row) => row.name == name)
    userEmotesRows.value.splice(rowIndex, 1)
    hasUnsavedChanges.value = true
}

async function save() {
    loading.value = true
    let hasPartialErrors = false
    try {
        let userEmotes: EventImPoniesUserEmotesContent | undefined
        try {
            userEmotes = await getAccountDataByType<EventImPoniesUserEmotesContent>(
                'im.ponies.user_emotes',
                EventImPoniesUserEmotesContentSchema,
            )
        } catch (error) {
            if (error instanceof HttpError && error.isMatrixNotFound()) {
                userEmotes = {
                    images: {},
                    pack: {},
                }
            } else {
                throw error
            }
        }
        if (!userEmotes) throw new Error('User emotes object not created.')
        
        for (const name of queuedDeletions.value.values()) {
            delete userEmotes.images![name]
        }
        for (const row of userEmotesRows.value) {
            if (row.name !== row.originalName) {
                delete userEmotes.images![row.originalName]
            }
        }

        const mediaUploads: Array<[string, ReturnType<typeof createLazyMediaUpload>]> = []
        for (const row of userEmotesRows.value) {
            try {
                let needsUpdate: boolean = false
                if (row.imageBlob) {
                    needsUpdate = true
                    const mediaUpload = createLazyMediaUpload()
                    row.mxcUri = await mediaUpload.useBlob(row.imageBlob)
                    delete row.imageBlob
                    mediaUploads.push([row.name, mediaUpload])
                }
                if (row.name !== row.originalName) {
                    needsUpdate = true
                }
                if (needsUpdate && row.mxcUri) {
                    userEmotes.images![row.name] = {
                        url: row.mxcUri,
                        info: row.info,
                    }
                }
            } catch (error) {
                hasPartialErrors = true
            }
        }

        const userEmotesLength = new TextEncoder().encode(JSON.stringify(userEmotes)).length
        if (userEmotesLength > 65536) {
            throw new RequestTooBigError('Max event length exceeded')
        }

        for (const [name, mediaUpload] of mediaUploads) {
            try {
                await mediaUpload.upload()
            } catch (error) {
                delete userEmotes.images![name]
                hasPartialErrors = true
            }
        }

        await setAccountDataByType('im.ponies.user_emotes', userEmotes)
        reset()
    } catch (error) {
        if (error instanceof Error) {
            loadError.value = error
        } else {
            loadError.value = new Error('A non-error object was thrown.')
        }
    } finally {
        loading.value = false
    }
    if (hasPartialErrors) {
        toast.add({ severity: 'error', summary: t('userSettings.emoji.loadError.uploadImageFail'), life: 7000 })
    }

}

</script>

<style scoped lang="scss">
.p-datatable {
    --p-inputgroup-addon-padding: 0.375rem 0.25rem 0.375rem 0.375rem;
}
.p-datatable :deep(.p-inputgroup .p-inputtext) {
    --p-inputtext-padding-x: 0.0625rem;
    --p-inputtext-padding-7: 0.375rem;

    field-sizing: content;
    border-inline: none;
    min-width: 4rem;
}

.p-datatable :deep(.p-inputgroupaddon:last-child) {
    --p-inputgroup-addon-padding: 0.375rem 0.375rem 0.375rem 0.25rem;
}
</style>