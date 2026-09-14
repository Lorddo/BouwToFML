<script setup lang="ts">
import type { FmlThicknessPickTier } from '@/core/fml/apply-fml-thickness-pick'
import { FACTORY_THICKNESS_CMS } from '@/core/fml/fml-wall-thickness-catalog'
import { useI18n } from 'vue-i18n'
import ScaleLengthInput from './ScaleLengthInput.vue'
import ThicknessCatalogFields from './ThicknessCatalogFields.vue'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import { formatScaleInputLabel } from '@/ui/composables/settings/scale-input-unit'
import './fml-panel-fields.css'

const { t } = useI18n()

withDefaults(
  defineProps<{
    scaleConfirmed: boolean
    hasCombinedOutput: boolean
    unit: ScaleInputUnit
    underlayAvailable?: boolean
    planThicknessCms?: number[]
    fmlBandMidBoundaryCm?: number
    fmlBandMaxBoundaryCm?: number
    fmlThicknessPickTier?: FmlThicknessPickTier | null
    fmlThicknessPickMessage?: string | null
    fmlThicknessPickBusy?: boolean
  }>(),
  {
    underlayAvailable: false,
    planThicknessCms: () => [...FACTORY_THICKNESS_CMS],
    fmlBandMidBoundaryCm: 12,
    fmlBandMaxBoundaryCm: 23,
    fmlThicknessPickTier: null,
    fmlThicknessPickMessage: null,
    fmlThicknessPickBusy: false,
  },
)

const emit = defineEmits<{
  'update:planThicknessCms': [value: number[]]
  'update:fmlBandMidBoundaryCm': [value: number]
  'update:fmlBandMaxBoundaryCm': [value: number]
  startThicknessPick: [tier: FmlThicknessPickTier]
  cancelThicknessPick: []
}>()
</script>

<template>
  <details class="fml-fold">
    <summary>{{ t('result.thicknessFold') }}</summary>
    <ThicknessCatalogFields
      :cms="planThicknessCms"
      :unit="unit"
      :disabled="!scaleConfirmed || !hasCombinedOutput"
      @update:cms="emit('update:planThicknessCms', $event)"
    />
    <div class="fml-thickness-limits">
      <label class="fml-limit-field">
        <span :title="t('result.thicknessMinTitle')">{{ t('result.pickMinTitle') }}</span>
        <div class="fml-limit-input-row">
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
          <ScaleLengthInput
            input-class="band-input"
            :cm="fmlBandMidBoundaryCm"
            :unit="unit"
            :min-cm="1"
            :aria-label="t('result.bandMidTitle')"
            :disabled="!scaleConfirmed || !hasCombinedOutput"
            @update:cm="emit('update:fmlBandMidBoundaryCm', $event)"
          />
        </div>
      </label>
      <label class="fml-limit-field">
        <span :title="t('result.thicknessMaxTitle')">{{ t('result.pickMaxTitle') }}</span>
        <div class="fml-limit-input-row">
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
          <ScaleLengthInput
            input-class="band-input"
            :cm="fmlBandMaxBoundaryCm"
            :unit="unit"
            :min-cm="1"
            :aria-label="t('result.bandMaxTitle')"
            :disabled="!scaleConfirmed || !hasCombinedOutput"
            @update:cm="emit('update:fmlBandMaxBoundaryCm', $event)"
          />
        </div>
      </label>
    </div>
    <p class="fml-band-hint">
      {{
        t('result.bandHint', {
          mid: formatScaleInputLabel(fmlBandMidBoundaryCm, unit),
          max: formatScaleInputLabel(fmlBandMaxBoundaryCm, unit),
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
  margin: 8px 0 0;
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
