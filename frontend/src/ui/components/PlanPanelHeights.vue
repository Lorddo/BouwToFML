<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ScaleLengthInput from './ScaleLengthInput.vue'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import { SCALE_LENGTH_COMMIT_DEBOUNCE_MS } from '@/ui/composables/settings/scale-length-field'
import './plan-panel-fields.css'

const { t } = useI18n()

withDefaults(
  defineProps<{
    scaleConfirmed: boolean
    hasCombinedOutput: boolean
    unit: ScaleInputUnit
    planWallHeightCm?: number
    planDoorHeightCm?: number
    planWindowHeightCm?: number
    planWindowSillZCm?: number
  }>(),
  {
    planWallHeightCm: 280,
    planDoorHeightCm: 220,
    planWindowHeightCm: 150,
    planWindowSillZCm: 70,
  },
)

const emit = defineEmits<{
  'update:planWallHeightCm': [value: number]
  'update:planDoorHeightCm': [value: number]
  'update:planWindowHeightCm': [value: number]
  'update:planWindowSillZCm': [value: number]
}>()
</script>

<template>
  <details class="plan-fold">
    <summary>{{ t('result.heightsFold') }}</summary>
    <div class="plan-height-limits">
      <label class="plan-limit-field">
        <span>{{ t('result.wallHeightM') }}</span>
        <ScaleLengthInput
          block
          :cm="planWallHeightCm"
          :unit="unit"
          :min-cm="1"
          :debounce-ms="SCALE_LENGTH_COMMIT_DEBOUNCE_MS"
          :disabled="!scaleConfirmed || !hasCombinedOutput"
          @update:cm="emit('update:planWallHeightCm', $event)"
        />
      </label>
      <label class="plan-limit-field">
        <span :title="t('result.doorHeightTitle')">
          {{ t('result.doorHeightM') }}
        </span>
        <ScaleLengthInput
          block
          :cm="planDoorHeightCm"
          :unit="unit"
          :min-cm="1"
          :debounce-ms="SCALE_LENGTH_COMMIT_DEBOUNCE_MS"
          :disabled="!scaleConfirmed || !hasCombinedOutput"
          @update:cm="emit('update:planDoorHeightCm', $event)"
        />
      </label>
      <label class="plan-limit-field">
        <span :title="t('result.windowSillTitle')">
          {{ t('result.windowSillM') }}
        </span>
        <ScaleLengthInput
          block
          :cm="planWindowSillZCm"
          :unit="unit"
          :min-cm="0"
          allow-zero
          :debounce-ms="SCALE_LENGTH_COMMIT_DEBOUNCE_MS"
          :disabled="!scaleConfirmed || !hasCombinedOutput"
          @update:cm="emit('update:planWindowSillZCm', $event)"
        />
      </label>
      <label class="plan-limit-field">
        <span :title="t('result.windowGlassTitle')">
          {{ t('result.windowGlassM') }}
        </span>
        <ScaleLengthInput
          block
          :cm="planWindowHeightCm"
          :unit="unit"
          :min-cm="1"
          :debounce-ms="SCALE_LENGTH_COMMIT_DEBOUNCE_MS"
          :disabled="!scaleConfirmed || !hasCombinedOutput"
          @update:cm="emit('update:planWindowHeightCm', $event)"
        />
      </label>
    </div>
    <p class="plan-band-hint">{{ t('result.overrideHint') }}</p>
  </details>
</template>

<style scoped>
.plan-height-limits {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 4px 0 0;
}
</style>
