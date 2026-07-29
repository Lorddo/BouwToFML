<script setup lang="ts">
import type { PreprocessConfig } from '@/core/extraction/types'

const model = defineModel<PreprocessConfig>({ required: true })
</script>

<template>
  <div class="panel">
    <h3>Rotatie</h3>
    <div class="setting-row">
      <span class="setting-label">Rotatie (graden)</span>
      <div class="field-row">
        <input v-model.number="model.rotationDeg" type="range" min="-180" max="180" step="0.1" />
        <input
          v-model.number="model.rotationDeg"
          type="number"
          min="-180"
          max="180"
          step="0.1"
          class="num-input"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.setting-row {
  display: grid;
  grid-template-columns: 108px minmax(0, 1fr);
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
</style>
