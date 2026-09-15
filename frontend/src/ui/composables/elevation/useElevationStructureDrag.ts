import type { Ref } from 'vue'
import type { FloorPlan, Point2D, Wall } from '@/core/plan/types'
import {
  unprojectElevationAlong,
  type ElevationRect,
  type ElevationWallRect,
  type FacadeElevation,
} from '@/core/plan/facade-elevation'
import {
  collectElevationRoofSnapXs,
  collectElevationRoofSnapYs,
  collectElevationSegmentSnapYs,
  collectElevationWallSnapXs,
  ELEVATION_SEGMENT_SNAP_CM,
  snapElevationX,
  snapElevationY,
} from '@/core/plan/elevation-hit'
import {
  resizeElevationRect,
  translateElevationRect,
  type ElevResizeSide,
  type ElevationSnapGuide,
} from '@/core/plan/elevation-opening-edit'
import {
  applyElevationRidgeEnd,
  applyElevationRidgeRect,
  collectElevationRidgeJunctionSnapXs,
  ELEVATION_RIDGE_MIN_SIZE_CM,
  elevationRidgeRectOf,
  snapElevationRidgeCenter,
} from '@/core/plan/elevation-ridge-edit'
import { applyElevationWallEndAlongPlanAxis } from '@/core/plan/elevation-wall-end-edit'
import { findRidgeSurface, setRidgeSurfaceVertex } from '@/core/plan/roof-planes'
import { listRidgeWallsOnFloor, setPlanRidgeJunctionZ } from '@/core/plan/ridge-walls'
import { setPlanJunctionElevationEdit, setPlanWallElevationEdit } from '@/core/plan/elevation-openings'
import {
  wallEndpoint3D,
  wallUniformBottomZCm,
  type WallElevationEditMode,
} from '@/core/plan/wall-endpoint-height'
import { floorWallBaseWorldZ } from '@/core/plan/floor-stack'
import type { ElevationInteractionProps } from './elevation-interaction-types'

export function useElevationStructureDrag(options: {
  props: ElevationInteractionProps
  elevation: Ref<FacadeElevation | null>
  clientToCm: (clientX: number, clientY: number) => Point2D | null
  snapGuide: Ref<ElevationSnapGuide | null>
  pushUndo: () => void
  commitPlan: (next: FloorPlan) => void
  selectRidge: (wallId: string, floorIndex: number, end?: 'a' | 'b') => void
  selectJunction: (id: string | null) => void
}) {
  const {
    props,
    elevation,
    clientToCm,
    snapGuide,
    pushUndo,
    commitPlan,
    selectRidge,
    selectJunction,
  } = options

  function elevCmToLocalZ(floorIndex: number, elevY: number): number {
    return -elevY - floorWallBaseWorldZ(props.plan, floorIndex)
  }

  function snapPointerCm(
    cm: Point2D,
    snapOff: boolean,
    xs?: readonly number[],
    ys?: readonly number[],
    ySlackCm?: number,
  ): Point2D {
    if (snapOff) {
      snapGuide.value = null
      return cm
    }
    let x = cm.x
    let y = cm.y
    if (xs) x = snapElevationX(x, xs)
    if (ys) y = snapElevationY(y, ys, ySlackCm)
    const guide: ElevationSnapGuide = {}
    if (xs && Math.abs(x - cm.x) >= 1e-6) guide.x = x
    if (ys && Math.abs(y - cm.y) >= 1e-6) guide.y = y
    snapGuide.value = guide.x != null || guide.y != null ? guide : null
    return { x, y }
  }

  type RidgeRectDrag = {
    wallId: string
    floorIndex: number
    mode: 'move' | ElevResizeSide
    startCm: Point2D
    startRect: ElevationRect
    startWall: Wall
  }

  let ridgeRectDrag: RidgeRectDrag | null = null

  function beginRidgeRectDrag(
    wall: ElevationWallRect,
    mode: RidgeRectDrag['mode'],
    cm: Point2D,
  ): void {
    const floor = props.plan.floors[wall.floorIndex]
    const startWall = floor
      ? listRidgeWallsOnFloor(floor).find((item) => item.id === wall.wallId)
      : undefined
    if (!startWall) return
    selectRidge(wall.wallId, wall.floorIndex)
    ridgeRectDrag = {
      wallId: wall.wallId,
      floorIndex: wall.floorIndex,
      mode,
      startCm: cm,
      startRect: elevationRidgeRectOf(wall),
      startWall,
    }
    pushUndo()
    window.addEventListener('pointermove', onRidgeRectMove)
    window.addEventListener('pointerup', onRidgeRectUp, { once: true })
  }

  function onRidgeRectMove(event: PointerEvent): void {
    if (!ridgeRectDrag) return
    const elev = elevation.value
    const cm = clientToCm(event.clientX, event.clientY)
    if (!elev || !cm) return
    const raw =
      ridgeRectDrag.mode === 'move'
        ? translateElevationRect(
            ridgeRectDrag.startRect,
            cm.x - ridgeRectDrag.startCm.x,
            cm.y - ridgeRectDrag.startCm.y,
          )
        : resizeElevationRect(
            ridgeRectDrag.startRect,
            ridgeRectDrag.mode,
            cm,
            ELEVATION_RIDGE_MIN_SIZE_CM,
            ELEVATION_RIDGE_MIN_SIZE_CM,
          )
    const snapOff = event.ctrlKey || event.metaKey
    const snapped =
      ridgeRectDrag.mode === 'move' && !snapOff
        ? snapElevationRidgeCenter(raw, collectElevationRidgeJunctionSnapXs(elev))
        : { rect: raw, guide: {} as ElevationSnapGuide }
    snapGuide.value = snapped.guide.x != null ? snapped.guide : null
    commitPlan(
      applyElevationRidgeRect({
        plan: props.plan,
        axis: elev.axis,
        floorIndex: ridgeRectDrag.floorIndex,
        wallId: ridgeRectDrag.wallId,
        startWall: ridgeRectDrag.startWall,
        startRect: ridgeRectDrag.startRect,
        nextRect: snapped.rect,
      }),
    )
  }

  function onRidgeRectUp(): void {
    window.removeEventListener('pointermove', onRidgeRectMove)
    ridgeRectDrag = null
    snapGuide.value = null
  }

  type RidgeEndDrag = {
    floorIndex: number
    refs: Array<{ wallId: string; end: 'a' | 'b' }>
  }

  let ridgeEndDrag: RidgeEndDrag | null = null

  function ridgeRefsForEnd(
    wall: ElevationWallRect,
    end: 'a' | 'b',
  ): Array<{ wallId: string; end: 'a' | 'b' }> {
    const elev = elevation.value
    const fallback = [{ wallId: wall.wallId, end }]
    if (!elev) return fallback
    const x = end === 'a' ? wall.xa : wall.xb
    const junction = elev.junctions.find(
      (item) =>
        item.ridge === true && item.floorIndex === wall.floorIndex && Math.abs(item.x - x) < 0.75,
    )
    return junction?.refs.length ? [...junction.refs] : fallback
  }

  function beginRidgeEndDrag(
    floorIndex: number,
    refs: Array<{ wallId: string; end: 'a' | 'b' }>,
  ): void {
    if (refs.length === 0) return
    ridgeEndDrag = { floorIndex, refs }
    pushUndo()
    window.addEventListener('pointermove', onRidgeEndMove)
    window.addEventListener('pointerup', onRidgeEndUp, { once: true })
  }

  function onRidgeEndMove(event: PointerEvent): void {
    if (!ridgeEndDrag) return
    const elev = elevation.value
    const cm = clientToCm(event.clientX, event.clientY)
    if (!elev || !cm) return
    const snapped = snapPointerCm(
      cm,
      event.ctrlKey || event.metaKey,
      collectElevationRidgeJunctionSnapXs(elev),
      collectElevationSegmentSnapYs(elev, {
        wallIds: ridgeEndDrag.refs.map((r) => r.wallId),
      }),
      ELEVATION_SEGMENT_SNAP_CM,
    )
    commitPlan(
      applyElevationRidgeEnd({
        plan: props.plan,
        elevation: elev,
        floorIndex: ridgeEndDrag.floorIndex,
        refs: ridgeEndDrag.refs,
        alongCm: snapped.x,
        zCm: elevCmToLocalZ(ridgeEndDrag.floorIndex, snapped.y),
      }),
    )
  }

  function onRidgeEndUp(): void {
    window.removeEventListener('pointermove', onRidgeEndMove)
    ridgeEndDrag = null
    snapGuide.value = null
  }

  type WallAxisEndDrag = {
    wallId: string
    floorIndex: number
    end: 'a' | 'b'
  }

  let wallAxisEndDrag: WallAxisEndDrag | null = null

  function beginWallAxisEndDrag(wallId: string, floorIndex: number, end: 'a' | 'b'): void {
    wallAxisEndDrag = { wallId, floorIndex, end }
    pushUndo()
    window.addEventListener('pointermove', onWallAxisEndMove)
    window.addEventListener('pointerup', onWallAxisEndUp, { once: true })
  }

  function onWallAxisEndMove(event: PointerEvent): void {
    if (!wallAxisEndDrag) return
    const elev = elevation.value
    const cm = clientToCm(event.clientX, event.clientY)
    if (!elev || !cm) return
    const snapped = snapPointerCm(
      cm,
      event.ctrlKey || event.metaKey,
      collectElevationWallSnapXs(elev.walls),
      collectElevationSegmentSnapYs(elev, { wallId: wallAxisEndDrag.wallId }),
      ELEVATION_SEGMENT_SNAP_CM,
    )
    commitPlan(
      applyElevationWallEndAlongPlanAxis({
        plan: props.plan,
        elevation: elev,
        floorIndex: wallAxisEndDrag.floorIndex,
        wallId: wallAxisEndDrag.wallId,
        end: wallAxisEndDrag.end,
        alongCm: snapped.x,
        zCm: elevCmToLocalZ(wallAxisEndDrag.floorIndex, snapped.y),
      }),
    )
  }

  function onWallAxisEndUp(): void {
    window.removeEventListener('pointermove', onWallAxisEndMove)
    wallAxisEndDrag = null
    snapGuide.value = null
  }

  type WallElevHandleDrag = {
    wallId: string
    floorIndex: number
    mode: WallElevationEditMode
    startBottomZ: number
  }

  let wallElevDrag: WallElevHandleDrag | null = null
  let wallElevDragStarted = false

  function beginWallElevDrag(
    wallId: string,
    floorIndex: number,
    mode: WallElevationEditMode,
  ): void {
    const floor = props.plan.floors[floorIndex]
    const wall = floor?.walls.find((item) => item.id === wallId)
    if (!floor || !wall) return
    const startBottomZ = wallUniformBottomZCm(wall, floor.height) ?? 0
    wallElevDrag = { wallId, floorIndex, mode, startBottomZ }
    wallElevDragStarted = false
    window.addEventListener('pointermove', onWallElevHandleMove)
    window.addEventListener('pointerup', onWallElevHandleUp, { once: true })
  }

  function onWallElevHandleMove(event: PointerEvent): void {
    if (!wallElevDrag) return
    const elev = elevation.value
    const cm = clientToCm(event.clientX, event.clientY)
    if (!cm) return
    const snapped = snapPointerCm(
      cm,
      !elev || event.ctrlKey || event.metaKey,
      undefined,
      elev
        ? collectElevationSegmentSnapYs(elev, { wallId: wallElevDrag.wallId })
        : undefined,
      ELEVATION_SEGMENT_SNAP_CM,
    )
    const localZ = Math.max(0, Math.round(elevCmToLocalZ(wallElevDrag.floorIndex, snapped.y)))
    const targetCm =
      wallElevDrag.mode === 'height' ? Math.max(1, localZ - wallElevDrag.startBottomZ) : localZ
    if (!wallElevDragStarted) {
      pushUndo()
      wallElevDragStarted = true
    }
    commitPlan(
      setPlanWallElevationEdit(
        props.plan,
        wallElevDrag.wallId,
        wallElevDrag.floorIndex,
        wallElevDrag.mode,
        targetCm,
      ),
    )
  }

  function onWallElevHandleUp(): void {
    window.removeEventListener('pointermove', onWallElevHandleMove)
    wallElevDrag = null
    wallElevDragStarted = false
    snapGuide.value = null
  }

  type JunctionDrag = {
    id: string
    startY: number
    startHeightCm: number
    startBottomZ: number
    mode: WallElevationEditMode
    floorIndex: number
    refs: Array<{ wallId: string; end: 'a' | 'b' }>
    ridge?: boolean
  }

  let junctionDrag: JunctionDrag | null = null

  function junctionBottomZOf(junction: {
    floorIndex: number
    refs: Array<{ wallId: string; end: 'a' | 'b' }>
  }): number {
    const floor = props.plan.floors[junction.floorIndex]
    const floorH = floor?.height ?? 280
    const bottoms = junction.refs
      .map((wallRef) => {
        const wall = floor?.walls.find((item) => item.id === wallRef.wallId)
        if (!wall) return null
        return Math.round(wallEndpoint3D(wall, wallRef.end, floorH).z)
      })
      .filter((value): value is number => value != null)
    return bottoms[0] ?? 0
  }

  function beginJunctionDrag(
    junction: { id: string; heightCm: number; floorIndex: number; ridge?: boolean },
    refs: Array<{ wallId: string; end: 'a' | 'b' }>,
    startY: number,
    mode: WallElevationEditMode = 'height',
  ): void {
    selectJunction(junction.id)
    junctionDrag = {
      id: junction.id,
      startY,
      startHeightCm: junction.heightCm,
      startBottomZ: junction.ridge
        ? 0
        : junctionBottomZOf({ floorIndex: junction.floorIndex, refs }),
      mode: junction.ridge ? 'height' : mode,
      floorIndex: junction.floorIndex,
      refs,
      ridge: junction.ridge,
    }
    pushUndo()
    window.addEventListener('pointermove', onJunctionMove)
    window.addEventListener('pointerup', onJunctionUp, { once: true })
  }

  function onJunctionMove(event: PointerEvent): void {
    if (!junctionDrag) return
    const elev = elevation.value
    const cm = clientToCm(event.clientX, event.clientY)
    if (!cm) return
    const snapped = snapPointerCm(
      cm,
      !elev || event.ctrlKey || event.metaKey,
      undefined,
      elev
        ? collectElevationSegmentSnapYs(elev, {
            junctionId: junctionDrag.id,
            wallIds: junctionDrag.refs.map((r) => r.wallId),
          })
        : undefined,
      ELEVATION_SEGMENT_SNAP_CM,
    )
    const y = snapped.y
    if (junctionDrag.ridge) {
      const heightCm = Math.max(
        0,
        Math.min(800, Math.round(junctionDrag.startHeightCm - (y - junctionDrag.startY))),
      )
      commitPlan(
        setPlanRidgeJunctionZ(props.plan, junctionDrag.floorIndex, junctionDrag.refs, heightCm),
      )
      return
    }
    const localZ = Math.max(0, Math.round(elevCmToLocalZ(junctionDrag.floorIndex, y)))
    const targetCm =
      junctionDrag.mode === 'height' ? Math.max(1, localZ - junctionDrag.startBottomZ) : localZ
    commitPlan(
      setPlanJunctionElevationEdit(
        props.plan,
        junctionDrag.floorIndex,
        junctionDrag.refs,
        junctionDrag.mode,
        targetCm,
      ),
    )
  }

  function onJunctionUp(): void {
    window.removeEventListener('pointermove', onJunctionMove)
    junctionDrag = null
    snapGuide.value = null
  }

  type RoofVertexDrag = {
    surfaceId: string
    vertexIndex: number
    floorIndex: number
  }

  let roofVertexDrag: RoofVertexDrag | null = null

  function beginRoofVertexDrag(surfaceId: string, vertexIndex: number, floorIndex: number): void {
    roofVertexDrag = { surfaceId, vertexIndex, floorIndex }
    pushUndo()
    window.addEventListener('pointermove', onRoofVertexMove)
    window.addEventListener('pointerup', onRoofVertexUp, { once: true })
  }

  function onRoofVertexMove(event: PointerEvent): void {
    if (!roofVertexDrag) return
    const elev = elevation.value
    const cm = clientToCm(event.clientX, event.clientY)
    if (!elev || !cm) return
    const surface = findRidgeSurface(props.plan, roofVertexDrag.surfaceId)
    const keep = surface?.poly[roofVertexDrag.vertexIndex]
    if (!keep) return
    const skip = {
      planeId: roofVertexDrag.surfaceId,
      vertexIndex: roofVertexDrag.vertexIndex,
    }
    const snapped = snapPointerCm(
      cm,
      event.ctrlKey || event.metaKey,
      collectElevationRoofSnapXs(elev, skip),
      collectElevationRoofSnapYs(elev, skip),
    )
    const xy = unprojectElevationAlong(snapped.x, keep, elev)
    commitPlan(
      setRidgeSurfaceVertex(props.plan, roofVertexDrag.surfaceId, roofVertexDrag.vertexIndex, {
        x: xy.x,
        y: xy.y,
        z: elevCmToLocalZ(roofVertexDrag.floorIndex, snapped.y),
      }),
    )
  }

  function onRoofVertexUp(): void {
    window.removeEventListener('pointermove', onRoofVertexMove)
    roofVertexDrag = null
    snapGuide.value = null
  }

  function cleanupStructureDrag(): void {
    window.removeEventListener('pointermove', onRidgeRectMove)
    window.removeEventListener('pointermove', onRidgeEndMove)
    window.removeEventListener('pointermove', onWallAxisEndMove)
    window.removeEventListener('pointermove', onWallElevHandleMove)
    window.removeEventListener('pointermove', onJunctionMove)
    window.removeEventListener('pointermove', onRoofVertexMove)
    ridgeRectDrag = null
    ridgeEndDrag = null
    wallAxisEndDrag = null
    wallElevDrag = null
    wallElevDragStarted = false
    junctionDrag = null
    roofVertexDrag = null
  }

  return {
    beginRidgeRectDrag,
    beginRidgeEndDrag,
    ridgeRefsForEnd,
    beginWallAxisEndDrag,
    beginWallElevDrag,
    beginJunctionDrag,
    beginRoofVertexDrag,
    cleanupStructureDrag,
  }
}

export type ElevationStructureDrag = ReturnType<typeof useElevationStructureDrag>
