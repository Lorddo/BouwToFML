import { ref } from 'vue'
import type { InkToolId } from '@/ui/components/canvas/canvas-toolbelt.types'

type Point = { x: number; y: number }
type Rect = { x: number; y: number; width: number; height: number }

export function useFloorplanInkPointer(deps: {
  inkTool: () => InkToolId | null
  inkBrushSize: () => number
  spacePressed: () => boolean
  isInkBrushMode: () => boolean
  isInkLineMode: () => boolean
  isInkRectMode: () => boolean
  onInkBrushStroke: (points: Point[], radius: number) => void
  onInkEraseStroke: (points: Point[], radius: number) => void
  onInkLine: (start: Point, end: Point, lineWidth: number) => void
  onInkRect: (bounds: Rect, lineWidth: number) => void
}) {
  const inkStrokeActive = ref(false)
  const inkStrokePoints = ref<Point[]>([])
  const inkPointer = ref<Point | null>(null)
  const inkLineDraftStart = ref<Point | null>(null)
  const inkLineDraftEnd = ref<Point | null>(null)
  const inkRectDraft = ref<Rect | null>(null)

  function resetInkDraft() {
    inkStrokeActive.value = false
    inkStrokePoints.value = []
    inkPointer.value = null
    inkLineDraftStart.value = null
    inkLineDraftEnd.value = null
    inkRectDraft.value = null
  }

  function endInkBrushStroke() {
    if (!inkStrokeActive.value || inkStrokePoints.value.length === 0) return
    const points = inkStrokePoints.value
    const radius = deps.inkBrushSize()
    if (deps.inkTool() === 'eraser') {
      deps.onInkEraseStroke(points, radius)
    } else if (deps.inkTool() === 'brush') {
      deps.onInkBrushStroke(points, radius)
    }
    inkStrokeActive.value = false
    inkStrokePoints.value = []
  }

  function onInkMouseDown(
    p: Point,
    stopDrag: () => void,
  ): boolean {
    if (deps.spacePressed()) return false
    if (deps.isInkBrushMode()) {
      stopDrag()
      inkStrokeActive.value = true
      inkStrokePoints.value = [p]
      return true
    }
    if (deps.isInkLineMode()) {
      stopDrag()
      inkLineDraftStart.value = { ...p }
      inkLineDraftEnd.value = { ...p }
      return true
    }
    if (deps.isInkRectMode()) {
      stopDrag()
      inkRectDraft.value = { x: p.x, y: p.y, width: 0, height: 0 }
      return true
    }
    return false
  }

  function onInkMouseMove(p: Point): boolean {
    if (deps.isInkBrushMode() && !deps.spacePressed()) {
      inkPointer.value = p
    } else {
      inkPointer.value = null
    }

    if (inkLineDraftStart.value && deps.isInkLineMode() && !deps.spacePressed()) {
      inkLineDraftEnd.value = { ...p }
      return true
    }
    if (inkRectDraft.value && deps.isInkRectMode() && !deps.spacePressed()) {
      const start = inkRectDraft.value
      inkRectDraft.value = {
        x: start.x,
        y: start.y,
        width: p.x - start.x,
        height: p.y - start.y,
      }
      return true
    }
    if (deps.isInkBrushMode() && inkStrokeActive.value && !deps.spacePressed()) {
      inkStrokePoints.value = [...inkStrokePoints.value, p]
      return true
    }
    return false
  }

  function onInkMouseUp(): boolean {
    if (deps.isInkBrushMode()) {
      endInkBrushStroke()
    }
    if (deps.isInkLineMode() && inkLineDraftStart.value && inkLineDraftEnd.value && !deps.spacePressed()) {
      const start = inkLineDraftStart.value
      const end = inkLineDraftEnd.value
      if (Math.hypot(end.x - start.x, end.y - start.y) >= 1) {
        deps.onInkLine(start, end, deps.inkBrushSize())
      }
      resetInkDraft()
      return true
    }
    if (deps.isInkRectMode() && inkRectDraft.value && !deps.spacePressed()) {
      const rect = inkRectDraft.value
      if (Math.abs(rect.width) >= 1 || Math.abs(rect.height) >= 1) {
        deps.onInkRect(rect, deps.inkBrushSize())
      }
      resetInkDraft()
      return true
    }
    return false
  }

  function clearInkPointer() {
    inkPointer.value = null
  }

  return {
    inkStrokeActive,
    inkStrokePoints,
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
  }
}

export type FloorplanInkPointerApi = ReturnType<typeof useFloorplanInkPointer>
