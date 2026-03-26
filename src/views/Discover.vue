<template>
    <Application key="mainApplication" :title="t('discover.title')" titleIcon="pi pi-users">
        <template #sidebar-list>
            <SidebarListHeader>
                <div class="flex justify-between gap-2 w-full">

                </div>
            </SidebarListHeader>
            <SidebarListBody>

            </SidebarListBody>
        </template>
        <MainHeader>
            <div class="flex pl-4 py-2 pr-2">
                {{ t('discover.title') }}
            </div>
        </MainHeader>
        <MainBody>

        </MainBody>
    </Application>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import Application from './Layout/Application.vue'
import MainBody from './Layout/MainBody.vue'
import MainHeader from './Layout/MainHeader.vue'
import SidebarListBody from './Layout/SidebarListBody.vue'
import SidebarListHeader from './Layout/SidebarListHeader.vue'

const { t } = useI18n()

</script>