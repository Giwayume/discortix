<template>
    <Dialog
        :visible="props.visible"
        modal
        :draggable="false"
        :style="{
            width: 'calc(100% - 1rem)',
            maxWidth: '30rem',
        }"
        @update:visible="emit('update:visible', $event)"
    >
        <template #header>
            <div class="p-dialog-title">{{ t('createPollDialog.title') }}</div>
        </template>

        <form :id="'create-poll-dialog-form-' + uuid" @submit.prevent="post">
            <div class="flex flex-col pt-4">
                <label :for="'poll-question-input-' + uuid" class="pb-2 text-strong font-medium">{{ t('createPollDialog.question') }}</label>
                <InputText :id="'poll-question-input-' + uuid" v-model="question" :placeholder="t('createPollDialog.questionPlaceholder')" :maxlength="questionMaxLength" @input="questionValidation = undefined" />
                <Message v-if="questionValidation" severity="error" size="small" variant="simple" class="mt-2">
                    <template #icon>
                        <span class="pi pi-exclamation-circle !text-xs !leading-3 -mt-[1px]" aria-hidden="true" />
                    </template>
                    {{ t('createPollDialog.validation.question.' + questionValidation) }}
                </Message>
                <span class="text-subtle text-right text-xs mt-1">{{ question.length }} / {{ questionMaxLength }}</span>
            </div>
            <div role="group" :aria-labelledby="'poll-answers-heading-' + uuid" class="flex flex-col pt-4">
                <div :id="'poll-answers-heading-' + uuid" class="pb-2 text-strong font-medium">{{ t('createPollDialog.answers') }}</div>
                <template v-for="(answer, answerIndex) of answers">
                    <InputGroup class="mb-1!">
                        <InputGroupAddon>
                            <Button
                                :aria-label="t('createPollDialog.chooseAnswerEmoji')"
                                severity="secondary"
                                variant="text"
                                class="h-full w-10!"
                                @click="(event) => chooseEmoji(event, answerIndex)"
                            >
                                <div class="p-button-label flex flex-col items-center">
                                    <template v-if="answer.emoji">
                                        {{ answer.emoji }}
                                    </template>
                                    <template v-else>
                                        <span class="pi pi-face-smile" />
                                    </template>
                                </div>
                            </Button>
                        </InputGroupAddon>
                        <InputText
                            v-model="answer.body"
                            :aria-label="t('createPollDialog.answerPlaceholder')"
                            :placeholder="t('createPollDialog.answerPlaceholder')"
                            :maxlength="answerMaxLength"
                            class="border-x-0!"
                            @input="answer.validation = undefined"
                        />
                        <InputGroupAddon v-if="answers.length > 1">
                            <Button
                                icon="pi pi-trash"
                                :aria-label="t('createPollDialog.removeAnswer')"
                                severity="secondary"
                                variant="text"
                                class="h-full w-10!"
                                @click="removeAnswer(answerIndex)"
                            />
                        </InputGroupAddon>
                    </InputGroup>
                    <Message v-if="answer.validation" severity="error" size="small" variant="simple" class="mt-2 mb-4">
                        <template #icon>
                            <span class="pi pi-exclamation-circle !text-xs !leading-3 -mt-[1px]" aria-hidden="true" />
                        </template>
                        {{ t('createPollDialog.validation.answer.' + answer.validation) }}
                    </Message>
                </template>
                <Button
                    v-if="answers.length < answersMaxCount"
                    severity="secondary"
                    icon="pi pi-plus"
                    :label="t('createPollDialog.addAnotherAnswer')"
                    class="self-end"
                    @click="addAnswer()"
                />
            </div>
            <div class="flex flex-col pt-4">
                <label :id="'poll-question-duration-' + uuid" class="pb-2 text-strong font-medium">{{ t('createPollDialog.duration') }}</label>
                <Select
                    :label-id="'poll-question-duration-' + uuid"
                    v-model="duration"
                    :options="durationOptions"
                    option-value="value"
                    option-label="text"
                    class="mb-2"
                />
            </div>
        </form>
        
        <template #footer>
            <div class="flex justify-between align-items w-full">
                <label class="flex items-center">
                    <Checkbox v-model="allowMultipleAnswers" binary />
                    <span class="ml-3">{{ t('createPollDialog.allowMultipleAnswers') }}</span>
                </label>
                <Button :form="'create-poll-dialog-form-' + uuid" type="submit" class="min-w-25" severity="primary" :loading="isSaving">
                    <span class="p-button-label">{{ t('createPollDialog.postButton') }}</span>
                    <span class="p-button-loading-dots" />
                </Button>
            </div>
        </template>
    </Dialog>
    <ContextMenu ref="emojiContextMenu" :model="emojiContextMenuItems">
        <template #item="{ item, props }">
            <a class="p-contextmenu-item-link" v-bind="props.action">
                <span class="p-contextmenu-item-label" :class="item.labelClass">{{ item.label }}</span>
            </a>
        </template>
    </ContextMenu>
    <Dialog
        v-model:visible="expressionPickerVisible"
        modal
        :draggable="false"
        :style="{
            width: 'calc(100% - 1rem)',
            maxWidth: '30rem',
        }"
        class="p-0!"
        :pt="{
            header: {
                class: 'p-7!'
            },
            content: {
                class: 'p-0!'
            }
        }"
    >
        <ExpressionPicker
            ref="expressionPicker"
            :inline="true"
            :allowCustomEmoji="false"
            :emojiOnly="true"
            :zIndex="5000"
            @selectEmoji="onEmojiSelected"
            @hidden="expressionPickerVisible = false"
        />
    </Dialog>
</template>

<script setup lang="ts">
import { defineAsyncComponent, nextTick, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { v4 as uuidv4 } from 'uuid'
import type { GroupSession } from 'vodozemac-wasm-bindings'

import { useApplication } from '@/composables/application'
import { useRouterHistory, onHistoryNavigation } from '@/composables/router-history'
import { createLogger } from '@/composables/logger'
import { useMegolm } from '@/composables/megolm'
import { useRooms } from '@/composables/rooms'

import { useRoomStore } from '@/stores/room'
import { useSessionStore } from '@/stores/session'

const ExpressionPicker = defineAsyncComponent(() => import('@/views/Room/ExpressionPicker.vue'))

import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import ContextMenu from 'primevue/contextmenu'
import Dialog from 'primevue/dialog'
import InputGroup from 'primevue/inputgroup'
import InputGroupAddon from 'primevue/inputgroupaddon'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import { useToast } from 'primevue/usetoast'

import type {
    ApiV3SyncClientEventWithoutRoomId,
    EventPollStartContent,
    EmojiPickerEmojiItem,
} from '@/types'

const log = createLogger(import.meta.url)

const uuid = uuidv4()
const { t } = useI18n()
const toast = useToast()
const route = useRoute()
const router = useRouter()

const { isMobileView } = useApplication()
const {
    pushRouteHashCategory,
    popRouteHashCategory,
    routeHashCategoryExists,
} = useRouterHistory()
const { getOutboundGroupSession } = useMegolm()
const { sendMessageEvent } = useRooms()

const roomStore = useRoomStore()
const {
    associateTransactionIdWithEventId,
    populateSentMessageEvent,
} = roomStore
const { userId: sessionUserId } = storeToRefs(useSessionStore())

const props = defineProps({
    visible: {
        type: Boolean,
        default: false,
    },
    roomId: {
        type: String,
        required: true,
    },
})

const emit = defineEmits<{
    (e: 'update:visible', visible: boolean): void
}>()

interface PollAnswer {
    emoji: string;
    body: string;
    validation: 'required' | undefined;
}

const isSaving = ref<boolean>(false)
const question = ref<string>('')
const questionValidation = ref<'required'>()
const questionMaxLength = 300
const answers = ref<PollAnswer[]>([
    { emoji: '', body: '', validation: undefined },
    { emoji: '', body: '', validation: undefined }
])
const answerMaxLength = 55
const answersMaxCount = 20
const duration = ref<string>('24Hours')
const durationOptions = ref([
    { value: '1Hour', text: t('createPollDialog.1Hour') },
    { value: '4Hours', text: t('createPollDialog.4Hours') },
    { value: '8Hours', text: t('createPollDialog.8Hours') },
    { value: '24Hours', text: t('createPollDialog.24Hours') },
    { value: '3Days', text: t('createPollDialog.3Days') },
    { value: '1Week', text: t('createPollDialog.1Week') },
    { value: '2Weeks', text: t('createPollDialog.2Weeks') },
])
const allowMultipleAnswers = ref<boolean>(false)
const expressionPicker = ref<InstanceType<typeof ExpressionPicker>>()
const emojiContextMenu = ref<InstanceType<typeof ContextMenu>>()
const expressionPickerVisible = ref<boolean>(false)
const choosingEmojiAnswerIndex = ref<number>(-1)

const emojiContextMenuItems = ref([
    {
        label: t('createPollDialog.replaceEmoji'),
        async command() {
            if (answers.value[choosingEmojiAnswerIndex.value]) {
                expressionPickerVisible.value = true
                await nextTick()
                expressionPicker.value?.show(new MouseEvent('click'))
            }
        }
    },
    {
        labelClass: 'text-feedback-critical',
        label: t('createPollDialog.removeEmoji'),
        command() {
            if (answers.value[choosingEmojiAnswerIndex.value]) {
                answers.value[choosingEmojiAnswerIndex.value]!.emoji = ''
            }
        }
    },
])

function removeAnswer(answerIndex: number) {
    answers.value.splice(answerIndex, 1)
}

function addAnswer() {
    answers.value.push({
        emoji: '',
        body: '',
        validation: undefined,
    })
}

async function chooseEmoji(event: Event, answerIndex: number) {
    choosingEmojiAnswerIndex.value = answerIndex
    if (answers.value[choosingEmojiAnswerIndex.value]?.emoji) {
        emojiContextMenu.value?.show(event)
    } else {
        expressionPickerVisible.value = true
        await nextTick()
        expressionPicker.value?.show(event)
    }
}

function onEmojiSelected(emoji: EmojiPickerEmojiItem) {
    if (answers.value[choosingEmojiAnswerIndex.value]) {
        answers.value[choosingEmojiAnswerIndex.value]!.emoji = emoji.emoji
    }
    expressionPickerVisible.value = false
    expressionPicker.value?.hide()
}

async function post() {
    isSaving.value = true
    try {

        let willSubmit = true;
        if (question.value.trim().length === 0) {
            questionValidation.value = 'required'
            willSubmit = false;
        } else {
            questionValidation.value = undefined
        }
        for (const answer of answers.value) {
            if (answer.body.trim().length === 0) {
                answer.validation = 'required'
                willSubmit = false;
            } else {
                answer.validation = undefined
            }
        }

        if (!willSubmit) {
            return
        }

        await createPollStartEvent()
        emit('update:visible', false)
    } catch (error) {
        toast.add({ severity: 'error', summary: t('createPollDialog.postError'), life: 5000 })
    } finally {
        isSaving.value = false
    }
}

async function createPollStartEvent() {
    let eventContent: EventPollStartContent = {
        'm.text': [
            {
                mimetype: 'text/plain',
                body: `${question.value}\n${answers.value.map((answer, index) => {
                    return `${index + 1}. ${answer.emoji}${answer.body}`
                }).join('\n')}`
            },
        ],
        'm.poll': {
            kind: 'm.disclosed',
            maxSelections: allowMultipleAnswers.value ? answers.value.length : 1,
            question: {
                'm.text': [
                    { body: question.value },
                ],
            },
            answers: answers.value.map((answer, index) => {
                return {
                    'm.id': `${index + 1}-${answer.body.split(/\s+/).join('-').toLowerCase().replace(/[^a-z0-9\-]/g, '').slice(0, 30)}`,
                    'm.text': [
                        { body: (answer.emoji ? answer.emoji + ' ' : '') + answer.body },
                    ],
                }
            }),
        },
    }

    const txnId = uuidv4()
    const event: ApiV3SyncClientEventWithoutRoomId = reactive({
        content: eventContent,
        eventId: `PLACEHOLDER_${txnId}`,
        originServerTs: Date.now(),
        sender: sessionUserId.value!,
        type: 'm.poll.start',
        txnId,
        sendError: false,
    })

    populateSentMessageEvent(props.roomId, event)
    try {
        let groupSession: GroupSession | undefined = await getOutboundGroupSession(props.roomId)
        const response = await sendMessageEvent<EventPollStartContent>(
            props.roomId, event.type, txnId, event.content, groupSession
        )
        associateTransactionIdWithEventId(props.roomId, txnId, response.eventId)
    } catch (error) {
        log.error('Error sending message:', error)
        event.sendError = true
    }
}

watch(() => props.visible, (visible, wasVisible) => {
    if (visible && !wasVisible) {
        question.value = ''
        answers.value = [
            { emoji: '', body: '', validation: undefined },
            { emoji: '', body: '', validation: undefined },
        ]
        duration.value = '24Hours'
        allowMultipleAnswers.value = false
        if (isMobileView.value && !routeHashCategoryExists(route, 'create-poll')) {
            pushRouteHashCategory(router, 'create-poll')
        }
    } else if (!visible && wasVisible) {
        if (isMobileView.value && routeHashCategoryExists(route, 'create-poll')) {
            popRouteHashCategory(router, 'create-poll')
        }
    }
})

onHistoryNavigation((to, from, info) => {
    if (isMobileView.value && info.source === 'browser') {
        if (routeHashCategoryExists(to, 'create-poll')) {
            if (!props.visible) {
                emit('update:visible', true)
            }
        } else if (props.visible) {
            emit('update:visible', false)
        }
    }
})

</script>
