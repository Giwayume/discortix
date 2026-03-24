import { createI18n } from 'vue-i18n'

import en from './en.json'

const languageOverride = (new URLSearchParams(window.location.search)).get('language')

export const i18n = createI18n({
    legacy: false,
    locale: languageOverride ?? 'en',
    fallbackWarn: false,
    missingWarn: languageOverride !== 'e2e',
    messages: {
        en: languageOverride === 'e2e' ? {} : en,
    }
})
