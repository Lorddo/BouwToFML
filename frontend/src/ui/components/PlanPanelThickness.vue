<script setup lang="ts">
import type { ThicknessPickTier } from '@/core/plan/apply-thickness-pick'
import { FACTORY_THICKNESS_CMS } from '@/core/plan/wall-thickness-catalog'
import { useI18n } from 'vue-i18n'
import ScaleLengthInput from './ScaleLengthInput.vue'
import ThicknessCatalogFields from './ThicknessCatalogFields.vue'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import './plan-panel-fields.css'

const { t } = useI18n()

withDefaults(
  defineProps<{
    scaleConfirmed: boolean
    hasCombinedOutput: boolean
    unit: ScaleInputUnit
    underlayAvailable?: boolean
    planThicknessCms?: number[]
    planBandMidBoundaryCm?: number
    planBandMaxBoundaryCm?: number
    thicknessPickTier?: ThicknessPickTier | null
    thicknessPickMessage?: string | null
    thicknessPickBusy?: boolean
  }>(),
  {
    underlayAvailable: false,
    planThicknessCms: () => [...FACTORY_THICKNESS_CMS],
    planBandMidBoundaryCm: 12,
    planBandMaxBoundaryCm: 27,
    thicknessPickTier: null,
    thicknessPickMessage: null,
    thicknessPickBusy: false,
  },
)

const emit = defineEmits<{
  'update:planThicknessCms': [value: number[]]
  'update:planBandMidBoundaryCm': [value: number]
  'update:planBandMaxBoundaryCm': [value: number]
  startThicknessPick: [tier: ThicknessPickTier]
  cancelThicknessPick: []
}>()
</script>

<template>
  <details class="plan-fold">
    <summary>{{ t('result.thicknessFold') }}</summary>
    <ThicknessCatalogFields
      :cms="planThicknessCms"
      :unit="unit"
      :disabled="!scaleConfirmed || !hasCombinedOutput"
      @update:cms="emit('update:planThicknessCms', $event)"
    >
      <template #bands>
        <div class="plan-limit-input-row">
          <button
            type="button"
            class="pick-btn"
            :title="t('result.pickMaxTitle')"
            :class="{ active: thicknessPickTier === 'max' }"
            :disabled="
              !scaleConfirmed || !hasCombinedOutput || !underlayAvailable || thicknessPickBusy
            "
            @click="emit('startThicknessPick', 'max')"
          >
            ⊕
          </button>
          <ScaleLengthInput
            input-class="band-input"
            :cm="planBandMaxBoundaryCm"
            :unit="unit"
            :min-cm="1"
            :aria-label="t('result.bandMaxTitle')"
            :disabled="!scaleConfirmed || !hasCombinedOutput"
            @update:cm="emit('update:planBandMaxBoundaryCm', $event)"
          />
        </div>
        <div class="plan-limit-input-row">
          <button
            type="button"
            class="pick-btn"
            :title="t('result.pickMinTitle')"
            :class="{ active: thicknessPickTier === 'min' }"
            :disabled="
              !scaleConfirmed || !hasCombinedOutput || !underlayAvailable || thicknessPickBusy
            "
            @click="emit('startThicknessPick', 'min')"
          >
            ⊕
          </button>
          <ScaleLengthInput
            input-class="band-input"
            :cm="planBandMidBoundaryCm"
            :unit="unit"
            :min-cm="1"
            :aria-label="t('result.bandMidTitle')"
            :disabled="!scaleConfirmed || !hasCombinedOutput"
            @update:cm="emit('update:planBandMidBoundaryCm', $event)"
          />
        </div>
      </template>
    </ThicknessCatalogFields>
    <p v-if="thicknessPickMessage" class="plan-hint plan-pick-hint">
      {{ thicknessPickMessage }}
      <button
        v-if="thicknessPickTier"
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
.plan-limit-input-row {
  display: flex;
  align-items: center;
  gap: 4px;
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

.plan-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: #475569;
  line-height: 1.4;
}

.plan-pick-hint {
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
