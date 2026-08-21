<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { OpeningType } from '@/core/fml/types'
import ToolbeltIcon from './canvas/ToolbeltIcon.vue'
import './fml-toolbelt-settings-fields.css'

defineProps<{
  type: OpeningType
  widthCm: number
  heightCm: number
  sillZCm: number
}>()

const emit = defineEmits<{
  width: [cm: number]
  height: [cm: number]
  sill: [cm: number]
  remove: []
}>()

const { t } = useI18n()

function onNumber(event: Event): number | null {
  const raw = Number((event.target as HTMLInputElement).value)
  if (!Number.isFinite(raw)) return null
  return Math.round(raw)
}

function releaseFocus(event: Event): void {
  const el = event.target
  if (el instanceof HTMLElement) el.blur()
}
</script>

<template>
  <span class="fml-toolbelt__meta">
    {{ type === 'window' ? t('result.toolbar.windowOne') : t('result.toolbar.doorOne') }}
  </span>
  <div class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.width') }}</span>
    <div class="fml-toolbelt__field-controls">
      <input
        type="number"
        min="10"
        max="400"
        step="1"
        class="fml-toolbelt__thickness-input"
        :value="widthCm"
        @change="
          (event) => {
            const cm = onNumber(event)
            if (cm != null) emit('width', cm)
            releaseFocus(event)
          }
        "
      />
      <span class="fml-toolbelt__unit">cm</span>
    </div>
  </div>
  <div class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.height') }}</span>
    <div class="fml-toolbelt__field-controls">
      <input
        type="number"
        min="50"
        max="500"
        step="1"
        class="fml-toolbelt__thickness-input"
        :value="heightCm"
        @change="
          (event) => {
            const cm = onNumber(event)
            if (cm != null) emit('height', cm)
            releaseFocus(event)
          }
        "
      />
      <span class="fml-toolbelt__unit">cm</span>
    </div>
  </div>
  <div class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.floor') }}</span>
    <div class="fml-toolbelt__field-controls">
      <input
        type="number"
        min="0"
        max="400"
        step="1"
        class="fml-toolbelt__thickness-input"
        :value="sillZCm"
        @change="
          (event) => {
            const cm = onNumber(event)
            if (cm != null) emit('sill', cm)
            releaseFocus(event)
          }
        "
      />
      <span class="fml-toolbelt__unit">cm</span>
    </div>
  </div>
  <button
    type="button"
    class="canvas-toolbelt__btn"
    :title="type === 'window' ? t('result.toolbar.deleteWindow') : t('result.toolbar.deleteDoor')"
    :aria-label="
      type === 'window' ? t('result.toolbar.deleteWindow') : t('result.toolbar.deleteDoor')
    "
    @click="emit('remove')"
  >
    <ToolbeltIcon name="delete" />
  </button>
</template>
