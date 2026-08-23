import { computed, ref, type Ref } from 'vue'
import type { Point2D } from '@/core/fml/types'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import type { useFmlPreviewEditor } from '@/ui/composables/useFmlPreviewEditor'
import {
  applyDrawTypeKey,
  connectorInsetAlong,
  endFromDirection,
  ensureAwayFromStart,
  flipPointAround,
  hitClosestDraftPoint,
  isDrawTypeLengthKey,
  parseDrawLengthDraftToCm,
  seedDrawWallEnd,
  unitFromTo,
  type DrawThickWall,
} from './fml-preview-draw-measure'
import { isLiveDrawPointer } from './fml-preview-touch-tap'
import type { RenderJunction } from './useFmlPreviewRenderModel'

type EditorApi = ReturnType<typeof useFmlPreviewEditor>

interface DrawWallHitTestApi {
  hitTestJunctionAtCm: (cm: Point2D) => RenderJunction | null
  clientToCm: (clientX: number, clientY: number) => Point2D | null
}

/**
 * Muurtekenen: klik → verplaats → klik (of typ lengte + Enter).
 * Mobile: seed 0,5 m omhoog + handles; plaatsen alleen via accept.
 */
export function useFmlPreviewDrawWall(options: {
  hitTest: DrawWallHitTestApi
  editor: EditorApi
  hoveredJunctionId: Ref<string | null>
  wallThicknessDraft: Ref<number>
  drawKind?: Ref<'wall' | 'ridge'>
  ridgeZCm?: Ref<number | undefined>
  requireFloorIndex?: () => number | undefined
  resolvePoint: (cm: Point2D, axisAnchor?: Point2D, snapDisabled?: boolean) => Point2D
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
  const drawWallPreview = ref<{ a: Point2D; b: Point2D } | null>(null)
  const drafting = ref(false)
  let draft: { startCm: Point2D; hoverCm: Point2D } | null = null
  const lengthOverrideCm = ref<number | null>(null)
  const typeText = ref('')
  const handleDragging = ref(false)
  let unbindHandle: (() => void) | null = null

  const measureLengthCm = computed(() => {
    const preview = drawWallPreview.value
    if (!preview) return 0
    return innerLengthCm(preview.a, preview.b)
  })

  function insetWalls(): ReadonlyArray<DrawThickWall> {
    if (options.drawKind?.value === 'ridge') return []
    return options.getWalls?.() ?? []
  }

  function wallInsets(start: Point2D, hover: Point2D): { start: number; end: number } {
    const walls = insetWalls()
    const along = unitFromTo(start, hover, { x: 0, y: -1 })
    return {
      start: connectorInsetAlong(start, along, walls),
      end: connectorInsetAlong(hover, { x: -along.x, y: -along.y }, walls),
    }
  }

  function innerLengthCm(start: Point2D, end: Point2D): number {
    const cl = Math.hypot(end.x - start.x, end.y - start.y)
    const insets = wallInsets(start, end)
    return Math.max(0, cl - insets.start - insets.end)
  }

  function centerlineFromInner(start: Point2D, hover: Point2D, innerCm: number): number {
    const insets = wallInsets(start, hover)
    return innerCm + insets.start + insets.end
  }

  function seedEnd(start: Point2D): Point2D {
    const extra = connectorInsetAlong(start, { x: 0, y: -1 }, insetWalls())
    return seedDrawWallEnd(start, extra)
  }

  function directedHover(start: Point2D, hover: Point2D, signed: number | null): Point2D {
    if (signed != null && signed < 0) return flipPointAround(start, hover)
    return hover
  }

  function overrideEndCm(start: Point2D, hover: Point2D, signed: number): Point2D {
    const dir = directedHover(start, hover, signed)
    return endFromDirection(start, dir, centerlineFromInner(start, dir, Math.abs(signed)))
  }

  function rebuildPreview(): void {
    if (!draft) {
      drawWallPreview.value = null
      return
    }
    const override = lengthOverrideCm.value
    const endCm =
      override != null && override !== 0
        ? overrideEndCm(draft.startCm, draft.hoverCm, override)
        : draft.hoverCm
    drawWallPreview.value = { a: draft.startCm, b: endCm }
  }

  function cancelHandleDrag(): void {
    unbindHandle?.()
    unbindHandle = null
    handleDragging.value = false
  }

  function cancelDrawWallDrag(): void {
    cancelHandleDrag()
    draft = null
    drafting.value = false
    lengthOverrideCm.value = null
    typeText.value = ''
    drawWallPreview.value = null
    options.hoveredJunctionId.value = null
  }

  function handleRadius(): number {
    return options.handleTolCm?.() ?? 12
  }

  function handlePoints(): Point2D[] {
    const preview = drawWallPreview.value
    if (!preview) return []
    return [preview.a, preview.b]
  }

  function hitHandleAtCm(cm: Point2D): 0 | 1 | null {
    if (!draft) return null
    const idx = hitClosestDraftPoint(cm, handlePoints(), handleRadius())
    return idx === 0 || idx === 1 ? idx : null
  }

  function applyHandle(id: 0 | 1, event: { clientX: number; clientY: number }): void {
    if (!draft) return
    const cm = options.hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return
    const snapOff = 'ctrlKey' in event && (event as MouseEvent).ctrlKey
    if (id === 0) {
      const end = drawWallPreview.value?.b ?? draft.hoverCm
      draft.startCm = options.resolvePoint(cm, undefined, snapOff)
      draft.hoverCm = end
    } else {
      draft.hoverCm = options.resolvePoint(cm, draft.startCm, snapOff)
    }
    lengthOverrideCm.value = null
    typeText.value = ''
    rebuildPreview()
  }

  function beginHandleDrag(id: 0 | 1): void {
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

  function updateDrawWallHover(event: MouseEvent): void {
    if (!draft || handleDragging.value || typeText.value) return
    const cm = options.hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return
    draft.hoverCm = options.resolvePoint(cm, draft.startCm, event.ctrlKey || event.metaKey)
    rebuildPreview()
    if (options.drawKind?.value === 'ridge') {
      options.hoveredJunctionId.value = null
      return
    }
    const junction = options.hitTest.hitTestJunctionAtCm(cm)
    options.hoveredJunctionId.value = junction?.id ?? null
  }

  function clearDrawWallHover(): void {
    if (!draft) options.hoveredJunctionId.value = null
  }

  function placeWall(endCm: Point2D): boolean {
    if (!draft) return false
    options.editor.pushUndo()
    const kind = options.drawKind?.value ?? 'wall'
    const wallId = options.editor.applyWallAdd(
      draft.startCm,
      endCm,
      options.wallThicknessDraft.value,
      { kind, ridgeZCm: options.ridgeZCm?.value, requireFloorIndex: options.requireFloorIndex?.() },
    )
    if (!wallId) {
      options.editor.undo()
      return false
    }
    options.syncPlanToParent()
    cancelDrawWallDrag()
    options.onPlaced?.()
    return true
  }

  function onDrawWallClick(event: MouseEvent): void {
    const cm = options.hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return

    if (draft && options.placeOnSecondClick?.() === false) {
      const handle = hitHandleAtCm(cm)
      if (handle != null) {
        if (isLiveDrawPointer(event)) beginHandleDrag(handle)
        return
      }
    }

    const locked = options.resolvePoint(cm, draft?.startCm, event.ctrlKey || event.metaKey)
    if (!locked) return

    if (!draft) {
      options.beforeBegin()
      const hoverCm = seedEnd(locked)
      draft = { startCm: locked, hoverCm }
      drafting.value = true
      lengthOverrideCm.value = null
      typeText.value = ''
      rebuildPreview()
      return
    }

    if (options.placeOnSecondClick?.() === false) {
      draft.hoverCm = locked
      lengthOverrideCm.value = null
      typeText.value = ''
      rebuildPreview()
      return
    }

    const override = lengthOverrideCm.value
    const endCm =
      override != null && override !== 0
        ? overrideEndCm(draft.startCm, draft.hoverCm, override)
        : locked
    if (Math.hypot(endCm.x - draft.startCm.x, endCm.y - draft.startCm.y) < 1) return
    placeWall(endCm)
  }

  function setLengthOverrideCm(cm: number | null): void {
    if (!draft) return
    draft.hoverCm = ensureAwayFromStart(draft.startCm, draft.hoverCm, seedEnd(draft.startCm))
    typeText.value = ''
    lengthOverrideCm.value = cm != null && Number.isFinite(cm) && cm !== 0 ? cm : null
    rebuildPreview()
  }

  function handleTypeKey(event: KeyboardEvent): boolean {
    if (!draft) return false
    if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) return true
    if (!isDrawTypeLengthKey(event)) return false
    const next = applyDrawTypeKey(typeText.value, event.key)
    if (next == null) return false
    typeText.value = next
    lengthOverrideCm.value = parseDrawLengthDraftToCm(next, inputUnit())
    rebuildPreview()
    return true
  }

  function commitFromMeasure(): boolean {
    if (!draft) return false
    const preview = drawWallPreview.value
    if (!preview) return false
    if (Math.hypot(preview.b.x - preview.a.x, preview.b.y - preview.a.y) < 1) return false
    return placeWall(preview.b)
  }

  return {
    drawWallPreview,
    measureLengthCm,
    lengthOverrideCm,
    typeText,
    handleDragging,
    isDrafting: () => drafting.value,
    /** Esc / legacy alias */
    isDragging: () => drafting.value,
    hitHandleAtCm,
    onDrawWallClick,
    updateDrawWallHover,
    clearDrawWallHover,
    setLengthOverrideCm,
    handleTypeKey,
    commitFromMeasure,
    cancelDrawWallDrag,
  }
}
