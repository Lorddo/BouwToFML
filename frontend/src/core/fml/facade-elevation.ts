/**
 * Projectie van één gevelgroep op een 2D-aanzicht (alle floors gestapeld).
 * X = langs het gevelvlak; Y = −worldZ (grond onderaan in Y-omlaag-canvas).
 */
import {
  DEFAULT_FML_DOOR_HEIGHT_CM,
  DEFAULT_FML_WINDOW_HEIGHT_CM,
  DEFAULT_FML_WINDOW_SILL_Z_CM,
} from './extraction-to-plan-types'
import { readElevationProjection, type ElevationProjectionMode } from './elevation-views'
import { listElevationFacadeGroups, wallGuidsInGroup } from './facade-groups'
import { floorSlabWorldRange, floorWallBaseWorldZ, readFloorStack } from './floor-stack'
import {
  elevationFaceXs,
  elevationRidgeIsEndOn,
  resolveElevationWallEndFaces,
  ridgeElevationFaceXs,
} from './elevation-wall-faces'
import {
  dakThicknessCmForPlan,
  listRidgeWallsOnFloor,
  ridgeAwareNokWorldRange,
  ridgeDisplayWidthCm,
  ridgeEndpointZCm,
} from './ridge-walls'
import {
  BOVENLICHT_GAP_CM,
  BOVENLICHT_HEIGHT_CM,
  buildBovenlichtOpening,
  readBovenlichtPacked,
  resolveBovenlichtGapCm,
  resolveBovenlichtHeightCm,
  resolveDoorBovenlicht,
  resolveWindowBovenlicht,
} from './bovenlicht'
import { ROOF_TOUCH_SLACK_CM, listRidgeSurfacesOnFloor } from './roof-planes'
import { buildLocalOpeningId, encodePlanOpeningId } from './opening-ids'
import {
  CONCEPT_WINDOW_REFID,
  type Floor,
  type FloorPlan,
  type FloorSurface,
  type FmlExtras,
  type Opening,
  type OpeningType,
  type Point2D,
  type Wall,
} from './types'
import {
  parseEndpoint3D,
  wallElevationAtT,
  wallEndpointHeightCm,
  type Endpoint3D,
  type WallEnd,
} from './wall-endpoint-height'
import { planFootprintCentroid, wallInnerFace, wallOuterFace } from './wall-outer-face'

/** Per-floor defaults voor effectieve bovenlicht-flag in het aanzicht. */
export type ElevationBovenlichtDefaults = {
  doorDefault: boolean
  windowDefault: boolean
  heightCm: number
  gapCm: number
}

export type ElevationBovenlichtResolver = (floorIndex: number) => ElevationBovenlichtDefaults

/** Hoek t.o.v. loodrecht: kleiner → return-wand, weglaten. */
export const ELEVATION_RETURN_MAX_DOT = Math.cos((65 * Math.PI) / 180)

export type ElevationRect = {
  x0: number
  y0: number
  x1: number
  y1: number
}

export type ElevationWallRect = ElevationRect & {
  wallId: string
  floorIndex: number
  xa: number
  xb: number
  ridge?: boolean
  /** Kopse kant: eindvlak i.p.v. lange balk — sleepbaar zoals een opening. */
  endOn?: boolean
  /** Eindpunt A/B in aanzicht-cm (Y = −worldZ); X = buitenkant, top-Y volgt hartlijn `az`/`bz`. */
  aTop: Point2D
  aBottom: Point2D
  bTop: Point2D
  bBottom: Point2D
  /** Binnenkant (stippellijn); X wijkt af van de buitenkant bij dikte/knoop. */
  innerATop: Point2D
  innerABottom: Point2D
  innerBTop: Point2D
  innerBBottom: Point2D
  /** Diepte t.o.v. gebouw-centroid langs de kijkrichting; groter = dichter bij de kijker. */
  depthCm: number
}

export type ElevationOpeningRect = ElevationRect & {
  openingId: string
  openingGuid: string
  wallId: string
  floorIndex: number
  type: OpeningType
  refid: string
  mirrored?: [number, number]
  /** FML-breedte (cm), ongeprojecteerd — kozijn-X schalen met (x1−x0)/widthCm. */
  widthCm: number
  extras?: FmlExtras
  /** Muur-a ligt links in het aanzicht (`xa <= xb`); scharnier/kruk-X. */
  startOnLeft?: boolean
  /** Zelfde diepte als de host-muur; groter = vóór. */
  depthCm: number
}

export type ElevationBand = ElevationRect & {
  kind: 'slab' | 'nok'
  floorIndex?: number
}

/** Dakvlak op dit aanzicht: goot-gevel of kopse kil. */
export type ElevationRoofPlane = {
  id: string
  floorIndex: number
  /** Hart van de plaat = echte surface-punten (handles / Z-edit). */
  points: Point2D[]
  /** Gesimuleerde plaat: nokdikte verdeeld boven én onder het hart. */
  fillPoints: Point2D[]
  color: string
}

/** Grijs per gevelgroep — afwijkend van muur `#94a3b8`. */
export const ELEVATION_ROOF_FILL_GRAYS = [
  '#64748b',
  '#78716c',
  '#57534e',
  '#6b7280',
  '#a8a29e',
  '#52525b',
] as const

const ROOF_EAVE_PARALLEL_DOT = 0.92
const ROOF_FACADE_BBOX_PAD_CM = 80
const ROOF_PROJECTED_AREA_MIN_CM2 = 100

type ElevationFacadeWall = {
  wall: Wall
  floorIndex: number
}

export type ElevationJunction = {
  id: string
  x: number
  floorIndex: number
  yTop: number
  yBot: number
  heightCm: number
  refs: Array<{ wallId: string; end: WallEnd }>
  /** Nok-uiteinde: `heightCm` = onderkant (`az`/`bz`.z), niet muurtop. */
  ridge?: boolean
}

export type FacadeElevation = {
  groupId: string
  axis: Point2D
  origin: Point2D
  walls: ElevationWallRect[]
  openings: ElevationOpeningRect[]
  /** Afgeleide bovenlichten (zelfde openingId als ouder). */
  transoms: ElevationOpeningRect[]
  bands: ElevationBand[]
  roofPlanes: ElevationRoofPlane[]
  junctions: ElevationJunction[]
  bounds: ElevationRect
}

function wallLen(wall: Pick<Wall, 'a' | 'b'>): number {
  return Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y)
}

function unit(dx: number, dy: number): Point2D | null {
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return null
  return { x: dx / len, y: dy / len }
}

function flipConsistent(dir: Point2D): Point2D {
  if (dir.x < -1e-9 || (Math.abs(dir.x) <= 1e-9 && dir.y < 0)) {
    return { x: -dir.x, y: -dir.y }
  }
  return dir
}

function projectOnAxis(point: Point2D, origin: Point2D, axis: Point2D): number {
  return (point.x - origin.x) * axis.x + (point.y - origin.y) * axis.y
}

function wallPlanMid(wall: Pick<Wall, 'a' | 'b'>): Point2D {
  return { x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 }
}

/**
 * Kijkrichting loodrecht op de gevel-as, naar buiten (weg van de centroid).
 * Parallelle gevels in één groep: serre verder naar buiten = grotere diepte = vóór.
 */
export function elevationOutwardPerp(
  axis: Point2D,
  centroid: Point2D,
  mids: readonly Point2D[],
): Point2D {
  const perp = { x: -axis.y, y: axis.x }
  let sum = 0
  for (const mid of mids) {
    sum += (mid.x - centroid.x) * perp.x + (mid.y - centroid.y) * perp.y
  }
  return sum < -1e-6 ? { x: -perp.x, y: -perp.y } : perp
}

export function elevationDepthCm(mid: Point2D, centroid: Point2D, outward: Point2D): number {
  return (mid.x - centroid.x) * outward.x + (mid.y - centroid.y) * outward.y
}

export function compareElevationPainter(
  a: { depthCm: number; floorIndex: number; wallId: string },
  b: { depthCm: number; floorIndex: number; wallId: string },
): number {
  return a.depthCm - b.depthCm || a.floorIndex - b.floorIndex || a.wallId.localeCompare(b.wallId)
}

/** Muren/openingen binnen deze diepte horen bij hetzelfde gevelvlak (gesplitste muur). */
export const ELEVATION_SAME_PLANE_CM = 8

export function elevationRoofFillColor(groupId: string, groupIndex = -1): string {
  const slot =
    groupIndex >= 0
      ? groupIndex
      : Math.abs([...groupId].reduce((hash, ch) => (hash * 31 + ch.charCodeAt(0)) | 0, 0))
  return ELEVATION_ROOF_FILL_GRAYS[slot % ELEVATION_ROOF_FILL_GRAYS.length]
}

function hypot2(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay)
}

function distPointToInfiniteLine(point: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-9) return hypot2(point.x, point.y, a.x, a.y)
  return Math.abs((point.x - a.x) * dy - (point.y - a.y) * dx) / len
}

function facadeWallsBounds(walls: readonly ElevationFacadeWall[]): {
  minX: number
  maxX: number
  minY: number
  maxY: number
} | null {
  if (walls.length === 0) return null
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const member of walls) {
    minX = Math.min(minX, member.wall.a.x, member.wall.b.x)
    maxX = Math.max(maxX, member.wall.a.x, member.wall.b.x)
    minY = Math.min(minY, member.wall.a.y, member.wall.b.y)
    maxY = Math.max(maxY, member.wall.a.y, member.wall.b.y)
  }
  if (!Number.isFinite(minX)) return null
  return { minX, maxX, minY, maxY }
}

function edgeOverlapsBounds(
  pa: Point2D,
  pb: Point2D,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  padCm: number,
): boolean {
  const loX = Math.min(pa.x, pb.x)
  const hiX = Math.max(pa.x, pb.x)
  const loY = Math.min(pa.y, pb.y)
  const hiY = Math.max(pa.y, pb.y)
  return (
    hiX >= bounds.minX - padCm &&
    loX <= bounds.maxX + padCm &&
    hiY >= bounds.minY - padCm &&
    loY <= bounds.maxY + padCm
  )
}

function polyAreaCm2(points: readonly Point2D[]): number {
  let area = 0
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    if (!a || !b) continue
    area += a.x * b.y - b.x * a.y
  }
  return Math.abs(area) / 2
}

function roofEdgeAlongFacadeWall(
  pa: Point2D,
  pb: Point2D,
  member: ElevationFacadeWall,
  centroid: Point2D,
): boolean {
  const wall = member.wall
  const edgeDir = unit(pb.x - pa.x, pb.y - pa.y)
  if (!edgeDir) return false
  const outer = wallOuterFace(wall, centroid)
  const inner = wallInnerFace(wall, centroid)
  const wallDir = unit(outer.b.x - outer.a.x, outer.b.y - outer.a.y)
  if (!wallDir) return false
  if (Math.abs(edgeDir.x * wallDir.x + edgeDir.y * wallDir.y) < ROOF_EAVE_PARALLEL_DOT) return false
  const pad = ROOF_TOUCH_SLACK_CM + Math.max(0, wall.thickness)
  return [outer, inner, { a: wall.a, b: wall.b }].some((face) => {
    const distA = distPointToInfiniteLine(pa, face.a, face.b)
    const distB = distPointToInfiniteLine(pb, face.a, face.b)
    return Math.max(distA, distB) <= pad
  })
}

/**
 * Goot (langgevel) of kil/rake (kopgevel): rand evenwijdig en vlakbij de gevel.
 * Geen Z-match — kopgeveltops volgen de daklijn vaak niet.
 */
export function roofSurfaceTouchesFacadeWalls(
  surface: FloorSurface,
  walls: readonly ElevationFacadeWall[],
  centroid: Point2D,
  _plan?: FloorPlan,
  _roofFloorIndex?: number,
): boolean {
  const poly = surface.poly
  if (poly.length < 2 || walls.length === 0) return false
  const bounds = facadeWallsBounds(walls)
  if (!bounds) return false
  for (let i = 0; i < poly.length; i += 1) {
    const pa = poly[i]
    const pb = poly[(i + 1) % poly.length]
    if (!pa || !pb) continue
    if (!edgeOverlapsBounds(pa, pb, bounds, ROOF_FACADE_BBOX_PAD_CM)) continue
    if (walls.some((member) => roofEdgeAlongFacadeWall(pa, pb, member, centroid))) {
      return true
    }
  }
  return false
}

function elevY(worldZ: number): number {
  return -worldZ
}

function cross2(origin: Point2D, a: Point2D, b: Point2D): number {
  return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x)
}

/** Monotone-chain hull; nodig omdat top+onderkant anders zelf-overlapt. */
function convexHull2(points: readonly Point2D[]): Point2D[] {
  const sorted = points
    .map((point) => ({ x: point.x, y: point.y }))
    .sort((a, b) => a.x - b.x || a.y - b.y)
  if (sorted.length <= 2) return sorted
  const lower: Point2D[] = []
  for (const point of sorted) {
    while (
      lower.length >= 2 &&
      cross2(lower[lower.length - 2], lower[lower.length - 1], point) <= 0
    ) {
      lower.pop()
    }
    lower.push(point)
  }
  const upper: Point2D[] = []
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const point = sorted[i]
    while (
      upper.length >= 2 &&
      cross2(upper[upper.length - 2], upper[upper.length - 1], point) <= 0
    ) {
      upper.pop()
    }
    upper.push(point)
  }
  lower.pop()
  upper.pop()
  return [...lower, ...upper]
}

/**
 * Simuleer dakplaat-dikte in aanzicht: `points` = hart (handles),
 * vul = convexe omhulling van ±halve nokdikte (verticaal). Ook een lijn
 * (kopse projectie) wordt zo een zichtbare plaat.
 */
export function thickenElevationRoofPoly(
  points: readonly Point2D[],
  thicknessCm: number,
): Point2D[] {
  const base = points.map((point) => ({ x: point.x, y: point.y }))
  if (base.length < 2 || thicknessCm <= 0) return base
  const half = thicknessCm / 2
  const above = base.map((point) => ({ x: point.x, y: point.y - half }))
  const below = base.map((point) => ({ x: point.x, y: point.y + half }))
  const hull = convexHull2([...above, ...below])
  return hull.length >= 3 ? hull : base
}

function openingHeightCm(opening: Opening): number {
  if (typeof opening.z_height === 'number' && Number.isFinite(opening.z_height)) {
    return opening.z_height
  }
  return opening.type === 'window' ? DEFAULT_FML_WINDOW_HEIGHT_CM : DEFAULT_FML_DOOR_HEIGHT_CM
}

function openingSillCm(opening: Opening): number {
  if (typeof opening.z === 'number' && Number.isFinite(opening.z)) return opening.z
  return opening.type === 'window' ? DEFAULT_FML_WINDOW_SILL_Z_CM : 0
}

export function localElevationOpeningId(
  wallId: string,
  opening: Opening,
  openingIndex: number,
): string {
  return buildLocalOpeningId(wallId, opening, openingIndex)
}

/** Uniek over floors: zelfde muur-id + guid komt voor bij gestapelde gevels. */
export function elevationOpeningId(
  wallId: string,
  opening: Opening,
  openingIndex: number,
  floorIndex: number,
): string {
  return encodePlanOpeningId(floorIndex, localElevationOpeningId(wallId, opening, openingIndex))
}

function wallEndpoints(wall: Wall, floorHeightCm: number): { az: Endpoint3D; bz: Endpoint3D } {
  return {
    az: parseEndpoint3D(wall.extras?.az, floorHeightCm),
    bz: parseEndpoint3D(wall.extras?.bz, floorHeightCm),
  }
}

function collectGroupWalls(
  plan: FloorPlan,
  groupId: string,
): Array<{ wall: Wall; floorIndex: number; floor: Floor }> {
  const ids = new Set(wallGuidsInGroup(plan, groupId))
  if (ids.size === 0) return []
  const out: Array<{ wall: Wall; floorIndex: number; floor: Floor }> = []
  plan.floors.forEach((floor, floorIndex) => {
    for (const wall of floor.walls) {
      if (!ids.has(wall.id)) continue
      out.push({ wall, floorIndex, floor })
    }
  })
  return out
}

/** Snap een as naar de dichtstbijzijnde wereld-H/V (architect-aanzicht). */
export function snapElevationAxisOrtho(dir: Point2D): Point2D {
  if (Math.abs(dir.x) >= Math.abs(dir.y)) {
    return flipConsistent({ x: dir.x >= 0 ? 1 : -1, y: 0 })
  }
  return flipConsistent({ x: 0, y: dir.y >= 0 ? 1 : -1 })
}

export function resolveElevationAxis(
  walls: ReadonlyArray<Pick<Wall, 'a' | 'b'>>,
  mode: ElevationProjectionMode = 'architect',
): Point2D | null {
  const dirs: Array<{ dir: Point2D; len: number }> = []
  for (const wall of walls) {
    const dir = unit(wall.b.x - wall.a.x, wall.b.y - wall.a.y)
    if (!dir) continue
    dirs.push({ dir: flipConsistent(dir), len: wallLen(wall) })
  }
  if (dirs.length === 0) return null
  dirs.sort((a, b) => a.dir.x - b.dir.x || a.dir.y - b.dir.y)
  const mid = dirs[Math.floor(dirs.length / 2)]
  const raw = mid?.dir ?? dirs.sort((a, b) => b.len - a.len)[0]?.dir
  if (!raw) return null
  return mode === 'projective' ? raw : snapElevationAxisOrtho(raw)
}

function emptyBounds(): ElevationRect {
  return { x0: 0, y0: 0, x1: 1, y1: 1 }
}

function unionBounds(rects: ElevationRect[]): ElevationRect {
  if (rects.length === 0) return emptyBounds()
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const rect of rects) {
    x0 = Math.min(x0, rect.x0, rect.x1)
    y0 = Math.min(y0, rect.y0, rect.y1)
    x1 = Math.max(x1, rect.x0, rect.x1)
    y1 = Math.max(y1, rect.y0, rect.y1)
  }
  if (!Number.isFinite(x0) || !Number.isFinite(y0)) return emptyBounds()
  return { x0, y0, x1: Math.max(x1, x0 + 1), y1: Math.max(y1, y0 + 1) }
}

export function projectFacadeElevation(
  plan: FloorPlan,
  groupId: string,
  bovenlichtDefaults?: ElevationBovenlichtResolver,
): FacadeElevation | null {
  const group = listElevationFacadeGroups(plan).find((entry) => entry.id === groupId)
  if (!group) return null
  const members = collectGroupWalls(plan, groupId)
  const axis = resolveElevationAxis(
    members.map((item) => item.wall),
    readElevationProjection(plan),
  )
  if (!axis) {
    return {
      groupId,
      axis: { x: 1, y: 0 },
      origin: { x: 0, y: 0 },
      walls: [],
      openings: [],
      transoms: [],
      bands: [],
      roofPlanes: [],
      junctions: [],
      bounds: emptyBounds(),
    }
  }

  const elevAxis = axis
  /** X = p · axis zodat nulpunt (0,0) op X=0 ligt. */
  const lineOrigin: Point2D = { x: 0, y: 0 }
  const centroid = planFootprintCentroid(plan)
  const outward = elevationOutwardPerp(
    elevAxis,
    centroid,
    members.map((item) => wallPlanMid(item.wall)),
  )

  const walls: ElevationWallRect[] = []
  const openings: ElevationOpeningRect[] = []
  const transoms: ElevationOpeningRect[] = []

  function resolveFloorBovenlicht(floorIndex: number): ElevationBovenlichtDefaults {
    if (bovenlichtDefaults) return bovenlichtDefaults(floorIndex)
    return {
      doorDefault: false,
      windowDefault: false,
      heightCm: BOVENLICHT_HEIGHT_CM,
      gapCm: BOVENLICHT_GAP_CM,
    }
  }

  function pushWallRect(
    wall: Wall,
    floorIndex: number,
    floor: Floor,
    skipReturnFilter: boolean,
    ridge: boolean,
  ): void {
    const dir = unit(wall.b.x - wall.a.x, wall.b.y - wall.a.y)
    if (!dir) return
    const along = Math.abs(dir.x * elevAxis.x + dir.y * elevAxis.y)
    if (!skipReturnFilter && along < ELEVATION_RETURN_MAX_DOT) return
    const xa = projectOnAxis(wall.a, lineOrigin, elevAxis)
    const xb = projectOnAxis(wall.b, lineOrigin, elevAxis)
    const { xOuterA, xOuterB, xInnerA, xInnerB } = ridge
      ? ridgeElevationFaceXs(xa, xb, wallLen(wall), ridgeDisplayWidthCm(plan))
      : elevationFaceXs(xa, xb, resolveElevationWallEndFaces(wall, floor.walls))
    const base = floorWallBaseWorldZ(plan, floorIndex)
    const ends = wallEndpoints(wall, floor.height)
    const aTop = { x: xOuterA, y: elevY(base + ends.az.h) }
    const aBottom = { x: xOuterA, y: elevY(base + ends.az.z) }
    const bTop = { x: xOuterB, y: elevY(base + ends.bz.h) }
    const bBottom = { x: xOuterB, y: elevY(base + ends.bz.z) }
    const innerATop = { x: xInnerA, y: aTop.y }
    const innerABottom = { x: xInnerA, y: aBottom.y }
    const innerBTop = { x: xInnerB, y: bTop.y }
    const innerBBottom = { x: xInnerB, y: bBottom.y }
    const ys = [aTop.y, aBottom.y, bTop.y, bBottom.y]
    walls.push({
      wallId: wall.id,
      floorIndex,
      depthCm: elevationDepthCm(wallPlanMid(wall), centroid, outward),
      xa,
      xb,
      ridge,
      endOn: ridge ? elevationRidgeIsEndOn(xa, xb, wallLen(wall)) : undefined,
      aTop,
      aBottom,
      bTop,
      bBottom,
      innerATop,
      innerABottom,
      innerBTop,
      innerBBottom,
      x0: Math.min(xOuterA, xOuterB, xInnerA, xInnerB),
      x1: Math.max(xOuterA, xOuterB, xInnerA, xInnerB),
      y0: Math.min(...ys),
      y1: Math.max(...ys),
    })
  }

  for (const { wall, floorIndex, floor } of members) {
    pushWallRect(wall, floorIndex, floor, false, false)
    const dir = unit(wall.b.x - wall.a.x, wall.b.y - wall.a.y)
    if (!dir) continue
    const along = Math.abs(dir.x * elevAxis.x + dir.y * elevAxis.y)
    if (along < ELEVATION_RETURN_MAX_DOT) continue
    const xa = projectOnAxis(wall.a, lineOrigin, elevAxis)
    const xb = projectOnAxis(wall.b, lineOrigin, elevAxis)
    const base = floorWallBaseWorldZ(plan, floorIndex)

    wall.openings.forEach((opening, openingIndex) => {
      const t = Number.isFinite(opening.t) ? opening.t : 0.5
      const width = Math.max(1, opening.width)
      const projWidth = width * along
      const xCenter = xa + (xb - xa) * t
      const sill = openingSillCm(opening)
      const height = openingHeightCm(opening)
      const z0 = base + sill
      const z1 = z0 + height
      const guid = opening.guid?.trim() || `${wall.id}:${openingIndex}`
      const openingId = elevationOpeningId(wall.id, opening, openingIndex, floorIndex)
      const x0 = xCenter - projWidth / 2
      const x1 = xCenter + projWidth / 2
      const startOnLeft = xa <= xb
      const depthCm = elevationDepthCm(wallPlanMid(wall), centroid, outward)
      openings.push({
        openingId,
        openingGuid: guid,
        wallId: wall.id,
        floorIndex,
        type: opening.type,
        refid: opening.refid,
        mirrored: opening.mirrored,
        widthCm: width,
        extras: opening.extras,
        startOnLeft,
        depthCm,
        x0,
        x1,
        y0: elevY(z1),
        y1: elevY(z0),
      })

      const floorDefaults = resolveFloorBovenlicht(floorIndex)
      const on =
        readBovenlichtPacked(plan) &&
        (opening.type === 'door'
          ? resolveDoorBovenlicht(opening, floorDefaults.doorDefault)
          : opening.type === 'window'
            ? resolveWindowBovenlicht(opening, floorDefaults.windowDefault)
            : false)
      if (!on) return
      const wallTopCm = wallElevationAtT(wall, t, floor.height).h
      const transom = buildBovenlichtOpening(opening, {
        floorHeightCm: wallTopCm,
        sourceGuid: opening.guid,
        heightCm: resolveBovenlichtHeightCm(opening, floorDefaults.heightCm),
        gapCm: resolveBovenlichtGapCm(opening, floorDefaults.gapCm),
      })
      if (!transom) return
      const tz0 = base + (transom.z ?? 0)
      const tz1 = tz0 + (transom.z_height ?? 0)
      if (!(tz1 > tz0)) return
      transoms.push({
        openingId,
        openingGuid: guid,
        wallId: wall.id,
        floorIndex,
        type: 'window',
        refid: transom.refid || CONCEPT_WINDOW_REFID,
        mirrored: transom.mirrored,
        widthCm: transom.width,
        startOnLeft,
        depthCm,
        x0,
        x1,
        y0: elevY(tz1),
        y1: elevY(tz0),
      })
    })
  }

  plan.floors.forEach((floor, floorIndex) => {
    for (const wall of listRidgeWallsOnFloor(floor)) {
      pushWallRect(wall, floorIndex, floor, true, true)
    }
  })

  walls.sort(compareElevationPainter)
  openings.sort(compareElevationPainter)
  transoms.sort(compareElevationPainter)

  const facadeGroupIndex = listElevationFacadeGroups(plan).findIndex(
    (entry) => entry.id === groupId,
  )
  const roofColor = elevationRoofFillColor(groupId, facadeGroupIndex)
  const facadeWalls: ElevationFacadeWall[] = members.map((item) => ({
    wall: item.wall,
    floorIndex: item.floorIndex,
  }))
  const roofPlanes: ElevationRoofPlane[] = []
  const roofThicknessCm = dakThicknessCmForPlan(plan)
  plan.floors.forEach((floor, floorIndex) => {
    if (facadeWalls.length === 0) return
    const base = floorWallBaseWorldZ(plan, floorIndex)
    listRidgeSurfacesOnFloor(floor).forEach((surface) => {
      if (!roofSurfaceTouchesFacadeWalls(surface, facadeWalls, centroid, plan, floorIndex)) return
      const points = surface.poly.map((point) => ({
        x: projectOnAxis(point, lineOrigin, elevAxis),
        y: elevY(base + (point.z ?? 0)),
      }))
      const fillPoints = thickenElevationRoofPoly(points, roofThicknessCm)
      const ring = fillPoints.length >= 3 ? fillPoints : points
      if (ring.length < 3 || polyAreaCm2(ring) < ROOF_PROJECTED_AREA_MIN_CM2) return
      roofPlanes.push({
        id: surface.id,
        floorIndex,
        points,
        fillPoints,
        color: roofColor,
      })
    })
  })

  const bands: ElevationBand[] = []
  const facadeXs = walls.filter((w) => !w.ridge).flatMap((w) => [w.x0, w.x1])
  const xs =
    facadeXs.length > 0 ? facadeXs : walls.length > 0 ? walls.flatMap((w) => [w.x0, w.x1]) : [0, 1]
  const fallbackX0 = Math.min(...xs)
  const fallbackX1 = Math.max(...xs)
  plan.floors.forEach((_, floorIndex) => {
    const range = floorSlabWorldRange(plan, floorIndex)
    if (!range) return
    const floorXs = walls
      .filter((w) => !w.ridge && w.floorIndex === floorIndex)
      .flatMap((w) => [w.x0, w.x1])
    if (floorXs.length === 0) return
    bands.push({
      kind: 'slab',
      floorIndex,
      x0: Math.min(...floorXs),
      x1: Math.max(...floorXs),
      y0: elevY(range.z1),
      y1: elevY(range.z0),
    })
  })
  const ridgeRects = walls.filter((w) => w.ridge)
  if (ridgeRects.length > 0) {
    for (const ridge of ridgeRects) {
      bands.push({
        kind: 'nok',
        x0: ridge.x0,
        x1: ridge.x1,
        y0: ridge.y0,
        y1: ridge.y1,
      })
    }
  } else if (readFloorStack(plan).nokThicknessCm > 0) {
    const nok = ridgeAwareNokWorldRange(plan)
    bands.push({
      kind: 'nok',
      x0: fallbackX0,
      x1: fallbackX1,
      y0: elevY(nok.z1),
      y1: elevY(nok.z0),
    })
  }

  const junctions = collectElevationJunctions(walls, plan)

  return {
    groupId,
    axis,
    origin: lineOrigin,
    walls,
    openings,
    transoms,
    bands,
    roofPlanes,
    junctions,
    bounds: unionBounds([
      ...walls,
      ...openings,
      ...transoms,
      ...bands,
      ...roofPlanes.map((plane) => {
        const ring = plane.fillPoints.length >= 3 ? plane.fillPoints : plane.points
        return {
          x0: Math.min(...ring.map((point) => point.x)),
          x1: Math.max(...ring.map((point) => point.x)),
          y0: Math.min(...ring.map((point) => point.y)),
          y1: Math.max(...ring.map((point) => point.y)),
        }
      }),
    ]),
  }
}

function findElevationSrcWall(
  plan: FloorPlan,
  wall: ElevationWallRect,
): { floor: Floor; src: Wall } | null {
  const floor = plan.floors[wall.floorIndex]
  if (!floor) return null
  const src = wall.ridge
    ? listRidgeWallsOnFloor(floor).find((item) => item.id === wall.wallId)
    : floor.walls.find((item) => item.id === wall.wallId)
  return src ? { floor, src } : null
}

function collectElevationJunctions(
  walls: readonly ElevationWallRect[],
  plan: FloorPlan,
): ElevationJunction[] {
  type Acc = {
    x: number
    floorIndex: number
    yTop: number
    yBot: number
    refs: Array<{ wallId: string; end: WallEnd }>
    heights: number[]
    ridge: boolean
  }
  const grouped = new Map<string, Acc>()
  for (const wall of walls) {
    if (wall.ridge && wall.endOn) continue
    const located = findElevationSrcWall(plan, wall)
    if (!located) continue
    const ridge = wall.ridge === true
    const ends: Array<{ end: WallEnd; x: number; yTop: number; yBot: number }> = [
      { end: 'a', x: wall.xa, yTop: wall.aTop.y, yBot: wall.aBottom.y },
      { end: 'b', x: wall.xb, yTop: wall.bTop.y, yBot: wall.bBottom.y },
    ]
    for (const item of ends) {
      const key = `${ridge ? 'r' : 'w'}:${wall.floorIndex}:${Math.round(item.x * 2) / 2}`
      const heightCm = ridge
        ? ridgeEndpointZCm(located.src, item.end, located.floor.height)
        : wallEndpointHeightCm(located.src, item.end, located.floor.height)
      const existing = grouped.get(key)
      if (!existing) {
        grouped.set(key, {
          x: item.x,
          floorIndex: wall.floorIndex,
          yTop: item.yTop,
          yBot: item.yBot,
          refs: [{ wallId: wall.wallId, end: item.end }],
          heights: [heightCm],
          ridge,
        })
        continue
      }
      existing.yTop = Math.min(existing.yTop, item.yTop)
      existing.yBot = Math.max(existing.yBot, item.yBot)
      existing.refs.push({ wallId: wall.wallId, end: item.end })
      existing.heights.push(heightCm)
    }
  }
  return [...grouped.values()].map((item) => ({
    id: `${item.ridge ? 'rj' : 'j'}-${item.floorIndex}-${Math.round(item.x)}`,
    x: item.x,
    floorIndex: item.floorIndex,
    yTop: item.yTop,
    yBot: item.yBot,
    heightCm: Math.round(item.heights.reduce((sum, h) => sum + h, 0) / item.heights.length),
    refs: item.refs,
    ridge: item.ridge ? true : undefined,
  }))
}

export function elevationWallYsAtX(
  wall: ElevationWallRect,
  x: number,
): { top: number; bot: number } | null {
  const outerLo = Math.min(wall.aTop.x, wall.bTop.x)
  const outerHi = Math.max(wall.aTop.x, wall.bTop.x)
  if (x < outerLo - 1e-6 || x > outerHi + 1e-6) return null
  const axisLo = Math.min(wall.xa, wall.xb)
  const axisHi = Math.max(wall.xa, wall.xb)
  if (x < axisLo - 1e-6) {
    return wall.xa <= wall.xb
      ? { top: wall.aTop.y, bot: wall.aBottom.y }
      : { top: wall.bTop.y, bot: wall.bBottom.y }
  }
  if (x > axisHi + 1e-6) {
    return wall.xa <= wall.xb
      ? { top: wall.bTop.y, bot: wall.bBottom.y }
      : { top: wall.aTop.y, bot: wall.aBottom.y }
  }
  const xSpan = wall.xb - wall.xa
  const t = Math.abs(xSpan) < 1e-6 ? 0.5 : (x - wall.xa) / xSpan
  return {
    top: wall.aTop.y + (wall.bTop.y - wall.aTop.y) * t,
    bot: wall.aBottom.y + (wall.bBottom.y - wall.aBottom.y) * t,
  }
}
