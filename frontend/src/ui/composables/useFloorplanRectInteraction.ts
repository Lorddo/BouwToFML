import { ref, computed } from 'vue'
import type Konva from 'konva'
import type { SelectionRect } from '@/platform/selection'

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export const RESIZE_HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

const MIN_RECT_SIZE = 5

export function useFloorplanRectInteraction(deps: {
  lbeRects: () => SelectionRect[]
  selectedRectId: () => string | null
  isSelectionMode: () => boolean
  spacePressed: () => boolean
  imgSize: () => { w: number; h: number }
  stageScale: () => number
  stagePointerPos: () => { x: number; y: number } | null
  onSelectRect: (id: string | null) => void
  onRectUpdate: (
    id: string,
    bounds: { x: number; y: number; width: number; height: number },
  ) => void
  onRectDelete: (id: string) => void
}) {
  const resizeDrag = ref<{
    handle: ResizeHandle
    rectId: string
    startPointer: { x: number; y: number }
    startBounds: { x: number; y: number; width: number; height: number }
  } | null>(null)

  const moveDrag = ref<{
    rectId: string
    offsetX: number
    offsetY: number
  } | null>(null)

  const selectedRect = computed(
    () => deps.lbeRects().find((r) => r.id === deps.selectedRectId()) ?? null,
  )

  const iconSize = computed(() => Math.max(14, 18 / deps.stageScale()))
  const handleSize = computed(() => Math.max(8, 10 / deps.stageScale()))

  function handlePosition(rect: SelectionRect, handle: ResizeHandle): { x: number; y: number } {
    const hs = handleSize.value / 2
    const { x, y, width, height } = rect
    switch (handle) {
      case 'nw':
        return { x: x - hs, y: y - hs }
      case 'n':
        return { x: x + width / 2 - hs, y: y - hs }
      case 'ne':
        return { x: x + width - hs, y: y - hs }
      case 'e':
        return { x: x + width - hs, y: y + height / 2 - hs }
      case 'se':
        return { x: x + width - hs, y: y + height - hs }
      case 's':
        return { x: x + width / 2 - hs, y: y + height - hs }
      case 'sw':
        return { x: x - hs, y: y + height - hs }
      case 'w':
        return { x: x - hs, y: y + height / 2 - hs }
    }
  }

  function clampBounds(bounds: { x: number; y: number; width: number; height: number }) {
    const { w: maxW, h: maxH } = deps.imgSize()
    let { x, y, width, height } = bounds
    width = Math.max(MIN_RECT_SIZE, width)
    height = Math.max(MIN_RECT_SIZE, height)
    if (x < 0) {
      width += x
      x = 0
    }
    if (y < 0) {
      height += y
      y = 0
    }
    if (x + width > maxW) width = maxW - x
    if (y + height > maxH) height = maxH - y
    width = Math.max(MIN_RECT_SIZE, width)
    height = Math.max(MIN_RECT_SIZE, height)
    return { x, y, width, height }
  }

  function resizeFromHandle(
    start: { x: number; y: number; width: number; height: number },
    handle: ResizeHandle,
    pointer: { x: number; y: number },
  ) {
    let { x, y, width, height } = start
    const right = x + width
    const bottom = y + height
    const px = pointer.x
    const py = pointer.y

    if (handle.includes('w')) {
      x = Math.min(px, right - MIN_RECT_SIZE)
      width = right - x
    }
    if (handle.includes('e')) {
      width = Math.max(MIN_RECT_SIZE, px - x)
    }
    if (handle.includes('n')) {
      y = Math.min(py, bottom - MIN_RECT_SIZE)
      height = bottom - y
    }
    if (handle.includes('s')) {
      height = Math.max(MIN_RECT_SIZE, py - y)
    }
    return clampBounds({ x, y, width, height })
  }

  function iconPositions(rect: SelectionRect) {
    const pad = Math.max(4, 6 / deps.stageScale())
    const sz = iconSize.value
    return {
      move: { x: rect.x + pad, y: rect.y + pad },
      delete: { x: rect.x + rect.width - pad - sz, y: rect.y + pad },
    }
  }

  function stopBubble(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    e.cancelBubble = true
  }

  function onRectMouseDown(e: Konva.KonvaEventObject<MouseEvent>, rectId: string) {
    if (!deps.isSelectionMode() || deps.spacePressed()) return
    stopBubble(e)
    deps.onSelectRect(rectId)
    const rect = deps.lbeRects().find((r) => r.id === rectId)
    const p = deps.stagePointerPos()
    if (!rect || !p) return
    moveDrag.value = {
      rectId: rect.id,
      offsetX: p.x - rect.x,
      offsetY: p.y - rect.y,
    }
  }

  function onStageMouseDown(e: Konva.KonvaEventObject<MouseEvent>) {
    if (deps.isSelectionMode() && !deps.spacePressed() && e.target === e.target.getStage()) {
      deps.onSelectRect(null)
    }
  }

  function onResizeHandleDown(
    e: Konva.KonvaEventObject<MouseEvent>,
    handle: ResizeHandle,
    rect: SelectionRect,
  ) {
    if (!deps.isSelectionMode() || deps.spacePressed()) return
    stopBubble(e)
    const p = deps.stagePointerPos()
    if (!p) return
    resizeDrag.value = {
      handle,
      rectId: rect.id,
      startPointer: p,
      startBounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    }
  }

  function onMoveIconDown(e: Konva.KonvaEventObject<MouseEvent>, rect: SelectionRect) {
    if (!deps.isSelectionMode() || deps.spacePressed()) return
    stopBubble(e)
    const p = deps.stagePointerPos()
    if (!p) return
    moveDrag.value = {
      rectId: rect.id,
      offsetX: p.x - rect.x,
      offsetY: p.y - rect.y,
    }
  }

  function onDeleteIconClick(e: Konva.KonvaEventObject<MouseEvent>, rectId: string) {
    stopBubble(e)
    deps.onRectDelete(rectId)
  }

  function onSelectionMouseMove() {
    const p = deps.stagePointerPos()
    if (!p) return

    if (resizeDrag.value) {
      const { handle, rectId, startBounds } = resizeDrag.value
      const bounds = resizeFromHandle(startBounds, handle, p)
      deps.onRectUpdate(rectId, bounds)
      return
    }

    if (moveDrag.value) {
      const { rectId, offsetX, offsetY } = moveDrag.value
      const rect = deps.lbeRects().find((r) => r.id === rectId)
      if (!rect) return
      const bounds = clampBounds({
        x: p.x - offsetX,
        y: p.y - offsetY,
        width: rect.width,
        height: rect.height,
      })
      deps.onRectUpdate(rectId, bounds)
    }
  }

  function isDragging() {
    return !!resizeDrag.value || !!moveDrag.value
  }

  function onSelectionMouseUp() {
    resizeDrag.value = null
    moveDrag.value = null
  }

  function onSelectionKeyDown(e: KeyboardEvent) {
    if (!deps.isSelectionMode() || !deps.selectedRectId()) return
    if (e.key === 'Escape') {
      deps.onSelectRect(null)
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      deps.onRectDelete(deps.selectedRectId()!)
    }
  }

  return {
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
  }
}
