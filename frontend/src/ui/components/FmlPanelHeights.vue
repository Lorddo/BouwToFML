<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ScaleLengthInput from './ScaleLengthInput.vue'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import './fml-panel-fields.css'

const { t } = useI18n()

withDefaults(
  defineProps<{
    scaleConfirmed: boolean
    hasCombinedOutput: boolean
    unit: ScaleInputUnit
    fmlWallHeightCm?: number
    fmlDoorHeightCm?: number
    fmlWindowHeightCm?: number
    fmlWindowSillZCm?: number
  }>(),
  {
    fmlWallHeightCm: 280,
    fmlDoorHeightCm: 220,
    fmlWindowHeightCm: 150,
    fmlWindowSillZCm: 70,
  },
)

const emit = defineEmits<{
  'update:fmlWallHeightCm': [value: number]
  'update:fmlDoorHeightCm': [value: number]
  'update:fmlWindowHeightCm': [value: number]
  'update:fmlWindowSillZCm': [value: number]
}>()
</script>

<template>
  <details class="fml-fold">
    <summary>{{ t('result.heightsFold') }}</summary>
    <div class="fml-height-limits">
      <label class="fml-limit-field">
        <span>{{ t('result.wallHeightM') }}</span>
        <ScaleLengthInput
          block
          :cm="fmlWallHeightCm"
          :unit="unit"
          :min-cm="1"
          :disabled="!scaleConfirmed || !hasCombinedOutput"
          @update:cm="emit('update:fmlWallHeightCm', $event)"
        />
      </label>
      <label class="fml-limit-field">
        <span :title="t('result.doorHeightTitle')">
          {{ t('result.doorHeightM') }}
        </span>
        <ScaleLengthInput
          block
          :cm="fmlDoorHeightCm"
          :unit="unit"
          :min-cm="1"
          :disabled="!scaleConfirmed || !hasCombinedOutput"
          @update:cm="emit('update:fmlDoorHeightCm', $event)"
        />
      </label>
      <label class="fml-limit-field">
        <span :title="t('result.windowSillTitle')">
          {{ t('result.windowSillM') }}
        </span>
        <ScaleLengthInput
          block
          :cm="fmlWindowSillZCm"
          :unit="unit"
          :min-cm="0"
          allow-zero
          :disabled="!scaleConfirmed || !hasCombinedOutput"
          @update:cm="emit('update:fmlWindowSillZCm', $event)"
        />
      </label>
      <label class="fml-limit-field">
        <span :title="t('result.windowGlassTitle')">
          {{ t('result.windowGlassM') }}
        </span>
        <ScaleLengthInput
          block
          :cm="fmlWindowHeightCm"
          :unit="unit"
          :min-cm="1"
          :disabled="!scaleConfirmed || !hasCombinedOutput"
          @update:cm="emit('update:fmlWindowHeightCm', $event)"
        />
      </label>
    </div>
    <p class="fml-band-hint">{{ t('result.overrideHint') }}</p>
  </details>
</template>

<style scoped>
.fml-height-limits {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 4px 0 0;
}
</style>
