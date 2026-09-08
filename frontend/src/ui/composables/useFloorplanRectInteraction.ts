import { ref, computed } from 'vue'
import type Konva from 'konva'
import type { SelectionRect } from '@/platform/selection'
import {
  compactRectRotationDeg,
  orientedWorldToLocal,
  rectCenter,
  rectRotationDeg,
} from '@/platform/selection/oriented-rect'
import { isTypingFieldTarget } from '@/ui/composables/fml-preview/fml-preview-draft-commit'
import {
  resizeFromSide,
  type ItemResizeSide,
} from '@/ui/composables/fml-preview/item-resize-handles'
import {
  pointerAngleDeg,
  rotationFromGrab,
  snapItemRotationDeg,
  type ItemRotateCorner,
} from '@/ui/composables/fml-preview/item-rotate-handles'

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export const RESIZE_HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
export const EDGE_RESIZE_HANDLES: ItemResizeSide[] = ['n', 'e', 's', 'w']
export const ROTATE_CORNERS: ItemRotateCorner[] = ['ne', 'se', 'sw', 'nw']

const MIN_RECT_SIZE = 5
const ROTATE_SNAP_CANDIDATES = [0, 90, 180, 270]

export type RectBoundsUpdate = {
  x: number
  y: number
  width: number
  height: number
  rotationDeg?: number
}

export function useFloorplanRectInteraction(deps: {
  lbeRects: () => SelectionRect[]
  selectedRectId: () => string | null
  isSelectionMode: () => boolean
  spacePressed: () => boolean
  imgSize: () => { w: number; h: number }
  stageScale: () => number
  stagePointerPos: () => { x: number; y: number } | null
  onSelectRect: (id: string | null) => void
  onRectUpdate: (id: string, bounds: RectBoundsUpdate) => void
  onRectDelete: (id: string) => void
}) {
  const resizeDrag = ref<{
    handle: ItemResizeSide
    rectId: string
    startBounds: SelectionRect
  } | null>(null)

  const moveDrag = ref<{
    rectId: string
    offsetX: number
    offsetY: number
  } | null>(null)

  const rotateDrag = ref<{
    corner: ItemRotateCorner
    rectId: string
    startRotationDeg: number
    startPointerDeg: number
    center: { x: number; y: number }
  } | null>(null)

  const selectedRect = computed(
    () => deps.lbeRects().find((r) => r.id === deps.selectedRectId()) ?? null,
  )

  const iconSize = computed(() => Math.max(14, 18 / deps.stageScale()))
  const handleSize = computed(() => Math.max(8, 10 / deps.stageScale()))

  function asCenterItem(rect: SelectionRect) {
    const center = rectCenter(rect)
    return {
      x: center.x,
      y: center.y,
      width: rect.width,
      height: rect.height,
      rotation: rectRotationDeg(rect),
    }
  }

  function fromCenterItem(
    item: { x: number; y: number; width: number; height: number },
    rotationDeg: number,
  ): RectBoundsUpdate {
    return {
      x: item.x - item.width / 2,
      y: item.y - item.height / 2,
      width: item.width,
      height: item.height,
      ...(compactRectRotationDeg(rotationDeg) != null
        ? { rotationDeg: compactRectRotationDeg(rotationDeg) }
        : { rotationDeg: 0 }),
    }
  }

  function clampOriented(bounds: RectBoundsUpdate): RectBoundsUpdate {
    const { w: maxW, h: maxH } = deps.imgSize()
    const x = bounds.x
    const y = bounds.y
    const width = Math.max(MIN_RECT_SIZE, bounds.width)
    const height = Math.max(MIN_RECT_SIZE, bounds.height)
    const rot = rectRotationDeg(bounds)
    const cx = x + width / 2
    const cy = y + height / 2
    const rad = (rot * Math.PI) / 180
    const cos = Math.abs(Math.cos(rad))
    const sin = Math.abs(Math.sin(rad))
    const aabbW = width * cos + height * sin
    const aabbH = width * sin + height * cos
    let nextCx = cx
    let nextCy = cy
    if (nextCx - aabbW / 2 < 0) nextCx = aabbW / 2
    if (nextCy - aabbH / 2 < 0) nextCy = aabbH / 2
    if (nextCx + aabbW / 2 > maxW) nextCx = maxW - aabbW / 2
    if (nextCy + aabbH / 2 > maxH) nextCy = maxH - aabbH / 2
    if (aabbW > maxW) nextCx = maxW / 2
    if (aabbH > maxH) nextCy = maxH / 2
    return {
      x: nextCx - width / 2,
      y: nextCy - height / 2,
      width,
      height,
      ...(bounds.rotationDeg != null ? { rotationDeg: bounds.rotationDeg } : {}),
    }
  }

  function iconPositions(rect: SelectionRect) {
    const pad = Math.max(4, 6 / deps.stageScale())
    const sz = iconSize.value
    return {
      delete: { x: rect.width / 2 - pad - sz, y: -rect.height / 2 + pad },
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
    handle: ItemResizeSide,
    rect: SelectionRect,
  ) {
    if (!deps.isSelectionMode() || deps.spacePressed()) return
    stopBubble(e)
    if (!deps.stagePointerPos()) return
    resizeDrag.value = {
      handle,
      rectId: rect.id,
      startBounds: { ...rect },
    }
  }

  function onRotateHandleDown(
    e: Konva.KonvaEventObject<MouseEvent>,
    corner: ItemRotateCorner,
    rect: SelectionRect,
  ) {
    if (!deps.isSelectionMode() || deps.spacePressed()) return
    stopBubble(e)
    const p = deps.stagePointerPos()
    if (!p) return
    const center = rectCenter(rect)
    rotateDrag.value = {
      corner,
      rectId: rect.id,
      startRotationDeg: rectRotationDeg(rect),
      startPointerDeg: pointerAngleDeg(center, p),
      center,
    }
  }

  function onDeleteIconClick(e: Konva.KonvaEventObject<MouseEvent>, rectId: string) {
    stopBubble(e)
    deps.onRectDelete(rectId)
  }

  function onSelectionMouseMove(event?: MouseEvent) {
    const p = deps.stagePointerPos()
    if (!p) return

    if (rotateDrag.value) {
      const { rectId, startRotationDeg, startPointerDeg, center } = rotateDrag.value
      const raw = rotationFromGrab(startRotationDeg, startPointerDeg, pointerAngleDeg(center, p))
      const snapOff = event?.ctrlKey === true || event?.metaKey === true
      const rotationDeg = snapOff ? raw : snapItemRotationDeg(raw, ROTATE_SNAP_CANDIDATES)
      const rect = deps.lbeRects().find((r) => r.id === rectId)
      if (!rect) return
      deps.onRectUpdate(
        rectId,
        clampOriented({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          rotationDeg,
        }),
      )
      return
    }

    if (resizeDrag.value) {
      const { handle, rectId, startBounds } = resizeDrag.value
      const startItem = asCenterItem(startBounds)
      const local = orientedWorldToLocal({ x: startItem.x, y: startItem.y }, p, startItem.rotation)
      const next = resizeFromSide(startItem, handle, local, MIN_RECT_SIZE)
      deps.onRectUpdate(rectId, clampOriented(fromCenterItem(next, startItem.rotation)))
      return
    }

    if (moveDrag.value) {
      const { rectId, offsetX, offsetY } = moveDrag.value
      const rect = deps.lbeRects().find((r) => r.id === rectId)
      if (!rect) return
      deps.onRectUpdate(
        rectId,
        clampOriented({
          x: p.x - offsetX,
          y: p.y - offsetY,
          width: rect.width,
          height: rect.height,
          ...(rect.rotationDeg != null ? { rotationDeg: rect.rotationDeg } : {}),
        }),
      )
    }
  }

  function isDragging() {
    return !!resizeDrag.value || !!moveDrag.value || !!rotateDrag.value
  }

  function onSelectionMouseUp() {
    resizeDrag.value = null
    moveDrag.value = null
    rotateDrag.value = null
  }

  function onSelectionKeyDown(e: KeyboardEvent) {
    if (isTypingFieldTarget(e.target)) return
    if (!deps.isSelectionMode() || !deps.selectedRectId()) return
    if (e.key === 'Escape') {
      e.preventDefault()
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
    iconPositions,
    isDragging,
    onRectMouseDown,
    onStageMouseDown,
    onResizeHandleDown,
    onRotateHandleDown,
    onDeleteIconClick,
    onSelectionMouseMove,
    onSelectionMouseUp,
    onSelectionKeyDown,
  }
}
