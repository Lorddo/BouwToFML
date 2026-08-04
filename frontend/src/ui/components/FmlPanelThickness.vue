<script setup lang="ts">
import type { FmlThicknessPickTier } from '@/core/fml/apply-fml-thickness-pick'
import { useI18n } from 'vue-i18n'
import './fml-panel-fields.css'

const { t } = useI18n()

withDefaults(
  defineProps<{
    scaleConfirmed: boolean
    hasCombinedOutput: boolean
    underlayAvailable?: boolean
    fmlThicknessMinCm?: number
    fmlThicknessMidCm?: number
    fmlThicknessMaxCm?: number
    fmlBandMidBoundaryCm?: number
    fmlBandMaxBoundaryCm?: number
    fmlThicknessPickTier?: FmlThicknessPickTier | null
    fmlThicknessPickMessage?: string | null
    fmlThicknessPickBusy?: boolean
  }>(),
  {
    underlayAvailable: false,
    fmlThicknessMinCm: 10,
    fmlThicknessMidCm: 20,
    fmlThicknessMaxCm: 30,
    fmlBandMidBoundaryCm: 12,
    fmlBandMaxBoundaryCm: 23,
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
  <details class="fml-fold">
    <summary>{{ t('result.thicknessFold') }}</summary>
    <div class="fml-thickness-limits">
      <label class="fml-limit-field">
        <span :title="t('result.thicknessMinTitle')">{{ t('result.thicknessMin') }}</span>
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
            :title="t('result.pickMinTitle')"
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
            :title="t('result.bandMidTitle')"
            :value="fmlBandMidBoundaryCm"
            :disabled="!scaleConfirmed || !hasCombinedOutput"
            @input="onBandMidBoundaryInput"
          />
        </div>
      </label>
      <label class="fml-limit-field">
        <span :title="t('result.thicknessMidTitle')">{{ t('result.thicknessMid') }}</span>
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
        <span :title="t('result.thicknessMaxTitle')">{{ t('result.thicknessMax') }}</span>
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
            :title="t('result.pickMaxTitle')"
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
            :title="t('result.bandMaxTitle')"
            :value="fmlBandMaxBoundaryCm"
            :disabled="!scaleConfirmed || !hasCombinedOutput"
            @input="onBandMaxBoundaryInput"
          />
        </div>
      </label>
    </div>
    <p class="fml-band-hint">
      {{
        t('result.bandHint', {
          mid: fmlBandMidBoundaryCm,
          max: fmlBandMaxBoundaryCm,
        })
      }}
      <span class="fml-band-ratio">{{ t('result.bandHintRatio') }}</span>
    </p>
    <p v-if="fmlThicknessPickMessage" class="fml-hint fml-pick-hint">
      {{ fmlThicknessPickMessage }}
      <button
        v-if="fmlThicknessPickTier"
        type="button"
        class="link-btn"
        @click="emit('cancelThicknessPick')"
      >
        {{ t('result.pickCancel') }}
      </button>
    </p>
  </details>
</template>

<style scoped>
.fml-thickness-limits {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 4px 0 0;
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
