import { ref, type Ref } from 'vue'
import type { Point2D } from '@/core/fml/types'
import type { useFmlPreviewEditor } from '@/ui/composables/useFmlPreviewEditor'
import type { RenderJunction } from './useFmlPreviewRenderModel'

type EditorApi = ReturnType<typeof useFmlPreviewEditor>

interface DrawRoomHitTestApi {
  hitTestJunctionAtCm: (cm: Point2D) => RenderJunction | null
  clientToCm: (clientX: number, clientY: number) => Point2D | null
}

function buildRectCorners(start: Point2D, end: Point2D): Point2D[] {
  return [
    { x: start.x, y: start.y },
    { x: end.x, y: start.y },
    { x: end.x, y: end.y },
    { x: start.x, y: end.y },
  ]
}

function applySquareLock(start: Point2D, end: Point2D): Point2D {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const side = Math.max(Math.abs(dx), Math.abs(dy))
  return {
    x: start.x + Math.sign(dx || 1) * side,
    y: start.y + Math.sign(dy || 1) * side,
  }
}

export function useFmlPreviewDrawRoom(options: {
  hitTest: DrawRoomHitTestApi
  editor: EditorApi
  hoveredJunctionId: Ref<string | null>
  wallThicknessDraft: Ref<number>
  shiftPressed: Ref<boolean>
  resolvePoint: (cm: Point2D) => Point2D
  beforeBegin: () => void
  syncPlanToParent: () => void
}) {
  const drawRoomPreview = ref<Point2D[] | null>(null)
  let drawRoomDrag: { startCm: Point2D } | null = null

  function cancelDrawRoomDrag(): void {
    window.removeEventListener('mousemove', onDrawRoomPointerMove)
    drawRoomDrag = null
    drawRoomPreview.value = null
  }

  function resolveEndPoint(cm: Point2D, start: Point2D): Point2D {
    const snapped = options.resolvePoint(cm)
    return options.shiftPressed.value ? applySquareLock(start, snapped) : snapped
  }

  function beginDrawRoom(event: MouseEvent): void {
    const cm = options.hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return
    cancelDrawRoomDrag()
    options.beforeBegin()
    const startCm = options.resolvePoint(cm)
    drawRoomDrag = { startCm }
    drawRoomPreview.value = buildRectCorners(startCm, startCm)
    window.addEventListener('mousemove', onDrawRoomPointerMove)
    window.addEventListener('mouseup', onDrawRoomPointerUp, { once: true })
  }

  function onDrawRoomPointerMove(event: MouseEvent): void {
    if (!drawRoomDrag) return
    const cm = options.hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return
    const endCm = resolveEndPoint(cm, drawRoomDrag.startCm)
    drawRoomPreview.value = buildRectCorners(drawRoomDrag.startCm, endCm)
    const junction = options.hitTest.hitTestJunctionAtCm(cm)
    options.hoveredJunctionId.value = junction?.id ?? null
  }

  function onDrawRoomPointerUp(event: MouseEvent): void {
    window.removeEventListener('mousemove', onDrawRoomPointerMove)
    const drag = drawRoomDrag
    drawRoomDrag = null
    const preview = drawRoomPreview.value
    drawRoomPreview.value = null
    options.hoveredJunctionId.value = null
    if (!drag || !preview) return

    const pointerCm = options.hitTest.clientToCm(event.clientX, event.clientY) ?? preview[2]!
    const endCm = resolveEndPoint(pointerCm, drag.startCm)
    const corners = buildRectCorners(drag.startCm, endCm)

    options.editor.pushUndo()
    const wallIds = options.editor.applyRoomRect(corners, options.wallThicknessDraft.value)
    if (!wallIds) {
      options.editor.undo()
      return
    }
    options.syncPlanToParent()
  }

  return {
    drawRoomPreview,
    isDragging: () => drawRoomDrag != null,
    beginDrawRoom,
    cancelDrawRoomDrag,
  }
}
