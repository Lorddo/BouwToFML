<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { HScaleState } from '@/platform/calibration'
import { SCALE_RESCALE_MIN_MEASURED_CM } from '@/platform/calibration'
import {
  measuredCmFromRescaleState,
  resolveRescaleFactorsFromRulers,
} from '@/ui/composables/workspace/fml-rescale-from-measure'
import {
  mmToScaleInput,
  scaleInputStep,
  scaleInputToMm,
  type ScaleInputUnit,
} from '@/ui/composables/settings/scale-input-unit'
import { formatMeasureDistanceCm } from '@/ui/composables/fml-preview/fml-preview-measure'

const props = withDefaults(
  defineProps<{
    active: boolean
    canStart: boolean
    state: HScaleState | null
    mmX: number
    mmY: number
    unit: ScaleInputUnit
    /** Parent toont zelf de startknop (bijv. icoonrij). */
    hideStart?: boolean
  }>(),
  { hideStart: false },
)

const emit = defineEmits<{
  begin: []
  cancel: []
  confirm: []
  updateMmX: [value: number]
  updateMmY: [value: number]
}>()

const { t } = useI18n()

const unitLabel = computed(() => t(`common.${props.unit}`))
const inputStep = computed(() => scaleInputStep(props.unit))
const displayX = computed(() => mmToScaleInput(props.mmX, props.unit))
const displayY = computed(() => mmToScaleInput(props.mmY, props.unit))

const measured = computed(() =>
  props.state ? measuredCmFromRescaleState(props.state) : { x: 0, y: 0 },
)

const canConfirm = computed(() => {
  if (!props.active || !props.state) return false
  return (
    resolveRescaleFactorsFromRulers({
      measuredCmX: measured.value.x,
      measuredCmY: measured.value.y,
      trueMmX: props.mmX,
      trueMmY: props.mmY,
    }) != null
  )
})

const minHint = computed(() => t('result.rescaleMinHint', { cm: SCALE_RESCALE_MIN_MEASURED_CM }))

function onUpdateX(raw: string) {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return
  emit('updateMmX', scaleInputToMm(n, props.unit))
}

function onUpdateY(raw: string) {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return
  emit('updateMmY', scaleInputToMm(n, props.unit))
}
</script>

<template>
  <div v-if="!hideStart || active" class="fml-rescale-panel">
    <button
      v-if="!active"
      type="button"
      class="rescale-btn"
      :disabled="!canStart"
      :title="t('result.rescaleHint')"
      @click="emit('begin')"
    >
      {{ t('result.rescale') }}
    </button>

    <template v-else>
      <h3 class="rescale-title">{{ t('result.rescaleTitle') }}</h3>
      <p class="rescale-help">{{ t('result.rescaleHelp') }}</p>
      <div class="scale-grid">
        <label>
          <span>{{ t('input.scaleH', { unit: unitLabel }) }}</span>
          <div class="row">
            <input
              type="number"
              min="0"
              :step="inputStep"
              :value="displayX"
              @input="onUpdateX(($event.target as HTMLInputElement).value)"
            />
            <span class="unit">{{ unitLabel }}</span>
            <span class="px">{{ formatMeasureDistanceCm(measured.x) }}</span>
          </div>
        </label>
        <label>
          <span>{{ t('input.scaleV', { unit: unitLabel }) }}</span>
          <div class="row">
            <input
              type="number"
              min="0"
              :step="inputStep"
              :value="displayY"
              @input="onUpdateY(($event.target as HTMLInputElement).value)"
            />
            <span class="unit">{{ unitLabel }}</span>
            <span class="px">{{ formatMeasureDistanceCm(measured.y) }}</span>
          </div>
        </label>
      </div>
      <p class="rescale-min">{{ minHint }}</p>
      <div class="actions">
        <button type="button" class="primary" :disabled="!canConfirm" @click="emit('confirm')">
          {{ t('input.scaleApply') }}
        </button>
        <button type="button" @click="emit('cancel')">{{ t('input.scaleCancel') }}</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.fml-rescale-panel {
  margin: 0 0 10px;
}

.rescale-btn {
  width: 100%;
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #334155;
  border-radius: 4px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.rescale-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.rescale-title {
  margin: 0 0 4px;
  font-size: 13px;
  color: #0f172a;
}

.rescale-help,
.rescale-min {
  margin: 0 0 8px;
  font-size: 11px;
  color: #64748b;
  line-height: 1.35;
}

.scale-grid label {
  display: block;
  margin: 4px 0;
  font-size: 12px;
}

.row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.row input {
  width: 88px;
  height: 28px;
  padding: 2px 6px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
}

.unit,
.px {
  font-size: 11px;
  color: #64748b;
}

.actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

.actions button {
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 4px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}

.actions .primary {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}

.actions .primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
