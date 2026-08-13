<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ScaleConfirmBar from './ScaleConfirmBar.vue'
import OriginalSetupPanel from './OriginalSetupPanel.vue'
import InputMaskPanel from './InputMaskPanel.vue'
import OpenCvStatusPanel from './OpenCvStatusPanel.vue'
import type { PreprocessConfig } from '@/core/extraction/types'
import type { useHScaleCalibration } from '@/platform/calibration'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import type { useOpenCvLoader } from '../composables/useOpenCvLoader'

const props = defineProps<{
  scale: ReturnType<typeof useHScaleCalibration>
  scalePanelOpen: boolean
  scaleInputUnit: ScaleInputUnit
  cvLoader: ReturnType<typeof useOpenCvLoader>
  imageSrc: string | null
  eraserEnabled: boolean
  polygonEraserEnabled: boolean
  cropIncludeEnabled: boolean
  eraserTouched: boolean
  canUndoMask: boolean
  canReuseUnderlay?: boolean
  underlayDonorOptions?: Array<{ id: string; name: string }>
  canBakeRotation?: boolean
  bakingRotation?: boolean
}>()

const preprocess = defineModel<PreprocessConfig>('preprocess', { required: true })
const eraserRadius = defineModel<number>('eraserRadius', { required: true })

const emit = defineEmits<{
  updateMmX: [value: number]
  updateMmY: [value: number]
  confirmScale: []
  cancelScale: []
  toggleScalePanel: []
  toggleEraser: []
  togglePolygonEraser: []
  toggleCropInclude: []
  resetMask: []
  undo: []
  downloadUnderlay: []
  reuseUnderlay: [donorFloorId: string]
  bakeRotation: []
}>()

const { t } = useI18n()

const donorId = ref('')

watch(
  () => props.underlayDonorOptions,
  (opts) => {
    if (!opts?.length) {
      donorId.value = ''
      return
    }
    if (!opts.some((o) => o.id === donorId.value)) {
      donorId.value = opts[0]?.id ?? ''
    }
  },
  { immediate: true },
)

function onReuseUnderlay() {
  if (!donorId.value) return
  emit('reuseUnderlay', donorId.value)
}
</script>

<template>
  <ScaleConfirmBar
    :mm-x="scale.distanceMmX.value"
    :mm-y="scale.distanceMmY.value"
    :px-x="scale.pxDistanceX.value"
    :px-y="scale.pxDistanceY.value"
    :can-confirm="scale.canConfirm.value"
    :confirmed="scale.confirmed.value"
    :axis-mismatch-pct="scale.axisMismatchPct.value"
    :open="scalePanelOpen"
    :unit="scaleInputUnit"
    @update-mm-x="$emit('updateMmX', $event)"
    @update-mm-y="$emit('updateMmY', $event)"
    @confirm="$emit('confirmScale')"
    @cancel="$emit('cancelScale')"
    @toggle-open="$emit('toggleScalePanel')"
  />

  <OriginalSetupPanel
    v-model="preprocess"
    :can-bake="canBakeRotation"
    :baking="bakingRotation"
    @bake-rotation="$emit('bakeRotation')"
  />

  <InputMaskPanel
    :eraser-enabled="eraserEnabled"
    :polygon-eraser-enabled="polygonEraserEnabled"
    :crop-include-enabled="cropIncludeEnabled"
    :eraser-radius="eraserRadius"
    :mask-touched="eraserTouched"
    :can-undo="canUndoMask"
    @toggle-eraser="$emit('toggleEraser')"
    @toggle-polygon-eraser="$emit('togglePolygonEraser')"
    @toggle-crop-include="$emit('toggleCropInclude')"
    @update-eraser-radius="eraserRadius = $event"
    @reset-mask="$emit('resetMask')"
    @undo="$emit('undo')"
  />

  <div class="panel">
    <h3>{{ t('input.underlayTitle') }}</h3>
    <p class="hint">{{ t('input.underlayHint') }}</p>
    <label v-if="(underlayDonorOptions?.length ?? 0) > 0" class="field">
      <span>{{ t('input.reuseUnderlayDonor') }}</span>
      <select v-model="donorId">
        <option v-for="opt in underlayDonorOptions" :key="opt.id" :value="opt.id">
          {{ opt.name }}
        </option>
      </select>
    </label>
    <button
      type="button"
      class="secondary"
      :disabled="!canReuseUnderlay || !donorId"
      @click="onReuseUnderlay"
    >
      {{ t('input.reuseUnderlay') }}
    </button>
    <p v-if="canReuseUnderlay" class="hint">{{ t('input.reuseUnderlayHintOk') }}</p>
    <p v-else class="hint">{{ t('input.reuseUnderlayHintBlocked') }}</p>
    <button type="button" class="primary" :disabled="!imageSrc" @click="$emit('downloadUnderlay')">
      {{ t('input.downloadUnderlay') }}
    </button>
  </div>

  <OpenCvStatusPanel
    :loading="cvLoader.loading.value"
    :error="cvLoader.error.value"
    @reset="cvLoader.resetOpenCv"
  />
</template>

<style scoped>
.panel {
  padding: 12px 16px;
  border-bottom: 1px solid #e2e8f0;
}

.panel button {
  display: block;
  width: 100%;
  margin-top: 8px;
}

.panel button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 8px 0 0;
  font-size: 13px;
  color: #334155;
}

.field select {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
}

.hint {
  font-size: 12px;
  color: #64748b;
  margin: 0 0 10px;
  line-height: 1.4;
}
</style>
