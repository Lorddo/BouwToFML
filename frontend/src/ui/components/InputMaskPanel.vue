<script setup lang="ts">
import { useI18n } from 'vue-i18n'

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
      <div class="section-head">
        <p class="section-title">{{ t('input.cropSection') }}</p>
        <button
          type="button"
          :class="{ primary: cropIncludeEnabled }"
          @click="emit('toggleCropInclude')"
        >
          {{ t('input.cropPolygon') }}
        </button>
      </div>
    </div>

    <div class="section section-divider">
      <div class="section-head">
        <p class="section-title">{{ t('input.gumSection') }}</p>
        <button type="button" :class="{ primary: eraserEnabled }" @click="emit('toggleEraser')">
          {{ t('input.gumBrush') }}
        </button>
        <button
          type="button"
          :class="{ primary: polygonEraserEnabled }"
          @click="emit('togglePolygonEraser')"
        >
          {{ t('input.gumPolygon') }}
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
label {
  display: block;
  font-size: 12px;
  margin: 4px 0;
}

.actions {
  display: flex;
  gap: 6px;
  margin-top: 6px;
  flex-wrap: wrap;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.section-title {
  margin: 0;
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

.hint {
  font-size: 12px;
  color: #666;
  margin: 4px 0;
}

button.primary {
  font-weight: 600;
}
</style>
