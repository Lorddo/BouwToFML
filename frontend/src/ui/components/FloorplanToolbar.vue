<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { PolygonToolMode } from '@/cv/tools/polygon'
import type { ElementClass } from '@/core/extraction/types'
import type { InkToolId, FaceToolId } from '@/ui/components/canvas/canvas-toolbelt.types'
import './canvas/canvas-toolbelt.css'

defineProps<{
  polygonToolMode?: PolygonToolMode
  isEraserMode: boolean
  isDrawMode: boolean
  isFaceSelectMode: boolean
  isFaceBoxMode?: boolean
  faceBoxTool?: FaceToolId | null
  isSelectionMode: boolean
  isProbeMode?: boolean
  probeMode?: 'point' | 'region'
  drawType?: ElementClass | null
  inkTool?: InkToolId | null
  /** Inkt/vlak-tool hints staan in instructiebalk boven canvas. */
  relocateToolHints?: boolean
}>()

defineEmits<{
  fit: []
}>()

const { t } = useI18n()
</script>

<template>
  <div class="canvas-toolbar">
    <button type="button" @click="$emit('fit')">{{ t('common.fitToView') }}</button>
    <span v-if="!relocateToolHints" class="hint">
      <template v-if="polygonToolMode">
        {{ t('result.canvasHints.polygon') }}
      </template>
      <template v-else-if="isEraserMode">
        {{ t('result.canvasHints.eraserMode') }}
      </template>
      <template v-else-if="inkTool === 'brush'">
        {{ t('toolbelt.hints.inkBrush') }}{{ t('toolbelt.hints.panZoomSuffix') }}
      </template>
      <template v-else-if="inkTool === 'eraser'">
        {{ t('toolbelt.hints.inkEraser') }}{{ t('toolbelt.hints.panZoomSuffix') }}
      </template>
      <template v-else-if="inkTool === 'line'">
        {{ t('toolbelt.hints.inkLine') }}{{ t('toolbelt.hints.panZoomSuffix') }}
      </template>
      <template v-else-if="inkTool === 'rect'">
        {{ t('toolbelt.hints.inkRect') }}{{ t('toolbelt.hints.panZoomSuffix') }}
      </template>
      <template v-else-if="isDrawMode">
        {{ t('result.canvasHints.drawRef', { type: drawType }) }}
      </template>
      <template v-else-if="isFaceBoxMode">
        <template v-if="faceBoxTool === 'box_unknown'">
          {{ t('toolbelt.hints.faceUnknown') }}{{ t('toolbelt.hints.panZoomSuffix') }}
        </template>
        <template v-else>
          {{ t('toolbelt.hints.faceWall') }}{{ t('toolbelt.hints.panZoomSuffix') }}
        </template>
      </template>
      <template v-else-if="isFaceSelectMode">
        {{ t('result.canvasHints.faceSelect') }}
      </template>
      <template v-else-if="isProbeMode">
        <template v-if="probeMode === 'point'">
          {{ t('result.canvasHints.probePoint') }}
        </template>
        <template v-else>
          {{ t('result.canvasHints.probeRegion') }}
        </template>
      </template>
      <template v-else-if="isSelectionMode">
        {{ t('result.canvasHints.selection') }}
      </template>
      <template v-else>{{ t('result.canvasHints.panZoomChooseType') }}</template>
    </span>
    <span v-else class="hint">
      <template v-if="isFaceSelectMode">
        {{ t('result.canvasHints.faceSelect') }}
      </template>
      <template v-else-if="isProbeMode">
        <template v-if="probeMode === 'point'">
          {{ t('result.canvasHints.probePoint') }}
        </template>
        <template v-else>
          {{ t('result.canvasHints.probeRegion') }}
        </template>
      </template>
      <template v-else-if="isSelectionMode">
        {{ t('result.canvasHints.selectionWithMove') }}
      </template>
      <template v-else-if="isDrawMode">
        {{ t('result.canvasHints.drawRefShort', { type: drawType }) }}
      </template>
      <template v-else>{{ t('result.canvasHints.panZoom') }}</template>
    </span>
  </div>
</template>

<style scoped>
.canvas-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid #e2e8f0;
  flex-wrap: wrap;
}
</style>
