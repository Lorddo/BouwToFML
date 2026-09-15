import { computed, ref, type Ref } from 'vue'
import type { Point2D } from '@/core/plan/types'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import type { usePlanEditor } from '@/ui/composables/usePlanEditor'
import {
  applyDrawTypeKey,
  centerlineSpanFromInner,
  ensureAwayFromStart,
  flipPointX,
  flipPointY,
  hitClosestDraftPoint,
  innerSpanFromCenterline,
  isDrawTypeLengthKey,
  isDrawTypeRoomFieldKey,
  parseDrawLengthDraftToCm,
  roomEndFromHv,
  roomSideThicknesses,
  seedDrawRoomEnd,
  type DrawThickWall,
} from '@/ui/composables/canvas-kernel/plan-canvas-draw-measure'
import { isLiveDrawPointer } from './plan-canvas-touch-tap'
import type { RenderJunction } from './usePlanCanvasRenderModel'

type EditorApi = ReturnType<typeof usePlanEditor>

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
 * Mobile: seed 0,5 × 0,5 m omhoog + handles; plaatsen alleen via accept.
 */
export function usePlanCanvasDrawRoom(options: {
  hitTest: DrawRoomHitTestApi
  editor: EditorApi
  hoveredJunctionId: Ref<string | null>
  wallThicknessDraft: Ref<number>
  wallHeightDraft?: Ref<number>
  wallBottomZDraft?: Ref<number>
  shiftPressed: Ref<boolean>
  resolveStartPoint: (cm: Point2D) => Point2D
  resolveEndPoint: (cm: Point2D, start: Point2D) => Point2D
  handleTolCm?: () => number
  placeOnSecondClick?: () => boolean
  getWalls?: () => ReadonlyArray<DrawThickWall>
  getInputUnit?: () => ScaleInputUnit
  beforeBegin: () => void
  syncPlanToParent: () => void
  onPlaced?: () => void
}) {
  function inputUnit(): ScaleInputUnit {
    return options.getInputUnit?.() ?? 'm'
  }
  const drawRoomPreview = ref<Point2D[] | null>(null)
  const drafting = ref(false)
  let draft: { startCm: Point2D; hoverCm: Point2D } | null = null
  const hOverrideCm = ref<number | null>(null)
  const vOverrideCm = ref<number | null>(null)
  const typeHText = ref('')
  const typeVText = ref('')
  const typeField = ref<'h' | 'v'>('h')
  const handleDragging = ref(false)
  let unbindHandle: (() => void) | null = null

  const measureHCm = computed(() => {
    const preview = drawRoomPreview.value
    if (!preview || preview.length < 3) return 0
    return innerAxes(preview[0], preview[2]).h
  })

  const measureVCm = computed(() => {
    const preview = drawRoomPreview.value
    if (!preview || preview.length < 3) return 0
    return innerAxes(preview[0], preview[2]).v
  })

  function draftWalls(): ReadonlyArray<DrawThickWall> {
    return options.getWalls?.() ?? []
  }

  function sideThick(start: Point2D, end: Point2D) {
    return roomSideThicknesses(start, end, options.wallThicknessDraft.value, draftWalls())
  }

  function innerAxes(start: Point2D, end: Point2D): { h: number; v: number } {
    const sides = sideThick(start, end)
    return {
      h: innerSpanFromCenterline(end.x - start.x, sides.west, sides.east),
      v: innerSpanFromCenterline(end.y - start.y, sides.north, sides.south),
    }
  }

  function seedEnd(start: Point2D): Point2D {
    const thick = options.wallThicknessDraft.value
    const sides = roomSideThicknesses(
      start,
      { x: start.x + 1, y: start.y - 1 },
      thick,
      draftWalls(),
    )
    return seedDrawRoomEnd(
      start,
      centerlineSpanFromInner(0, sides.west, sides.east),
      centerlineSpanFromInner(0, sides.north, sides.south),
    )
  }

  function resolveEnd(hover: Point2D, start: Point2D): Point2D {
    let snapped = options.resolveEndPoint(hover, start)
    let hOv = hOverrideCm.value
    let vOv = vOverrideCm.value
    if (hOv != null && hOv < 0) {
      snapped = flipPointX(start, snapped)
      hOv = Math.abs(hOv)
    }
    if (vOv != null && vOv < 0) {
      snapped = flipPointY(start, snapped)
      vOv = Math.abs(vOv)
    }
    if (hOv != null || vOv != null) {
      const live = innerAxes(start, snapped)
      const sides = sideThick(start, snapped)
      return roomEndFromHv(
        start,
        snapped,
        centerlineSpanFromInner(hOv ?? live.h, sides.west, sides.east),
        centerlineSpanFromInner(vOv ?? live.v, sides.north, sides.south),
      )
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

  function cancelHandleDrag(): void {
    unbindHandle?.()
    unbindHandle = null
    handleDragging.value = false
  }

  function cancelDrawRoomDrag(): void {
    cancelHandleDrag()
    draft = null
    drafting.value = false
    hOverrideCm.value = null
    vOverrideCm.value = null
    typeHText.value = ''
    typeVText.value = ''
    typeField.value = 'h'
    drawRoomPreview.value = null
    options.hoveredJunctionId.value = null
  }

  function handleRadius(): number {
    return options.handleTolCm?.() ?? 12
  }

  function hitHandleAtCm(cm: Point2D): number | null {
    const corners = drawRoomPreview.value
    if (!draft || !corners) return null
    return hitClosestDraftPoint(cm, corners, handleRadius())
  }

  function applyHandle(id: number, event: { clientX: number; clientY: number }): void {
    if (!draft) return
    const cm = options.hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return
    const end = resolveEnd(draft.hoverCm, draft.startCm)
    const start = draft.startCm
    if (id === 0) {
      draft.startCm = options.resolveStartPoint(cm)
      draft.hoverCm = end
    } else if (id === 2) {
      draft.hoverCm = cm
    } else if (id === 1) {
      draft.startCm = { x: start.x, y: cm.y }
      draft.hoverCm = { x: cm.x, y: end.y }
    } else if (id === 3) {
      draft.startCm = { x: cm.x, y: start.y }
      draft.hoverCm = { x: end.x, y: cm.y }
    }
    hOverrideCm.value = null
    vOverrideCm.value = null
    typeHText.value = ''
    typeVText.value = ''
    rebuildPreview()
  }

  function beginHandleDrag(id: number): void {
    if (typeof window === 'undefined') return
    cancelHandleDrag()
    handleDragging.value = true
    const onMove = (moveEvent: PointerEvent) => applyHandle(id, moveEvent)
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      unbindHandle = null
      handleDragging.value = false
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    unbindHandle = onUp
  }

  function updateDrawRoomHover(event: MouseEvent): void {
    if (!draft || handleDragging.value || typeHText.value || typeVText.value) return
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
    const wallIds = options.editor.applyRoomRect(corners, options.wallThicknessDraft.value, {
      heightCm: options.wallHeightDraft?.value,
      bottomZCm: options.wallBottomZDraft?.value,
    })
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

    if (draft && options.placeOnSecondClick?.() === false) {
      const handle = hitHandleAtCm(cm)
      if (handle != null) {
        if (isLiveDrawPointer(event)) beginHandleDrag(handle)
        return
      }
    }

    if (!draft) {
      options.beforeBegin()
      const startCm = options.resolveStartPoint(cm)
      draft = { startCm, hoverCm: seedEnd(startCm) }
      drafting.value = true
      hOverrideCm.value = null
      vOverrideCm.value = null
      typeHText.value = ''
      typeVText.value = ''
      typeField.value = 'h'
      rebuildPreview()
      return
    }

    if (options.placeOnSecondClick?.() === false) {
      draft.hoverCm = cm
      hOverrideCm.value = null
      vOverrideCm.value = null
      typeHText.value = ''
      typeVText.value = ''
      rebuildPreview()
      return
    }

    const endCm =
      hOverrideCm.value != null || vOverrideCm.value != null
        ? resolveEnd(draft.hoverCm, draft.startCm)
        : resolveEnd(cm, draft.startCm)
    if (Math.abs(endCm.x - draft.startCm.x) < 1 && Math.abs(endCm.y - draft.startCm.y) < 1) {
      return
    }
    placeRoom(endCm)
  }

  function setHOverrideCm(cm: number | null): void {
    if (!draft) return
    draft.hoverCm = ensureAwayFromStart(draft.startCm, draft.hoverCm, seedEnd(draft.startCm))
    typeHText.value = ''
    hOverrideCm.value = cm != null && Number.isFinite(cm) && cm !== 0 ? cm : null
    rebuildPreview()
  }

  function setVOverrideCm(cm: number | null): void {
    if (!draft) return
    draft.hoverCm = ensureAwayFromStart(draft.startCm, draft.hoverCm, seedEnd(draft.startCm))
    typeVText.value = ''
    vOverrideCm.value = cm != null && Number.isFinite(cm) && cm !== 0 ? cm : null
    rebuildPreview()
  }

  function handleTypeKey(event: KeyboardEvent): boolean {
    if (!draft) return false
    if (isDrawTypeRoomFieldKey(event)) {
      typeField.value = typeField.value === 'h' ? 'v' : 'h'
      return true
    }
    if (!isDrawTypeLengthKey(event)) return false
    const current = typeField.value === 'h' ? typeHText.value : typeVText.value
    const next = applyDrawTypeKey(current, event.key)
    if (next == null) return false
    if (typeField.value === 'h') {
      typeHText.value = next
      hOverrideCm.value = parseDrawLengthDraftToCm(next, inputUnit())
    } else {
      typeVText.value = next
      vOverrideCm.value = parseDrawLengthDraftToCm(next, inputUnit())
    }
    rebuildPreview()
    return true
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
    typeHText,
    typeVText,
    typeField,
    handleDragging,
    isDrafting: () => drafting.value,
    isDragging: () => drafting.value,
    hitHandleAtCm,
    onDrawRoomClick,
    updateDrawRoomHover,
    clearDrawRoomHover,
    setHOverrideCm,
    setVOverrideCm,
    handleTypeKey,
    commitFromMeasure,
    cancelDrawRoomDrag,
  }
}
