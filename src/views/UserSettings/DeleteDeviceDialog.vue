<template>
    <Dialog
        :visible="visible"
        modal
        :draggable="false"
        :style="{ width: 'calc(100% - 1rem)', maxWidth: '30rem' }"
        @update:visible="emit('update:visible', $event)"
    >
        <template #header>
            <div class="p-dialog-title">
                <template v-if="deleteError">
                    {{ t('userSettings.devices.deleteDevice.deleteErrorTitle') }}
                </template>
                <template v-else>
                    {{ t('userSettings.devices.deleteDevice.authenticationTitle') }}
                </template>
            </div>
        </template>
        <template v-if="deleteError">
            {{ t('userSettings.devices.deleteDevice.deleteErrorDescription') }}
        </template>
        <form v-else-if="deleteAuthenticationStep === 'm.login.password'" id="delete-device-password-auth-form" novalidate @submit.prevent="submitDeleteAuthenticationForm">
            <p class="text-sm text-muted">{{ t('userSettings.devices.deleteDevice.authenticationDescription') }}</p>
            <div class="p-staticlabel flex flex-col gap-2 mt-5 mb-1">
                <label for="delete-device-auth-password" class="text-strong">
                    {{ t('userSettings.devices.deleteDevice.passwordLabel') }}
                </label>
                <InputText
                    id="delete-device-auth-password"
                    v-model.trim="deleteFormAuthPasswordData.password" type="password"
                    :invalid="v$AuthPasswordForm.password.$invalid && v$AuthPasswordForm.$dirty"
                    required
                    autocomplete="off" autocorrect="off" autocapitalize="off"
                />
                <Message v-if="(v$AuthPasswordForm.password.$invalid && v$AuthPasswordForm.$dirty)" severity="error" size="small" variant="simple">
                    <template #icon>
                        <span class="pi pi-exclamation-circle !text-xs !leading-3 -mt-[1px]" aria-hidden="true" />
                    </template>
                    <template v-if="v$AuthPasswordForm.password.required.$invalid">
                        {{ t('userSettings.devices.deleteDevice.passwordRequired') }}
                    </template>
                    <template v-else>
                        {{ t('userSettings.devices.deleteDevice.passwordInvalid') }}
                    </template>
                </Message>
            </div>
        </form>
        <template v-else>
            {{ t('userSettings.devices.deleteDevice.authenticationMethodNotSupported') }}
        </template>
        <template #footer>
            <Button v-if="deleteAuthenticationStep === 'm.login.password'" type="submit" form="delete-device-password-auth-form" :loading="submittingDelete">
                {{ t('userSettings.devices.deleteDevice.authFormSubmitButton') }}
                <div class="p-button-loading-dots" />
            </Button>
        </template>
    </Dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'

import { useVuelidate } from '@vuelidate/core'
import { required } from '@vuelidate/validators'

import { HttpError } from '@/utils/error'

import { useDevices } from '@/composables/devices'

import { useSessionStore } from '@/stores/session'

import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'

import type {
    ApiV3DeviceResponse,
    ApiV3DeleteDeviceRequest,
    ApiV3DeleteDeviceAuthenticationResponse,
} from '@/types'

const { t } = useI18n()
const { deleteDevice } = useDevices()
const { userId: sessionUserId } = storeToRefs(useSessionStore())

const props = defineProps({
    visible: {
        type: Boolean,
        default: false,
    },
    otherDevices: {
        type: Array as PropType<ApiV3DeviceResponse[]>,
        default: [],
    }
})

const emit = defineEmits<{
    (e: 'update:visible', visible: boolean): void
    (e: 'update:otherDevices', otherDevices: ApiV3DeviceResponse[]): void
    (e: 'success' ): void
}>()

const deviceToDelete = ref<ApiV3DeviceResponse>()
const deleteAuthentication = ref<ApiV3DeleteDeviceAuthenticationResponse>()
const deleteError = ref<Error>()
const submittingDelete = ref<boolean>(false)

const deleteFormAuthPasswordData = reactive({
    password: '',
})
const isDeleteFormAuthPasswordInvalid = ref<boolean>(false)
const deleteFormAuthPasswordRules = {
    password: {
        required,
        invalid: () => !isDeleteFormAuthPasswordInvalid.value,
    },
}
const v$AuthPasswordForm = useVuelidate(deleteFormAuthPasswordRules, deleteFormAuthPasswordData)

const deleteAuthenticationStep = computed(() => {
    let preferredFlow: string | undefined = undefined
    for (const flow of deleteAuthentication.value?.flows ?? []) {
        if (flow.stages[0] === 'm.login.password' && !deleteAuthentication.value?.completed?.includes('m.login.password')) {
            preferredFlow = 'm.login.password'
        }
    }
    return preferredFlow
})

async function submitDeleteAuthenticationForm() {
    if (!deviceToDelete.value) return
    deleteDeviceStart(deviceToDelete.value)
}

async function deleteDeviceStart(device: ApiV3DeviceResponse) {
    deleteError.value = undefined

    let auth: ApiV3DeleteDeviceRequest['auth'] | undefined = undefined
    if (deleteAuthenticationStep.value === 'm.login.password') {
        isDeleteFormAuthPasswordInvalid.value = false
        if (!await v$AuthPasswordForm.value.$validate()) return
        auth = {
            session: deleteAuthentication.value?.session,
            type: 'm.login.password',
            identifier: {
                type: 'm.id.user',
                user: sessionUserId.value,
            },
            password: deleteFormAuthPasswordData.password,
        }
    }

    submittingDelete.value = true
    try {
        await deleteDevice(device.deviceId, auth)
        emit('update:otherDevices', props.otherDevices.filter((device) => device.deviceId !== deviceToDelete.value?.deviceId))
        emit('update:visible', false)
        emit('success')
    } catch (error) {
        if (error instanceof HttpError) {
            if (error.status === 401) {
                if (deleteAuthenticationStep.value === 'm.login.password') {
                    isDeleteFormAuthPasswordInvalid.value = true
                }
                deleteAuthentication.value = await error.responseBody
            } else if (deleteAuthenticationStep.value === 'm.login.password') {
                isDeleteFormAuthPasswordInvalid.value = true
            } else {
                deleteError.value = error
            }
        } else {
            deleteError.value = new Error('The thrown object was not an error.')
        }
    } finally {
        submittingDelete.value = false
    }
}

function show(device: ApiV3DeviceResponse) {
    deviceToDelete.value = device
    deleteAuthentication.value = undefined

    deleteFormAuthPasswordData.password = ''
    v$AuthPasswordForm.value.$reset()

    emit('update:visible', true)
    deleteDeviceStart(device)
}

defineExpose({
    show,
})

</script>