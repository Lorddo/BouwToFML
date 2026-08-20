import { computed, ref, type Ref } from 'vue'
import type { Point2D } from '@/core/fml/types'
import type { useFmlPreviewEditor } from '@/ui/composables/useFmlPreviewEditor'
import { roomEndFromHv } from './fml-preview-draw-measure'
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

/**
 * Kamertekenen: klik → verplaats → klik (of typ H/V + Enter).
 * Oriëntatie = cursor-kwadrant; Shift = vierkant zolang geen H/V-override.
 */
export function useFmlPreviewDrawRoom(options: {
  hitTest: DrawRoomHitTestApi
  editor: EditorApi
  hoveredJunctionId: Ref<string | null>
  wallThicknessDraft: Ref<number>
  shiftPressed: Ref<boolean>
  resolveStartPoint: (cm: Point2D) => Point2D
  resolveEndPoint: (cm: Point2D, start: Point2D) => Point2D
  beforeBegin: () => void
  syncPlanToParent: () => void
  onPlaced?: () => void
}) {
  const drawRoomPreview = ref<Point2D[] | null>(null)
  const drafting = ref(false)
  let draft: { startCm: Point2D; hoverCm: Point2D } | null = null
  const hOverrideCm = ref<number | null>(null)
  const vOverrideCm = ref<number | null>(null)

  const measureHCm = computed(() => {
    const preview = drawRoomPreview.value
    if (!preview || preview.length < 3) return 0
    return Math.abs(preview[2].x - preview[0].x)
  })

  const measureVCm = computed(() => {
    const preview = drawRoomPreview.value
    if (!preview || preview.length < 3) return 0
    return Math.abs(preview[2].y - preview[0].y)
  })

  function resolveEnd(hover: Point2D, start: Point2D): Point2D {
    const snapped = options.resolveEndPoint(hover, start)
    const hOv = hOverrideCm.value
    const vOv = vOverrideCm.value
    if (hOv != null || vOv != null) {
      const liveH = Math.abs(snapped.x - start.x)
      const liveV = Math.abs(snapped.y - start.y)
      return roomEndFromHv(start, snapped, hOv ?? liveH, vOv ?? liveV)
    }
    return options.shiftPressed.value ? applySquareLock(start, snapped) : snapped
  }

  function rebuildPreview(): void {
    if (!draft) {
      drawRoomPreview.value = null
      return
    }
    const endCm = resolveEnd(draft.hoverCm, draft.startCm)
    drawRoomPreview.value = buildRectCorners(draft.startCm, endCm)
  }

  function cancelDrawRoomDrag(): void {
    draft = null
    drafting.value = false
    hOverrideCm.value = null
    vOverrideCm.value = null
    drawRoomPreview.value = null
    options.hoveredJunctionId.value = null
  }

  function updateDrawRoomHover(event: MouseEvent): void {
    if (!draft) return
    const cm = options.hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return
    draft.hoverCm = cm
    rebuildPreview()
    const junction = options.hitTest.hitTestJunctionAtCm(cm)
    options.hoveredJunctionId.value = junction?.id ?? null
  }

  function clearDrawRoomHover(): void {
    if (!draft) options.hoveredJunctionId.value = null
  }

  function placeRoom(endCm: Point2D): boolean {
    if (!draft) return false
    const corners = buildRectCorners(draft.startCm, endCm)
    options.editor.pushUndo()
    const wallIds = options.editor.applyRoomRect(corners, options.wallThicknessDraft.value)
    if (!wallIds) {
      options.editor.undo()
      return false
    }
    options.syncPlanToParent()
    cancelDrawRoomDrag()
    options.onPlaced?.()
    return true
  }

  function onDrawRoomClick(event: MouseEvent): void {
    const cm = options.hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return

    if (!draft) {
      options.beforeBegin()
      const startCm = options.resolveStartPoint(cm)
      draft = { startCm, hoverCm: startCm }
      drafting.value = true
      hOverrideCm.value = null
      vOverrideCm.value = null
      rebuildPreview()
      return
    }

    const endCm = resolveEnd(cm, draft.startCm)
    if (Math.abs(endCm.x - draft.startCm.x) < 1 && Math.abs(endCm.y - draft.startCm.y) < 1) {
      return
    }
    placeRoom(endCm)
  }

  function setHOverrideCm(cm: number | null): void {
    if (!draft) return
    hOverrideCm.value = cm != null && Number.isFinite(cm) && cm > 0 ? cm : null
    rebuildPreview()
  }

  function setVOverrideCm(cm: number | null): void {
    if (!draft) return
    vOverrideCm.value = cm != null && Number.isFinite(cm) && cm > 0 ? cm : null
    rebuildPreview()
  }

  function commitFromMeasure(): boolean {
    if (!draft) return false
    const preview = drawRoomPreview.value
    if (!preview || preview.length < 3) return false
    const endCm = preview[2]
    if (Math.abs(endCm.x - draft.startCm.x) < 1 && Math.abs(endCm.y - draft.startCm.y) < 1) {
      return false
    }
    return placeRoom(endCm)
  }

  return {
    drawRoomPreview,
    measureHCm,
    measureVCm,
    hOverrideCm,
    vOverrideCm,
    isDrafting: () => drafting.value,
    isDragging: () => drafting.value,
    onDrawRoomClick,
    updateDrawRoomHover,
    clearDrawRoomHover,
    setHOverrideCm,
    setVOverrideCm,
    commitFromMeasure,
    cancelDrawRoomDrag,
  }
}
