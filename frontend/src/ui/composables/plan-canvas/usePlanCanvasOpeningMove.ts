import { ref, type Ref } from 'vue'
import type { Point2D, Wall } from '@/core/plan/types'
import { projectPointToWallTUnclamped } from '@/ui/components/plan-canvas-opening-drag-geom'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import type { usePlanEditor } from '@/ui/composables/usePlanEditor'
import {
  applyDrawTypeKey,
  isDrawTypeLengthKey,
  parseDrawLengthDraftToCm,
} from '@/ui/composables/canvas-kernel/plan-canvas-draw-measure'

type EditorApi = ReturnType<typeof usePlanEditor>

interface OpeningMoveHitTestApi {
  clientToCm: (clientX: number, clientY: number) => Point2D | null
}

/** Klik-jitter: negeer per ongeluk bijna-nul. Alleen getypt mag tot 1 mm (bewuste invoer). */
const CLICK_COMMIT_MIN_CM = 0.5
const TYPED_COMMIT_MIN_CM = 0.1

/**
 * Opening (deur/raam) langs muur: klik → richting → klik (of typ verplaatsing + Enter).
 * Geen hop/transfer — dat blijft bij pointer-sleep.
 */
export function usePlanCanvasOpeningMove(options: {
  hitTest: OpeningMoveHitTestApi
  editor: EditorApi
  moveOpeningId: Ref<string | null>
  spacePressed: Ref<boolean>
  getInputUnit?: () => ScaleInputUnit
  syncPlanToParent: () => void
}) {
  function inputUnit(): ScaleInputUnit {
    return options.getInputUnit?.() ?? 'm'
  }

  const drafting = ref(false)
  const typeText = ref('')
  const measureLengthCm = ref(0)
  const labelCm = ref<Point2D | null>(null)

  let draft: {
    openingId: string
    wallId: string
    wall: { a: Point2D; b: Point2D }
    startT: number
    startCm: Point2D
    hoverCm: Point2D
    baseWalls: Wall[]
    delta: number
    overrideCm: number | null
  } | null = null

  function wallLen(wall: { a: Point2D; b: Point2D }): number {
    return Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y)
  }

  function openingLabelAt(wall: { a: Point2D; b: Point2D }, t: number): Point2D {
    return {
      x: wall.a.x + (wall.b.x - wall.a.x) * t,
      y: wall.a.y + (wall.b.y - wall.a.y) * t,
    }
  }

  function syncLabel(): void {
    if (!draft) {
      measureLengthCm.value = 0
      labelCm.value = null
      return
    }
    measureLengthCm.value = Math.abs(draft.delta)
    const len = wallLen(draft.wall)
    const t = len < 1e-6 ? draft.startT : Math.max(0, Math.min(1, draft.startT + draft.delta / len))
    const live = options.editor.resolveOpening(options.moveOpeningId.value ?? draft.openingId)
    if (live) {
      labelCm.value = openingLabelAt(live.wall, live.opening.t)
      return
    }
    labelCm.value = openingLabelAt(draft.wall, t)
  }

  function applyDelta(delta: number): void {
    if (!draft) return
    draft.delta = delta
    const nextId = options.editor.previewOpeningSlideAlongWall(
      draft.baseWalls,
      draft.openingId,
      delta,
    )
    if (nextId) options.moveOpeningId.value = nextId
    syncLabel()
  }

  function rebuildFromHover(): void {
    if (!draft) return
    const len = wallLen(draft.wall)
    if (len < 1e-6) return
    const hoverT = projectPointToWallTUnclamped(draft.wall, draft.hoverCm)
    const axisDelta = (hoverT - draft.startT) * len
    if (draft.overrideCm != null && draft.overrideCm !== 0) {
      const sign =
        draft.overrideCm < 0
          ? -1
          : axisDelta !== 0
            ? Math.sign(axisDelta)
            : Math.sign(draft.delta) || 1
      applyDelta(Math.abs(draft.overrideCm) * sign)
      return
    }
    applyDelta(axisDelta)
  }

  function clearDraftUi(): void {
    draft = null
    drafting.value = false
    typeText.value = ''
    measureLengthCm.value = 0
    labelCm.value = null
  }

  function cancelOpeningMove(): void {
    if (draft) options.editor.undo()
    clearDraftUi()
  }

  function beginOpeningMove(openingId: string, event: MouseEvent): boolean {
    if (options.spacePressed.value || draft) return false
    const cm = options.hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return false
    const located = options.editor.resolveOpening(openingId)
    if (!located) return false
    const len = wallLen(located.wall)
    if (len < 1e-6) return false
    options.editor.pushUndo()
    draft = {
      openingId,
      wallId: located.wallId,
      wall: { a: { ...located.wall.a }, b: { ...located.wall.b } },
      startT: located.opening.t,
      startCm: cm,
      hoverCm: cm,
      baseWalls: JSON.parse(JSON.stringify(options.editor.walls.value)) as Wall[],
      delta: 0,
      overrideCm: null,
    }
    drafting.value = true
    typeText.value = ''
    options.moveOpeningId.value = openingId
    syncLabel()
    return true
  }

  function updateOpeningMoveHover(event: MouseEvent): void {
    if (!draft || typeText.value) return
    const cm = options.hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return
    draft.hoverCm = cm
    rebuildFromHover()
  }

  function commitOpeningMove(): boolean {
    if (!draft) return false
    const minCm = draft.overrideCm != null ? TYPED_COMMIT_MIN_CM : CLICK_COMMIT_MIN_CM
    if (Math.abs(draft.delta) < minCm) {
      cancelOpeningMove()
      return false
    }
    options.syncPlanToParent()
    clearDraftUi()
    return true
  }

  function onOpeningMoveClick(openingId: string, event: MouseEvent): boolean {
    if (draft) return commitOpeningMove()
    return beginOpeningMove(openingId, event)
  }

  function handleTypeKey(event: KeyboardEvent): boolean {
    if (!draft) return false
    if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) return true
    if (!isDrawTypeLengthKey(event)) return false
    const next = applyDrawTypeKey(typeText.value, event.key)
    if (next == null) return false
    typeText.value = next
    draft.overrideCm = parseDrawLengthDraftToCm(next, inputUnit())
    rebuildFromHover()
    return true
  }

  return {
    drafting,
    typeText,
    measureLengthCm,
    openingMoveLabelCm: labelCm,
    isDrafting: () => drafting.value,
    beginOpeningMove,
    updateOpeningMoveHover,
    onOpeningMoveClick,
    handleTypeKey,
    commitFromMeasure: commitOpeningMove,
    cancelOpeningMove,
  }
}
