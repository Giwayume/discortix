<template>
    <MainHeader>
        <div class="flex pl-4 py-2 pr-2 items-center">
            <h1 class="font-medium text-(--text-strong) mr-2">
                {{ t('room.invitedRoomTitle') }}
            </h1>
        </div>
    </MainHeader>
    <MainBody>
        <div class="absolute top-0 left-0 right-0 bottom-0 flex flex-col items-center justify-center p-10">
            <h2 class="text-(--text-strong) text-xl mb-2">{{ t('room.invitedRoomTitle') }}</h2>
            <div
                class="text-(--channels-default) max-w-120"
                v-html="micromark(t(invitedByUserDisplayname === invitedByUserId ? 'room.invitedRoomDescription' : 'room.invitedRoomDescriptionWithUserId', { displayname: invitedByUserDisplayname, userId: invitedByUserId }))"
            />
            <div v-if="invitedRoomName" class="text-(--text-strong) mt-2">"{{ invitedRoomName }}"</div>
            <div class="flex justify-center mt-8 gap-2">
                <Button :loading="loadingJoinRoom" :disabled="loadingIgnoreRoom" @click="tryJoinRoom">
                    <div class="p-button-label">{{ t('room.acceptInviteButton') }}</div>
                    <div class="p-button-loading-dots" />
                </Button>
                <Button severity="secondary" :loading="loadingIgnoreRoom" :disabled="loadingJoinRoom" @click="tryIgnoreRoom">
                    <div class="p-button-label">{{ t('room.ignoreInviteButton') }}</div>
                    <div class="p-button-loading-dots" />
                </Button>
            </div>
        </div>
    </MainBody>
</template>

<script setup lang="ts">
import { computed, ref, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { micromark } from 'micromark'

import { useRooms } from '@/composables/rooms'

import { useProfileStore } from '@/stores/profile'
import { useRoomStore } from '@/stores/room'
import { useSessionStore } from '@/stores/session'

import MainBody from '@/views/Layout/MainBody.vue'
import MainHeader from '@/views/Layout/MainHeader.vue'

import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'

import { type InvitedRoom } from '@/types'

const { t } = useI18n()
const router = useRouter()
const toast = useToast()

const { joinRoom, leaveRoom, forgetRoom } = useRooms()

const { profiles } = storeToRefs(useProfileStore())
const { deleteInvitedRoom } = useRoomStore()
const { userId: sessionUserId } = storeToRefs(useSessionStore())

const props = defineProps({
    room: {
        type: Object as PropType<InvitedRoom>,
        required: true,
    }
})

const loadingJoinRoom = ref<boolean>(false)
const loadingIgnoreRoom = ref<boolean>(false)

const invitedByUserId = computed(() => {
    const myInvite = props.room.stateEventsByType['m.room.member']?.find((event) => {
        return event.content.membership === 'invite' && event.stateKey === sessionUserId.value
    })
    return myInvite?.sender
})

const invitedByUserDisplayname = computed(() => {
    return profiles.value[invitedByUserId.value!]?.displayname ?? invitedByUserId.value
})

const invitedRoomName = computed(() => {
    return props.room.stateEventsByType['m.room.name']?.[0]?.content?.name
})

async function tryJoinRoom() {
    loadingJoinRoom.value = true
    try {
        await joinRoom(props.room.roomId, t('messageRequests.dmJoinReason'))
    } catch (error) {
        toast.add({ severity: 'error', summary: t('messageRequests.joinRoomErrorToast'), life: 5000 })
    } finally {
        loadingJoinRoom.value = false
    }
}

async function tryIgnoreRoom() {
    loadingIgnoreRoom.value = true
    let isError = false
    try {
        await leaveRoom(props.room.roomId)
    } catch (error) {
        isError = true
        deleteInvitedRoom(props.room.roomId)
    }
    try {
        await forgetRoom(props.room.roomId)
    } catch (error) {
        isError = true
        deleteInvitedRoom(props.room.roomId)
    }
    if (isError) {
        toast.add({ severity: 'error', summary: t('messageRequests.rejectInviteErrorToast'), life: 5000 })
    }
    router.push({ name: 'home' })
    loadingIgnoreRoom.value = false

}

</script>

<style lang="scss" scoped>
:deep(p) {
    strong {
        color: var(--text-strong);
    }
    em {
        font-style: none;
        font-size: 0.75rem;
    }
}
</style>