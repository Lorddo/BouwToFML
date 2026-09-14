/**
 * Nokbalk in het aanzicht: kopse kant sleep/resize zoals een opening;
 * dwarsligger: per uiteinde verslepen (diepte blijft), zoals dakvlak-punten.
 */
import type { ElevationSnapGuide } from './elevation-opening-edit'
import { translateElevationRect } from './elevation-opening-edit'
import { displayWidthFromRidgeElevationRect } from './elevation-wall-faces'
import {
  unprojectElevationAlong,
  type ElevationRect,
  type ElevationWallRect,
  type FacadeElevation,
} from './facade-elevation'
import { snapElevationX } from './elevation-hit'
import { DEFAULT_NOK_THICKNESS_CM, floorWallBaseWorldZ } from './floor-stack'
import {
  listRidgeWallsOnFloor,
  ridgeDisplayWidthCm,
  ridgeEndpointZCm,
  setRidgeDisplayWidthCm,
  setRidgeWallPlanPose,
} from './ridge-walls'
import type { FloorPlan, Point2D, Wall } from './types'
import { endpointHeightCm, wallEndpoint3D, type WallEnd } from './wall-endpoint-height'

export const ELEVATION_RIDGE_MIN_SIZE_CM = 4

function rectMidX(rect: ElevationRect): number {
  return (rect.x0 + rect.x1) / 2
}

function rectBotY(rect: ElevationRect): number {
  return Math.max(rect.y0, rect.y1)
}

function wallLen(wall: Pick<Wall, 'a' | 'b'>): number {
  return Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y)
}

function clonePlanForRidgeEdit(plan: FloorPlan): FloorPlan {
  return {
    ...plan,
    floors: [...plan.floors],
    source: plan.source
      ? { ...plan.source, settings: { ...(plan.source.settings ?? {}) } }
      : plan.source,
  }
}

function ridgeSpanCm(wall: Wall, floorHeightCm: number): number {
  const span = Math.round(endpointHeightCm(wallEndpoint3D(wall, 'a', floorHeightCm)))
  return Math.max(ELEVATION_RIDGE_MIN_SIZE_CM, span > 0 ? span : DEFAULT_NOK_THICKNESS_CM)
}

/** Alleen gevel-knoop X; geen binnen-/buitenface, dak of openingen. */
export function collectElevationRidgeJunctionSnapXs(elevation: FacadeElevation): number[] {
  return elevation.junctions.filter((item) => !item.ridge).map((item) => item.x)
}

export function elevationRidgeRectCenter(rect: ElevationRect): { x: number; y: number } {
  return {
    x: (rect.x0 + rect.x1) / 2,
    y: (rect.y0 + rect.y1) / 2,
  }
}

/** Midden van de kopse box snapt op muurjunctions (X). Geen Y- of face-snap. */
export function snapElevationRidgeCenter(
  rect: ElevationRect,
  junctionXs: readonly number[],
  slackCm = 8,
): { rect: ElevationRect; guide: ElevationSnapGuide } {
  const mid = elevationRidgeRectCenter(rect)
  const snappedX = snapElevationX(mid.x, junctionXs, slackCm)
  if (Math.abs(snappedX - mid.x) < 1e-6) return { rect, guide: {} }
  return {
    rect: translateElevationRect(rect, snappedX - mid.x, 0),
    guide: { x: snappedX },
  }
}

/** Lange nok: einden snappen op gevelknopen (niet het midden van de balk). */
export function snapElevationRidgeEnds(
  rect: ElevationRect,
  junctionXs: readonly number[],
  slackCm = 8,
): { rect: ElevationRect; guide: ElevationSnapGuide } {
  let bestDx = 0
  let bestGuide: number | undefined
  let bestDist = slackCm
  for (const end of [rect.x0, rect.x1]) {
    const snappedX = snapElevationX(end, junctionXs, slackCm)
    const dist = Math.abs(snappedX - end)
    if (dist < 1e-6 || dist > bestDist + 1e-9) continue
    bestDist = dist
    bestDx = snappedX - end
    bestGuide = snappedX
  }
  if (bestGuide == null) return { rect, guide: {} }
  return {
    rect: translateElevationRect(rect, bestDx, 0),
    guide: { x: bestGuide },
  }
}

/**
 * Silhouet → plan. Kopse: uniforme Z + weergavebreedte.
 */
export function applyElevationRidgeRect(args: {
  plan: FloorPlan
  axis: Point2D
  floorIndex: number
  wallId: string
  startWall: Wall
  startRect: ElevationRect
  nextRect: ElevationRect
}): FloorPlan {
  const { axis, floorIndex, wallId, startWall, startRect, nextRect } = args
  const floor = args.plan.floors[floorIndex]
  if (!floor) return args.plan
  const dx = rectMidX(nextRect) - rectMidX(startRect)
  const a = { x: startWall.a.x + axis.x * dx, y: startWall.a.y + axis.y * dx }
  const b = { x: startWall.b.x + axis.x * dx, y: startWall.b.y + axis.y * dx }
  const yBot = rectBotY(nextRect)
  const span = Math.max(
    ELEVATION_RIDGE_MIN_SIZE_CM,
    Math.round(Math.abs(nextRect.y1 - nextRect.y0)),
  )
  const z = Math.max(0, Math.round(-yBot - floorWallBaseWorldZ(args.plan, floorIndex)))
  const xa = startWall.a.x * axis.x + startWall.a.y * axis.y
  const xb = startWall.b.x * axis.x + startWall.b.y * axis.y
  const displayWidth = displayWidthFromRidgeElevationRect(
    Math.abs(nextRect.x1 - nextRect.x0),
    xa + dx,
    xb + dx,
    wallLen(startWall),
  )
  const next = setRidgeWallPlanPose(clonePlanForRidgeEdit(args.plan), floorIndex, wallId, {
    a,
    b,
    zA: z,
    zB: z,
    spanCm: span,
  })
  if (displayWidth === ridgeDisplayWidthCm(args.plan)) return next
  return setRidgeDisplayWidthCm(next, displayWidth)
}

/**
 * Eén nok-uiteinde (of gedeelde knoop) langs de gevel + Z; diepte blijft.
 * Andere einden van dezelfde balk blijven staan.
 */
export function applyElevationRidgeEnd(args: {
  plan: FloorPlan
  elevation: Pick<FacadeElevation, 'axis' | 'origin'>
  floorIndex: number
  refs: ReadonlyArray<{ wallId: string; end: WallEnd }>
  alongCm: number
  zCm: number
}): FloorPlan {
  const floor = args.plan.floors[args.floorIndex]
  if (!floor || args.refs.length === 0) return args.plan
  const zCm = Math.max(0, Math.min(800, Math.round(args.zCm)))
  let next = args.plan
  for (const ref of args.refs) {
    const currentFloor = next.floors[args.floorIndex]
    if (!currentFloor) break
    const wall = listRidgeWallsOnFloor(currentFloor).find((item) => item.id === ref.wallId)
    if (!wall) continue
    const keep = ref.end === 'a' ? wall.a : wall.b
    const other = ref.end === 'a' ? wall.b : wall.a
    const otherAlong = other.x * args.elevation.axis.x + other.y * args.elevation.axis.y
    let along = args.alongCm
    if (Math.abs(along - otherAlong) < ELEVATION_RIDGE_MIN_SIZE_CM) {
      const dir = along >= otherAlong ? 1 : -1
      along = otherAlong + dir * ELEVATION_RIDGE_MIN_SIZE_CM
    }
    const point = unprojectElevationAlong(along, keep, args.elevation)
    const zA = ref.end === 'a' ? zCm : ridgeEndpointZCm(wall, 'a', currentFloor.height)
    const zB = ref.end === 'b' ? zCm : ridgeEndpointZCm(wall, 'b', currentFloor.height)
    next = setRidgeWallPlanPose(clonePlanForRidgeEdit(next), args.floorIndex, ref.wallId, {
      a: ref.end === 'a' ? point : { x: wall.a.x, y: wall.a.y },
      b: ref.end === 'b' ? point : { x: wall.b.x, y: wall.b.y },
      zA,
      zB,
      spanCm: ridgeSpanCm(wall, currentFloor.height),
    })
  }
  return next
}

export function elevationRidgeRectOf(wall: ElevationWallRect): ElevationRect {
  return { x0: wall.x0, x1: wall.x1, y0: wall.y0, y1: wall.y1 }
}
