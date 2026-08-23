<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { SCALE_AXIS_MISMATCH_WARN_PCT } from '@/platform/calibration'
import {
  formatScaleInputValue,
  parseScaleInputToMm,
  type ScaleInputUnit,
} from '@/ui/composables/settings/scale-input-unit'

const props = defineProps<{
  mmX: number
  mmY: number
  pxX: number
  pxY: number
  canConfirm: boolean
  confirmed: boolean
  open: boolean
  unit: ScaleInputUnit
  /** Verschil tussen horizontale en verticale px/mm, in procent. */
  axisMismatchPct: number
}>()

const emit = defineEmits<{
  updateMmX: [value: number]
  updateMmY: [value: number]
  confirm: []
  cancel: []
  toggleOpen: []
}>()

const { t } = useI18n()

const unitLabel = computed(() => t(`common.${props.unit}`))
const axisMismatch = computed(() => props.axisMismatchPct >= SCALE_AXIS_MISMATCH_WARN_PCT)
const axisMismatchLabel = computed(() =>
  props.axisMismatchPct >= 100
    ? `${(props.axisMismatchPct / 100 + 1).toFixed(1)}×`
    : `${props.axisMismatchPct.toFixed(1)}%`,
)

function formatMm(mm: number): string {
  return formatScaleInputValue(mm / 10, props.unit)
}

const editingX = ref(false)
const editingY = ref(false)
const draftX = ref('')
const draftY = ref('')

const displayX = computed(() => (editingX.value ? draftX.value : formatMm(props.mmX)))
const displayY = computed(() => (editingY.value ? draftY.value : formatMm(props.mmY)))

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
  <div class="panel">
    <h3>{{ t('input.scaleTitle') }}</h3>
    <template v-if="open">
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
            <span class="px">{{ pxX.toFixed(1) }}{{ t('common.px') }}</span>
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
            <span class="px">{{ pxY.toFixed(1) }}{{ t('common.px') }}</span>
          </div>
        </label>
      </div>
      <div class="actions">
        <button type="button" class="primary" :disabled="!canConfirm" @click="emit('confirm')">
          {{ t('input.scaleApply') }}
        </button>
        <button type="button" @click="emit('cancel')">{{ t('input.scaleCancel') }}</button>
      </div>
    </template>
    <template v-else>
      <button type="button" class="primary" @click="emit('toggleOpen')">
        {{ t('input.scaleOpen') }}
      </button>
    </template>
    <p v-if="axisMismatch" class="warning">
      {{ t('input.scaleAxisMismatch', { diff: axisMismatchLabel }) }}
    </p>
  </div>
</template>

<style scoped>
label {
  display: block;
  margin: 4px 0;
  font-size: 12px;
}

.row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.scale-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.row input {
  width: 7.5em;
  min-width: 72px;
}

.unit {
  font-size: 11px;
  color: #475569;
  min-width: 1.5em;
}

.px {
  font-size: 11px;
  color: #64748b;
}
.actions {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}

.warning {
  margin: 8px 0 0;
  padding: 6px 8px;
  border-left: 3px solid #d97706;
  background: #fffbeb;
  color: #92400e;
  font-size: 11px;
  line-height: 1.35;
}
</style>
