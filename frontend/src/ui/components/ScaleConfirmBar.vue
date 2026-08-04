<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  mmToScaleInput,
  scaleInputStep,
  scaleInputToMm,
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
const inputStep = computed(() => scaleInputStep(props.unit))
const displayX = computed(() => mmToScaleInput(props.mmX, props.unit))
const displayY = computed(() => mmToScaleInput(props.mmY, props.unit))

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
  <div class="panel">
    <h3>{{ t('input.scaleTitle') }}</h3>
    <template v-if="open">
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
            <span class="px">{{ pxX.toFixed(1) }}{{ t('common.px') }}</span>
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
  width: 72px;
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
</style>
