<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import { FML_FIELD_COMMIT_DEBOUNCE_MS } from '@/ui/composables/plan-canvas/plan-canvas-draft-commit'
import { MIN_DIMENSION_LENGTH_CM } from '@/core/fml/offset-dimension-line'
import ScaleLengthInput from './ScaleLengthInput.vue'
import ToolbeltActionButton from './canvas/ToolbeltActionButton.vue'
import './plan-toolbelt-settings-fields.css'
import { TOOLBELT_HOTKEY_PRIORITY } from '@/ui/composables/canvas/useToolbeltHotkey'

defineProps<{
  unit: ScaleInputUnit
  selectedDimensionPanel: {
    id: string
    lengthCm: number
  }
}>()

const emit = defineEmits<{
  dimensionLengthCm: [cm: number]
  deleteDimension: []
}>()

const { t } = useI18n()
</script>

<template>
  <span class="plan-toolbelt__meta">{{ t('result.toolbar.dimensionSelected') }}</span>
  <div class="plan-toolbelt__field">
    <span class="plan-toolbelt__field-label">{{ t('result.toolbar.dimensionLength') }}</span>
    <div class="plan-toolbelt__field-controls">
      <ScaleLengthInput
        :cm="selectedDimensionPanel.lengthCm"
        :unit="unit"
        :min-cm="MIN_DIMENSION_LENGTH_CM"
        :debounce-ms="FML_FIELD_COMMIT_DEBOUNCE_MS"
        :aria-label="t('result.toolbar.dimensionLength')"
        input-class="plan-toolbelt__thickness-input"
        @update:cm="emit('dimensionLengthCm', $event)"
      />
    </div>
  </div>
  <ToolbeltActionButton
    icon="delete"
    :title="t('result.toolbar.deleteDimension')"
    :aria-label="t('result.toolbar.deleteDimension')"
    hotkey="Delete"
    :hotkey-priority="TOOLBELT_HOTKEY_PRIORITY.object"
    @click="emit('deleteDimension')"
  />
</template>
