import { ref, type Ref } from 'vue'
import type { FloorPlan, Point2D, Wall } from '@/core/fml/types'
import type { ElevationRect, ElevationWallRect, FacadeElevation } from '@/core/fml/facade-elevation'
import {
  elevationRectCenter,
  translateElevationRect,
  type ElevationSnapGuide,
} from '@/core/fml/elevation-opening-edit'
import {
  applyElevationRidgeRect,
  collectElevationRidgeJunctionSnapXs,
  elevationRidgeRectOf,
  snapElevationRidgeCenter,
} from '@/core/fml/elevation-ridge-edit'
import { listRidgeWallsOnFloor, setPlanRidgeJunctionZ } from '@/core/fml/ridge-walls'
import { findOpeningInPlan, setPlanJunctionHeight } from '@/core/fml/elevation-openings'
import {
  elevationPreciseCommitMinCm,
  elevationPreciseHeightDelta,
  elevationPreciseOffset,
} from './elevation-precise-move'
import { resolveRelocatePointerIntent } from './plan-canvas-mods'
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

  let preciseDraft: PreciseDraft | null = null
  let preciseIgnoreClick = false
  let preciseOverrideCm: number | null = null

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
    const offset = elevationPreciseOffset(
      draft.startCm,
      draft.hoverCm,
      preciseOverrideCm,
      elevAxisLockMod.value,
    )
    const next = translateElevationRect(draft.startRect, offset.x, offset.y)
    applyOpeningRect(draft.openingId, wall, next, false)
    const center = elevationRectCenter(next)
    precisePreview.value = {
      a: elevationRectCenter(draft.startRect),
      b: center,
    }
  }

  function applyPreciseRidge(draft: Extract<PreciseDraft, { kind: 'ridge' }>): void {
    const elev = elevation.value
    if (!elev) return
    const offset = elevationPreciseOffset(
      draft.startCm,
      draft.hoverCm,
      preciseOverrideCm,
      elevAxisLockMod.value,
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
  }

  function applyPreciseJunction(draft: Extract<PreciseDraft, { kind: 'junction' }>): void {
    const delta = elevationPreciseHeightDelta(draft.startCm.y, draft.hoverCm.y, preciseOverrideCm)
    const min = draft.ridge ? 0 : 1
    const heightCm = Math.max(min, Math.min(800, Math.round(draft.startHeightCm + delta)))
    commitPlan(
      draft.ridge
        ? setPlanRidgeJunctionZ(props.plan, draft.floorIndex, draft.refs, heightCm)
        : setPlanJunctionHeight(props.plan, draft.floorIndex, draft.refs, heightCm),
    )
    precisePreview.value = {
      a: draft.startCm,
      b: { x: draft.startCm.x, y: draft.startCm.y - (heightCm - draft.startHeightCm) },
    }
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
    const delta =
      preciseDraft.kind === 'junction'
        ? Math.abs(
            elevationPreciseHeightDelta(
              preciseDraft.startCm.y,
              preciseDraft.hoverCm.y,
              preciseOverrideCm,
            ),
          )
        : Math.hypot(
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
