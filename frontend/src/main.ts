import { createApp } from 'vue'
import VueKonva from 'vue-konva'
import App from './ui/App.vue'
import './style.css'

import { registerAllExtractors } from '@/core/extraction/register-all-extractors'
import { applyLocale, i18n } from '@/ui/i18n'
import { loadUserSettings } from '@/ui/composables/settings/user-settings'
import { formatUnknownError, reportAppError } from '@/ui/app-error'

registerAllExtractors()

applyLocale(loadUserSettings().locale)

/** Andere Vite-apps op hetzelfde origin (localhost:5173) kunnen een PWA-SW nalaten. */
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      void registration.unregister()
    }
  })
  if ('caches' in window) {
    void caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
  }
}

const app = createApp(App)

app.config.errorHandler = (err) => {
  const fallback = i18n.global.t('common.errorGeneric')
  reportAppError(formatUnknownError(err, fallback))
}

window.addEventListener('error', (event) => {
  const fallback = i18n.global.t('common.errorGeneric')
  reportAppError(formatUnknownError(event.error ?? event.message, fallback))
})

window.addEventListener('unhandledrejection', (event) => {
  const fallback = i18n.global.t('common.errorGeneric')
  reportAppError(formatUnknownError(event.reason, fallback))
})

app.use(i18n).use(VueKonva).mount('#app')
