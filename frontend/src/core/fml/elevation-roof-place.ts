/**
 * Dakvlak plaatsen vanuit kopgevel-aanzicht:
 * 2 klikken (goot + nok) → quad langs bestaande nok naar de andere kant.
 */
import { elevationInwardDir, resolveElevationRidgeFloor } from './elevation-ridge-place'
import { snapElevationX } from './elevation-hit'
import { elevationDepthCm, type FacadeElevation } from './facade-elevation'
import { floorWallBaseWorldZ } from './floor-stack'
import { isPointSkyExposedOnFloor } from './ridge-floor'
import { listRidgeWallsOnFloor } from './ridge-walls'
import {
  listRidgeSurfacesOnFloor,
  makeRoofSurface,
  markRoofSurfaceManual,
  ROOF_SAME_POINT_CM,
  setRidgeSurfacesOnFloor,
  syncRoofPlaneGuidsFromDesigns,
} from './roof-planes'
import { validateRoofOverlap } from './roof-overlap'
import type { FloorPlan, Point2D, Wall } from './types'
import {
  floorFootprintCentroid,
  listFloorOuterFaceCorners,
  planFootprintCentroid,
  wallOuterFace,
} from './wall-outer-face'
import { wallEndpoint3D, type WallEnd } from './wall-endpoint-height'

export type Point3 = Point2D & { z: number }

export type ElevationRoofPlaceDraft = {
  floorIndex: number
  /** Gootpunt (1e klik), plan-cm + z. */
  eave: Point3
  /** Elevatie-cm van de gootklik (ghost). */
  eaveElev: Point2D
}

export type ElevationRoofPlacePreview = {
  floorIndex: number
  poly: Point3[]
  /** Quad in aanzicht-cm (hartlijn), voor ghost-outline. */
  elevPoints: Point2D[]
  ridgeWallId: string
}

export type ElevationRoofPlaceResult = {
  plan: FloorPlan
  surfaceId: string
  floorIndex: number
}

const RIDGE_HIT_SLACK_CM = 40
const AREA_MIN_CM2 = 2500
const MIN_EDGE_CM = 4
const OUTER_CORNER_SNAP_CM = 8
const FACE_HIT_PAD = 0.2

function clonePlanForPlace(plan: FloorPlan): FloorPlan {
  return {
    ...plan,
    floors: [...plan.floors],
    source: plan.source
      ? { ...plan.source, settings: { ...(plan.source.settings ?? {}) } }
      : plan.source,
  }
}

function hypot2(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay)
}

function zFromElevY(plan: FloorPlan, floorIndex: number, elevY: number): number {
  return Math.max(0, Math.round(-elevY - floorWallBaseWorldZ(plan, floorIndex)))
}

function elevYFromZ(plan: FloorPlan, floorIndex: number, zCm: number): number {
  return -(floorWallBaseWorldZ(plan, floorIndex) + zCm)
}

function projectElevX(point: Point2D, axis: Point2D): number {
  return point.x * axis.x + point.y * axis.y
}

/** Bovenkant nok (`az`/`bz`.h), niet onderkant `.z`. */
function ridgeEndpointTopZCm(wall: Wall, end: WallEnd, floorHeightCm: number): number {
  return Math.round(wallEndpoint3D(wall, end, floorHeightCm).h)
}

function polyArea2(poly: readonly Point2D[]): number {
  let sum = 0
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    if (!a || !b) continue
    sum += a.x * b.y - b.x * a.y
  }
  return Math.abs(sum) * 0.5
}

function projectOnSeg(point: Point2D, a: Point2D, b: Point2D): Point2D {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq < 1e-9) return { x: a.x, y: a.y }
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq))
  return { x: a.x + dx * t, y: a.y + dy * t }
}

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

function facadeOutward(plan: FloorPlan, elev: FacadeElevation): Point2D {
  const inward = elevationInwardDir(plan, elev)
  return { x: -inward.x, y: -inward.y }
}

/** Snap X op buitenface-randen + buitenhoeken (niet hartlijn-junctions). */
function snapEaveElevationX(
  plan: FloorPlan,
  elev: FacadeElevation,
  floorIndex: number,
  xCm: number,
  snapOff: boolean,
): number {
  if (snapOff) return xCm
  const xs: number[] = []
  for (const wall of elev.walls) {
    if (wall.ridge || wall.floorIndex !== floorIndex) continue
    xs.push(wall.x0, wall.x1)
  }
  const floor = plan.floors[floorIndex]
  if (floor) {
    for (const corner of listFloorOuterFaceCorners(floor)) {
      xs.push(projectElevX(corner, elev.axis))
    }
  }
  return snapElevationX(xCm, xs, OUTER_CORNER_SNAP_CM)
}

/**
 * Nok-uiteinden op buitenfaces: snij noklijn met buitenfaces,
 * near = gevelkant (hoge diepte), far = andere kant.
 */
function ridgeEndsOnOuterFaces(
  plan: FloorPlan,
  elev: FacadeElevation,
  floorIndex: number,
  ridge: Wall,
): { near: Point2D; far: Point2D } | null {
  const floor = plan.floors[floorIndex]
  if (!floor) return null
  const dx = ridge.b.x - ridge.a.x
  const dy = ridge.b.y - ridge.a.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-9) return null
  const dir = { x: dx / len, y: dy / len }
  const centroid = floorFootprintCentroid(floor)
  const outward = facadeOutward(plan, elev)
  const planCentroid = planFootprintCentroid(plan)
  const hits: Point2D[] = []
  for (const wall of floor.walls) {
    if (!(wall.thickness > 1e-6)) continue
    const face = wallOuterFace(wall, centroid)
    const hit = intersectLineWithSeg(ridge.a, dir, face.a, face.b)
    if (!hit) continue
    if (hit.u < -FACE_HIT_PAD || hit.u > 1 + FACE_HIT_PAD) continue
    hits.push(hit.point)
  }
  if (hits.length < 2) {
    return { near: { x: ridge.a.x, y: ridge.a.y }, far: { x: ridge.b.x, y: ridge.b.y } }
  }
  let near = hits[0]
  let far = hits[0]
  let nearDepth = elevationDepthCm(near, planCentroid, outward)
  let farDepth = nearDepth
  for (const hit of hits) {
    const depth = elevationDepthCm(hit, planCentroid, outward)
    if (depth > nearDepth) {
      near = hit
      nearDepth = depth
    }
    if (depth < farDepth) {
      far = hit
      farDepth = depth
    }
  }
  if (hypot2(near.x, near.y, far.x, far.y) < MIN_EDGE_CM) {
    return { near: { x: ridge.a.x, y: ridge.a.y }, far: { x: ridge.b.x, y: ridge.b.y } }
  }
  return { near, far }
}

/** Gootklik → buitenface / buitenhoek van de voorste gevelmuur op die X. */
export function mapElevationClickToFacadePoint(
  plan: FloorPlan,
  elev: FacadeElevation,
  click: Point2D,
  floorIndex: number,
  options?: { snapOff?: boolean },
): Point3 | null {
  const floor = plan.floors[floorIndex]
  if (!floor) return null
  const x = snapEaveElevationX(plan, elev, floorIndex, click.x, options?.snapOff === true)
  let best: (typeof elev.walls)[number] | null = null
  for (const wall of elev.walls) {
    if (wall.ridge || wall.floorIndex !== floorIndex) continue
    const lo = Math.min(wall.x0, wall.x1)
    const hi = Math.max(wall.x0, wall.x1)
    if (x < lo - 2 || x > hi + 2) continue
    if (!best || wall.depthCm > best.depthCm) best = wall
  }
  if (!best) return null
  const planWall = floor.walls.find((item) => item.id === best.wallId)
  if (!planWall) return null
  const span = best.xb - best.xa
  const t = Math.abs(span) < 1e-6 ? 0.5 : (x - best.xa) / span
  const heart = {
    x: planWall.a.x + (planWall.b.x - planWall.a.x) * t,
    y: planWall.a.y + (planWall.b.y - planWall.a.y) * t,
  }
  const centroid = floorFootprintCentroid(floor)
  const face = wallOuterFace(planWall, centroid)
  let onFace = projectOnSeg(heart, face.a, face.b)
  // Buitenhoek wint op hartlijn-projectie als X dichtbij is.
  let bestCornerDist = OUTER_CORNER_SNAP_CM
  for (const corner of listFloorOuterFaceCorners(floor)) {
    const cx = projectElevX(corner, elev.axis)
    const distX = Math.abs(cx - x)
    if (distX > bestCornerDist) continue
    if (hypot2(corner.x, corner.y, onFace.x, onFace.y) > 80) continue
    bestCornerDist = distX
    onFace = corner
  }
  return { x: onFace.x, y: onFace.y, z: zFromElevY(plan, floorIndex, click.y) }
}

type RidgeSnap = {
  wall: Wall
  nearEnd: WallEnd
  farEnd: WallEnd
  near: Point3
  far: Point3
}

/** Nokklik → kopse nok op floor; near = gevelkant op buitenface; Z = nok-bovenkant. */
export function snapElevationClickToRidge(
  plan: FloorPlan,
  elev: FacadeElevation,
  click: Point2D,
  floorIndex: number,
  options?: { snapOff?: boolean; freeZ?: boolean },
): RidgeSnap | null {
  const floor = plan.floors[floorIndex]
  if (!floor) return null
  const ridges = listRidgeWallsOnFloor(floor)
  if (ridges.length === 0) return null
  const outward = facadeOutward(plan, elev)
  const centroid = planFootprintCentroid(plan)
  const snapOff = options?.snapOff === true
  const freeZ = options?.freeZ === true
  const x = snapOff
    ? click.x
    : snapElevationX(
        click.x,
        elev.walls
          .filter((w) => w.ridge && w.floorIndex === floorIndex)
          .map((w) => (w.x0 + w.x1) / 2),
        RIDGE_HIT_SLACK_CM,
      )

  let best: RidgeSnap | null = null
  let bestDist = RIDGE_HIT_SLACK_CM
  for (const wall of ridges) {
    const elevWall = elev.walls.find(
      (item) => item.ridge && item.wallId === wall.id && item.floorIndex === floorIndex,
    )
    if (elevWall && elevWall.endOn === false) continue
    const depthA = elevationDepthCm(wall.a, centroid, outward)
    const depthB = elevationDepthCm(wall.b, centroid, outward)
    const nearEnd: WallEnd = depthA >= depthB ? 'a' : 'b'
    const farEnd: WallEnd = nearEnd === 'a' ? 'b' : 'a'
    const ends = ridgeEndsOnOuterFaces(plan, elev, floorIndex, wall)
    const nearXy = ends ? ends.near : nearEnd === 'a' ? wall.a : wall.b
    const farXy = ends ? ends.far : farEnd === 'a' ? wall.a : wall.b
    // Houd near/far consistent met depth (buitenfaces kunnen volgorde omdraaien t.o.v. a/b).
    const nearDepth = elevationDepthCm(nearXy, centroid, outward)
    const farDepth = elevationDepthCm(farXy, centroid, outward)
    const orderedNear = nearDepth >= farDepth ? nearXy : farXy
    const orderedFar = nearDepth >= farDepth ? farXy : nearXy
    const elevX = elevWall ? (elevWall.x0 + elevWall.x1) / 2 : projectElevX(orderedNear, elev.axis)
    const dist = Math.abs(elevX - x)
    if (dist > bestDist) continue
    const topNear = ridgeEndpointTopZCm(wall, nearEnd, floor.height)
    const topFar = ridgeEndpointTopZCm(wall, farEnd, floor.height)
    const z = freeZ ? zFromElevY(plan, floorIndex, click.y) : topNear
    const farZ = freeZ ? z : topFar
    bestDist = dist
    best = {
      wall,
      nearEnd,
      farEnd,
      near: { x: orderedNear.x, y: orderedNear.y, z },
      far: { x: orderedFar.x, y: orderedFar.y, z: farZ },
    }
  }
  return best
}

/** Quad: goot→nok langs de nok naar de andere kant. */
export function buildRoofQuadFromGableEdge(nearEave: Point3, ridge: RidgeSnap): Point3[] | null {
  const nearRidge = ridge.near
  const farRidge = ridge.far
  const dx = farRidge.x - nearRidge.x
  const dy = farRidge.y - nearRidge.y
  const span = Math.hypot(dx, dy)
  if (span < MIN_EDGE_CM) return null
  if (hypot2(nearEave.x, nearEave.y, nearRidge.x, nearRidge.y) < MIN_EDGE_CM) return null
  const farEave: Point3 = {
    x: nearEave.x + dx,
    y: nearEave.y + dy,
    z: nearEave.z,
  }
  const poly = [nearEave, nearRidge, farRidge, farEave]
  if (polyArea2(poly) < AREA_MIN_CM2) return null
  return poly
}

function elevPointsFromPoly(
  plan: FloorPlan,
  elev: FacadeElevation,
  floorIndex: number,
  poly: readonly Point3[],
): Point2D[] {
  return poly.map((point) => ({
    x: projectElevX(point, elev.axis),
    y: elevYFromZ(plan, floorIndex, point.z),
  }))
}

export function beginRoofPlaceFromElevation(
  plan: FloorPlan,
  elev: FacadeElevation,
  click: Point2D,
  options?: { snapOff?: boolean },
): ElevationRoofPlaceDraft | null {
  const floorIndexHint = resolveElevationRidgeFloor(plan, elev, click)
  if (floorIndexHint < 0) return null
  const x = snapEaveElevationX(plan, elev, floorIndexHint, click.x, options?.snapOff === true)
  const snapped = { x, y: click.y }
  const floorIndex = resolveElevationRidgeFloor(plan, elev, snapped)
  if (floorIndex < 0) return null
  const eave = mapElevationClickToFacadePoint(plan, elev, snapped, floorIndex, options)
  if (!eave) return null
  return {
    floorIndex,
    eave,
    eaveElev: { x, y: elevYFromZ(plan, floorIndex, eave.z) },
  }
}

export function previewRoofFromElevation(
  plan: FloorPlan,
  elev: FacadeElevation,
  draft: ElevationRoofPlaceDraft,
  click: Point2D,
  options?: { snapOff?: boolean; freeZ?: boolean },
): ElevationRoofPlacePreview | null {
  const ridge = snapElevationClickToRidge(plan, elev, click, draft.floorIndex, options)
  if (!ridge) return null
  const poly = buildRoofQuadFromGableEdge(draft.eave, ridge)
  if (!poly) return null
  const mid = {
    x: (poly[0].x + poly[2].x) / 2,
    y: (poly[0].y + poly[2].y) / 2,
  }
  if (!isPointSkyExposedOnFloor(plan, draft.floorIndex, mid)) return null
  return {
    floorIndex: draft.floorIndex,
    poly,
    elevPoints: elevPointsFromPoly(plan, elev, draft.floorIndex, poly),
    ridgeWallId: ridge.wall.id,
  }
}

export function placeRoofFromElevation(
  plan: FloorPlan,
  elev: FacadeElevation,
  draft: ElevationRoofPlaceDraft,
  click: Point2D,
  options?: { snapOff?: boolean; freeZ?: boolean },
): ElevationRoofPlaceResult | null {
  const preview = previewRoofFromElevation(plan, elev, draft, click, options)
  if (!preview) return null
  const floor = plan.floors[preview.floorIndex]
  if (!floor) return null
  const surfaceId = `roof-${crypto.randomUUID().slice(0, 8)}`
  const existing = listRidgeSurfacesOnFloor(floor)
  const surface = markRoofSurfaceManual(
    makeRoofSurface({
      id: surfaceId,
      poly: preview.poly,
      origin: 'manual',
    }),
  )
  if (validateRoofOverlap(surface, existing)) return null
  const next = clonePlanForPlace(plan)
  next.floors[preview.floorIndex] = setRidgeSurfacesOnFloor(floor, [...existing, surface])
  syncRoofPlaneGuidsFromDesigns(next)
  return { plan: next, surfaceId, floorIndex: preview.floorIndex }
}

/** Hover-punt voor rubber-band (goot → muis) in aanzicht-cm. */
export function roofPlaceHoverElevPoint(
  plan: FloorPlan,
  elev: FacadeElevation,
  draft: ElevationRoofPlaceDraft,
  click: Point2D,
  options?: { snapOff?: boolean; freeZ?: boolean },
): Point2D {
  const ridge = snapElevationClickToRidge(plan, elev, click, draft.floorIndex, options)
  if (ridge) {
    return {
      x: projectElevX(ridge.near, elev.axis),
      y: elevYFromZ(plan, draft.floorIndex, ridge.near.z),
    }
  }
  const x = snapEaveElevationX(plan, elev, draft.floorIndex, click.x, options?.snapOff === true)
  return { x, y: click.y }
}

export { ROOF_SAME_POINT_CM }
