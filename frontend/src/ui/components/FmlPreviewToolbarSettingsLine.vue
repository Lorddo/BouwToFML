<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { FLOOR_LINE_TYPES, type FloorLineType } from '@/core/fml/types'
import ToolbeltIcon from './canvas/ToolbeltIcon.vue'
import HexColorField from './HexColorField.vue'
import './fml-toolbelt-settings-fields.css'

const { t } = useI18n()

defineProps<{
  selectedLinePanel: {
    id: string
    type: FloorLineType
    color: string
    thickness: number
  } | null
}>()

const emit = defineEmits<{
  updateLineType: [type: FloorLineType]
  updateLineColor: [color: string]
  updateLineThickness: [thickness: number]
  deleteAnnotation: []
}>()

function onTypeChange(event: Event): void {
  const raw = (event.target as HTMLSelectElement).value
  if (FLOOR_LINE_TYPES.includes(raw as FloorLineType)) {
    emit('updateLineType', raw as FloorLineType)
  }
}

function onThicknessInput(event: Event): void {
  const raw = Number((event.target as HTMLInputElement).value)
  emit('updateLineThickness', Number.isFinite(raw) ? Math.max(1, Math.round(raw)) : 2)
}
</script>

<template>
  <span v-if="selectedLinePanel" class="fml-toolbelt__meta">{{
    t('result.toolbar.lineSelected')
  }}</span>
  <div v-if="selectedLinePanel" class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.lineType') }}</span>
    <div class="fml-toolbelt__field-controls">
      <select
        class="fml-toolbelt__select"
        :aria-label="t('result.toolbar.lineType')"
        :value="selectedLinePanel.type"
        @change="onTypeChange"
      >
        <option v-for="type in FLOOR_LINE_TYPES" :key="type" :value="type">
          {{ t(`result.toolbar.lineTypes.${type}`) }}
        </option>
      </select>
    </div>
  </div>
  <div v-if="selectedLinePanel" class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.lineThickness') }}</span>
    <div class="fml-toolbelt__field-controls">
      <input
        type="text"
        inputmode="numeric"
        class="fml-toolbelt__thickness-input"
        :aria-label="t('result.toolbar.lineThickness')"
        :value="selectedLinePanel.thickness"
        @input="onThicknessInput"
      />
      <span class="fml-toolbelt__unit">{{ t('common.px') }}</span>
    </div>
  </div>
  <div v-if="selectedLinePanel" class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.lineColor') }}</span>
    <div class="fml-toolbelt__field-controls">
      <HexColorField
        :model-value="selectedLinePanel.color"
        :aria-label="t('result.toolbar.lineColor')"
        @update:model-value="emit('updateLineColor', $event)"
      />
    </div>
  </div>
  <button
    v-if="selectedLinePanel"
    type="button"
    class="canvas-toolbelt__btn"
    :title="t('result.toolbar.deleteLine')"
    :aria-label="t('result.toolbar.deleteLine')"
    @click="emit('deleteAnnotation')"
  >
    <ToolbeltIcon name="delete" />
  </button>
</template>
