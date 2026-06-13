import type { Ref } from 'vue'
import 'vue-router'

declare module 'vue-router' {
    interface Router {
        lastNavigationSource: Ref<'browser' | 'api'>;
    }
}