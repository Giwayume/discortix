<template>
    <div class="my-16 mx-auto max-w-174">
        <section class="px-3 py-2">
            <div class="flex mb-6 gap-6">
                <div class="grow-1">
                    <label
                        for="user-settings-advanced-developer-mode"
                        class="text-md mb-1 text-strong"
                    >{{ t('userSettings.advanced.developerMode') }}</label>
                    <p class="text-sm text-subtle">{{ t('userSettings.advanced.developerModeDescription') }}</p>
                </div>
                <div class="shrink-1">
                    <ToggleSwitch input-id="user-settings-advanced-developer-mode" v-model="settings.isDeveloperMode" />
                </div>
            </div>
        </section>
        <template v-if="settings.isDeveloperMode">
            <div class="border-t border-(--border-subtle) my-10 mx-3" />
            <section class="px-3 py-2">
                <div class="mb-6">
                    <h2 class="text-2xl leading-6 font-normal mb-1 text-strong">{{ t('userSettings.advanced.storageManagementHeading') }}</h2>
                    <p class="text-sm text-subtle">{{ t('userSettings.advanced.storageManagementDescription') }}</p>
                </div>
                <div class="flex flex-wrap gap-2">
                    <Select
                        v-model="storageManagementOption"
                        size="small"
                        :options="storageManagementOptions"
                        option-value="value"
                        option-label="text"
                    />
                    <Button severity="secondary" size="small" @click="applyStorageManagement()">
                        {{ t('userSettings.advanced.storageManagementApplyButton') }}
                    </Button>
                </div>
            </section>
        </template>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import { useBroadcast } from '@/composables/broadcast'

import { useClientSettingsStore } from '@/stores/client-settings'
import { useMegolmStore } from '@/stores/megolm'
import { useSyncStore } from '@/stores/sync'
import {
    getAllTableKeys as getAllDiscortixTableKeys,
    deleteTableKey as deleteDiscortixTableKey,
} from '@/stores/database/discortix'

import Button from 'primevue/button'
import Select from 'primevue/select'
import ToggleSwitch from 'primevue/toggleswitch'

const { t } = useI18n()
const route = useRoute()

const { isLeader } = useBroadcast()

const { settings } = useClientSettingsStore()
const { deleteRoomInboundMegolmSessions } = useMegolmStore()
const { setNextBatch } = useSyncStore()

const storageManagementOption = ref<string>('resyncAllRooms')

const storageManagementOptions = [
    { value: 'resyncAllRooms', text: t('userSettings.advanced.storageManagementOptions.resyncAllRooms') },
    { value: 'deleteCurrentRoomKeys', text: t('userSettings.advanced.storageManagementOptions.deleteCurrentRoomKeys') },
]

async function resyncAllRooms() {
    setNextBatch(undefined)
    isLeader.value = false
    const keypairs: [[string, string]] = await getAllDiscortixTableKeys('rooms')
    const deletePromises: Promise<void>[] = []
    for (const [membershipType, roomId] of keypairs) {
        deletePromises.push(deleteDiscortixTableKey('rooms', [membershipType, roomId]))
    }
    await Promise.allSettled(deletePromises)
    localStorage.removeItem('mx_broadcast_lock_leader_id')
    localStorage.removeItem('mx_broadcast_lock_leader_ts')
    window.location.reload()
}

async function deleteCurrentRoomKeys() {
    if (route.name !== 'room') return
    const currentRoomId = route.params.roomId as string
    if (!currentRoomId) return
    await deleteRoomInboundMegolmSessions(currentRoomId)
    window.location.reload()
}

async function applyStorageManagement() {
    switch (storageManagementOption.value) {
        case 'resyncAllRooms':
            return resyncAllRooms()
        case 'deleteCurrentRoomKeys':
            return deleteCurrentRoomKeys()
    }
}

</script>