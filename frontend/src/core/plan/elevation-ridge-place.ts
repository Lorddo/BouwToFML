/**
 * Nokbalk plaatsen vanuit kopgevel-aanzicht:
 * klik → verdieping + buitenface→buitenface (sky-exposed).
 */
import { ELEVATION_RIDGE_MIN_SIZE_CM } from './elevation-ridge-edit'
import { collectElevationRoofSnapXs, ELEVATION_ROOF_Z_SNAP_CM, snapElevationX } from './elevation-hit'
import {
  elevationDepthCm,
  elevationOutwardPerp,
  type ElevationRect,
  type FacadeElevation,
} from './facade-elevation'
import { floorCeilingWorldZ, floorSlabWorldRange, floorWallBaseWorldZ } from './floor-stack'
import { floorInteriorHitsPoint, isPointSkyExposedOnFloor } from './ridge-floor'
import {
  assignRidgeWallGuids,
  dakThicknessCmForPlan,
  listRidgeWallsOnFloor,
  markWallAsRidge,
  ridgeDisplayWidthCm,
  ridgeEndpointExtras,
  setRidgeWallsOnFloor,
} from './ridge-walls'
import type { FloorPlan, Point2D, Wall } from './types'
import { floorFootprintCentroid, planFootprintCentroid, wallOuterFace } from './wall-outer-face'

export type ElevationRidgePlacePreview = {
  floorIndex: number
  a: Point2D
  b: Point2D
  /** Ghost-box in aanzicht-cm (kopse silhouet). */
  rect: ElevationRect
  zCm: number
  spanCm: number
}

export type ElevationRidgePlaceResult = {
  plan: FloorPlan
  wallId: string
  floorIndex: number
}

const FACE_HIT_PAD = 0.15
const X_PRESENT_SLACK_CM = 2
/** Onderkant plaat + lichte snap eronder blijft floor N (goot op de plaat). */
const SLAB_SOFFIT_SNAP_CM = ELEVATION_ROOF_Z_SNAP_CM

function clonePlanForPlace(plan: FloorPlan): FloorPlan {
  return {
    ...plan,
    floors: [...plan.floors],
    source: plan.source
      ? { ...plan.source, settings: { ...(plan.source.settings ?? {}) } }
      : plan.source,
  }
}

function wallPlanMid(wall: Pick<Wall, 'a' | 'b'>): Point2D {
  return { x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 }
}

/** Inwaarts (loodrecht op gevelas, naar de centroid). */
export function elevationInwardDir(plan: FloorPlan, elev: FacadeElevation): Point2D {
  const centroid = planFootprintCentroid(plan)
  const mids: Point2D[] = []
  for (const rect of elev.walls) {
    if (rect.ridge) continue
    const wall = plan.floors[rect.floorIndex]?.walls.find((item) => item.id === rect.wallId)
    if (wall) mids.push(wallPlanMid(wall))
  }
  const outward = elevationOutwardPerp(elev.axis, centroid, mids)
  return { x: -outward.x, y: -outward.y }
}

/** Lijn base + t·dir snijdt segment a→b; t langs dir (unit), u op segment [0,1]. */
function intersectLineWithSeg(
  base: Point2D,
  dir: Point2D,
  a: Point2D,
  b: Point2D,
): { t: number; u: number; point: Point2D } | null {
  const dbx = b.x - a.x
  const dby = b.y - a.y
  const denom = dir.x * dby - dir.y * dbx
  if (Math.abs(denom) < 1e-9) return null
  const ox = a.x - base.x
  const oy = a.y - base.y
  const t = (ox * dby - oy * dbx) / denom
  const u = (ox * dir.y - oy * dir.x) / denom
  return {
    t,
    u,
    point: { x: base.x + dir.x * t, y: base.y + dir.y * t },
  }
}

function pointAt(base: Point2D, dir: Point2D, t: number): Point2D {
  return { x: base.x + dir.x * t, y: base.y + dir.y * t }
}

export function floorPresentAtElevationX(
  _plan: FloorPlan,
  elev: FacadeElevation,
  floorIndex: number,
  xCm: number,
): boolean {
  for (const wall of elev.walls) {
    if (wall.ridge || wall.floorIndex !== floorIndex) continue
    const lo = Math.min(wall.x0, wall.x1)
    const hi = Math.max(wall.x0, wall.x1)
    if (xCm >= lo - X_PRESENT_SLACK_CM && xCm <= hi + X_PRESENT_SLACK_CM) return true
  }
  return false
}

/**
 * Hoogste floor waarvan de vloerplaat de klik dekt.
 * Onderkant plaat + snap-slack eronder blijft die floor (1e-dakplaat op de
 * plaat-onderkant). Geen dak op een floor als er een verdiepingsvloer op X zit.
 */
export function resolveElevationRidgeFloor(
  plan: FloorPlan,
  elev: FacadeElevation,
  click: Point2D,
): number {
  const worldZ = -click.y
  for (let index = plan.floors.length - 1; index >= 0; index -= 1) {
    const slab = floorSlabWorldRange(plan, index)
    if (!slab) continue
    if (index > 0 && worldZ < slab.z0 - SLAB_SOFFIT_SNAP_CM) continue
    if (!floorPresentAtElevationX(plan, elev, index, click.x)) continue
    return index
  }
  return -1
}

/** True als floor+1 op deze aanzicht-X een gevel heeft — geen dak eronder. */
export function storeyAboveBlocksRoofAtX(
  plan: FloorPlan,
  elev: FacadeElevation,
  floorIndex: number,
  xCm: number,
): boolean {
  return floorPresentAtElevationX(plan, elev, floorIndex + 1, xCm)
}

/** Aanzicht-Y van de onderkant van déze vloerplaat (goot-snap). */
export function elevationFloorSoffitYAtX(
  plan: FloorPlan,
  elev: FacadeElevation,
  floorIndex: number,
  xCm: number,
): number | null {
  if (!floorPresentAtElevationX(plan, elev, floorIndex, xCm)) return null
  const slab = floorSlabWorldRange(plan, floorIndex)
  return slab ? -slab.z0 : null
}

/** Aanzicht-Y van de verdiepingsvloer erboven, alleen waar die floor op X bestaat. */
export function elevationCeilingYAtX(
  plan: FloorPlan,
  elev: FacadeElevation,
  floorIndex: number,
  xCm: number,
): number | null {
  if (!floorPresentAtElevationX(plan, elev, floorIndex + 1, xCm)) return null
  const ceiling = floorCeilingWorldZ(plan, floorIndex)
  return ceiling == null ? null : -ceiling
}

export function clampElevationYToFloorCeiling(
  plan: FloorPlan,
  elev: FacadeElevation,
  floorIndex: number,
  xCm: number,
  yCm: number,
): number {
  const ceilingY = elevationCeilingYAtX(plan, elev, floorIndex, xCm)
  if (ceilingY == null) return yCm
  return Math.max(yCm, ceilingY)
}

export function clampLocalZToFloorCeiling(
  plan: FloorPlan,
  elev: FacadeElevation,
  floorIndex: number,
  xCm: number,
  localZ: number,
  minZ = 0,
): number {
  const floor = Number.isFinite(localZ) ? localZ : 0
  if (!floorPresentAtElevationX(plan, elev, floorIndex + 1, xCm)) {
    return Math.max(minZ, floor)
  }
  const ceiling = floorCeilingWorldZ(plan, floorIndex)
  if (ceiling == null) return Math.max(minZ, floor)
  const maxZ = Math.max(minZ, Math.round(ceiling - floorWallBaseWorldZ(plan, floorIndex)))
  return Math.min(Math.max(minZ, floor), maxZ)
}

export function withFloorCeilingSnapYs(
  ys: readonly number[],
  ceilingY: number | null,
): number[] {
  const next = ceilingY == null ? [...ys] : ys.filter((y) => y >= ceilingY - 1e-6)
  if (ceilingY != null) next.push(ceilingY)
  return next
}

/**
 * Buitenface → buitenface loodrecht op de gevel, geknipt waar floor+1 het dak bedekt.
 */
export function spanElevationRidgeOnFloor(
  plan: FloorPlan,
  floorIndex: number,
  elev: FacadeElevation,
  xCm: number,
): { a: Point2D; b: Point2D } | null {
  const floor = plan.floors[floorIndex]
  if (!floor) return null
  const axis = elev.axis
  const inward = elevationInwardDir(plan, elev)
  const len = Math.hypot(inward.x, inward.y)
  if (len < 1e-9) return null
  const dir = { x: inward.x / len, y: inward.y / len }
  const base = { x: axis.x * xCm, y: axis.y * xCm }
  const centroid = floorFootprintCentroid(floor)
  const ts: number[] = []
  for (const wall of floor.walls) {
    if (!(wall.thickness > 1e-6)) continue
    const face = wallOuterFace(wall, centroid)
    const hit = intersectLineWithSeg(base, dir, face.a, face.b)
    if (!hit) continue
    if (hit.u < -FACE_HIT_PAD || hit.u > 1 + FACE_HIT_PAD) continue
    ts.push(hit.t)
  }
  if (ts.length < 2) return null
  let tLo = Math.min(...ts)
  let tHi = Math.max(...ts)
  if (tHi - tLo < ELEVATION_RIDGE_MIN_SIZE_CM) return null

  const outward = { x: -dir.x, y: -dir.y }
  const planCentroid = planFootprintCentroid(plan)
  const depthAt = (t: number): number =>
    elevationDepthCm(pointAt(base, dir, t), planCentroid, outward)
  // Facade = hogere diepte (meer naar buiten).
  if (depthAt(tLo) < depthAt(tHi)) {
    const swap = tLo
    tLo = tHi
    tHi = swap
  }

  let tEnd = tHi
  const next = plan.floors[floorIndex + 1]
  if (next) {
    const span = Math.abs(tHi - tLo)
    const steps = Math.max(8, Math.ceil(span / 5))
    let lastExposed = tLo
    for (let i = 0; i <= steps; i += 1) {
      const t = tLo + ((tHi - tLo) * i) / steps
      if (floorInteriorHitsPoint(next, pointAt(base, dir, t))) {
        tEnd = lastExposed
        break
      }
      lastExposed = t
    }
  }

  if (Math.abs(tEnd - tLo) < ELEVATION_RIDGE_MIN_SIZE_CM) return null
  const a = pointAt(base, dir, tLo)
  const b = pointAt(base, dir, tEnd)
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  if (!isPointSkyExposedOnFloor(plan, floorIndex, mid)) return null
  return { a, b }
}

function ridgeGhostRect(click: Point2D, displayWidthCm: number, spanCm: number): ElevationRect {
  const halfW = Math.max(1, displayWidthCm) / 2
  const halfH = Math.max(ELEVATION_RIDGE_MIN_SIZE_CM, spanCm) / 2
  return {
    x0: click.x - halfW,
    x1: click.x + halfW,
    y0: click.y - halfH,
    y1: click.y + halfH,
  }
}

function ridgeZFromClick(
  plan: FloorPlan,
  floorIndex: number,
  clickY: number,
  spanCm: number,
): number {
  const base = floorWallBaseWorldZ(plan, floorIndex)
  const worldCenter = -clickY
  return Math.max(0, Math.round(worldCenter - spanCm / 2 - base))
}

/** Snap X op muurknopen + dakvlak-punten van dezelfde floor (8 cm); Ctrl elders. */
export function snapElevationRidgePlaceX(
  elev: FacadeElevation,
  xCm: number,
  snapOff = false,
  floorIndex?: number,
): number {
  if (snapOff) return xCm
  const xs = elev.junctions
    .filter((item) => !item.ridge && (floorIndex == null || item.floorIndex === floorIndex))
    .map((item) => item.x)
  xs.push(...collectElevationRoofSnapXs(elev, undefined, floorIndex))
  return snapElevationX(xCm, xs, 8)
}

export function previewRidgeFromElevation(
  plan: FloorPlan,
  elev: FacadeElevation,
  click: Point2D,
  options?: { snapOff?: boolean },
): ElevationRidgePlacePreview | null {
  const floorHint = resolveElevationRidgeFloor(plan, elev, click)
  const x = snapElevationRidgePlaceX(
    elev,
    click.x,
    options?.snapOff === true,
    floorHint >= 0 ? floorHint : undefined,
  )
  const snapped = { x, y: click.y }
  const floorIndex = floorHint >= 0 ? floorHint : resolveElevationRidgeFloor(plan, elev, snapped)
  if (floorIndex < 0) return null
  const span = spanElevationRidgeOnFloor(plan, floorIndex, elev, x)
  if (!span) return null
  const spanCm = dakThicknessCmForPlan(plan)
  const zCm = clampLocalZToFloorCeiling(
    plan,
    elev,
    floorIndex,
    x,
    ridgeZFromClick(plan, floorIndex, snapped.y, spanCm),
  )
  return {
    floorIndex,
    a: span.a,
    b: span.b,
    rect: ridgeGhostRect(snapped, ridgeDisplayWidthCm(plan), spanCm),
    zCm,
    spanCm,
  }
}

export function placeRidgeFromElevation(
  plan: FloorPlan,
  elev: FacadeElevation,
  click: Point2D,
  options?: { snapOff?: boolean },
): ElevationRidgePlaceResult | null {
  const preview = previewRidgeFromElevation(plan, elev, click, options)
  if (!preview) return null
  const floor = plan.floors[preview.floorIndex]
  if (!floor) return null
  const wallId = `ridge-${crypto.randomUUID().slice(0, 8)}`
  const extras = ridgeEndpointExtras(floor.height, preview.spanCm, preview.zCm)
  const ridge = markWallAsRidge(
    {
      id: wallId,
      a: { x: preview.a.x, y: preview.a.y },
      b: { x: preview.b.x, y: preview.b.y },
      thickness: 0,
      openings: [],
    },
    extras,
  )
  const next = clonePlanForPlace(plan)
  const existing = listRidgeWallsOnFloor(floor)
  next.floors[preview.floorIndex] = setRidgeWallsOnFloor(floor, [...existing, ridge])
  assignRidgeWallGuids(next, [wallId])
  return { plan: next, wallId, floorIndex: preview.floorIndex }
}
