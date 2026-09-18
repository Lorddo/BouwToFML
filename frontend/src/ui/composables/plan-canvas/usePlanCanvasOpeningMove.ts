import { ref, type Ref } from 'vue'
import type { Point2D, Wall } from '@/core/plan/types'
import { projectPointToWallTUnclamped } from '@/core/plan/opening-drag-geom'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import type { usePlanEditor } from '@/ui/composables/usePlanEditor'
import { applyLengthTypeKey } from '@/ui/composables/canvas-kernel/plan-canvas-draw-measure'
import {
  buildOpeningMoveMeasureLines,
  openingMoveMeasureLengthsCm,
} from '@/ui/composables/canvas-kernel/plan-canvas-opening-move-measure'

type EditorApi = ReturnType<typeof usePlanEditor>

interface OpeningMoveHitTestApi {
  clientToCm: (clientX: number, clientY: number) => Point2D | null
}

/** Klik-jitter: negeer per ongeluk bijna-nul. Alleen getypt mag tot 1 mm (bewuste invoer). */
const CLICK_COMMIT_MIN_CM = 0.5
const TYPED_COMMIT_MIN_CM = 0.1

export type OpeningMoveRestSide = 'left' | 'right'

/**
 * Opening (deur/raam) langs muur: klik → richting → klik (of typ restmaat + Enter).
 * Geen hop/transfer — dat blijft bij pointer-sleep.
 * Typveld ligt op de actieve L/R-restmaat (hover-zijde).
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
  /** Welke restmaat wordt getypt / gehoverd (null = nog geen richting). */
  const restSide = ref<OpeningMoveRestSide | null>(null)

  let draft: {
    openingId: string
    wallId: string
    wall: Pick<Wall, 'a' | 'b' | 'thickness' | 'balance'>
    startT: number
    openingWidth: number
    startCm: Point2D
    hoverCm: Point2D
    baseWalls: Wall[]
    delta: number
    overrideCm: number | null
    /** Getypte restmaat (label); null = toon live rest of |delta|. */
    typedRestCm: number | null
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

  function resolveRestSide(axisDelta: number, delta: number): OpeningMoveRestSide | null {
    if (Math.abs(axisDelta) < 1e-6 && Math.abs(delta) < 1e-6) return null
    const towardB = axisDelta > 0 || (axisDelta === 0 && delta >= 0)
    return towardB ? 'right' : 'left'
  }

  function restMidpointCm(side: OpeningMoveRestSide): Point2D | null {
    if (!draft) return null
    const lines = buildOpeningMoveMeasureLines(
      draft.wall,
      { t: draft.startT, width: draft.openingWidth },
      draft.baseWalls,
    )
    const line = side === 'left' ? lines[0] : lines[1]
    if (!line) return null
    return {
      x: (line.a.x + line.b.x) / 2,
      y: (line.a.y + line.b.y) / 2,
    }
  }

  function syncLabel(): void {
    if (!draft) {
      measureLengthCm.value = 0
      labelCm.value = null
      restSide.value = null
      return
    }
    const len = wallLen(draft.wall)
    const hoverT = projectPointToWallTUnclamped(draft.wall, draft.hoverCm)
    const axisDelta = len < 1e-6 ? 0 : (hoverT - draft.startT) * len
    const side = resolveRestSide(axisDelta, draft.delta)
    restSide.value = side

    if (side && draft.typedRestCm != null) {
      measureLengthCm.value = Math.abs(draft.typedRestCm)
    } else if (side) {
      const lengths = openingMoveMeasureLengthsCm(
        draft.wall,
        { t: draft.startT, width: draft.openingWidth },
        draft.baseWalls,
      )
      measureLengthCm.value =
        lengths != null
          ? side === 'right'
            ? lengths.rightCm
            : lengths.leftCm
          : Math.abs(draft.delta)
    } else {
      measureLengthCm.value = Math.abs(draft.delta)
    }

    if (side) {
      const mid = restMidpointCm(side)
      if (mid) {
        labelCm.value = mid
        return
      }
    }

    const t =
      len < 1e-6 ? draft.startT : Math.max(0, Math.min(1, draft.startT + draft.delta / len))
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
    const nextId = options.editor.previewOpeningSlideAlongWall(draft.baseWalls, draft.openingId, delta)
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
      const lengths = openingMoveMeasureLengthsCm(
        draft.wall,
        { t: draft.startT, width: draft.openingWidth },
        draft.baseWalls,
      )
      // Negatieve typ = oude delta-semantiek (richting omkeren).
      if (lengths && draft.overrideCm > 0) {
        const towardB = axisDelta > 0 || (axisDelta === 0 && draft.delta >= 0)
        const typedI = draft.overrideCm
        const delta = towardB ? lengths.rightCm - typedI : typedI - lengths.leftCm
        draft.typedRestCm = typedI
        applyDelta(delta)
        return
      }
      draft.typedRestCm = null
      const sign =
        draft.overrideCm < 0
          ? -1
          : axisDelta !== 0
            ? Math.sign(axisDelta)
            : Math.sign(draft.delta) || 1
      applyDelta(Math.abs(draft.overrideCm) * sign)
      return
    }
    draft.typedRestCm = null
    applyDelta(axisDelta)
  }

  function clearDraftUi(): void {
    draft = null
    drafting.value = false
    typeText.value = ''
    measureLengthCm.value = 0
    labelCm.value = null
    restSide.value = null
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
      wall: {
        a: { ...located.wall.a },
        b: { ...located.wall.b },
        thickness: located.wall.thickness,
        balance: located.wall.balance,
      },
      startT: located.opening.t,
      openingWidth: located.opening.width,
      startCm: cm,
      hoverCm: cm,
      baseWalls: JSON.parse(JSON.stringify(options.editor.walls.value)) as Wall[],
      delta: 0,
      overrideCm: null,
      typedRestCm: null,
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
    const applied = applyLengthTypeKey(event, typeText.value, inputUnit())
    if (!applied) return false
    typeText.value = applied.text
    draft.overrideCm = applied.cm
    rebuildFromHover()
    return true
  }

  return {
    drafting,
    typeText,
    measureLengthCm,
    openingMoveLabelCm: labelCm,
    restSide,
    isDrafting: () => drafting.value,
    beginOpeningMove,
    updateOpeningMoveHover,
    onOpeningMoveClick,
    handleTypeKey,
    commitFromMeasure: commitOpeningMove,
    cancelOpeningMove,
  }
}
