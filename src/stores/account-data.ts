import { computed, ref, toRaw } from 'vue'
import { defineStore } from 'pinia'

import { deepToRaw } from '@/utils/vue'

import { useBroadcast } from '@/composables/broadcast'
import { createLogger } from '@/composables/logger'
import { onLogout } from '@/composables/logout'

import {
    getAllTableKeys as getAllDiscortixTableKeys,
    loadTableKey as loadDiscortixTableKey,
    saveTableKey as saveDiscortixTableKey,
} from '@/stores/database/discortix'

import {
    eventContentSchemaByType,
    type EventInvalidDiscortixHiddenRoomsContent,
    type EventInvalidDiscortixUserNicknamesContent,
    type EventInvalidDiscortixUserNotesContent,
    type ApiV3SyncAccountDataEvent,
    type ApiV3SyncResponse,
} from '@/types'

const log = createLogger(import.meta.url)

export const useAccountDataStore = defineStore('accountData', () => {
    const { isLeader, broadcastMessageFromTab, onTabMessage } = useBroadcast({ permanent: true })

    const accountDataLoading = ref<boolean>(true)
    const accountDataLoadError = ref<Error | null>(null)
    const accountData = ref<Record<string, any>>({})

    const hiddenRooms = computed<EventInvalidDiscortixHiddenRoomsContent['hiddenRooms']>(() => {
        return (accountData.value['invalid.discortix.hidden_rooms'] as EventInvalidDiscortixHiddenRoomsContent)?.hiddenRooms ?? {}
    })

    const userNicknames = computed<EventInvalidDiscortixUserNicknamesContent['nicknames']>(() => {
        return (accountData.value['invalid.discortix.user_nicknames'] as EventInvalidDiscortixUserNicknamesContent)?.nicknames ?? {}
    })

    const userNotes = computed<EventInvalidDiscortixUserNotesContent['notes']>(() => {
        return (accountData.value['invalid.discortix.user_notes'] as EventInvalidDiscortixUserNotesContent)?.notes ?? {}
    })

    async function initialize() {
        try {
            const keys: string[] = await getAllDiscortixTableKeys('accountData')
            const fetchPromises: Array<Promise<[string, ApiV3SyncAccountDataEvent]>> = []
            for (const key of keys) {
                fetchPromises.push(loadDiscortixTableKey('accountData', key).then((accountData) => [key, accountData]))
            }
            const settleResults = await Promise.allSettled(fetchPromises)
            for (const settleResult of settleResults) {
                if (settleResult.status === 'fulfilled') {
                    const [key, data] = settleResult.value
                    accountData.value[key] = data
                }
            }
        } catch (error) {
            if (error instanceof Error) {
                accountDataLoadError.value = error
            } else {
                accountDataLoadError.value = new Error('The thrown object was not an error.')
            }
        }
        accountDataLoading.value = false
    }
    initialize()

    async function populateFromApiV3SyncResponse(sync: ApiV3SyncResponse) {
        if (!sync.accountData?.events) return

        for (let accountDataItem of sync.accountData.events) {
            const schema = eventContentSchemaByType[accountDataItem.type as keyof typeof eventContentSchemaByType]
            const schemaParse = schema?.safeParse(accountDataItem.content)
            if (schema && !schemaParse?.success) {
                log.warn(`Skipped loading ${accountDataItem.type} account data event because it failed schema validation.`, schemaParse?.error)
                continue
            }
            accountData.value[accountDataItem.type] = accountDataItem.content

            if (isLeader.value) {
                saveDiscortixTableKey('accountData', accountDataItem.type, deepToRaw(accountDataItem.content)).catch(() => {
                    // Maybe this isn't the end of the world.
                })
            }
        }
    }

    function populateByType(type: string, data: any) {
        accountData.value[type] = data
        broadcastMessageFromTab({
            type: 'populateAccountDataByType',
            data: {
                type: toRaw(type),
                data: toRaw(data),
            }
        })
        if (isLeader.value) {
            saveDiscortixTableKey('accountData', type, deepToRaw(data)).catch(() => {
                // Maybe this isn't the end of the world.
            })
        }
    }

    onTabMessage((message) => {
        if (message.type === 'populateAccountDataByType') {
            accountData.value[message.data.type] = message.data.data
            if (isLeader.value) {
                saveDiscortixTableKey('accountData', message.data.type, deepToRaw(message.data.data)).catch(() => {
                    // Maybe this isn't the end of the world.
                })
            }
        }
    })

    onLogout(() => {
        accountDataLoading.value = false
        accountDataLoadError.value = null
        accountData.value = {}
    }, { permanent: true })

    return {
        accountDataLoading,
        accountDataLoadError,
        accountData: computed(() => accountData.value),
        hiddenRooms,
        userNicknames,
        userNotes,
        populateFromApiV3SyncResponse,
        populateByType,
    }
})