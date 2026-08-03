<script setup lang="ts">
import type { PreprocessConfig } from '@/core/extraction/types'

const model = defineModel<PreprocessConfig>({ required: true })

withDefaults(
  defineProps<{
    compact?: boolean
  }>(),
  { compact: true },
)
</script>

<template>
  <div class="panel">
    <h3 v-if="!compact">OCR</h3>
    <template v-if="model.ocrEnabled">
      <label>
        <input v-model="model.ocrDetectVertical" type="checkbox" />
        Zoek ook verticale tekst (90°/270°)
      </label>
      <label>
        OCR min confidence:
        <div class="field-row">
          <input v-model.number="model.ocrMinConfidence" type="range" min="0" max="100" step="1" />
          <input
            v-model.number="model.ocrMinConfidence"
            type="number"
            min="0"
            max="100"
            step="1"
            class="num-input"
          />
        </div>
      </label>
    </template>
    <p v-else class="hint">OCR staat uit — schakel aan op stap 2 (Voorbewerking).</p>
  </div>
</template>

<style scoped>
label {
  display: block;
  font-size: 13px;
  margin: 6px 0;
}

.hint {
  font-size: 12px;
  color: #64748b;
  margin: 0 0 8px;
}

.field-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.field-row input[type='range'] {
  flex: 1;
}

.num-input {
  width: 74px;
}
</style>
