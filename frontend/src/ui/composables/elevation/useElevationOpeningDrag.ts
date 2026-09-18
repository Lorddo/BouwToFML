import type { Ref } from 'vue'
import type { FloorPlan, Opening, Point2D } from '@/core/plan/types'
import type {
  ElevationOpeningRect,
  ElevationRect,
  ElevationWallRect,
  FacadeElevation,
} from '@/core/plan/facade-elevation'
import { collectElevationWallSnapXs, openingPatchFromElevationRect } from '@/core/plan/elevation-hit'
import {
  clampElevationOpeningMove,
  clampElevationOpeningResize,
  clampOpeningPatchKeepOppositeEdge,
  collectOpeningSnapTargets,
  elevationCollinearJointXs,
  elevationCollinearXBounds,
  excludeElevationSnapXs,
  pickElevationWallForOpeningX,
  resizeElevationRect,
  snapElevationRect,
  translateElevationRect,
  type ElevResizeSide,
  type ElevationOpeningShapeHint,
  type ElevationSnapGuide,
} from '@/core/plan/elevation-opening-edit'
import { findOpeningInPlan, movePlanOpening, updatePlanOpening } from '@/core/plan/elevation-openings'
import {
  clampElevationTransomRect,
  isElevationTransomDragMode,
  transomPatchFromElevationRect,
} from '@/core/plan/elevation-transom-edit'
import { elevationWallYsAtX } from '@/core/plan/facade-elevation'
import { floorWallBaseWorldZ } from '@/core/plan/floor-stack'
import type { ElevationInteractionProps } from './elevation-interaction-types'

type OpeningDragTarget = 'opening' | 'transom'

type OpeningDrag = {
  openingId: string
  mode: 'move' | ElevResizeSide
  target: OpeningDragTarget
  startCm: Point2D
  startRect: ElevationRect
  startOpening: Opening
  wallId: string
  floorIndex: number
}

const OPENING_MOVE_PENDING_PX = 4

export function useElevationOpeningDrag(options: {
  props: ElevationInteractionProps
  elevation: Ref<FacadeElevation | null>
  clientToCm: (clientX: number, clientY: number) => Point2D | null
  snapGuide: Ref<ElevationSnapGuide | null>
  pushUndo: () => void
  commitPlan: (next: FloorPlan) => void
  retargetOpeningId: (fromId: string, toId: string) => void
}) {
  const { props, elevation, clientToCm, snapGuide, pushUndo, commitPlan, retargetOpeningId } =
    options

  let drag: OpeningDrag | null = null

  function applyTransomRect(
    openingId: string,
    wall: ElevationWallRect,
    rect: ElevationRect,
    snapOff: boolean,
  ): void {
    if (!drag || drag.target !== 'transom' || !isElevationTransomDragMode(drag.mode)) return
    const elev = elevation.value
    const parentRect = elev?.openings.find((item) => item.openingId === openingId)
    if (!elev || !parentRect) return
    const openingTargets = collectOpeningSnapTargets(
      [...elev.openings, ...elev.transoms],
      openingId,
    )
    const midX = (drag.startRect.x0 + drag.startRect.x1) / 2
    const wallYs = elevationWallYsAtX(wall, midX)
    const raw =
      snapOff
        ? { rect, guide: {} as ElevationSnapGuide }
        : snapElevationRect(rect, drag.mode, {
            xs: [],
            ys: [
              ...openingTargets.ys,
              Math.min(parentRect.y0, parentRect.y1),
              ...(wallYs ? [wallYs.top] : []),
            ],
          })
    snapGuide.value = raw.guide.y != null ? { y: raw.guide.y } : null
    const nextRect = clampElevationTransomRect(
      drag.startRect,
      parentRect,
      wall,
      { ...raw.rect, x0: drag.startRect.x0, x1: drag.startRect.x1 },
      drag.mode,
    )
    const patch = transomPatchFromElevationRect(
      drag.startOpening,
      wall,
      nextRect,
      floorWallBaseWorldZ(props.plan, wall.floorIndex),
    )
    commitPlan(
      updatePlanOpening(props.plan, openingId, {
        bovenlicht: true,
        bovenlichtHeightCm: patch.bovenlichtHeightCm,
        bovenlichtGapCm: patch.bovenlichtGapCm,
      }),
    )
  }

  function applyOpeningRect(
    openingId: string,
    wall: ElevationWallRect,
    rect: ElevationRect,
    snapOff: boolean,
  ): void {
    if (drag?.target === 'transom') {
      applyTransomRect(openingId, wall, rect, snapOff)
      return
    }
    const elev = elevation.value
    const openingTargets = elev
      ? collectOpeningSnapTargets([...elev.openings, ...elev.transoms], openingId)
      : { xs: [], ys: [] }
    const floorWalls = props.plan.floors[wall.floorIndex]?.walls ?? []
    const xBounds = elevationCollinearXBounds(elev?.walls ?? [wall], wall, floorWalls)
    const moving = !drag || drag.mode === 'move'
    const shapeOpening = drag?.startOpening ?? findOpeningInPlan(props.plan, openingId)?.opening
    const shapeFor = (startOnLeft: boolean): ElevationOpeningShapeHint | undefined =>
      shapeOpening
        ? {
            type: shapeOpening.type,
            kind: shapeOpening.kind,
            mirrored: shapeOpening.mirrored,
            startOnLeft,
          }
        : undefined
    const snapShape = shapeFor(wall.xa <= wall.xb)
    const raw =
      snapOff || !elev
        ? { rect, guide: {} as ElevationSnapGuide }
        : snapElevationRect(
            rect,
            drag?.mode === 'move' || !drag ? 'move' : drag.mode,
            {
              xs: [
                ...openingTargets.xs,
                ...excludeElevationSnapXs(
                  collectElevationWallSnapXs(elev.walls),
                  elevationCollinearJointXs(elev.walls, floorWalls, wall.wallId),
                ),
              ],
              ys: openingTargets.ys,
            },
            undefined,
            snapShape,
          )
    snapGuide.value = raw.guide.x != null || raw.guide.y != null ? raw.guide : null
    let nextRect = raw.rect
    if (drag && drag.mode !== 'move') {
      nextRect = clampElevationOpeningResize(
        wall,
        nextRect,
        drag.mode,
        undefined,
        undefined,
        xBounds,
        shapeFor(wall.xa <= wall.xb),
      )
    }
    let hostElev = moving
      ? pickElevationWallForOpeningX(
          elev?.walls ?? [wall],
          wall,
          (nextRect.x0 + nextRect.x1) / 2,
          floorWalls,
        )
      : wall
    if (moving) {
      const hostBounds = elevationCollinearXBounds(elev?.walls ?? [hostElev], hostElev, floorWalls)
      nextRect = clampElevationOpeningMove(
        hostElev,
        nextRect,
        hostBounds,
        shapeFor(hostElev.xa <= hostElev.xb),
      )
      const nextHost = pickElevationWallForOpeningX(
        elev?.walls ?? [hostElev],
        hostElev,
        (nextRect.x0 + nextRect.x1) / 2,
        floorWalls,
      )
      if (nextHost.wallId !== hostElev.wallId || nextHost.floorIndex !== hostElev.floorIndex) {
        hostElev = nextHost
        const nextBounds = elevationCollinearXBounds(
          elev?.walls ?? [hostElev],
          hostElev,
          floorWalls,
        )
        nextRect = clampElevationOpeningMove(
          hostElev,
          nextRect,
          nextBounds,
          shapeFor(hostElev.xa <= hostElev.xb),
        )
      }
    }
    let nextId = openingId
    let nextPlan = props.plan
    if (moving && hostElev.wallId !== wall.wallId) {
      const patchT = openingPatchFromElevationRect(
        hostElev,
        nextRect,
        floorWallBaseWorldZ(props.plan, hostElev.floorIndex),
      )
      const moved = movePlanOpening(props.plan, openingId, hostElev.wallId, patchT.t)
      nextId = moved.openingId
      nextPlan = moved.plan
      if (drag) {
        drag.openingId = nextId
        drag.wallId = hostElev.wallId
        drag.floorIndex = hostElev.floorIndex
      }
      retargetOpeningId(openingId, nextId)
    }
    const patch = openingPatchFromElevationRect(
      hostElev,
      nextRect,
      floorWallBaseWorldZ(nextPlan, hostElev.floorIndex),
    )
    if (!drag || drag.mode === 'move') {
      commitPlan(
        updatePlanOpening(
          nextPlan,
          nextId,
          { t: patch.t, z: patch.z },
          { startOnLeft: hostElev.xa <= hostElev.xb },
        ),
      )
      return
    }
    const floor = nextPlan.floors[hostElev.floorIndex]
    const host = findOpeningInPlan(nextPlan, nextId)?.wall
    const resized =
      floor && host
        ? clampOpeningPatchKeepOppositeEdge(
            host,
            drag.startOpening,
            patch,
            drag.mode,
            floor.height,
            floor.walls,
            hostElev.xa <= hostElev.xb,
          )
        : patch
    commitPlan(updatePlanOpening(nextPlan, nextId, resized))
  }

  let openingMovePending: {
    onMove: (event: PointerEvent) => void
    onUp: () => void
  } | null = null

  function cancelOpeningMovePending(): void {
    if (!openingMovePending) return
    window.removeEventListener('pointermove', openingMovePending.onMove)
    window.removeEventListener('pointerup', openingMovePending.onUp)
    openingMovePending = null
  }

  function startOpeningMovePending(
    openingId: string,
    rect: ElevationOpeningRect,
    cm: Point2D,
    event: { evt: MouseEvent },
    target: OpeningDragTarget = 'opening',
  ): void {
    cancelOpeningMovePending()
    const startX = event.evt.clientX
    const startY = event.evt.clientY
    const onMove = (moveEvent: PointerEvent) => {
      if (
        Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < OPENING_MOVE_PENDING_PX
      ) {
        return
      }
      cancelOpeningMovePending()
      const nextCm = clientToCm(moveEvent.clientX, moveEvent.clientY) ?? cm
      beginOpeningDrag(openingId, 'move', nextCm, rect, rect.wallId, rect.floorIndex, target)
    }
    const onUp = () => cancelOpeningMovePending()
    openingMovePending = { onMove, onUp }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
  }

  function beginOpeningDrag(
    openingId: string,
    mode: OpeningDrag['mode'],
    cm: Point2D,
    rect: ElevationRect,
    wallId: string,
    floorIndex: number,
    target: OpeningDragTarget = 'opening',
  ): void {
    cancelOpeningMovePending()
    if (target === 'transom' && !isElevationTransomDragMode(mode)) return
    const located = findOpeningInPlan(props.plan, openingId)
    if (!located) return
    drag = {
      openingId,
      mode,
      target,
      startCm: cm,
      startRect: { x0: rect.x0, y0: rect.y0, x1: rect.x1, y1: rect.y1 },
      startOpening: { ...located.opening },
      wallId,
      floorIndex,
    }
    pushUndo()
    window.addEventListener('pointermove', onOpeningMove)
    window.addEventListener('pointerup', onOpeningUp, { once: true })
  }

  function onOpeningMove(event: PointerEvent): void {
    if (!drag) return
    const elev = elevation.value
    const wall = elev?.walls.find(
      (item) => item.wallId === drag!.wallId && item.floorIndex === drag!.floorIndex,
    )
    if (!elev || !wall) return
    const cm = clientToCm(event.clientX, event.clientY)
    if (!cm) return
    const next =
      drag.mode === 'move'
        ? translateElevationRect(
            drag.startRect,
            drag.target === 'transom' ? 0 : cm.x - drag.startCm.x,
            cm.y - drag.startCm.y,
          )
        : resizeElevationRect(drag.startRect, drag.mode, cm)
    applyOpeningRect(drag.openingId, wall, next, event.ctrlKey || event.metaKey)
  }

  function onOpeningUp(): void {
    window.removeEventListener('pointermove', onOpeningMove)
    cancelOpeningMovePending()
    drag = null
    snapGuide.value = null
  }

  function cleanupOpeningDrag(): void {
    cancelOpeningMovePending()
    window.removeEventListener('pointermove', onOpeningMove)
    drag = null
  }

  return {
    applyOpeningRect,
    cancelOpeningMovePending,
    startOpeningMovePending,
    beginOpeningDrag,
    cleanupOpeningDrag,
  }
}

export type ElevationOpeningDrag = ReturnType<typeof useElevationOpeningDrag>
