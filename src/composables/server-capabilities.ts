import { storeToRefs } from 'pinia'

import { fetchJson } from '@/utils/fetch'

import { useSessionStore } from '@/stores/session'

import {
    type ApiV3CapabilitiesResponse, ApiV3CapabilitiesResponseSchema,
} from '@/types'

let cachedCapabilitiesResponse: ApiV3CapabilitiesResponse['capabilities'] | undefined
let cachedCapabilitiesResponseTs: number = 0

export function useServerCapabilities() {
    const { homeserverBaseUrl } = storeToRefs(useSessionStore())

    async function getCapabilities() {
        if (cachedCapabilitiesResponse && cachedCapabilitiesResponseTs < Date.now() - 300000) {
            return cachedCapabilitiesResponse
        }

        const capabilities = await fetchJson<ApiV3CapabilitiesResponse>(
            `${homeserverBaseUrl.value}/_matrix/client/v3/capabilities`,
            {
                useAuthorization: true,
                jsonSchema: ApiV3CapabilitiesResponseSchema
            },
        )
        cachedCapabilitiesResponse = capabilities.capabilities
        cachedCapabilitiesResponseTs = Date.now()
        return capabilities.capabilities
    }

    return {
        getCapabilities,
    }
}