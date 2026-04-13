<template>
    <Dialog
        :visible="visible"
        modal
        :header="dialogTitle"
        :style="{ width: 'calc(100% - 1rem)', maxWidth: '30rem' }"
        @update:visible="(visible) => emit('update:visible', visible)"
    >
        <div v-if="!isMessageEncrypted" v-html="micromark(t('fixDecryption.messageNotEncryptedInEncryptedRoom', { messageSenderDisplayname }))" />
        <template v-else-if="encryptionNotSupported">
            <template v-if="isSecureContext">
                {{ t('fixDecryption.deviceEncryptionNotSupported') }}
            </template>
            <template v-else>
                {{ t('fixDecryption.deviceEncryptionNotEnabledSecureContext') }}
            </template>
        </template>
        <template v-else-if="isRequestKeysError">
            {{ t('fixDecryption.roomKeyRequestError' )}}
        </template>
        <template v-else-if="isRequestingKeys">
            <template v-if="isDiscoveringUsers">
                {{ t('fixDecryption.roomKeyRequestDiscoveringUsers') }}
            </template>
            <template v-else-if="isWaitingForForwardedKeys">
                {{ t('fixDecryption.roomKeyRequestWaitingForKeys') }}
            </template>
            <template v-else>
                {{ t('fixDecryption.roomKeyRequestRequestingKeys') }}
            </template>
            <ProgressBar mode="indeterminate" class="my-4"></ProgressBar>
        </template>
        <template v-else-if="!messageHasRoomKey">
            <p>{{ t('fixDecryption.roomKeyRequestInstructions') }}</p>
            <div class="flex mt-5 mb-2">
                <Button :label="t('fixDecryption.requestKeysButton')" class="ml-auto" @click="requestKeys" />
            </div>
        </template>
        <div v-else-if="!messageHasDecryptedEvent" v-html="micromark(t('fixDecryption.decryptionFailed'))" />
        <template v-else>
            {{ t('fixDecryption.roomKeyFound') }}
        </template>

        <!-- <p class="text-default">{{ t('identityVerification.subtitle') }}</p>
        <div class="flex items-stretch justify-center gap-2 my-5">
            <Button severity="secondary">
                <div class="flex flex-col items-center">
                    <span class="pi pi-mobile !text-2xl mb-2" aria-hidden="true" />
                    {{ t('identityVerification.verifyWithAnotherDeviceButton') }}
                </div>
            </Button>
            <Button severity="secondary" @click="recoveryKeyDialogVisible = true">
                <div class="flex flex-col items-center">
                    <span class="pi pi-key !text-2xl mb-2" aria-hidden="true" />
                    {{ t('identityVerification.verifyWithRecoveryKeyButton') }}
                </div>
            </Button>
        </div>
        <p class="text-sm text-muted">
            {{ t('identityVerification.lostRecoveryMethods') }}
            <a href="#">{{ t('identityVerification.resetIdentityLink') }}</a>
        </p> -->
    </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { micromark } from 'micromark'
import { v4 as uuidv4 } from 'uuid'

import { ConcurrencyLimiter } from '@/utils/timing'
import { until } from '@/utils/vue'

import { useCryptoKeys } from '@/composables/crypto-keys'
import { createLogger } from '@/composables/logger'
import { useOlm } from '@/composables/olm'

import { useAccountDataStore } from '@/stores/account-data'
import { useCryptoKeysStore } from '@/stores/crypto-keys'
import { useMegolmStore } from '@/stores/megolm'
import { useProfileStore } from '@/stores/profile'
import { useRoomStore } from '@/stores/room'
import { useSessionStore } from '@/stores/session'

import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import ProgressBar  from 'primevue/progressbar'

import type { EventRoomEncryptedContent, EventRoomKeyRequestContent } from '@/types'

const log = createLogger(import.meta.url)

const { t } = useI18n()
const { fetchUserKeys } = useCryptoKeys()
const { sendMessageToDevices } = useOlm()

const { userNicknames } = storeToRefs(useAccountDataStore())
const {
    encryptionNotSupported,
    deviceKeys,
} = storeToRefs(useCryptoKeysStore())
const { megolmSessionExists } = useMegolmStore()
const roomStore = useRoomStore()
const { profiles } = storeToRefs(useProfileStore())
const { userId: sessionUserId, deviceId: sessionDeviceId } = storeToRefs(useSessionStore())
const {
    joined: joinedRooms,
    decryptedRoomEvents,
} = storeToRefs(roomStore)
const {
    getTimelineEventById,
} = roomStore

const props = defineProps({
    visible: {
        type: Boolean,
        default: false,
    },
    roomId: {
        type: String,
        default: undefined,
    },
    eventId: {
        type: String,
        default: undefined,
    },
})

const emit = defineEmits<{
    (e: 'update:visible', visible: boolean): void
}>()

watch(() => props.visible, (visible, wasVisible) => {
    if (visible && !wasVisible) {
        isRequestingKeys.value = false
        isRequestKeysError.value = false
        isDiscoveringUsers.value = false
        isWaitingForForwardedKeys.value = false
    }
})

const isSecureContext = !!window.isSecureContext

const event = computed(() => {
    const room = joinedRooms.value[props.roomId ?? -1]
    if (!room) return
    return getTimelineEventById(room.visibleTimeline, props.eventId)
})

const isMessageEncrypted = computed(() => {
    return event.value?.type === 'm.room.encrypted'
})

const messageSenderDisplayname = computed(() => {
    const userId = event.value?.sender ?? ''
    return userNicknames.value[userId] ?? profiles.value[userId]?.displayname ?? userId ?? t('fixDecryption.unknownUser')
})

const dialogTitle = computed(() => {
    return isMessageEncrypted.value ? t('fixDecryption.title') : t('fixDecryption.noEncryptionTitle')
})

const messageHasRoomKey = computed<boolean>(() => {
    if (!event.value) return false
    if (event.value.type === 'm.room.encrypted') {
        const eventContent = event.value.content as EventRoomEncryptedContent
        return megolmSessionExists(props.roomId!, eventContent.sessionId!, eventContent.senderKey!)
    }
    return false
})

const messageHasDecryptedEvent = computed<boolean>(() => {
    if (!event.value) return false
    return !!decryptedRoomEvents.value[event.value.eventId]
})

/*----------------*\
|                  |
|   Request Keys   |
|                  |
\*----------------*/

const isRequestingKeys = ref<boolean>(false)
const isRequestKeysError = ref<boolean>(false)
const isDiscoveringUsers = ref<boolean>(false)
const isWaitingForForwardedKeys = ref<boolean>(false)

async function requestKeys() {
    isRequestingKeys.value = true
    isDiscoveringUsers.value = true

    if (event.value?.type !== 'm.room.encrypted') return
    let eventContent = event.value.content as EventRoomEncryptedContent
    if (!eventContent?.sessionId || !eventContent?.senderKey) return

    try {
        const room = joinedRooms.value[props.roomId ?? -1]
        if (!room) throw new Error('Missing room.')

        const userIdSet = new Set(room.stateEventsByType['m.room.member']
            ?.filter((memberEvent) => memberEvent.content?.membership === 'join' && memberEvent.sender !== sessionUserId.value)
            ?.map((memberEvent) => memberEvent.sender) ?? [])
        userIdSet.add(sessionUserId.value!)

        const userIds = Array.from(userIdSet).sort((a, b) => {
            if (a === sessionUserId.value) return -1
            if (b === sessionUserId.value) return 1
            return 0
        })

        if (userIds.length === 0) throw new Error('No other joined members in room.')

        await fetchUserKeys(userIds)

        isDiscoveringUsers.value = false

        const limiter = new ConcurrencyLimiter(10)
        for (const userId of userIds) {
            const userDeviceIds = Object.keys(deviceKeys.value[userId] ?? {})
            const sendToUsers: Array<[string, string]> = []
            for (const deviceId of userDeviceIds) {
                if (userId === sessionUserId.value && deviceId === sessionDeviceId.value) continue
                sendToUsers.push([userId, deviceId])
            }
            if (messageHasRoomKey.value) break
            await limiter.available()
            limiter.add(
                sendMessageToDevices<EventRoomKeyRequestContent>(sendToUsers, 'm.room_key_request', {
                    action: 'request',
                    body: {
                        algorithm: 'm.megolm.v1.aes-sha2',
                        roomId: room.roomId,
                        sessionId: eventContent.sessionId,
                        senderKey: eventContent.senderKey,
                    },
                    requestId: uuidv4(),
                    requestingDeviceId: sessionDeviceId.value!,
                })
            )
        }
        await limiter.waitForIdle()

        isWaitingForForwardedKeys.value = true
        await until(() => messageHasRoomKey.value, 5000)
        await until(() => messageHasDecryptedEvent.value, 100)
        isWaitingForForwardedKeys.value = false

        if (!messageHasRoomKey.value) {
            isRequestKeysError.value = true
        }
    } catch (error) {
        log.error('Error while requesting keys: ', error)
        isRequestKeysError.value = true
    } finally {
        isRequestingKeys.value = false
    }

}

</script>

<style lang="scss" scoped>
:deep(p) {
    margin: 1rem 0;
    &:first-child {
        margin-top: 0;
    }
    &:last-child {
        margin-bottom: 0;
    }
    + ul, + ol {
        margin-top: -1rem;
    }
}
:deep(ul) {
    display: block;
    list-style: disc;
    padding: 0 0 0 1.5rem;
    line-height: 1.2;
    margin: 0;
    white-space-collapse: collapse;

    li {
        display: list-item;
        margin: 0;
        white-space: break-spaces;
        line-height: 1.5;
    }
}
:deep(ol) {
    display: block;
    list-style: decimal;
    padding: 0 0 0 1.5rem;
    line-height: 1.2;
    margin: 0;
    white-space-collapse: collapse;

    li {
        display: list-item;
        margin: 0;
        white-space: break-spaces;
        line-height: 1.5;
    }
}
</style>