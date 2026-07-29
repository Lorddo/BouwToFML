<script setup lang="ts">
import type { FmlThicknessPickTier } from '@/core/fml/apply-fml-thickness-pick'
import './fml-panel-fields.css'

withDefaults(
  defineProps<{
    scaleConfirmed: boolean
    hasCombinedOutput: boolean
    underlayAvailable: boolean
    fmlThicknessMinCm: number
    fmlThicknessMidCm: number
    fmlThicknessMaxCm: number
    fmlBandMidBoundaryCm: number
    fmlBandMaxBoundaryCm: number
    fmlLimitsDirty: boolean
    fmlThicknessPickTier: FmlThicknessPickTier | null
    fmlThicknessPickMessage: string | null
    fmlThicknessPickBusy: boolean
  }>(),
  {
    underlayAvailable: false,
    fmlThicknessMinCm: 10,
    fmlThicknessMidCm: 20,
    fmlThicknessMaxCm: 30,
    fmlBandMidBoundaryCm: 12,
    fmlBandMaxBoundaryCm: 23,
    fmlLimitsDirty: false,
    fmlThicknessPickTier: null,
    fmlThicknessPickMessage: null,
    fmlThicknessPickBusy: false,
  },
)

const emit = defineEmits<{
  'update:fmlThicknessMinCm': [value: number]
  'update:fmlThicknessMidCm': [value: number]
  'update:fmlThicknessMaxCm': [value: number]
  'update:fmlBandMidBoundaryCm': [value: number]
  'update:fmlBandMaxBoundaryCm': [value: number]
  startThicknessPick: [tier: FmlThicknessPickTier]
  cancelThicknessPick: []
}>()

function onThicknessMinInput(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value)
  if (!Number.isFinite(value) || value <= 0) return
  emit('update:fmlThicknessMinCm', value)
}

function onThicknessMidInput(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value)
  if (!Number.isFinite(value) || value <= 0) return
  emit('update:fmlThicknessMidCm', value)
}

function onThicknessMaxInput(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value)
  if (!Number.isFinite(value) || value <= 0) return
  emit('update:fmlThicknessMaxCm', value)
}

function onBandMidBoundaryInput(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value)
  if (!Number.isFinite(value) || value <= 0) return
  emit('update:fmlBandMidBoundaryCm', value)
}

function onBandMaxBoundaryInput(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value)
  if (!Number.isFinite(value) || value <= 0) return
  emit('update:fmlBandMaxBoundaryCm', value)
}
</script>

<template>
  <div class="fml-thickness-limits">
    <label class="fml-limit-field">
      <span title="Exportdikte voor muren in de min-band">Min. FML-dikte (cm)</span>
      <div class="fml-limit-input-row">
        <input
          type="number"
          min="1"
          step="1"
          :value="fmlThicknessMinCm"
          :disabled="!scaleConfirmed || !hasCombinedOutput"
          @input="onThicknessMinInput"
        />
        <button
          type="button"
          class="pick-btn"
          title="Meet min-bandgrens op onderlegger (gemeten × 1.10)"
          :class="{ active: fmlThicknessPickTier === 'min' }"
          :disabled="
            !scaleConfirmed || !hasCombinedOutput || !underlayAvailable || fmlThicknessPickBusy
          "
          @click="emit('startThicknessPick', 'min')"
        >
          ⊕
        </button>
        <input
          type="number"
          class="band-input"
          min="1"
          step="0.1"
          title="Meetband: min &lt; deze waarde (cm)"
          :value="fmlBandMidBoundaryCm"
          :disabled="!scaleConfirmed || !hasCombinedOutput"
          @input="onBandMidBoundaryInput"
        />
      </div>
    </label>
    <label class="fml-limit-field">
      <span title="Exportdikte voor muren in de mid-band">Mid. FML-dikte (cm)</span>
      <div class="fml-limit-input-row">
        <input
          type="number"
          min="1"
          step="1"
          :value="fmlThicknessMidCm"
          :disabled="!scaleConfirmed || !hasCombinedOutput"
          @input="onThicknessMidInput"
        />
        <span class="fml-limit-spacer" aria-hidden="true" />
        <span class="fml-limit-spacer band-spacer" aria-hidden="true" />
      </div>
    </label>
    <label class="fml-limit-field">
      <span title="Exportdikte voor muren in de max-band">Max. FML-dikte (cm)</span>
      <div class="fml-limit-input-row">
        <input
          type="number"
          min="1"
          step="1"
          :value="fmlThicknessMaxCm"
          :disabled="!scaleConfirmed || !hasCombinedOutput"
          @input="onThicknessMaxInput"
        />
        <button
          type="button"
          class="pick-btn"
          title="Meet max-bandgrens op onderlegger (gemeten × 0.90)"
          :class="{ active: fmlThicknessPickTier === 'max' }"
          :disabled="
            !scaleConfirmed || !hasCombinedOutput || !underlayAvailable || fmlThicknessPickBusy
          "
          @click="emit('startThicknessPick', 'max')"
        >
          ⊕
        </button>
        <input
          type="number"
          class="band-input"
          min="1"
          step="0.1"
          title="Meetband: max &gt; deze waarde (cm)"
          :value="fmlBandMaxBoundaryCm"
          :disabled="!scaleConfirmed || !hasCombinedOutput"
          @input="onBandMaxBoundaryInput"
        />
      </div>
    </label>
  </div>
  <p class="fml-band-hint">
    Meetband: min &lt; {{ fmlBandMidBoundaryCm }} · mid {{ fmlBandMidBoundaryCm }}–{{
      fmlBandMaxBoundaryCm
    }}
    · max &gt; {{ fmlBandMaxBoundaryCm }} cm
    <span class="fml-band-ratio">(export links · bandgrens rechts van ⊕)</span>
  </p>
  <p v-if="fmlThicknessPickMessage" class="fml-hint fml-pick-hint">
    {{ fmlThicknessPickMessage }}
    <button
      v-if="fmlThicknessPickTier"
      type="button"
      class="link-btn"
      @click="emit('cancelThicknessPick')"
    >
      Annuleren
    </button>
  </p>
  <p v-if="fmlLimitsDirty" class="fml-hint fml-dirty-hint">
    Hoogte/dikte gewijzigd — klik Regenereren om de FML bij te werken.
  </p>
</template>

<style scoped>
.fml-thickness-limits {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0 0 8px;
}

.pick-btn {
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: #fff;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  color: #475569;
}

.pick-btn:hover:not(:disabled) {
  border-color: #2563eb;
  color: #2563eb;
}

.pick-btn.active {
  border-color: #2563eb;
  background: #eff6ff;
  color: #1d4ed8;
}

.pick-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.fml-hint {
  margin: 0 0 8px;
  font-size: 12px;
  color: #475569;
  line-height: 1.4;
}

.fml-dirty-hint {
  color: #b45309;
}

.fml-pick-hint {
  color: #1d4ed8;
}

.link-btn {
  margin-left: 6px;
  padding: 0;
  border: none;
  background: none;
  color: #2563eb;
  font-size: 11px;
  cursor: pointer;
  text-decoration: underline;
}
</style>
