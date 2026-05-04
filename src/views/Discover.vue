<template>
    <Application key="mainApplication" :title="t('discover.title')" titleIcon="pi pi-compass">
        <template #sidebar-list>
            <SidebarListHeader>
                <div class="flex justify-between gap-2 w-full text-lg font-bold pl-2">
                    {{ t('discover.title') }}
                </div>
            </SidebarListHeader>
            <SidebarListBody>
                <div class="pt-3 pb-2 px-2">
                    <FloatLabel class="w-full" variant="in">
                        <Select
                            v-model="selectedHomeserver"
                            labelId="discover-homeserver-label"
                            :options="homeservers"
                            optionLabel="name"
                            class="w-full"
                            :style="{ '--p-select-border-color': 'transparent' }"
                            @change="onChangeSelectedHomeserver"
                        />
                        <label id="discover-homeserver-label" class="text-strong">
                            {{ t('discover.sidebarMenu.homeserver') }}
                        </label>
                    </FloatLabel>
                </div>
                <div class="border-(--border-subtle) border-t mb-1" />
                <Menu
                    :model="sidebarMenuItems"
                    :style="{
                        '--p-menu-item-focus-background': 'var(--background-mod-subtle)',
                        '--p-menu-item-active-background': 'var(--background-mod-subtle)',
                        '--p-menu-item-padding': '1rem 0.5rem',
                    }"
                    class="p-2"
                >
                    <template #item="{ item }">
                        <a
                            class="p-menu-item-link"
                            :class="{ 'p-menu-item-link-active': route.name === item.key }"
                            tabindex="-1"
                        >
                            <span class="p-menu-item-icon mx-1" :class="item.icon" />
                            <span class="p-menu-item-label">{{ item.label }}</span>
                        </a>
                    </template>
                </Menu>
            </SidebarListBody>
        </template>
        <RouterView v-slot="{ Component }">
            <component
                :is="Component"
                :selectedHomeserver="selectedHomeserver.url != 'add' ? selectedHomeserver.url : ''"
            />
        </RouterView>
    </Application>
    <Dialog
        v-model:visible="addHomeserverDialogVisible"
        modal
        :draggable="false"
        :header="t('discover.addHomeserver.title')"
        :style="{ width: 'calc(100% - 1rem)', maxWidth: '30rem' }"
    >
        <p class="text-muted">{{ t('discover.addHomeserver.subtitle') }}</p>
        <form id="add-discover-homeserver-dialog-form" @submit.prevent="addHomeserverConfirm()">
            <div class="p-staticlabel flex flex-col gap-2 mt-4 mb-2">
                <label for="add-homeserver-url">{{ t('discover.addHomeserver.serverName') }}</label>
                <InputText id="add-homeserver-url" v-model="newHomeserverUrl" class="w-full" />
            </div>
            <Message v-if="showInvalidServerError" severity="error" size="small" variant="simple" class="mt-2">
                <template #icon>
                    <span class="pi pi-exclamation-circle !text-xs !leading-3 -mt-[1px]" aria-hidden="true" />
                </template>
                {{ t('discover.addHomeserver.invalidServerError') }}
            </Message>
        </form>
        <template #footer>
            <Button
                form="add-discover-homeserver-dialog-form"
                type="submit"
                :label="t('discover.addHomeserver.addButton')"
                :loading="isSubmittingNewHomeserver"
            >
                <span class="p-button-label">{{ t('discover.addHomeserver.addButton') }}</span>
                <span class="p-button-loading-dots" />
            </Button>
        </template>
    </Dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'

import { useApplication } from '@/composables/application'

import { useClientSettingsStore } from '@/stores/client-settings'
import { useRooms } from '@/composables/rooms'
import { useSessionStore } from '@/stores/session'

import Application from './Layout/Application.vue'
import SidebarListBody from './Layout/SidebarListBody.vue'
import SidebarListHeader from './Layout/SidebarListHeader.vue'

import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import FloatLabel from 'primevue/floatlabel'
import InputText from 'primevue/inputtext'
import Menu from 'primevue/menu'
import Message from 'primevue/message'
import Select, { type SelectChangeEvent } from 'primevue/select'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const { toggleApplicationSidebar } = useApplication()
const { searchRoomDirectory } = useRooms()

const { settings } = useClientSettingsStore()
const { defaultUserIdHomeserver } = storeToRefs(useSessionStore())

interface HomeserverOption {
    url: string;
    name: string;
}

const homeservers = computed<HomeserverOption[]>(() => {
    return [
        {
            url: '',
            name: defaultUserIdHomeserver.value,
        },
        ...settings.discoveryServers.map((url) => ({
            url,
            name: url,
        })),
        {
            url: 'add',
            name: t('discover.sidebarMenu.addHomeserver'),
        },
    ]
})
const selectedHomeserver = ref<HomeserverOption>(homeservers.value[0]!)
const addHomeserverDialogVisible = ref<boolean>(false)
const newHomeserverUrl = ref<string>('')
const isSubmittingNewHomeserver = ref<boolean>(false)
const showInvalidServerError = ref<boolean>(false)

const sidebarMenuItems = computed(() => {
    const items = [
        {
            key: 'discover-spaces',
            label: t('discover.sidebarMenu.publicSpaces'),
            icon: 'pi pi-home',
            command() {
                router.push({
                    name: 'discover-spaces',
                })
                toggleApplicationSidebar(false)
            },
        },
        {
            key: 'discover-rooms',
            label: t('discover.sidebarMenu.publicRooms'),
            icon: 'pi pi-hashtag',
            command() {
                router.push({
                    name: 'discover-rooms',
                })
                toggleApplicationSidebar(false)
            },
        },
    ]
    return items
})

watch(() => addHomeserverDialogVisible.value, (visible, wasVisible) => {
    if (visible && !wasVisible) {
        newHomeserverUrl.value = ''
        isSubmittingNewHomeserver.value = false
        showInvalidServerError.value = false
    }
})

function onChangeSelectedHomeserver(value: SelectChangeEvent) {
    if (value.value.url === 'add') {
        nextTick(() => {
            selectedHomeserver.value = homeservers.value[0]!
        })
        addHomeserverDialogVisible.value = true
    }
}

async function addHomeserverConfirm() {
    isSubmittingNewHomeserver.value = true
    showInvalidServerError.value = false
    try {
        await searchRoomDirectory(
            '',
            newHomeserverUrl.value,
            undefined,
            undefined,
            1,
        )
        if (!settings.discoveryServers.includes(newHomeserverUrl.value)) {
            settings.discoveryServers.push(newHomeserverUrl.value)
        }
        selectedHomeserver.value = homeservers.value.find((server) => server.url === newHomeserverUrl.value)!
        addHomeserverDialogVisible.value = false
    } catch (error) {
        showInvalidServerError.value = true
    } finally {
        isSubmittingNewHomeserver.value = false
    }
}

</script>
