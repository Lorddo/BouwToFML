<script setup lang="ts">
import { ref } from 'vue'
import type Konva from 'konva'
import { useStage } from '@/platform/canvas'
import type { PolygonToolMode } from '@/cv/tools/polygon'
import { useFloorplanCanvasImage } from '../composables/useFloorplanCanvasImage'
import { useFloorplanCanvasModes } from '../composables/useFloorplanCanvasModes'
import { useFloorplanCanvasLifecycle } from '../composables/useFloorplanCanvasLifecycle'
import { useFloorplanRectInteraction } from '../composables/useFloorplanRectInteraction'
import { useFloorplanInkPointer } from '../composables/useFloorplanInkPointer'
import { useFloorplanProbePointer } from '../composables/useFloorplanProbePointer'
import { useFloorplanFacePointer } from '../composables/useFloorplanFacePointer'
import { useFloorplanMaskPointer } from '../composables/useFloorplanMaskPointer'
import { useFloorplanPolygonPointer } from '../composables/useFloorplanPolygonPointer'
import { useFloorplanPointerRouter } from '../composables/useFloorplanPointerRouter'
import FloorplanToolbar from './FloorplanToolbar.vue'
import FloorplanScaleOverlayLayer from './FloorplanScaleOverlayLayer.vue'
import FloorplanPolygonDraftLayer from './FloorplanPolygonDraftLayer.vue'
import FloorplanOverlayLayers from './FloorplanOverlayLayers.vue'
import FloorplanSelectionLayer from './FloorplanSelectionLayer.vue'
import FloorplanProbeLayer from './FloorplanProbeLayer.vue'
import {
  FLOORPLAN_CANVAS_PROP_DEFAULTS,
  type FloorplanCanvasEmits,
  type FloorplanCanvasProps,
} from './floorplan-canvas.types'
import './canvas/canvas-toolbelt.css'
import './floorplan-canvas.css'

export type { PolygonToolMode }

const props = withDefaults(defineProps<FloorplanCanvasProps>(), FLOORPLAN_CANVAS_PROP_DEFAULTS)

const emit = defineEmits<FloorplanCanvasEmits>()

const stageRef = ref<{ getNode: () => Konva.Stage } | null>(null)
const underlayGroupRef = ref<{ getNode: () => Konva.Group } | null>(null)
const containerSize = ref({ width: 800, height: 600 })

const { spacePressed, shiftPressed, onKeyDown, onKeyUp, wheelZoom, fitToScreen } = useStage()

const { imageObj, rasterOverlayObj, imgSize, stageScale, fit } = useFloorplanCanvasImage({
  imageSrc: () => props.imageSrc,
  rasterOverlaySrc: () => props.rasterOverlaySrc,
  rasterOverlayRevision: () => props.rasterOverlayRevision,
  getStage: () => stageRef.value?.getNode(),
  fitToScreen,
  onImageLoaded: (width, height) => emit('imageLoaded', width, height),
})

const {
  isDrawMode,
  isSelectionMode,
  isFaceSelectMode,
  isFaceBoxMode,
  isProbeMode,
  isInkBrushMode,
  isInkLineMode,
  isInkRectMode,
  isEraserMode,
  isPolygonMode,
  stageConfig,
  wrapClass,
  faceBoxPreviewStroke,
  polygonCloseThreshold,
  underlayGroupConfig,
  baseImageConfig,
  polygonDraftStroke,
  onDragStart,
  onDragEnd,
} = useFloorplanCanvasModes({
  lbeEnabled: () => props.lbeEnabled,
  drawType: () => props.drawType,
  inkTool: () => props.inkTool,
  eraserEnabled: () => props.eraserEnabled,
  polygonToolMode: () => props.polygonToolMode,
  faceSelectEnabled: () => props.faceSelectEnabled,
  faceTool: () => props.faceTool,
  probeEnabled: () => props.probeEnabled,
  imageDimmed: () => props.imageDimmed,
  rotationPreviewDeg: () => props.rotationPreviewDeg,
  containerSize: () => containerSize.value,
  spacePressed: () => spacePressed.value,
  shiftPressed: () => shiftPressed.value,
  imageObj,
  imgSize: () => imgSize.value,
  stageScale: () => stageScale.value,
})

const {
  selectedRect,
  iconSize,
  handleSize,
  handlePosition,
  iconPositions,
  isDragging,
  onRectMouseDown,
  onStageMouseDown,
  onResizeHandleDown,
  onMoveIconDown,
  onDeleteIconClick,
  onSelectionMouseMove,
  onSelectionMouseUp,
  onSelectionKeyDown,
} = useFloorplanRectInteraction({
  lbeRects: () => props.lbeRects,
  selectedRectId: () => props.selectedRectId,
  isSelectionMode: () => isSelectionMode.value,
  spacePressed: () => spacePressed.value,
  imgSize: () => imgSize.value,
  stageScale: () => stageScale.value,
  stagePointerPos: () => pointer.stagePointerPos(),
  onSelectRect: (id) => emit('selectRect', id),
  onRectUpdate: (id, bounds) => emit('rectUpdate', id, bounds),
  onRectDelete: (id) => emit('rectDelete', id),
})

const {
  eraserPointer,
  resetEraserDraft,
  endEraserStroke,
  onMaskMouseDown,
  onMaskMouseMove,
  onMaskMouseUp,
  clearEraserPointer,
} = useFloorplanMaskPointer({
  eraserEnabled: () => props.eraserEnabled,
  eraserRadius: () => props.eraserRadius,
  spacePressed: () => spacePressed.value,
  onEraseStroke: (points, radius) => emit('eraseStroke', points, radius),
})

const {
  inkPointer,
  inkLineDraftStart,
  inkLineDraftEnd,
  inkRectDraft,
  resetInkDraft,
  endInkBrushStroke,
  onInkMouseDown,
  onInkMouseMove,
  onInkMouseUp,
  clearInkPointer,
} = useFloorplanInkPointer({
  inkTool: () => props.inkTool,
  inkBrushSize: () => props.inkBrushSize,
  spacePressed: () => spacePressed.value,
  isInkBrushMode: () => isInkBrushMode.value,
  isInkLineMode: () => isInkLineMode.value,
  isInkRectMode: () => isInkRectMode.value,
  onInkBrushStroke: (points, radius) => emit('inkBrushStroke', points, radius),
  onInkEraseStroke: (points, radius) => emit('inkEraseStroke', points, radius),
  onInkLine: (start, end, lineWidth) => emit('inkLine', start, end, lineWidth),
  onInkRect: (bounds, lineWidth) => emit('inkRect', bounds, lineWidth),
})

const {
  probePreviewRect,
  probeResultPoint,
  probeResultRect,
  clearProbeResults,
  onProbeMouseDown,
  onProbeMouseMove,
  onProbeMouseUp,
} = useFloorplanProbePointer({
  probeMode: () => props.probeMode,
  spacePressed: () => spacePressed.value,
  isProbeMode: () => isProbeMode.value,
  onProbeSample: (sample) => emit('probeSample', sample),
})

const {
  faceBoxPreviewRect,
  resetFaceBoxDraft,
  onFaceBoxMouseDown,
  onFaceSelectMouseDown,
  onFaceMouseMove,
  onFaceMouseUp,
} = useFloorplanFacePointer({
  spacePressed: () => spacePressed.value,
  isFaceBoxMode: () => isFaceBoxMode.value,
  isFaceSelectMode: () => isFaceSelectMode.value,
  onFaceClick: (x, y) => emit('faceClick', x, y),
  onFaceBoxSelect: (bounds) => emit('faceBoxSelect', bounds),
})

const { onPolygonKeyDown, onPolygonMouseDown, onPolygonDblClick } = useFloorplanPolygonPointer({
  polygonDraftPoints: () => props.polygonDraftPoints,
  spacePressed: () => spacePressed.value,
  isPolygonMode: () => isPolygonMode.value,
  polygonCloseThreshold: () => polygonCloseThreshold.value,
  onPolygonPoint: (x, y) => emit('polygonPoint', x, y),
  onPolygonComplete: (points) => emit('polygonComplete', points),
  onPolygonCancel: () => emit('polygonCancel'),
  onPolygonUndoPoint: () => emit('polygonUndoPoint'),
})

const { containerRef } = useFloorplanCanvasLifecycle({
  containerSize,
  onKeyDown,
  onKeyUp,
  onPolygonKeyDown,
  onSelectionKeyDown,
  endEraserStroke,
  endInkBrushStroke,
  onSelectionMouseUp,
})

const pointer = useFloorplanPointerRouter({
  stageRef,
  underlayGroupRef,
  imageObj,
  imgSize: () => imgSize.value,
  stageScale,
  spacePressed: () => spacePressed.value,
  lbeEnabled: () => props.lbeEnabled,
  lbeRects: () => props.lbeRects,
  ocrHitRemoveEnabled: () => props.ocrHitRemoveEnabled,
  ocrTextOverlays: () => props.ocrTextOverlays,
  drawType: () => props.drawType,
  probeEnabled: () => props.probeEnabled,
  eraserEnabled: () => props.eraserEnabled,
  inkTool: () => props.inkTool,
  faceTool: () => props.faceTool,
  rotationPreviewDeg: () => props.rotationPreviewDeg ?? 0,
  isDrawMode: () => isDrawMode.value,
  isDragging,
  fitToScreen,
  wheelZoom,
  onProbeMouseDown,
  onFaceBoxMouseDown,
  onFaceSelectMouseDown,
  onStageMouseDown,
  onPolygonMouseDown,
  onMaskMouseDown,
  onInkMouseDown,
  onPolygonDblClick,
  onSelectionMouseMove,
  onProbeMouseMove,
  onFaceMouseMove,
  onMaskMouseMove,
  onInkMouseMove,
  onSelectionMouseUp,
  onFaceMouseUp,
  onProbeMouseUp,
  onMaskMouseUp,
  onInkMouseUp,
  clearEraserPointer,
  clearInkPointer,
  clearProbeResults,
  resetEraserDraft,
  resetInkDraft,
  resetFaceBoxDraft,
  emit,
})

defineExpose({ fit, imageObj, imgSize })
</script>

<template>
  <div ref="containerRef" class="canvas-wrap" :class="wrapClass">
    <FloorplanToolbar
      :polygon-tool-mode="polygonToolMode"
      :is-eraser-mode="isEraserMode"
      :is-draw-mode="isDrawMode"
      :is-face-select-mode="isFaceSelectMode"
      :is-face-box-mode="isFaceBoxMode"
      :face-box-tool="faceTool"
      :is-selection-mode="isSelectionMode"
      :is-probe-mode="isProbeMode"
      :probe-mode="probeMode"
      :draw-type="drawType"
      :ink-tool="inkTool"
      :relocate-tool-hints="relocateToolHints"
      @fit="fit"
    />
    <p
      v-if="instructionHint"
      class="canvas-instruction-hint"
      :class="{ 'canvas-instruction-hint--stale': instructionHintStale }"
    >
      {{ instructionHint }}
    </p>
    <v-stage
      ref="stageRef"
      :config="stageConfig"
      @wheel="pointer.onWheel"
      @mousedown="pointer.onMouseDown"
      @dblclick="pointer.onDblClick"
      @mousemove="pointer.onMouseMove"
      @mouseup="pointer.onMouseUp"
      @dragstart="onDragStart"
      @dragend="onDragEnd"
      @mouseleave="pointer.onMouseLeave"
    >
      <v-layer>
        <v-group ref="underlayGroupRef" :config="underlayGroupConfig">
          <v-image v-if="imageObj" :config="baseImageConfig" />
          <v-image
            v-if="rasterOverlayObj && showRasterOverlay"
            :config="{
              name: 'rasterOverlay',
              image: rasterOverlayObj,
              x: 0,
              y: 0,
              width: imgSize.w,
              height: imgSize.h,
              opacity: 0.92,
              listening: false,
            }"
          />
          <FloorplanScaleOverlayLayer
            v-if="showScaleOverlay && scaleState"
            :scale-state="scaleState"
            :img-width="imgSize.w"
            :img-height="imgSize.h"
            :stage-scale="stageScale"
            @move-scale-handle="(handle, value) => emit('moveScaleHandle', handle, value)"
          />
          <FloorplanPolygonDraftLayer
            :polygon-draft-points="polygonDraftPoints"
            :stage-scale="stageScale"
            :stroke-color="polygonDraftStroke"
          />
          <FloorplanProbeLayer
            :probe-point="probeResultPoint"
            :probe-preview-rect="probePreviewRect"
            :probe-result-rect="probeResultRect"
          />
          <v-circle
            v-if="eraserEnabled && eraserPointer"
            :config="{
              x: eraserPointer.x,
              y: eraserPointer.y,
              radius: Math.max(2, eraserRadius),
              stroke: '#ef4444',
              strokeWidth: 1 / Math.max(0.01, stageScale),
              fill: 'rgba(239,68,68,0.12)',
              listening: false,
            }"
          />
          <v-circle
            v-if="isInkBrushMode && inkPointer"
            :config="{
              x: inkPointer.x,
              y: inkPointer.y,
              radius: Math.max(1, inkBrushSize),
              stroke: inkTool === 'eraser' ? '#ef4444' : '#0f172a',
              strokeWidth: 1 / Math.max(0.01, stageScale),
              fill: inkTool === 'eraser' ? 'rgba(239,68,68,0.12)' : 'rgba(15,23,42,0.12)',
              listening: false,
            }"
          />
          <v-line
            v-if="inkLineDraftStart && inkLineDraftEnd"
            :config="{
              points: [
                inkLineDraftStart.x,
                inkLineDraftStart.y,
                inkLineDraftEnd.x,
                inkLineDraftEnd.y,
              ],
              stroke: '#0f172a',
              strokeWidth: Math.max(1, inkBrushSize) / Math.max(0.01, stageScale),
              listening: false,
            }"
          />
          <v-rect
            v-if="faceBoxPreviewRect"
            :config="{
              x:
                faceBoxPreviewRect.width < 0
                  ? faceBoxPreviewRect.x + faceBoxPreviewRect.width
                  : faceBoxPreviewRect.x,
              y:
                faceBoxPreviewRect.height < 0
                  ? faceBoxPreviewRect.y + faceBoxPreviewRect.height
                  : faceBoxPreviewRect.y,
              width: Math.abs(faceBoxPreviewRect.width),
              height: Math.abs(faceBoxPreviewRect.height),
              stroke: faceBoxPreviewStroke,
              strokeWidth: 2 / Math.max(0.01, stageScale),
              dash: [6, 4],
              fill:
                faceBoxPreviewStroke === '#ef4444'
                  ? 'rgba(239, 68, 68, 0.12)'
                  : 'rgba(30, 41, 59, 0.12)',
              listening: false,
            }"
          />
          <v-rect
            v-if="inkRectDraft"
            :config="{
              x: inkRectDraft.width < 0 ? inkRectDraft.x + inkRectDraft.width : inkRectDraft.x,
              y: inkRectDraft.height < 0 ? inkRectDraft.y + inkRectDraft.height : inkRectDraft.y,
              width: Math.abs(inkRectDraft.width),
              height: Math.abs(inkRectDraft.height),
              stroke: '#0f172a',
              strokeWidth: Math.max(1, inkBrushSize) / Math.max(0.01, stageScale),
              listening: false,
            }"
          />
          <FloorplanSelectionLayer
            :lbe-rects="lbeRects"
            :preview-rect="previewRect"
            :selected-rect-id="selectedRectId"
            :selected-rect="selectedRect"
            :is-selection-mode="isSelectionMode"
            :type-colors="typeColors"
            :icon-size="iconSize"
            :handle-size="handleSize"
            :handle-position="handlePosition"
            :icon-positions="iconPositions"
            :on-rect-mouse-down="onRectMouseDown"
            :on-resize-handle-down="onResizeHandleDown"
            :on-move-icon-down="onMoveIconDown"
            :on-delete-icon-click="onDeleteIconClick"
          />
        </v-group>
      </v-layer>

      <FloorplanOverlayLayers
        :segment-overlays="segmentOverlays"
        :junction-overlays="junctionOverlays"
        :gap-overlays="gapOverlays"
        :ocr-text-overlays="ocrTextOverlays"
        :wall-match-overlays="wallMatchOverlays"
        :detection-overlays="detectionOverlays"
        :type-colors="typeColors"
      />
    </v-stage>
  </div>
</template>
