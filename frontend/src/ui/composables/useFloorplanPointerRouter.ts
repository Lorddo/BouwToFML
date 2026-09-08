import { watch, type Ref } from 'vue'
import type Konva from 'konva'
import type { SelectionRect } from '@/platform/selection'
import type { OcrTextOverlay } from '@/platform/canvas'
import { findOcrOverlayAt } from '@/platform/canvas/ocrOverlayHitTest'
import { findSelectionRectAt } from './floorplan-selection-hit'

type Point = { x: number; y: number }

/**
 * Stage pointer routing: tool priority (probe → face-box → shift-delete → … → LBE draw)
 * plus tool-reset watches. Rotatie-preview past zoom/pan niet aan (geen auto-fit).
 */
export function useFloorplanPointerRouter(deps: {
  stageRef: Ref<{ getNode: () => Konva.Stage } | null>
  underlayGroupRef: Ref<{ getNode: () => Konva.Group } | null>
  imageObj: Ref<HTMLImageElement | null>
  stageScale: Ref<number>
  spacePressed: () => boolean
  lbeEnabled: () => boolean
  lbeRects: () => SelectionRect[]
  ocrHitRemoveEnabled: () => boolean
  ocrTextOverlays: () => OcrTextOverlay[]
  drawType: () => unknown
  probeEnabled: () => boolean
  eraserEnabled: () => boolean
  inkTool: () => unknown
  faceTool: () => unknown
  isDrawMode: () => boolean
  isDragging: () => boolean
  wheelZoom: (stage: Konva.Stage, e: Konva.KonvaEventObject<WheelEvent>) => void
  onProbeMouseDown: (p: Point, stopDrag: () => void) => boolean
  onFaceBoxMouseDown: (p: Point, stopDrag: () => void) => boolean
  onFaceSelectMouseDown: (p: Point, opts: { shiftKey: boolean; stopDrag: () => void }) => boolean
  onStageMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => void
  onPolygonMouseDown: (p: Point) => boolean
  onMaskMouseDown: (p: Point, stopDrag?: () => void) => boolean
  onInkMouseDown: (p: Point, stopDrag: () => void) => boolean
  onPolygonDblClick: () => void
  onSelectionMouseMove: (event?: MouseEvent) => void
  onProbeMouseMove: (p: Point) => boolean
  onFaceMouseMove: (p: Point) => boolean
  onMaskMouseMove: (p: Point) => boolean
  onInkMouseMove: (p: Point) => boolean
  onSelectionMouseUp: () => void
  onFaceMouseUp: () => boolean
  onProbeMouseUp: () => boolean
  onMaskMouseUp: () => boolean
  onInkMouseUp: () => boolean
  clearEraserPointer: () => void
  clearInkPointer: () => void
  clearProbeResults: () => void
  resetEraserDraft: () => void
  resetInkDraft: () => void
  resetFaceBoxDraft: () => void
  /** After wheel zoom — sync guide-grid inverse transform. */
  onViewportChange?: () => void
  emit: {
    (e: 'lbeCancel'): void
    (e: 'lbeStart', x: number, y: number): void
    (e: 'lbeMove', x: number, y: number): void
    (e: 'lbeEnd'): void
    (e: 'rectDelete', id: string): void
    (e: 'ocrHitRemove', key: string): void
  }
}) {
  function stagePointerPos(): Point | null {
    const stage = deps.stageRef.value?.getNode()
    if (!stage) return null
    const group = deps.underlayGroupRef.value?.getNode()
    if (group && deps.imageObj.value) {
      const local = group.getRelativePointerPosition()
      if (local) return { x: local.x, y: local.y }
    }
    const pos = stage.getPointerPosition()
    if (!pos) return null
    const scale = stage.scaleX()
    return {
      x: (pos.x - stage.x()) / scale,
      y: (pos.y - stage.y()) / scale,
    }
  }

  watch(
    () => deps.drawType(),
    (type, prev) => {
      if (prev != null && type == null) deps.emit('lbeCancel')
    },
  )

  watch(
    () => deps.probeEnabled(),
    (enabled) => {
      if (!enabled) deps.clearProbeResults()
    },
  )

  watch(
    () => deps.eraserEnabled(),
    (enabled) => {
      if (!enabled) deps.resetEraserDraft()
    },
  )

  watch(
    () => deps.inkTool(),
    (tool) => {
      if (!tool) deps.resetInkDraft()
    },
  )

  watch(
    () => deps.faceTool(),
    (tool) => {
      if (!tool) deps.resetFaceBoxDraft()
    },
  )

  function onMouseDown(e: Konva.KonvaEventObject<MouseEvent>) {
    const p = stagePointerPos()
    if (!p) return
    const stopDrag = () => {
      e.cancelBubble = true
      e.target.getStage()?.stopDrag()
    }
    if (e.evt.button === 0 && deps.onProbeMouseDown(p, stopDrag)) return
    if (e.evt.button === 0 && deps.onFaceBoxMouseDown(p, stopDrag)) return
    if (deps.lbeEnabled() && e.evt.button === 0 && e.evt.shiftKey && !deps.spacePressed()) {
      const hit = findSelectionRectAt(p, deps.lbeRects())
      if (hit) {
        stopDrag()
        deps.emit('rectDelete', hit.id)
        return
      }
    }
    if (
      deps.ocrHitRemoveEnabled() &&
      e.evt.button === 0 &&
      e.evt.shiftKey &&
      !deps.spacePressed()
    ) {
      const hit = findOcrOverlayAt(p, deps.ocrTextOverlays())
      if (hit?.key) {
        stopDrag()
        deps.emit('ocrHitRemove', hit.key)
        return
      }
    }
    if (
      e.evt.button === 0 &&
      deps.onFaceSelectMouseDown(p, { shiftKey: e.evt.shiftKey, stopDrag })
    ) {
      return
    }
    deps.onStageMouseDown(e)
    if (deps.onPolygonMouseDown(p)) return
    if (deps.onMaskMouseDown(p, stopDrag)) return
    if (e.evt.button === 0 && deps.onInkMouseDown(p, stopDrag)) return
    if (deps.isDrawMode() && !deps.spacePressed()) {
      deps.emit('lbeStart', p.x, p.y)
    }
  }

  function onDblClick() {
    deps.onPolygonDblClick()
  }

  function onMouseMove(e: Konva.KonvaEventObject<MouseEvent>) {
    if (deps.isDragging()) {
      deps.onSelectionMouseMove(e.evt)
      return
    }
    const p = stagePointerPos()
    if (!p) return
    if (deps.onProbeMouseMove(p)) return
    if (deps.onFaceMouseMove(p)) return
    if (deps.onMaskMouseMove(p)) return
    if (deps.onInkMouseMove(p)) return
    if (deps.isDrawMode() && !deps.spacePressed()) {
      deps.emit('lbeMove', p.x, p.y)
    }
  }

  function onMouseUp() {
    deps.onSelectionMouseUp()
    if (deps.onFaceMouseUp()) return
    if (deps.onProbeMouseUp()) return
    deps.onMaskMouseUp()
    if (deps.onInkMouseUp()) return
    if (deps.isDrawMode() && !deps.spacePressed()) {
      deps.emit('lbeEnd')
    }
  }

  function onMouseLeave() {
    deps.clearEraserPointer()
    deps.clearInkPointer()
  }

  function onWheel(e: Konva.KonvaEventObject<WheelEvent>) {
    const stage = deps.stageRef.value?.getNode()
    if (stage) {
      deps.wheelZoom(stage, e)
      deps.stageScale.value = Math.max(0.01, stage.scaleX())
      deps.onViewportChange?.()
    }
  }

  return {
    stagePointerPos,
    onMouseDown,
    onDblClick,
    onMouseMove,
    onMouseUp,
    onMouseLeave,
    onWheel,
  }
}
