import { computed, ref, type Ref } from 'vue'
import {
  dormerDepthPoint,
  dormerFrontCenterlineFromInner,
  pointAlong,
  projectDormerFootprint,
  snapDormerFootprintToWalls,
  type DormerFootprint,
} from '@/core/plan/dormer-draw'
import type { Point2D } from '@/core/plan/types'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import type { usePlanEditor } from '@/ui/composables/usePlanEditor'
import {
  applyDrawTypeKey,
  DRAW_SEED_CM,
  ensureAwayFromStart,
  innerSpanFromCenterline,
  isDrawTypeLengthKey,
  isDrawTypeRoomFieldKey,
  parseDrawLengthDraftToCm,
  seedDrawWallEnd,
} from '@/ui/composables/canvas-kernel/plan-canvas-draw-measure'
import { isLiveDrawPointer } from './plan-canvas-touch-tap'
import type { RenderJunction } from './usePlanCanvasRenderModel'

type EditorApi = ReturnType<typeof usePlanEditor>

interface DrawDormerHitTestApi {
  hitTestJunctionAtCm: (cm: Point2D) => RenderJunction | null
  clientToCm: (clientX: number, clientY: number) => Point2D | null
}

type Draft =
  | { phase: 'front'; startCm: Point2D; hoverCm: Point2D }
  | { phase: 'depth'; frontA: Point2D; frontB: Point2D; hoverCm: Point2D }

/**
 * Dakkapel: klik voorzijde (als muur) → derde punt = haakse diepte.
 */
export function usePlanCanvasDrawDormer(options: {
  hitTest: DrawDormerHitTestApi
  editor: EditorApi
  hoveredJunctionId: Ref<string | null>
  wallThicknessDraft: Ref<number>
  wallHeightDraft?: Ref<number>
  wallBottomZDraft?: Ref<number>
  resolveFrontPoint: (cm: Point2D, axisAnchor?: Point2D, snapDisabled?: boolean) => Point2D
  handleTolCm?: () => number
  placeOnSecondClick?: () => boolean
  getInputUnit?: () => ScaleInputUnit
  beforeBegin: () => void
  syncPlanToParent: () => void
  onPlaced?: () => void
}) {
  function inputUnit(): ScaleInputUnit {
    return options.getInputUnit?.() ?? 'm'
  }

  const drawDormerPreview = ref<DormerFootprint | null>(null)
  const drawDormerFront = ref<{ a: Point2D; b: Point2D } | null>(null)
  const drafting = ref(false)
  let draft: Draft | null = null
  const lengthOverrideCm = ref<number | null>(null)
  const depthOverrideCm = ref<number | null>(null)
  const typeText = ref('')
  const typeDepthText = ref('')
  const typeField = ref<'front' | 'depth'>('front')

  const measureLengthCm = computed(() => {
    const front = drawDormerFront.value
    if (!front) return 0
    return innerSpanFromCenterline(
      Math.hypot(front.b.x - front.a.x, front.b.y - front.a.y),
      options.wallThicknessDraft.value,
      options.wallThicknessDraft.value,
    )
  })

  const measureDepthCm = computed(() => drawDormerPreview.value?.depthCm ?? 0)
  const phase = computed(() => draft?.phase ?? null)

  function seedEnd(start: Point2D): Point2D {
    return seedDrawWallEnd(start)
  }

  function frontEnd(start: Point2D, hover: Point2D): Point2D {
    const override = lengthOverrideCm.value
    if (override != null && override !== 0) {
      const centerline = dormerFrontCenterlineFromInner(
        Math.abs(override),
        options.wallThicknessDraft.value,
      )
      const toward = override < 0 ? { x: start.x * 2 - hover.x, y: start.y * 2 - hover.y } : hover
      return pointAlong(start, toward, centerline)
    }
    return hover
  }

  function depthHover(frontA: Point2D, frontB: Point2D, hover: Point2D): Point2D {
    const override = depthOverrideCm.value
    if (override != null && override !== 0) {
      return dormerDepthPoint(frontA, frontB, hover, override)
    }
    return hover
  }

  function seedDepthHover(frontA: Point2D, frontB: Point2D, toward: Point2D): Point2D {
    return dormerDepthPoint(frontA, frontB, toward, DRAW_SEED_CM)
  }

  function rebuildPreview(): void {
    if (!draft) {
      drawDormerPreview.value = null
      drawDormerFront.value = null
      return
    }
    if (draft.phase === 'front') {
      const end = frontEnd(draft.startCm, draft.hoverCm)
      drawDormerFront.value = { a: draft.startCm, b: end }
      drawDormerPreview.value = null
      return
    }
    const raw = projectDormerFootprint(
      draft.frontA,
      draft.frontB,
      depthHover(draft.frontA, draft.frontB, draft.hoverCm),
    )
    const snapped = raw ? snapDormerFootprintToWalls(options.editor.walls.value, raw) : null
    drawDormerFront.value = snapped
      ? { a: snapped.frontA, b: snapped.frontB }
      : { a: draft.frontA, b: draft.frontB }
    drawDormerPreview.value = snapped
  }

  function resetTypeState(): void {
    lengthOverrideCm.value = null
    depthOverrideCm.value = null
    typeText.value = ''
    typeDepthText.value = ''
    typeField.value = 'front'
  }

  function cancelDrawDormer(): void {
    draft = null
    drafting.value = false
    resetTypeState()
    drawDormerPreview.value = null
    drawDormerFront.value = null
    options.hoveredJunctionId.value = null
  }

  function placeDormer(depthPoint: Point2D): boolean {
    if (!draft || draft.phase !== 'depth') return false
    options.editor.pushUndo()
    const wallIds = options.editor.applyDormerDraw(
      draft.frontA,
      draft.frontB,
      depthPoint,
      options.wallThicknessDraft.value,
      {
        heightCm: options.wallHeightDraft?.value,
        bottomZCm: options.wallBottomZDraft?.value,
      },
    )
    if (!wallIds) {
      options.editor.undo()
      return false
    }
    options.syncPlanToParent()
    cancelDrawDormer()
    options.onPlaced?.()
    return true
  }

  function confirmFront(): boolean {
    if (!draft || draft.phase !== 'front') return false
    const end = frontEnd(draft.startCm, draft.hoverCm)
    if (Math.hypot(end.x - draft.startCm.x, end.y - draft.startCm.y) < 1) return false
    draft = {
      phase: 'depth',
      frontA: draft.startCm,
      frontB: end,
      hoverCm: seedDepthHover(draft.startCm, end, draft.hoverCm),
    }
    lengthOverrideCm.value = null
    typeText.value = ''
    depthOverrideCm.value = null
    typeDepthText.value = ''
    typeField.value = 'depth'
    rebuildPreview()
    return true
  }

  function goBackToFront(): boolean {
    if (!draft || draft.phase !== 'depth') return false
    draft = { phase: 'front', startCm: draft.frontA, hoverCm: draft.frontB }
    depthOverrideCm.value = null
    typeDepthText.value = ''
    typeField.value = 'front'
    rebuildPreview()
    return true
  }

  function onDrawDormerClick(event: MouseEvent): void {
    const cm = options.hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return

    if (!draft) {
      options.beforeBegin()
      const startCm = options.resolveFrontPoint(cm, undefined, event.ctrlKey || event.metaKey)
      draft = { phase: 'front', startCm, hoverCm: seedEnd(startCm) }
      drafting.value = true
      resetTypeState()
      rebuildPreview()
      return
    }

    if (draft.phase === 'front') {
      if (options.placeOnSecondClick?.() === false && isLiveDrawPointer(event)) {
        confirmFront()
        return
      }
      draft.hoverCm = options.resolveFrontPoint(cm, draft.startCm, event.ctrlKey || event.metaKey)
      rebuildPreview()
      confirmFront()
      return
    }

    const depth = options.hitTest.clientToCm(event.clientX, event.clientY)
    if (!depth) return
    placeDormer(depth)
  }

  function updateDrawDormerHover(event: MouseEvent): void {
    if (!draft || typeText.value || typeDepthText.value) return
    const cm = options.hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return
    if (draft.phase === 'front') {
      draft.hoverCm = options.resolveFrontPoint(cm, draft.startCm, event.ctrlKey || event.metaKey)
      options.hoveredJunctionId.value = null
    } else {
      draft.hoverCm = cm
      options.hoveredJunctionId.value = null
    }
    rebuildPreview()
  }

  function clearDrawDormerHover(): void {
    if (!draft) options.hoveredJunctionId.value = null
  }

  function setLengthOverrideCm(cm: number | null): void {
    if (!draft || draft.phase !== 'front') return
    draft.hoverCm = ensureAwayFromStart(draft.startCm, draft.hoverCm, seedEnd(draft.startCm))
    typeText.value = ''
    lengthOverrideCm.value = cm != null && Number.isFinite(cm) && cm !== 0 ? cm : null
    rebuildPreview()
  }

  function setDepthOverrideCm(cm: number | null): void {
    if (!draft || draft.phase !== 'depth') return
    draft.hoverCm = seedDepthHover(draft.frontA, draft.frontB, draft.hoverCm)
    typeDepthText.value = ''
    depthOverrideCm.value = cm != null && Number.isFinite(cm) && cm !== 0 ? cm : null
    rebuildPreview()
  }

  function handleTypeKey(event: KeyboardEvent): boolean {
    if (!draft) return false
    if (isDrawTypeRoomFieldKey(event)) {
      if (draft.phase === 'front') confirmFront()
      else goBackToFront()
      return true
    }
    if (!isDrawTypeLengthKey(event)) return false
    if (draft.phase === 'front') {
      const next = applyDrawTypeKey(typeText.value, event.key)
      if (next == null) return false
      typeText.value = next
      lengthOverrideCm.value = parseDrawLengthDraftToCm(next, inputUnit())
    } else {
      const next = applyDrawTypeKey(typeDepthText.value, event.key)
      if (next == null) return false
      typeDepthText.value = next
      depthOverrideCm.value = parseDrawLengthDraftToCm(next, inputUnit())
    }
    rebuildPreview()
    return true
  }

  function commitFromMeasure(): boolean {
    if (!draft) return false
    if (draft.phase === 'front') {
      confirmFront()
      return false
    }
    const preview = drawDormerPreview.value
    if (!preview || preview.depthCm < 1) return false
    return placeDormer({
      x: (preview.backA.x + preview.backB.x) / 2,
      y: (preview.backA.y + preview.backB.y) / 2,
    })
  }

  return {
    drawDormerPreview,
    drawDormerFront,
    measureLengthCm,
    measureDepthCm,
    lengthOverrideCm,
    depthOverrideCm,
    typeText,
    typeDepthText,
    typeField,
    phase,
    isDrafting: () => drafting.value,
    isDragging: () => drafting.value,
    onDrawDormerClick,
    updateDrawDormerHover,
    clearDrawDormerHover,
    setLengthOverrideCm,
    setDepthOverrideCm,
    handleTypeKey,
    commitFromMeasure,
    cancelDrawDormer,
  }
}
