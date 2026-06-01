<template>
    <h2 class="text-strong text-xl">
        {{ t('roomSettings.menu.emoji') }}
    </h2>
    <p class="text-sm mt-2">
        {{ t(isSpace ? 'roomSettings.emoji.summary.space' : 'roomSettings.emoji.summary.room') }}
    </p>

    <div class="border-t border-(--border-subtle) my-10" />

    <template v-if="editingImagePack">
        <h3 class="text-strong text-lg mb-2">
            {{ t('roomSettings.emoji.editImagePackHeading') }}
        </h3>
        <div v-if="errorMessage" ref="errorMessageContainer" class="px-3 my-4">
            <Message severity="error" size="small" variant="simple">
                <template #icon>
                    <span class="pi pi-exclamation-circle !text-xs !leading-3 -mt-[1px]" aria-hidden="true" />
                </template>
                {{ errorMessage }}
            </Message>
        </div>
        <div class="flex gap-2 mb-4">
            <Button :label="t('roomSettings.emoji.uploadImageButton')" :disabled="loading" @click="uploadEmoji" />
            <Button :label="t('roomSettings.emoji.cancelEditingButton')" severity="secondary" :disabled="loading" @click="cancelEditPack" />
        </div>
        <ProgressBar v-if="loading" mode="indeterminate" class="mb-4" />
        <DataTable v-else-if="roomEmotesRows.length > 0" :value="roomEmotesRows">
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
                        <InputText v-model="data.name" maxlength="100" @input="hasUnsavedChanges = true" @change="sanitizeName(data)" />
                        <InputGroupAddon>:</InputGroupAddon>
                    </InputGroup>
                </template>
            </Column>
            <Column field="controls">
                <template #body="{ data }">
                    <div class="text-right text-nowrap">
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
        <div v-else class="text-muted">{{ t('roomSettings.emoji.noEmoji') }}</div>
        <SaveChangesFooter :visible="hasUnsavedChanges && !loading" @reset="resetImagePack" @save="saveImagePack" />
    </template>
    <template v-else>
        <h3 class="text-strong text-lg mb-2">
            {{ t('roomSettings.emoji.imagePacksHeading') }}
        </h3>
        <p class="text-sm mb-4 text-muted">
            {{ t('roomSettings.emoji.imagePacksSummary') }}
        </p>
        <div class="-ml-3 -mr-2">
            <div class="ml-3 mr-2 border-t border-(--border-subtle)" />
            <template
                v-for="imagePack of imagePacks"
                :key="imagePack.type + '_' + imagePack.stateKey"
            >
                <div
                    class="flex h-16 px-3 gap-3 items-center rounded-xs hover:bg-(--background-mod-subtle) cursor-pointer"
                    @click="onClickImagePack($event, imagePack)"
                >
                    <span class="pi pi-images text-xl!" />
                    <div class="grow-1">
                        <div class="text-strong">{{ getImagePackName(imagePack) }}</div>
                        <div class="text-xs text-muted">({{ imagePack.stateKey || t('roomSettings.emoji.defaultStateKey') }})</div>
                    </div>
                    <Button
                        v-tooltip.top="{ value: isTouchEventsDetected ? undefined : t('roomSettings.emoji.editPackButton') }"
                        icon="pi pi-pencil" severity="secondary" variant="text"
                        class="ml-auto w-8! h-8! rounded-full!"
                        :aira-label="t('roomSettings.emoji.editPackButton')"
                        @click="editImagePack(imagePack)"
                    />
                    <Button
                        v-tooltip.top="{ value: isTouchEventsDetected ? undefined : t('roomSettings.emoji.deletePackButton') }"
                        icon="pi pi-trash" severity="secondary" variant="text"
                        class="ml-auto w-8! h-8! rounded-full! text-feedback-critical!"
                        :aira-label="t('roomSettings.emoji.deletePackButton')"
                        @click="deleteImagePack(imagePack)"
                    />
                </div>
                <div class="ml-3 mr-2 border-t border-(--border-subtle)" />
            </template>
        </div>
        <Button icon="pi pi-add" severity="secondary" class="mt-4" :label="t('roomSettings.emoji.addPackButton')" @click="addImagePack"></Button>
    </template>
    <Dialog
        v-model:visible="removeImagePackConfirmDialogVisible"
        modal
        :draggable="false"
        :header="t('roomSettings.emoji.deletePackConfirmTitle')"
        :style="{ width: 'calc(100% - 1rem)', maxWidth: '24rem' }"
    >
        <p>{{ t('roomSettings.emoji.deletePackConfirmSubtitle', { packName: getImagePackName(removeImagePackTarget) }) }}</p>
        <template #footer>
            <Button class="basis-1 grow-1" severity="secondary" autofocus :label="t('roomSettings.emoji.deletePackCancelButton')" @click="removeImagePackConfirmDialogVisible = false" />
            <Button class="basis-1 grow-1" severity="danger" :label="t('roomSettings.emoji.deletePackConfirmButton')" @click="confirmDeleteImagePack" />
        </template>
    </Dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { v4 as uuidv4 } from 'uuid'

import { HttpError, MissingRequiredInputError, ZodError, RequestTooBigError } from '@/utils/error'
import { pickFile } from '@/utils/file-access'

import { useApplication } from '@/composables/application'
import { createLazyMediaUpload, createMediaInfo } from '@/composables/media'
import { useRooms } from '@/composables/rooms'

import { useSpaceStore } from '@/stores/space'
import { useRoomStore } from '@/stores/room'

import AuthenticatedImage from '@/views/Common/AuthenticatedImage.vue'
import SaveChangesFooter from '@/views/RoomSettings/SaveChangesFooter.vue'

import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'
import InputGroup from 'primevue/inputgroup'
import InputGroupAddon from 'primevue/inputgroupaddon'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import ProgressBar from 'primevue/progressbar'
import { useToast } from 'primevue/usetoast'
import vTooltip from 'primevue/tooltip'

import {
    type EventRoomImagePackContent, EventRoomImagePackContentSchema,
    type EventRoomImagePackContentImage,
    type EventImPoniesRoomEmotesContent, EventImPoniesUserEmotesContentSchema,
} from '@/types'

interface ImagePackSummaryMatrix {
    type: 'm.room.image_pack';
    eventId: string;
    stateKey: string;
    content: EventRoomImagePackContent;
}
interface ImagePackSummaryFluffyChat {
    type: 'im.ponies.room_emotes';
    eventId: string;
    stateKey: string;
    content: EventImPoniesRoomEmotesContent;
}
type ImagePackSummary = ImagePackSummaryMatrix | ImagePackSummaryFluffyChat

interface RoomEmoteRow {
    originalName: string;
    name: string;
    mxcUri?: string;
    previewUrl?: string;
    imageBlob?: Blob;
    info: EventRoomImagePackContentImage['info'];
}

const { t } = useI18n()
const toast = useToast()

const { isTouchEventsDetected } = useApplication()
const { redactEvent, sendStateEvent } = useRooms()

const { joined: joinedRooms } = storeToRefs(useRoomStore())
const { currentTopLevelSpaceId } = storeToRefs(useSpaceStore())

const props = defineProps({
    roomId: {
        type: String,
        default: undefined,
    }
})

/*--------------------------*\
|                            |
|   Manage Image Pack List   |
|                            |
\*--------------------------*/

const editingImagePack = ref<ImagePackSummary>()
const removeImagePackConfirmDialogVisible = ref<boolean>(false)
const removeImagePackTarget = ref<ImagePackSummary>()
const newImagePacks = ref<ImagePackSummary[]>([])

const isSpace = computed(() => {
    return currentTopLevelSpaceId.value === props.roomId
})

const room = computed(() => {
    return joinedRooms.value[props.roomId!]
})

const imagePacks = computed(() => {
    const packs: ImagePackSummary[] = []
    for (const imagePack of joinedRooms.value[props.roomId!]?.stateEventsByType['im.ponies.room_emotes'] ?? []) {
        packs.push({
            type: 'im.ponies.room_emotes',
            eventId: imagePack.eventId,
            stateKey: imagePack.stateKey ?? '',
            content: imagePack.content,
        })
    }
    for (const imagePack of joinedRooms.value[props.roomId!]?.stateEventsByType['m.room.image_pack'] ?? []) {
        packs.push({
            type: 'm.room.image_pack',
            eventId: imagePack.eventId,
            stateKey: imagePack.stateKey ?? '',
            content: imagePack.content,
        })
    }
    for (const imagePack of newImagePacks.value) {
        packs.push(imagePack)
    }
    return packs
})

function getImagePackName(imagePack?: ImagePackSummary) {
    return imagePack?.content?.pack?.displayName
        ?? (
            imagePack?.type === 'im.ponies.room_emotes'
                ? t('roomSettings.emoji.defaultFluffyChatPackName')
                : t('roomSettings.emoji.defaultPackName')
        )
}

function onClickImagePack(event: MouseEvent, imagePack: ImagePackSummary) {
    if (!(event.target as HTMLElement)?.closest('.p-button')) {
        editImagePack(imagePack)
    }
}

function editImagePack(imagePack: ImagePackSummary) {
    editingImagePack.value = imagePack
    resetImagePack()
}

function deleteImagePack(imagePack: ImagePackSummary) {
    removeImagePackTarget.value = imagePack
    removeImagePackConfirmDialogVisible.value = true
}

function confirmDeleteImagePack() {
    if (!props.roomId || !removeImagePackTarget.value) return
    removeImagePackConfirmDialogVisible.value = false

    redactEvent(props.roomId, removeImagePackTarget.value.eventId, "Image pack deleted by user")
}

function addImagePack() {
    newImagePacks.value.push({
        type: 'm.room.image_pack',
        eventId: uuidv4(),
        stateKey: uuidv4(),
        content: {
            images: {},
        }
    })
    editingImagePack.value = newImagePacks.value[newImagePacks.value.length - 1]
}

/*----------------------*\
|                        |
|   Editing Image Pack   |
|                        |
\*----------------------*/

const loading = ref<boolean>(true)
const error = ref<Error | undefined>()
const errorMessageContainer = ref<HTMLDivElement>()
const roomEmotesRows = ref<RoomEmoteRow[]>([])
const hasUnsavedChanges = ref<boolean>(false)
const queuedDeletions = ref<Set<string>>(new Set())

const errorMessage = computed<string | undefined>(() => {
    if (!error.value) return
    if (error.value instanceof ZodError) {
        return t('errors.schemaValidation')
    } else if (error.value instanceof RequestTooBigError) {
        return t('roomSettings.emoji.error.tooManyEmoji')
    } else if (error.value instanceof MissingRequiredInputError) {
        return t('roomSettings.emoji.error.emptyName')
    }
    return t('roomSettings.emoji.error.unknown')
})

function cancelEditPack() {
    newImagePacks.value = []
    editingImagePack.value = undefined
    hasUnsavedChanges.value = false
    queuedDeletions.value.clear()
    loading.value = false
    error.value = undefined
}

async function resetImagePack() {
    if (!editingImagePack.value || !room.value) return
    hasUnsavedChanges.value = false
    queuedDeletions.value.clear()
    loading.value = true
    error.value = undefined
    await new Promise((resolve) => {
        setTimeout(resolve, 100)
    })
    try {
        for (const row of roomEmotesRows.value) {
            if (row.previewUrl) {
                URL.revokeObjectURL(row.previewUrl)
                delete row.imageBlob
                delete row.previewUrl
            }
        }
        const userEmotes = room.value.stateEventsByType[editingImagePack.value.type]?.find(
            (event) => event.stateKey === editingImagePack.value?.stateKey
        )?.content
        roomEmotesRows.value = []
        for (const name in userEmotes?.images) {
            const url = userEmotes.images[name]?.url
            const info = userEmotes.images[name]?.info
            if (!url) continue
            roomEmotesRows.value.push({
                originalName: name,
                name,
                mxcUri: url,
                info,
            })
        }
        roomEmotesRows.value.sort((a, b) => {
            return a.name < b.name ? -1 : 1
        })
    } catch (e) {
        if (e instanceof Error) {
            error.value = e
        } else {
            error.value = new Error('A non-error object was thrown.')
        }
    } finally {
        loading.value = false
    }
}

function sanitizeName(row: RoomEmoteRow) {
    row.name = row.name.replace(/[^a-zA-Z\d\-_]/g, '')
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
            roomEmotesRows.value.unshift({
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
        toast.add({ severity: 'error', summary: t('userSettings.emoji.error.selectFileFail'), life: 7000 })
    }
}


function deleteEmoji(name: string) {
    queuedDeletions.value.add(name)
    const rowIndex = roomEmotesRows.value.findIndex((row) => row.name == name)
    roomEmotesRows.value.splice(rowIndex, 1)
    hasUnsavedChanges.value = true
}

async function saveImagePack() {
    if (!editingImagePack.value || !room.value) return
    loading.value = true
    let hasPartialErrors = false
    try {
        for (const row of roomEmotesRows.value) {
            if (row.name.trim().length === 0) {
                throw new MissingRequiredInputError()
            }
        }

        let userEmotes: EventRoomImagePackContent | EventImPoniesRoomEmotesContent | undefined
        try {
            userEmotes = room.value.stateEventsByType[editingImagePack.value.type]?.find(
                (event) => event.stateKey === editingImagePack.value?.stateKey
            )?.content
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
        for (const row of roomEmotesRows.value) {
            if (row.name !== row.originalName) {
                delete userEmotes.images![row.originalName]
            }
        }

        const mediaUploads: Array<[string, ReturnType<typeof createLazyMediaUpload>]> = []
        for (const row of roomEmotesRows.value) {
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

        for (const [name, mediaUpload] of mediaUploads) {
            try {
                await mediaUpload.upload()
            } catch (error) {
                delete userEmotes.images![name]
                hasPartialErrors = true
            }
        }

        const userEmotesLength = new TextEncoder().encode(JSON.stringify(userEmotes)).length
        if (userEmotesLength > 65536) {
            throw new RequestTooBigError('Max event length exceeded')
        }

        await sendStateEvent(props.roomId!, editingImagePack.value.type, editingImagePack.value.stateKey, userEmotes)
        await new Promise((resolve) => {
            setTimeout(resolve, 100)
        })
        resetImagePack()
    } catch (e) {
        if (e instanceof Error) {
            error.value = e
        } else {
            error.value = new Error('A non-error object was thrown.')
        }
        await nextTick()
        const scrollPanelContent = errorMessageContainer.value?.closest('.p-scrollpanel-content')
        if (scrollPanelContent) scrollPanelContent.scrollTop = 0
    } finally {
        loading.value = false
    }
    if (hasPartialErrors) {
        toast.add({ severity: 'error', summary: t('userSettings.emoji.error.uploadImageFail'), life: 7000 })
    }
}

</script>