import { createApp } from 'vue'
import VueKonva from 'vue-konva'
import App from './ui/App.vue'
import './style.css'

import { registerAllExtractors } from '@/core/extraction/register-all-extractors'
import { applyLocale, i18n } from '@/ui/i18n'
import { loadUserSettings } from '@/ui/composables/settings/user-settings'

registerAllExtractors()

applyLocale(loadUserSettings().locale)
createApp(App).use(i18n).use(VueKonva).mount('#app')
