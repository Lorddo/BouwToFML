<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import ScaleLengthInput from './ScaleLengthInput.vue'
import './fml-toolbelt-settings-fields.css'

defineProps<{
  unit: ScaleInputUnit
  title: string
  heightCm: number
  min?: number
  max?: number
}>()

const emit = defineEmits<{
  height: [cm: number]
}>()

const { t } = useI18n()
</script>

<template>
  <span class="fml-toolbelt__meta">{{ title }}</span>
  <div class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.height') }}</span>
    <div class="fml-toolbelt__field-controls">
      <ScaleLengthInput
        :cm="heightCm"
        :unit="unit"
        :min-cm="min ?? 0"
        :max-cm="max ?? 800"
        :allow-zero="(min ?? 0) <= 0"
        :aria-label="t('result.toolbar.height')"
        input-class="fml-toolbelt__thickness-input"
        @update:cm="emit('height', $event)"
      />
    </div>
  </div>
</template>
