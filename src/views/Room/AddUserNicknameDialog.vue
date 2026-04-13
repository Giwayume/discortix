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
            <div class="p-dialog-title">{{ t(isAdding ? 'addUserNicknameDialog.addTitle' : 'addUserNicknameDialog.changeTitle') }}</div>
        </template>

        <p class="text-subtle mb-4">{{ t('addUserNicknameDialog.instructions') }}</p>

        <form :id="'add-user-nickname-form-' + uuid" @submit.prevent="save">
            <div class="flex flex-col">
                <label :for="'user-nickname-input-' + uuid" class="pb-2 text-primary font-bold">{{ t('addUserNicknameDialog.nicknameLabel') }}</label>
                <InputText :id="'user-nickname-input-' + uuid" v-model="nickname" :placeholder="defaultNickname" />
            </div>
            <button type="button" class="link text-sm my-2" @click="nickname = ''">{{ t('addUserNicknameDialog.resetNicknameLink') }}</button>
        </form>
        
        <template #footer>
            <Button class="basis-1 grow-1" severity="secondary" autofocus :label="t('addUserNicknameDialog.cancelButton')" @click="emit('update:visible', false)" />
            <Button :form="'add-user-nickname-form-' + uuid" type="submit" class="basis-1 grow-1" severity="primary" :loading="isSaving">
                <span class="p-button-label">{{ t('addUserNicknameDialog.saveButton') }}</span>
                <span class="p-button-loading-dots" />
            </Button>
        </template>
    </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { v4 as uuidv4 } from 'uuid'

import { useAccountData } from '@/composables/account-data'

import { useAccountDataStore } from '@/stores/account-data'
import { useProfileStore } from '@/stores/profile'

import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import { useToast } from 'primevue/usetoast'

import type {
    EventInvalidDiscortixUserNicknamesContent,
} from '@/types'

const uuid = uuidv4()
const { t } = useI18n()
const toast = useToast()

const { setAccountDataByType } = useAccountData()

const { userNicknames } = storeToRefs(useAccountDataStore())
const { profiles } = storeToRefs(useProfileStore())

const props = defineProps({
    visible: {
        type: Boolean,
        default: false,
    },
    userId: {
        type: String,
        default: undefined,
    },
})

const emit = defineEmits<{
    (e: 'update:visible', visible: boolean): void
}>()

const isAdding = computed<boolean>(() => {
    return !userNicknames.value[props.userId!]
})

const defaultNickname = computed<string>(() => {
    return profiles.value[props.userId!]?.displayname ?? props.userId ?? ''
})

const isSaving = ref<boolean>(false)
const nickname = ref<string>('')

async function save() {
    if (props.userId) {
        isSaving.value = true
        try {
            const nicknames: Record<string, string> = { ...userNicknames.value }
            if (!nickname.value) {
                delete nicknames[props.userId]
            } else {
                nicknames[props.userId] = nickname.value
            }
            await setAccountDataByType('invalid.discortix.user_nicknames', {
                nicknames,
            } satisfies EventInvalidDiscortixUserNicknamesContent)
        } catch (error) {
            toast.add({ severity: 'error', summary: t('addUserNicknameDialog.saveError'), life: 5000 })
        } finally {
            isSaving.value = false
        }
    }
    emit('update:visible', false)
}

watch(() => props.visible, (visible, wasVisible) => {
    if (visible && !wasVisible) {
        nickname.value = userNicknames.value[props.userId!] ?? ''
    }
})

</script>
