<script setup lang="ts">
withDefaults(
  defineProps<{
    enabled?: boolean
    generatedFmlText?: string
    fmlBandMidBoundaryCm?: number
    fmlBandMaxBoundaryCm?: number
    fmlBandDirty?: boolean
  }>(),
  {
    enabled: false,
    generatedFmlText: '',
    fmlBandMidBoundaryCm: 12,
    fmlBandMaxBoundaryCm: 23,
    fmlBandDirty: false,
  },
)

const emit = defineEmits<{
  'update:fmlBandMidBoundaryCm': [value: number]
  'update:fmlBandMaxBoundaryCm': [value: number]
  downloadGenerated: []
}>()

function parsePositiveCm(event: Event): number | null {
  const value = Number((event.target as HTMLInputElement).value)
  if (!Number.isFinite(value) || value <= 0) return null
  return value
}

function onBandMidBoundaryInput(event: Event): void {
  const value = parsePositiveCm(event)
  if (value == null) return
  emit('update:fmlBandMidBoundaryCm', value)
}

function onBandMaxBoundaryInput(event: Event): void {
  const value = parsePositiveCm(event)
  if (value == null) return
  emit('update:fmlBandMaxBoundaryCm', value)
}
</script>

<template>
  <div v-if="enabled" class="panel fml-dev-panel">
    <h3>FML meetbanden</h3>
    <p class="hint">
      Grenzen voor min/mid/max-classificatie. Pas aan en klik Regenereren in het FML-paneel.
    </p>

    <label class="field">
      <span>Min-band ≤ (cm)</span>
      <input
        type="number"
        min="1"
        step="0.5"
        :value="fmlBandMidBoundaryCm"
        @input="onBandMidBoundaryInput"
      />
    </label>
    <label class="field">
      <span>Max-band ≥ (cm)</span>
      <input
        type="number"
        min="1"
        step="0.5"
        :value="fmlBandMaxBoundaryCm"
        @input="onBandMaxBoundaryInput"
      />
    </label>
    <p class="band-hint">
      min: ≤ {{ fmlBandMidBoundaryCm }} · mid: &gt; {{ fmlBandMidBoundaryCm }} en &lt;
      {{ fmlBandMaxBoundaryCm }} · max: ≥ {{ fmlBandMaxBoundaryCm }}
    </p>
    <p v-if="fmlBandDirty" class="dirty-hint">Bandgrenzen gewijzigd — Regenereren in FML-paneel.</p>

    <h3 class="section-title">Export</h3>
    <button
      type="button"
      class="download-btn"
      :disabled="!generatedFmlText"
      @click="emit('downloadGenerated')"
    >
      Download .fml (verdieping)
    </button>
  </div>
</template>

<style scoped>
.fml-dev-panel {
  margin-top: 8px;
}

h3 {
  margin: 0 0 6px;
  font-size: 13px;
}

.hint,
.band-hint,
.dirty-hint {
  margin: 0 0 8px;
  font-size: 11px;
  color: #64748b;
  line-height: 1.4;
}

.dirty-hint {
  color: #b45309;
}

.section-title {
  margin: 12px 0 6px;
  font-size: 13px;
}

.download-btn {
  width: 100%;
  height: 28px;
  padding: 4px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  font-size: 12px;
  background: #fff;
  cursor: pointer;
  box-sizing: border-box;
}

.download-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0 0 8px;
  font-size: 11px;
  color: #334155;
}

.field input {
  width: 100%;
  height: 28px;
  padding: 4px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  font-size: 12px;
  box-sizing: border-box;
}
</style>
