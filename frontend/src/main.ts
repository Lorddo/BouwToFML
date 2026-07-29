import { createApp } from 'vue'
import VueKonva from 'vue-konva'
import App from './ui/App.vue'
import './style.css'

import { registerAllExtractors } from '@/core/extraction/register-all-extractors'

registerAllExtractors()

createApp(App).use(VueKonva).mount('#app')
