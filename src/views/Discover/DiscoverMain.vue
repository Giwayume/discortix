<template>
    <MainHeader>
        <div class="flex items-center justify-between w-full pl-4 py-2 pr-4">
            <span :class="headerIcon" aria-hidden="true" />
            <IconField>
                <InputIcon class="pi pi-search" />
                <InputText size="small" :placeholder="t('discover.searchPlaceholder')" />
            </IconField>
        </div>
    </MainHeader>
    <MainBody>
        <div class="hero-banner">
            <h2 class="text-6xl uppercase">{{ t('discover.spaceHeroTitle') }}</h2>
            <p class="text-muted">{{ t('discover.spaceHeroSubtitle') }}</p>
        </div>
        <div v-if="isSearching">
            <ProgressBar mode="indeterminate" :style="{ '--p-progressbar-border-radius': '0' }" />
        </div>
        <div v-else class="px-4">
            <h2 class="pt-8 pl-6 text-xl text-strong">{{ featuredTitle }}</h2>
            <div v-if="rooms.length > 0" class="space-cards">
                <article
                    v-for="room of rooms"
                    :key="room.roomId"
                    class="space-card"
                    :style="{
                        '--space-card-header-color': roomHeaderColors[room.roomId],
                    }"
                >
                    <header>
                        <div class="space-card__icon">
                            <AuthenticatedImage :mxcUri="room.avatarUrl" :generateAverageColor="true" @averageColor="updateRoomHeaderColor(room.roomId, $event)">
                                <template v-slot="{ src }">
                                    <img :src="src" :alt="t('discover.avatarImage')">
                                </template>
                            </AuthenticatedImage>
                        </div>
                    </header>
                    <div class="flex flex-col grow-1 p-4 pt-7 overflow-hidden">
                        <h3 class="shrink-0 text-strong overflow-hidden text-ellipsis font-bold whitespace-nowrap">
                            {{ room.name ?? defaultRoomName }}
                        </h3>
                        <p v-if="room.topic" class="text-sm mt-0 mb-4 overflow-hidden shrink-1 max-h-16">
                            {{ room.topic }}
                        </p>
                        <div class="inline-flex items-center text-sm mt-auto shrink-0">
                            <span class="pi pi-circle-fill text-[0.5rem]! mr-1" aria-hidden="true" />
                            <span>{{ t('discover.memberCount', { count: room.numJoinedMembers }) }}</span>
                        </div>
                    </div>
                </article>
            </div>
            <div v-else class="text-subtle py-4 px-6">
                {{ nothingFound }}
            </div>
        </div>
    </MainBody>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'

import { useRooms } from '@/composables/rooms'

import AuthenticatedImage from '@/views/Common/AuthenticatedImage.vue'
import MainBody from '@/views/Layout/MainBody.vue'
import MainHeader from '@/views/Layout/MainHeader.vue'

import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import InputText from 'primevue/inputtext'
import ProgressBar from 'primevue/progressbar'

import type { ApiV3PublicRoomChunk } from '@/types'

const route = useRoute()
const { t } = useI18n()

const { searchRoomDirectory } = useRooms()

const props = defineProps({
    selectedHomeserver: {
        type: String,
        default: '',
    }
})

const rooms = ref<ApiV3PublicRoomChunk[]>([])
const nextBatch = ref<string>()
const prevBatch = ref<string>()
const roomHeaderColors = ref<Record<string, string>>({})
const searchText = ref<string>('')
const isSearching = ref<boolean>(false)

const headerIcon = computed(() => {
    return route.name === 'discover-spaces' ? 'pi pi-home' : 'pi pi-hashtag'
})

const defaultRoomName = computed(() => {
    return route.name === 'discover-spaces' ? t('discover.untitledSpace') : t('discover.untitledRoom')
})

const featuredTitle = computed(() => {
    return route.name === 'discover-spaces' ? t('discover.featuredSpaces') : t('discover.featuredRooms')
})

const nothingFound = computed(() => {
    return route.name === 'discover-spaces' ? t('discover.noSpacesFound') : t('discover.noRoomsFound')
})

onMounted(() => {
    searchRooms()
})

watch(() => props.selectedHomeserver, () => {
    searchRooms()
})
watch(() => route.name, () => {
    searchRooms()
})

function updateRoomHeaderColor(roomId: string, color: string) {
    roomHeaderColors.value[roomId] = color
}

async function searchRooms() {
    isSearching.value = true
    try {
        const searchResponse = await searchRoomDirectory(
            searchText.value,
            props.selectedHomeserver,
            route.name === 'discover-spaces' ? ['m.space'] : [null],
        )
        rooms.value = searchResponse.chunk
        nextBatch.value = searchResponse.nextBatch
        prevBatch.value = searchResponse.prevBatch
    } catch (error) {

    } finally {
        isSearching.value = false
    }
}

</script>

<style scoped lang="scss">
.application__main__header {
    background: transparent;
}
.application__main__body {
    top: 0 !important;
}
:deep(.application__main__body-container) .p-scrollpanel {
    height: 100% !important;
}
.hero-banner {
    background: var(--background-base-lowest);
    background-image: radial-gradient(130.66% 324.98% at -3.95% 0px, rgb(47, 114, 193) 0px, rgba(37, 34, 154, 0.8) 35.73%, rgba(25, 23, 92, 0) 100%), none;
    padding: 7rem 0.5rem 4rem 2rem;

    h2 {
        font-family: "Bebas Neue",Arial,sans-serif;
    }
}
.space-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
    gap: 1rem;
    padding: 1rem;
}
.space-card {
    display: flex;
    flex-direction: column;
    position: relative;
    width: 100%;
    height: 20rem;
    background-color: var(--background-base-low);
    border: 1px solid var(--border-subtle);
    border-radius: 0.5rem;
    box-shadow: none;
    max-width: 25rem;
    cursor: pointer;
    transition: background-color 0.3s, border-color 0.3s;

    > header {
        display: block;
        position: relative;
        background: var(--space-card-header-color, var(--background-base-lowest));
        height: 9.125rem;
        border-radius: 0.5rem 0.5rem 0 0;
        flex-shrink: 0;
    }

    &:hover {
        background-color: var(--background-surface-high);
        border-color: var(--border-strong);
        box-shadow: var(--shadow-low);

        .space-card__icon::before {
            background-color: var(--background-surface-high);
        }
    }
}
.space-card__icon {
    display: block;
    position: absolute;
    bottom: -1.75rem;
    left: 0.625rem;
    width: 3.5rem;
    height: 3.5rem;
    

    &::before {
        content: '';
        display: block;
        position: absolute;
        width: 4rem;
        height: 4rem;
        left: -0.25rem;
        top: -0.25rem;
        background-color: var(--background-base-low);
        mask: var(--application-space-icon-mask);
        mask-size: 4rem;
        mask-repeat: no-repeat;
        transition: background-color 0.3s;
    }

    img {
        display: block;
        width: 3.5rem;
        height: 3.5rem;
        background-color: var(--background-base-lowest);
        mask: var(--application-space-icon-mask);
        mask-size: 3.5rem;
        mask-repeat: no-repeat;
    }
}
</style>