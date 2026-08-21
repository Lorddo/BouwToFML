<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import './fml-toolbelt-settings-fields.css'

defineProps<{
  title: string
  heightCm: number
  min?: number
  max?: number
}>()

const emit = defineEmits<{
  height: [cm: number]
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
  <span class="fml-toolbelt__meta">{{ title }}</span>
  <div class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.height') }}</span>
    <div class="fml-toolbelt__field-controls">
      <input
        type="number"
        :min="min ?? 0"
        :max="max ?? 800"
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
</template>
