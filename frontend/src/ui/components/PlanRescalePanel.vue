<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { HScaleState } from '@/platform/calibration'
import { SCALE_RESCALE_MIN_MEASURED_CM } from '@/platform/calibration'
import {
  measuredCmFromRescaleState,
  resolveRescaleFactorsFromRulers,
} from '@/ui/composables/plan-canvas/plan-canvas-rescale-from-measure'
import {
  formatScaleInputLabel,
  formatScaleInputValue,
  parseScaleInputToMm,
  type ScaleInputUnit,
} from '@/ui/composables/settings/scale-input-unit'
import ToolbeltIcon from './canvas/ToolbeltIcon.vue'

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

function formatMm(mm: number): string {
  return formatScaleInputValue(mm / 10, props.unit)
}

const editingX = ref(false)
const editingY = ref(false)
const draftX = ref('')
const draftY = ref('')

const displayX = computed(() => (editingX.value ? draftX.value : formatMm(props.mmX)))
const displayY = computed(() => (editingY.value ? draftY.value : formatMm(props.mmY)))

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

function onFocusX() {
  editingX.value = true
  draftX.value = formatMm(props.mmX)
}

function onFocusY() {
  editingY.value = true
  draftY.value = formatMm(props.mmY)
}

function onInputX(raw: string) {
  draftX.value = raw
  const mm = parseScaleInputToMm(raw, props.unit)
  if (mm != null) emit('updateMmX', mm)
}

function onInputY(raw: string) {
  draftY.value = raw
  const mm = parseScaleInputToMm(raw, props.unit)
  if (mm != null) emit('updateMmY', mm)
}

function onBlurX() {
  editingX.value = false
}

function onBlurY() {
  editingY.value = false
}
</script>

<template>
  <div v-if="!hideStart || active" class="fml-rescale-panel">
    <button
      v-if="!active"
      type="button"
      class="sidebar-icon-btn"
      :disabled="!canStart"
      :title="t('result.rescaleHint')"
      @click="emit('begin')"
    >
      <ToolbeltIcon name="rescale" />
      <span>{{ t('result.rescale') }}</span>
    </button>

    <template v-else>
      <h3 class="rescale-title">{{ t('result.rescaleTitle') }}</h3>
      <p class="rescale-help">{{ t('result.rescaleHelp') }}</p>
      <div class="scale-grid">
        <label>
          <span>{{ t('input.scaleH', { unit: unitLabel }) }}</span>
          <div class="row">
            <input
              type="text"
              inputmode="decimal"
              autocomplete="off"
              spellcheck="false"
              :value="displayX"
              @focus="onFocusX"
              @blur="onBlurX"
              @input="onInputX(($event.target as HTMLInputElement).value)"
            />
            <span class="unit">{{ unitLabel }}</span>
            <span class="px">{{ formatScaleInputLabel(measured.x, unit) }}</span>
          </div>
        </label>
        <label>
          <span>{{ t('input.scaleV', { unit: unitLabel }) }}</span>
          <div class="row">
            <input
              type="text"
              inputmode="decimal"
              autocomplete="off"
              spellcheck="false"
              :value="displayY"
              @focus="onFocusY"
              @blur="onBlurY"
              @input="onInputY(($event.target as HTMLInputElement).value)"
            />
            <span class="unit">{{ unitLabel }}</span>
            <span class="px">{{ formatScaleInputLabel(measured.y, unit) }}</span>
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

.fml-rescale-panel > .sidebar-icon-btn {
  justify-content: flex-start;
  text-align: left;
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
  width: 7.5em;
  min-width: 88px;
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
