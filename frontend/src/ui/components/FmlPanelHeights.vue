<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import './fml-panel-fields.css'

const { t } = useI18n()

withDefaults(
  defineProps<{
    scaleConfirmed: boolean
    hasCombinedOutput: boolean
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

function metersFromCm(cm: number): string {
  return (cm / 100).toFixed(2)
}

type HeightEmitName =
  | 'update:fmlWallHeightCm'
  | 'update:fmlDoorHeightCm'
  | 'update:fmlWindowHeightCm'
  | 'update:fmlWindowSillZCm'

function onHeightMetersInput(event: Event, emitName: HeightEmitName): void {
  const meters = Number((event.target as HTMLInputElement).value)
  if (!Number.isFinite(meters)) return
  const cm = Math.round(meters * 100)
  if (emitName === 'update:fmlWindowSillZCm') {
    if (meters < 0) return
    emit('update:fmlWindowSillZCm', cm)
    return
  }
  if (meters <= 0) return
  if (emitName === 'update:fmlWallHeightCm') emit('update:fmlWallHeightCm', cm)
  else if (emitName === 'update:fmlDoorHeightCm') emit('update:fmlDoorHeightCm', cm)
  else emit('update:fmlWindowHeightCm', cm)
}
</script>

<template>
  <details class="fml-fold">
    <summary>{{ t('result.heightsFold') }}</summary>
    <div class="fml-height-limits">
      <label class="fml-limit-field">
        <span>{{ t('result.wallHeightM') }}</span>
        <input
          type="number"
          min="1"
          max="6"
          step="0.01"
          :value="metersFromCm(fmlWallHeightCm)"
          :disabled="!scaleConfirmed || !hasCombinedOutput"
          @input="onHeightMetersInput($event, 'update:fmlWallHeightCm')"
        />
      </label>
      <label class="fml-limit-field">
        <span :title="t('result.doorHeightTitle')">
          {{ t('result.doorHeightM') }}
        </span>
        <input
          type="number"
          min="0.5"
          max="4"
          step="0.01"
          :value="metersFromCm(fmlDoorHeightCm)"
          :disabled="!scaleConfirmed || !hasCombinedOutput"
          @input="onHeightMetersInput($event, 'update:fmlDoorHeightCm')"
        />
      </label>
      <label class="fml-limit-field">
        <span :title="t('result.windowSillTitle')">
          {{ t('result.windowSillM') }}
        </span>
        <input
          type="number"
          min="0"
          max="3"
          step="0.01"
          :value="metersFromCm(fmlWindowSillZCm)"
          :disabled="!scaleConfirmed || !hasCombinedOutput"
          @input="onHeightMetersInput($event, 'update:fmlWindowSillZCm')"
        />
      </label>
      <label class="fml-limit-field">
        <span :title="t('result.windowGlassTitle')">
          {{ t('result.windowGlassM') }}
        </span>
        <input
          type="number"
          min="0.3"
          max="4"
          step="0.01"
          :value="metersFromCm(fmlWindowHeightCm)"
          :disabled="!scaleConfirmed || !hasCombinedOutput"
          @input="onHeightMetersInput($event, 'update:fmlWindowHeightCm')"
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
