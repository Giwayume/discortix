<template>
    <div class="my-16 mx-auto max-w-174">
        <section class="px-3 py-2">
            <div class="flex mb-6 gap-6">
                <div class="grow-1">
                    <label
                        for="user-settings-advanced-developer-mode"
                        class="text-md mb-1 text-(--text-strong)"
                    >{{ t('userSettings.advanced.developerMode') }}</label>
                    <p class="text-sm text-(--text-subtle)">{{ t('userSettings.advanced.developerModeDescription') }}</p>
                </div>
                <div class="shrink-1">
                    <ToggleSwitch id="user-settings-advanced-developer-mode" v-model="settings.isDeveloperMode" />
                </div>
            </div>
        </section>
        <template v-if="settings.isDeveloperMode">
            <div class="border-t border-(--border-subtle) my-10 mx-3" />
            <section class="px-3 py-2">
                <div class="mb-6">
                    <h2 class="text-2xl leading-6 font-normal mb-1 text-(--text-strong)">{{ t('userSettings.advanced.storageManagementHeading') }}</h2>
                    <p class="text-sm text-(--text-subtle)">{{ t('userSettings.advanced.storageManagementDescription') }}</p>
                </div>
                <div class="flex flex-wrap gap-2">
                    <Button severity="secondary" size="small" @click="resyncAllRooms()">
                        {{ t('userSettings.advanced.resyncRoomsButton') }}
                    </Button>
                </div>
            </section>
        </template>
    </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { useClientSettingsStore } from '@/stores/client-settings'
import { useSyncStore } from '@/stores/sync'
import {
    deleteTableKey as deleteDiscortixTableKey,
} from '@/stores/database/discortix'

import Button from 'primevue/button'
import ToggleSwitch from 'primevue/toggleswitch'

const { t } = useI18n()
const { settings } = useClientSettingsStore()
const { setNextBatch } = useSyncStore()

async function resyncAllRooms() {
    setNextBatch(undefined)
    await Promise.allSettled([
        deleteDiscortixTableKey('rooms', 'invited'),
        deleteDiscortixTableKey('rooms', 'knocked'),
        deleteDiscortixTableKey('rooms', 'joined'),
        deleteDiscortixTableKey('rooms', 'left'),
    ])
    localStorage.removeItem('mx_broadcast_lock_leader_id')
    localStorage.removeItem('mx_broadcast_lock_leader_ts')
    window.location.reload()
}

</script>