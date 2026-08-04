<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ScaleConfirmBar from './ScaleConfirmBar.vue'
import OriginalSetupPanel from './OriginalSetupPanel.vue'
import InputMaskPanel from './InputMaskPanel.vue'
import OpenCvStatusPanel from './OpenCvStatusPanel.vue'
import type { PreprocessConfig } from '@/core/extraction/types'
import type { useHScaleCalibration } from '@/platform/calibration'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import type { useOpenCvLoader } from '../composables/useOpenCvLoader'

defineProps<{
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
}>()

const preprocess = defineModel<PreprocessConfig>('preprocess', { required: true })
const eraserRadius = defineModel<number>('eraserRadius', { required: true })

defineEmits<{
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
  reuseUnderlay: []
}>()

const { t } = useI18n()
</script>

<template>
  <ScaleConfirmBar
    :mm-x="scale.distanceMmX.value"
    :mm-y="scale.distanceMmY.value"
    :px-x="scale.pxDistanceX.value"
    :px-y="scale.pxDistanceY.value"
    :can-confirm="scale.canConfirm.value"
    :confirmed="scale.confirmed.value"
    :open="scalePanelOpen"
    :unit="scaleInputUnit"
    @update-mm-x="$emit('updateMmX', $event)"
    @update-mm-y="$emit('updateMmY', $event)"
    @confirm="$emit('confirmScale')"
    @cancel="$emit('cancelScale')"
    @toggle-open="$emit('toggleScalePanel')"
  />

  <OriginalSetupPanel v-model="preprocess" />

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
    <button
      type="button"
      class="secondary"
      :disabled="!canReuseUnderlay"
      @click="$emit('reuseUnderlay')"
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

.hint {
  font-size: 12px;
  color: #64748b;
  margin: 0 0 10px;
  line-height: 1.4;
}
</style>
