<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ToolbeltIcon from './canvas/ToolbeltIcon.vue'

withDefaults(
  defineProps<{
    eraserEnabled?: boolean
    polygonEraserEnabled?: boolean
    cropIncludeEnabled?: boolean
    eraserRadius?: number
    maskTouched?: boolean
    canUndo?: boolean
  }>(),
  {
    eraserEnabled: false,
    polygonEraserEnabled: false,
    cropIncludeEnabled: false,
    eraserRadius: 10,
    maskTouched: false,
    canUndo: false,
  },
)

const emit = defineEmits<{
  toggleEraser: []
  togglePolygonEraser: []
  toggleCropInclude: []
  updateEraserRadius: [value: number]
  resetMask: []
  undo: []
}>()

const { t } = useI18n()
</script>

<template>
  <div class="panel">
    <h3>{{ t('input.cropGumTitle') }}</h3>
    <div class="section">
      <p class="section-title">{{ t('input.cropSection') }}</p>
      <button
        type="button"
        class="sidebar-icon-btn"
        :class="{ 'is-on': cropIncludeEnabled }"
        @click="emit('toggleCropInclude')"
      >
        <ToolbeltIcon name="crop" />
        <span>{{ t('input.cropPolygon') }}</span>
      </button>
    </div>

    <div class="section section-divider">
      <p class="section-title">{{ t('input.gumSection') }}</p>
      <div class="sidebar-icon-row">
        <button
          type="button"
          class="sidebar-icon-btn"
          :class="{ 'is-on': eraserEnabled }"
          @click="emit('toggleEraser')"
        >
          <ToolbeltIcon name="brush" />
          <span>{{ t('input.gumBrush') }}</span>
        </button>
        <button
          type="button"
          class="sidebar-icon-btn"
          :class="{ 'is-on': polygonEraserEnabled }"
          @click="emit('togglePolygonEraser')"
        >
          <ToolbeltIcon name="eraser" />
          <span>{{ t('input.gumPolygon') }}</span>
        </button>
      </div>
      <div v-if="eraserEnabled" class="setting-row">
        <span class="setting-label">{{ t('input.gumThickness') }}</span>
        <div class="field-row">
          <input
            :value="eraserRadius"
            type="range"
            min="2"
            max="80"
            step="1"
            @input="emit('updateEraserRadius', Number(($event.target as HTMLInputElement).value))"
          />
          <input
            :value="eraserRadius"
            type="number"
            min="2"
            max="80"
            step="1"
            class="num-input"
            @input="emit('updateEraserRadius', Number(($event.target as HTMLInputElement).value))"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.section-title {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 600;
  color: #475569;
}

.section {
  margin-top: 4px;
}

.section-divider {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #e2e8f0;
}

.setting-row {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

.setting-label {
  font-size: 12px;
  color: #0f172a;
}

.field-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 74px;
  gap: 8px;
  align-items: center;
  width: 100%;
}

.field-row input[type='range'] {
  width: 100%;
  min-width: 0;
}

.num-input {
  width: 74px;
  min-width: 74px;
}

.sidebar-icon-row {
  margin-bottom: 0;
}
</style>
