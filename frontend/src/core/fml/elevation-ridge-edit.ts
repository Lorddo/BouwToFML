/**
 * Kopse nokbalk in het aanzicht: sleep/resize zoals een raam of deur.
 */
import type { ElevationSnapGuide } from './elevation-opening-edit'
import { translateElevationRect } from './elevation-opening-edit'
import { displayWidthFromRidgeElevationRect } from './elevation-wall-faces'
import type { ElevationRect, ElevationWallRect, FacadeElevation } from './facade-elevation'
import { snapElevationX } from './elevation-hit'
import { floorWallBaseWorldZ } from './floor-stack'
import { ridgeDisplayWidthCm, setRidgeDisplayWidthCm, setRidgeWallPlanPose } from './ridge-walls'
import type { FloorPlan, Point2D, Wall } from './types'

export const ELEVATION_RIDGE_MIN_SIZE_CM = 4

function rectMidX(rect: ElevationRect): number {
  return (rect.x0 + rect.x1) / 2
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

/** Zet kopse silhouet terug naar plan: X langs de gevelas, Y = nok-z + span, breedte = weergave. */
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
  const yBot = Math.max(nextRect.y0, nextRect.y1)
  const span = Math.max(
    ELEVATION_RIDGE_MIN_SIZE_CM,
    Math.round(Math.abs(nextRect.y1 - nextRect.y0)),
  )
  const z = Math.max(0, Math.round(-yBot - floorWallBaseWorldZ(args.plan, floorIndex)))
  const a = { x: startWall.a.x + axis.x * dx, y: startWall.a.y + axis.y * dx }
  const b = { x: startWall.b.x + axis.x * dx, y: startWall.b.y + axis.y * dx }
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

export function elevationRidgeRectOf(wall: ElevationWallRect): ElevationRect {
  return { x0: wall.x0, x1: wall.x1, y0: wall.y0, y1: wall.y1 }
}
