<template>
    <MainHeader>
        <div class="flex pl-4 py-2 pr-2 items-center">
            <h1 class="font-medium text-(--text-strong) mr-2">
                {{ t('room.unknownRoom') }}
            </h1>
        </div>
    </MainHeader>
    <MainBody>
        <div class="absolute top-0 left-0 right-0 bottom-0 flex flex-col items-center justify-center p-10">
            <h2 class="text-(--text-strong) text-xl mb-2">{{ t('room.unknownRoom') }}</h2>
            <p class="text-(--channels-default) max-w-120">{{ t('room.unknownRoomDescription') }}</p>
        </div>
    </MainBody>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import MainBody from '@/views/Layout/MainBody.vue'
import MainHeader from '@/views/Layout/MainHeader.vue'

const { t } = useI18n()
</script>

