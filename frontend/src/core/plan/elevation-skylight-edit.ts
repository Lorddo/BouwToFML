/**
 * Dakraam verplaatsen/resizen vanuit gevel-aanzicht (host = dakvlak).
 */
import { sampleRoofZAtPoint } from './bind-walls-to-roofs'
import { roofSlopeDir } from './dormer-edge-walls'
import {
  elevationHandlePoints,
  elevationRectCenter,
  hitElevationHandle,
  type ElevResizeSide,
} from './elevation-opening-edit'
import { ROOF_TOUCH_SLACK_CM } from './roof-planes'
import {
  hasSkylightRoofLink,
  isSkylightItem,
  refreshSkylightRoofPose,
  skylightFootprintCorners,
} from './skylight-roof'
import type { FloorItem, FloorPlan, FloorSurface, Point2D } from './types'

export const ELEVATION_SKYLIGHT_MIN_CM = 20

export type ElevationSkylightRect = {
  x0: number
  y0: number
  x1: number
  y1: number
}

function hypot(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay)
}

function pointInPolygon(point: Point2D, ring: readonly Point2D[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (!a || !b) continue
    const intersect =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y + 1e-15) + a.x
    if (intersect) inside = !inside
  }
  return inside
}

function distToSeg(point: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq < 1e-9) return hypot(point.x, point.y, a.x, a.y)
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq))
  return hypot(point.x, point.y, a.x + dx * t, a.y + dy * t)
}

function nearestOnPoly(point: Point2D, poly: readonly Point2D[]): Point2D {
  let best = point
  let bestDist = Infinity
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    if (!a || !b) continue
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lenSq = dx * dx + dy * dy
    const t =
      lenSq < 1e-9
        ? 0
        : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq))
    const proj = { x: a.x + dx * t, y: a.y + dy * t }
    const dist = hypot(point.x, point.y, proj.x, proj.y)
    if (dist < bestDist) {
      bestDist = dist
      best = proj
    }
  }
  return best
}

function surfaceCovers(surface: FloorSurface, point: Point2D): boolean {
  const ring = surface.poly.map((p) => ({ x: p.x, y: p.y }))
  if (ring.length < 3) return false
  if (pointInPolygon(point, ring)) return true
  let best = Infinity
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    if (!a || !b) continue
    best = Math.min(best, distToSeg(point, a, b))
  }
  return best <= ROOF_TOUCH_SLACK_CM
}

function localToWorld(
  center: Point2D,
  local: Point2D,
  rotationDeg: number,
  mirrored: readonly [number, number] | undefined,
): Point2D {
  const lx = mirrored?.[0] === 1 ? -local.x : local.x
  const ly = mirrored?.[1] === 1 ? -local.y : local.y
  const rad = (rotationDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return {
    x: center.x + lx * cos - ly * sin,
    y: center.y + lx * sin + ly * cos,
  }
}

function worldToLocal(
  center: Point2D,
  world: Point2D,
  rotationDeg: number,
  mirrored: readonly [number, number] | undefined,
): Point2D {
  const dx = world.x - center.x
  const dy = world.y - center.y
  const rad = (-rotationDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  let lx = dx * cos - dy * sin
  let ly = dx * sin + dy * cos
  if (mirrored?.[0] === 1) lx = -lx
  if (mirrored?.[1] === 1) ly = -ly
  return { x: lx, y: ly }
}

/** Grade = ΔZ per cm langs slopeDir (plat → 0). */
export function roofGradeAlongSlope(surface: FloorSurface): {
  slopeDir: Point2D | null
  grade: number
} {
  const slopeDir = roofSlopeDir(surface)
  if (!slopeDir) return { slopeDir: null, grade: 0 }
  const mid = {
    x: surface.poly.reduce((s, p) => s + p.x, 0) / Math.max(1, surface.poly.length),
    y: surface.poly.reduce((s, p) => s + p.y, 0) / Math.max(1, surface.poly.length),
  }
  const a = { x: mid.x - slopeDir.x * 50, y: mid.y - slopeDir.y * 50 }
  const b = { x: mid.x + slopeDir.x * 50, y: mid.y + slopeDir.y * 50 }
  const za = sampleRoofZAtPoint([surface], a)
  const zb = sampleRoofZAtPoint([surface], b)
  if (za == null || zb == null) return { slopeDir, grade: 0 }
  return { slopeDir, grade: (zb - za) / 100 }
}

export function elevDeltaToPlanDelta(
  dElev: Point2D,
  elevAxis: Point2D,
  slopeDir: Point2D | null,
  grade: number,
): Point2D {
  let dx = elevAxis.x * dElev.x
  let dy = elevAxis.y * dElev.x
  if (slopeDir && Math.abs(grade) > 1e-4) {
    const along = -dElev.y / grade
    dx += slopeDir.x * along
    dy += slopeDir.y * along
  }
  return { x: dx, y: dy }
}

export function skylightElevBounds(points: readonly Point2D[]): ElevationSkylightRect | null {
  if (points.length < 3) return null
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  return {
    x0: Math.min(...xs),
    x1: Math.max(...xs),
    y0: Math.min(...ys),
    y1: Math.max(...ys),
  }
}

export function findSkylightInPlan(
  plan: FloorPlan,
  itemId: string,
): { floorIndex: number; item: FloorItem } | null {
  for (let floorIndex = 0; floorIndex < plan.floors.length; floorIndex += 1) {
    const item = plan.floors[floorIndex]?.items?.find((entry) => entry.id === itemId)
    if (item && isSkylightItem(item)) return { floorIndex, item }
  }
  return null
}

export function updatePlanSkylight(
  plan: FloorPlan,
  itemId: string,
  patch: Partial<Omit<FloorItem, 'id' | 'kind'>>,
): FloorPlan {
  return {
    ...plan,
    floors: plan.floors.map((floor) => {
      if (!floor.items?.some((item) => item.id === itemId)) return floor
      return {
        ...floor,
        items: floor.items.map((item) =>
          item.id === itemId ? { ...item, ...patch } : item,
        ),
      }
    }),
  }
}

export function deletePlanSkylight(plan: FloorPlan, itemId: string): FloorPlan {
  return {
    ...plan,
    floors: plan.floors.map((floor) => {
      if (!floor.items?.some((item) => item.id === itemId)) return floor
      return {
        ...floor,
        items: floor.items.filter((item) => item.id !== itemId),
      }
    }),
  }
}

function footprintFitsSurface(surface: FloorSurface, item: FloorItem): boolean {
  const center = { x: item.x, y: item.y }
  if (!surfaceCovers(surface, center)) return false
  for (const corner of skylightFootprintCorners(item)) {
    if (!surfaceCovers(surface, corner)) return false
  }
  return true
}

export function clampSkylightToSurface(
  item: FloorItem,
  surface: FloorSurface,
): FloorItem {
  const ring = surface.poly.map((p) => ({ x: p.x, y: p.y }))
  let center = { x: item.x, y: item.y }
  if (!surfaceCovers(surface, center)) {
    center = nearestOnPoly(center, ring)
  }
  let next: FloorItem = { ...item, x: center.x, y: center.y }
  if (footprintFitsSurface(surface, next)) {
    const z = sampleRoofZAtPoint([surface], center)
    return z == null ? next : refreshSkylightRoofPose({ ...next, z }, [surface])
  }
  // Krimp naar min zolang nodig (max 8 stappen).
  let width = item.width
  let height = item.height
  for (let i = 0; i < 8; i += 1) {
    width = Math.max(ELEVATION_SKYLIGHT_MIN_CM, width * 0.9)
    height = Math.max(ELEVATION_SKYLIGHT_MIN_CM, height * 0.9)
    next = { ...next, width, height }
    if (footprintFitsSurface(surface, next)) break
  }
  const z = sampleRoofZAtPoint([surface], { x: next.x, y: next.y })
  return z == null ? next : refreshSkylightRoofPose({ ...next, z }, [surface])
}

export function moveSkylightFromElevation(
  item: FloorItem,
  surface: FloorSurface,
  dElev: Point2D,
  elevAxis: Point2D,
): FloorItem {
  if (!hasSkylightRoofLink(item)) return item
  const { slopeDir, grade } = roofGradeAlongSlope(surface)
  const delta = elevDeltaToPlanDelta(dElev, elevAxis, slopeDir, grade)
  const moved: FloorItem = {
    ...item,
    x: item.x + delta.x,
    y: item.y + delta.y,
  }
  return clampSkylightToSurface(moved, surface)
}

export function resizeSkylightFromElevation(
  item: FloorItem,
  surface: FloorSurface,
  side: ElevResizeSide,
  dElev: Point2D,
  elevAxis: Point2D,
): FloorItem {
  if (!hasSkylightRoofLink(item)) return item
  const { slopeDir, grade } = roofGradeAlongSlope(surface)
  const delta = elevDeltaToPlanDelta(dElev, elevAxis, slopeDir, grade)
  const rotation = item.rotation ?? 0
  // Tegenoverliggende plan-rand vast: verschuif centrum met half Δsize in lokale as.
  let width = item.width
  let height = item.height
  let localShift = { x: 0, y: 0 }
  const localDelta = worldToLocal({ x: 0, y: 0 }, delta, rotation, item.mirrored)
  if (side === 'e') {
    const nextW = Math.max(ELEVATION_SKYLIGHT_MIN_CM, width + localDelta.x)
    localShift = { x: (nextW - width) / 2, y: 0 }
    width = nextW
  } else if (side === 'w') {
    const nextW = Math.max(ELEVATION_SKYLIGHT_MIN_CM, width - localDelta.x)
    localShift = { x: -(nextW - width) / 2, y: 0 }
    width = nextW
  } else if (side === 's') {
    const nextH = Math.max(ELEVATION_SKYLIGHT_MIN_CM, height + localDelta.y)
    localShift = { x: 0, y: (nextH - height) / 2 }
    height = nextH
  } else {
    const nextH = Math.max(ELEVATION_SKYLIGHT_MIN_CM, height - localDelta.y)
    localShift = { x: 0, y: -(nextH - height) / 2 }
    height = nextH
  }
  const center = localToWorld(
    { x: item.x, y: item.y },
    localShift,
    rotation,
    item.mirrored,
  )
  const next: FloorItem = {
    ...item,
    x: center.x,
    y: center.y,
    width,
    height,
  }
  return clampSkylightToSurface(next, surface)
}

/** Live Z + helling verversen zonder positie te wijzigen (dakpunt versleept). */
export function refreshSkylightZ(
  item: FloorItem,
  surfaces: ReadonlyArray<FloorSurface>,
): FloorItem {
  return refreshSkylightRoofPose(item, surfaces)
}

export {
  elevationHandlePoints as skylightElevHandlePoints,
  elevationRectCenter as skylightElevRectCenter,
  hitElevationHandle as hitSkylightElevHandle,
}
export type { ElevResizeSide }
