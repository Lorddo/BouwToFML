import { ref, type Ref } from 'vue'
import type { FloorPlan, Point2D, Wall } from '@/core/plan/types'
import type { ElevationRect, ElevationWallRect, FacadeElevation } from '@/core/plan/facade-elevation'
import {
  elevationRectCenter,
  translateElevationRect,
  type ElevationSnapGuide,
} from '@/core/plan/elevation-opening-edit'
import {
  applyElevationRidgeRect,
  collectElevationRidgeJunctionSnapXs,
  elevationRidgeRectOf,
  snapElevationRidgeCenter,
} from '@/core/plan/elevation-ridge-edit'
import { listRidgeWallsOnFloor, setPlanRidgeJunctionZ } from '@/core/plan/ridge-walls'
import { findOpeningInPlan, setPlanJunctionHeight } from '@/core/plan/elevation-openings'
import {
  elevationOpeningRestLengthCm,
  elevationOpeningRestLineId,
  elevationPreciseCommitMinCm,
  elevationPreciseOffset,
  elevationPreciseOpeningOffset,
  elevationPreciseOpeningRestSide,
  elevationPreciseResultHeightCm,
  elevationPreciseRidgeOffset,
  elevationRectBottomZCm,
  type ElevationOpeningRestSide,
} from './elevation-precise-move'
import {
  buildElevationOpeningMeasureLines,
  elevationOpeningMeasureLengthsCm,
} from './elevation-opening-measure'
import { floorWallBaseWorldZ } from '@/core/plan/floor-stack'
import { resolveRelocatePointerIntent } from '@/ui/composables/canvas-kernel/plan-canvas-mods'
import type { ElevationInteractionProps } from './elevation-interaction-types'

type PreciseDraft =
  | {
      kind: 'opening'
      startCm: Point2D
      hoverCm: Point2D
      startRect: ElevationRect
      openingId: string
      wallId: string
      floorIndex: number
    }
  | {
      kind: 'ridge'
      startCm: Point2D
      hoverCm: Point2D
      startRect: ElevationRect
      wallId: string
      floorIndex: number
      startWall: Wall
    }
  | {
      kind: 'junction'
      startCm: Point2D
      hoverCm: Point2D
      startHeightCm: number
      id: string
      floorIndex: number
      refs: Array<{ wallId: string; end: 'a' | 'b' }>
      ridge?: boolean
    }

export interface UseElevationPreciseOptions {
  props: ElevationInteractionProps
  elevation: Ref<FacadeElevation | null>
  clientToCm: (clientX: number, clientY: number) => Point2D | null
  useTouchNav: Ref<boolean>
  elevMoveMod: Ref<boolean>
  elevAxisLockMod: Ref<boolean>
  snapGuide: Ref<ElevationSnapGuide | null>
  pushUndo: () => void
  undoEdit: () => void
  commitPlan: (next: FloorPlan) => void
  applyOpeningRect: (
    openingId: string,
    wall: ElevationWallRect,
    rect: ElevationRect,
    snapOff: boolean,
  ) => void
  cancelOpeningMovePending: () => void
  selectRidge: (wallId: string, floorIndex: number, end?: 'a' | 'b') => void
  selectJunction: (id: string | null) => void
}

export function useElevationPrecise(options: UseElevationPreciseOptions) {
  const {
    props,
    elevation,
    clientToCm,
    useTouchNav,
    elevMoveMod,
    elevAxisLockMod,
    snapGuide,
    pushUndo,
    undoEdit,
    commitPlan,
    applyOpeningRect,
    cancelOpeningMovePending,
    selectRidge,
    selectJunction,
  } = options

  const preciseTypeText = ref('')
  const precisePreview = ref<{ a: Point2D; b: Point2D } | null>(null)
  const preciseLabelCm = ref<Point2D | null>(null)
  const preciseMeasureLengthCm = ref(0)
  const preciseRestSide = ref<ElevationOpeningRestSide | null>(null)

  let preciseDraft: PreciseDraft | null = null
  let preciseIgnoreClick = false
  let preciseOverrideCm: number | null = null

  function clearPreciseLabel(): void {
    preciseLabelCm.value = null
    preciseMeasureLengthCm.value = 0
    preciseRestSide.value = null
  }

  function syncOpeningPreciseLabel(
    draft: Extract<PreciseDraft, { kind: 'opening' }>,
    wall: ElevationWallRect,
    nextRect: ElevationRect,
  ): void {
    const side = elevationPreciseOpeningRestSide(
      draft.startCm,
      draft.hoverCm,
      elevAxisLockMod.value,
    )
    preciseRestSide.value = side
    const lengths = elevationOpeningMeasureLengthsCm(wall, nextRect)
    if (side && preciseOverrideCm != null && preciseOverrideCm > 0) {
      preciseMeasureLengthCm.value = Math.abs(preciseOverrideCm)
    } else if (side && lengths) {
      preciseMeasureLengthCm.value = elevationOpeningRestLengthCm(lengths, side)
    } else {
      preciseMeasureLengthCm.value =
        Math.hypot(
          nextRect.x0 + nextRect.x1 - (draft.startRect.x0 + draft.startRect.x1),
          nextRect.y0 + nextRect.y1 - (draft.startRect.y0 + draft.startRect.y1),
        ) / 2
    }
    if (side) {
      const lines = buildElevationOpeningMeasureLines(wall, nextRect)
      const line = lines.find((item) => item.id === elevationOpeningRestLineId(side))
      if (line) {
        preciseLabelCm.value = {
          x: (line.a.x + line.b.x) / 2,
          y: (line.a.y + line.b.y) / 2,
        }
        return
      }
    }
    preciseLabelCm.value = elevationRectCenter(nextRect)
  }

  function syncRidgePreciseLabel(
    draft: Extract<PreciseDraft, { kind: 'ridge' }>,
    nextRect: ElevationRect,
  ): void {
    preciseRestSide.value = null
    const base = floorWallBaseWorldZ(props.plan, draft.floorIndex)
    const heightCm = elevationRectBottomZCm(nextRect, base)
    preciseMeasureLengthCm.value =
      preciseOverrideCm != null && preciseOverrideCm > 0
        ? Math.abs(preciseOverrideCm)
        : heightCm
    const midX = (nextRect.x0 + nextRect.x1) / 2
    const yBot = Math.max(nextRect.y0, nextRect.y1)
    const floorY = -base
    preciseLabelCm.value = {
      x: midX,
      y: (floorY + yBot) / 2,
    }
  }

  function syncJunctionPreciseLabel(
    draft: Extract<PreciseDraft, { kind: 'junction' }>,
    heightCm: number,
  ): void {
    preciseRestSide.value = null
    // Typ = absolute hoogte; zonder typ toon huidige knoophoogte (zelfde eenheid).
    preciseMeasureLengthCm.value =
      preciseOverrideCm != null && preciseOverrideCm > 0
        ? Math.abs(preciseOverrideCm)
        : Math.max(0, heightCm)
    const topY = draft.startCm.y - (heightCm - draft.startHeightCm)
    const floorY = draft.startCm.y + draft.startHeightCm
    // Label mid tussen vloer en top (hoogtemaat), niet mid van de Δ-preview.
    preciseLabelCm.value = {
      x: draft.startCm.x,
      y: (floorY + topY) / 2,
    }
  }

  function preciseIntent(event: { shiftKey?: boolean }): boolean {
    return (
      resolveRelocatePointerIntent({
        touchNav: useTouchNav.value,
        moveMod: elevMoveMod.value,
        shiftKey: event.shiftKey === true,
      }) === 'precise'
    )
  }

  function clearPreciseDraftUi(): void {
    window.removeEventListener('pointermove', onPreciseMove)
    preciseDraft = null
    preciseOverrideCm = null
    preciseTypeText.value = ''
    precisePreview.value = null
    clearPreciseLabel()
  }

  function cancelPreciseDraft(): void {
    if (preciseDraft) undoEdit()
    clearPreciseDraftUi()
  }

  function markPreciseIgnoreClick(): void {
    preciseIgnoreClick = true
    window.addEventListener(
      'pointerup',
      () => {
        preciseIgnoreClick = false
      },
      { once: true },
    )
  }

  function beginPreciseListen(): void {
    markPreciseIgnoreClick()
    window.addEventListener('pointermove', onPreciseMove)
  }

  function applyPreciseOpening(draft: Extract<PreciseDraft, { kind: 'opening' }>): void {
    const elev = elevation.value
    const wall = elev?.walls.find(
      (item) => item.wallId === draft.wallId && item.floorIndex === draft.floorIndex,
    )
    if (!elev || !wall) return
    const lengths = elevationOpeningMeasureLengthsCm(wall, draft.startRect)
    const offset = elevationPreciseOpeningOffset(
      draft.startCm,
      draft.hoverCm,
      preciseOverrideCm,
      lengths,
      elevAxisLockMod.value,
    )
    const next = translateElevationRect(draft.startRect, offset.x, offset.y)
    applyOpeningRect(draft.openingId, wall, next, false)
    const center = elevationRectCenter(next)
    precisePreview.value = {
      a: elevationRectCenter(draft.startRect),
      b: center,
    }
    syncOpeningPreciseLabel(draft, wall, next)
  }

  function applyPreciseRidge(draft: Extract<PreciseDraft, { kind: 'ridge' }>): void {
    const elev = elevation.value
    if (!elev) return
    const base = floorWallBaseWorldZ(props.plan, draft.floorIndex)
    const startBottomZ = elevationRectBottomZCm(draft.startRect, base)
    const offset = elevationPreciseRidgeOffset(
      draft.startCm,
      draft.hoverCm,
      preciseOverrideCm,
      startBottomZ,
    )
    const raw = translateElevationRect(draft.startRect, offset.x, offset.y)
    const snapped = snapElevationRidgeCenter(raw, collectElevationRidgeJunctionSnapXs(elev))
    snapGuide.value = snapped.guide.x != null ? snapped.guide : null
    commitPlan(
      applyElevationRidgeRect({
        plan: props.plan,
        axis: elev.axis,
        floorIndex: draft.floorIndex,
        wallId: draft.wallId,
        startWall: draft.startWall,
        startRect: draft.startRect,
        nextRect: snapped.rect,
      }),
    )
    precisePreview.value = {
      a: elevationRectCenter(draft.startRect),
      b: elevationRectCenter(snapped.rect),
    }
    syncRidgePreciseLabel(draft, snapped.rect)
  }

  function applyPreciseJunction(draft: Extract<PreciseDraft, { kind: 'junction' }>): void {
    const heightCm = Math.max(
      draft.ridge ? 0 : 1,
      Math.min(
        800,
        Math.round(
          elevationPreciseResultHeightCm(
            draft.startHeightCm,
            draft.startCm.y,
            draft.hoverCm.y,
            preciseOverrideCm,
          ),
        ),
      ),
    )
    commitPlan(
      draft.ridge
        ? setPlanRidgeJunctionZ(props.plan, draft.floorIndex, draft.refs, heightCm)
        : setPlanJunctionHeight(props.plan, draft.floorIndex, draft.refs, heightCm),
    )
    precisePreview.value = {
      a: draft.startCm,
      b: { x: draft.startCm.x, y: draft.startCm.y - (heightCm - draft.startHeightCm) },
    }
    syncJunctionPreciseLabel(draft, heightCm)
  }

  function applyPreciseDraft(): void {
    if (!preciseDraft) return
    if (preciseDraft.kind === 'opening') applyPreciseOpening(preciseDraft)
    else if (preciseDraft.kind === 'ridge') applyPreciseRidge(preciseDraft)
    else applyPreciseJunction(preciseDraft)
  }

  function onPreciseMove(event: PointerEvent): void {
    if (!preciseDraft || preciseTypeText.value) return
    const cm = clientToCm(event.clientX, event.clientY)
    if (!cm) return
    preciseDraft.hoverCm = cm
    applyPreciseDraft()
  }

  function commitPreciseDraft(): boolean {
    if (!preciseDraft) return false
    const typed = preciseOverrideCm != null
    const minCm = elevationPreciseCommitMinCm(typed)
    let delta: number
    if (preciseDraft.kind === 'junction') {
      const nextH = elevationPreciseResultHeightCm(
        preciseDraft.startHeightCm,
        preciseDraft.startCm.y,
        preciseDraft.hoverCm.y,
        preciseOverrideCm,
      )
      delta = Math.abs(nextH - preciseDraft.startHeightCm)
    } else if (preciseDraft.kind === 'ridge') {
      const base = floorWallBaseWorldZ(props.plan, preciseDraft.floorIndex)
      const startZ = elevationRectBottomZCm(preciseDraft.startRect, base)
      if (preciseOverrideCm != null && preciseOverrideCm > 0) {
        delta = Math.abs(preciseOverrideCm - startZ)
      } else {
        const offset = elevationPreciseRidgeOffset(
          preciseDraft.startCm,
          preciseDraft.hoverCm,
          preciseOverrideCm,
          startZ,
        )
        delta = Math.hypot(offset.x, offset.y)
      }
    } else {
      delta = Math.hypot(
        elevationPreciseOffset(
          preciseDraft.startCm,
          preciseDraft.hoverCm,
          preciseOverrideCm,
          elevAxisLockMod.value,
        ).x,
        elevationPreciseOffset(
          preciseDraft.startCm,
          preciseDraft.hoverCm,
          preciseOverrideCm,
          elevAxisLockMod.value,
        ).y,
      )
    }
    if (delta < minCm) {
      cancelPreciseDraft()
      return false
    }
    clearPreciseDraftUi()
    return true
  }

  function beginPreciseOpening(
    openingId: string,
    cm: Point2D,
    rect: ElevationRect,
    wallId: string,
    floorIndex: number,
  ): void {
    if (preciseDraft) {
      commitPreciseDraft()
      return
    }
    cancelOpeningMovePending()
    const located = findOpeningInPlan(props.plan, openingId)
    if (!located) return
    pushUndo()
    preciseDraft = {
      kind: 'opening',
      startCm: cm,
      hoverCm: cm,
      startRect: { x0: rect.x0, y0: rect.y0, x1: rect.x1, y1: rect.y1 },
      openingId,
      wallId,
      floorIndex,
    }
    const elev = elevation.value
    const wall = elev?.walls.find(
      (item) => item.wallId === wallId && item.floorIndex === floorIndex,
    )
    if (wall) syncOpeningPreciseLabel(preciseDraft, wall, preciseDraft.startRect)
    beginPreciseListen()
  }

  function beginPreciseRidge(wall: ElevationWallRect, cm: Point2D): void {
    if (preciseDraft) {
      commitPreciseDraft()
      return
    }
    const floor = props.plan.floors[wall.floorIndex]
    const startWall = floor
      ? listRidgeWallsOnFloor(floor).find((item) => item.id === wall.wallId)
      : undefined
    if (!startWall) return
    selectRidge(wall.wallId, wall.floorIndex)
    pushUndo()
    const startRect = elevationRidgeRectOf(wall)
    preciseDraft = {
      kind: 'ridge',
      startCm: cm,
      hoverCm: cm,
      startRect,
      wallId: wall.wallId,
      floorIndex: wall.floorIndex,
      startWall,
    }
    syncRidgePreciseLabel(preciseDraft, startRect)
    beginPreciseListen()
  }

  function beginPreciseJunction(
    junction: { id: string; heightCm: number; floorIndex: number; ridge?: boolean },
    refs: Array<{ wallId: string; end: 'a' | 'b' }>,
    cm: Point2D,
  ): void {
    if (preciseDraft) {
      commitPreciseDraft()
      return
    }
    selectJunction(junction.id)
    pushUndo()
    preciseDraft = {
      kind: 'junction',
      startCm: cm,
      hoverCm: cm,
      startHeightCm: junction.heightCm,
      id: junction.id,
      floorIndex: junction.floorIndex,
      refs,
      ridge: junction.ridge,
    }
    syncJunctionPreciseLabel(preciseDraft, junction.heightCm)
    beginPreciseListen()
  }

  function hasPreciseDraft(): boolean {
    return preciseDraft != null
  }

  function isPreciseIgnoreClick(): boolean {
    return preciseIgnoreClick
  }

  function setPreciseOverrideCm(cm: number | null): void {
    preciseOverrideCm = cm
  }

  return {
    preciseTypeText,
    precisePreview,
    preciseLabelCm,
    preciseMeasureLengthCm,
    preciseRestSide,
    preciseIntent,
    clearPreciseDraftUi,
    cancelPreciseDraft,
    commitPreciseDraft,
    beginPreciseOpening,
    beginPreciseRidge,
    beginPreciseJunction,
    applyPreciseDraft,
    hasPreciseDraft,
    isPreciseIgnoreClick,
    setPreciseOverrideCm,
  }
}
