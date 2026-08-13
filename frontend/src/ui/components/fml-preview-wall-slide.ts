import type { Point2D, Wall } from '@/core/fml/types'
import {
  COLLINEAR_DOT_THRESHOLD,
  MIN_CONNECTOR_LENGTH_CM,
  MIN_WALL_LENGTH_CM,
  SEGMENT_PARAM_EPS,
  WALL_AXIS_EPS_CM,
  buildJunctions,
  cloneWalls,
  distance,
  moveJunction,
  normalizeDir,
  pointParamOnSegment,
  pruneCollapsedWalls,
  refKey,
  splitWallAtPoint,
  type JunctionNode,
  type WallEndRef,
} from './fml-preview-junction-core'
import { openingWorldCenter, reprojectWallOpenings } from './fml-preview-openings'
import {
  addSegmentPathWithJunctionBreaks,
  materializeCrossingsAlongWall,
  materializeEndpointJoinsAtPoint,
  splitCarrierWallsAtJunctionsOnSegment,
  splitCrossedWallsAlongSegment,
} from './fml-preview-wall-draw-geom'

const RIGID_TRANSLATION_EPS_CM = 1e-6

/**
 * Na endpoint-slide: openingen op asymmetrisch gewijzigde muren herprojecteren
 * (wereldpositie vast, zoals `moveJunction`). Rigide getransleerde muren houden `t`
 * (openingen schuiven mee met het segment).
 */
function reprojectOpeningsAfterEndpointSlide(
  walls: Wall[],
  beforeById: ReadonlyMap<string, { a: Point2D; b: Point2D; worldCenters: Point2D[] }>,
): void {
  for (const wall of walls) {
    const before = beforeById.get(wall.id)
    if (!before || before.worldCenters.length === 0 || wall.openings.length === 0) continue

    const dAx = wall.a.x - before.a.x
    const dAy = wall.a.y - before.a.y
    const dBx = wall.b.x - before.b.x
    const dBy = wall.b.y - before.b.y
    const rigid =
      Math.abs(dAx - dBx) <= RIGID_TRANSLATION_EPS_CM &&
      Math.abs(dAy - dBy) <= RIGID_TRANSLATION_EPS_CM
    if (rigid) continue

    wall.openings = reprojectWallOpenings(wall, before.worldCenters)
  }
}

export { splitWallAtPoint }

/** Richting vanaf een eindpunt de muur in op. */
function directionFromEndpoint(wall: { a: Point2D; b: Point2D }, end: 'a' | 'b'): Point2D {
  return end === 'a'
    ? normalizeDir({ x: wall.b.x - wall.a.x, y: wall.b.y - wall.a.y })
    : normalizeDir({ x: wall.a.x - wall.b.x, y: wall.a.y - wall.b.y })
}

/** Twee muren delen een rechte lijn op het knooppunt. */
function areCollinearAtEndpoint(
  wallA: { a: Point2D; b: Point2D },
  endA: 'a' | 'b',
  wallB: { a: Point2D; b: Point2D },
  endB: 'a' | 'b',
): boolean {
  const dirA = directionFromEndpoint(wallA, endA)
  const dirB = directionFromEndpoint(wallB, endB)
  const dot = dirA.x * dirB.x + dirA.y * dirB.y
  return dot < -COLLINEAR_DOT_THRESHOLD
}

function findJunctionForRef(walls: Wall[], wallId: string, end: 'a' | 'b'): JunctionNode | null {
  return (
    buildJunctions(walls).find((junction) =>
      junction.refs.some((ref) => ref.wallId === wallId && ref.end === end),
    ) ?? null
  )
}

function moveWallEndpoint(wall: Wall, end: 'a' | 'b', deltaT: number, slideDir: Point2D): void {
  const point = wall[end]
  wall[end] = { x: point.x + deltaT * slideDir.x, y: point.y + deltaT * slideDir.y }
}

function junctionHasBranch(
  walls: Wall[],
  draggedWall: Wall,
  draggedEnd: 'a' | 'b',
  junction: JunctionNode,
): boolean {
  for (const ref of junction.refs) {
    if (ref.wallId === draggedWall.id && ref.end === draggedEnd) continue
    const other = walls.find((item) => item.id === ref.wallId)
    if (!other) continue
    if (!areCollinearAtEndpoint(draggedWall, draggedEnd, other, ref.end)) {
      return true
    }
  }
  return false
}

function isDirectionParallel(a: Point2D, b: Point2D, threshold = COLLINEAR_DOT_THRESHOLD): boolean {
  const dot = Math.abs(a.x * b.x + a.y * b.y)
  return dot > threshold
}

function computeMovingRefsAtJunction(
  walls: Wall[],
  draggedWall: Wall,
  draggedEnd: 'a' | 'b',
  junction: JunctionNode,
  slideDir: Point2D,
): Set<string> {
  const moving = new Set<string>()
  const hasBranch = junctionHasBranch(walls, draggedWall, draggedEnd, junction)
  const isLCorner = junction.refs.length === 2 && hasBranch

  if (!hasBranch || isLCorner) {
    for (const ref of junction.refs) moving.add(refKey(ref))
    return moving
  }

  const draggedDir = directionFromEndpoint(draggedWall, draggedEnd)
  const slideAlongTrunk = isDirectionParallel(slideDir, draggedDir)

  if (slideAlongTrunk) {
    moving.add(refKey({ wallId: draggedWall.id, end: draggedEnd }))
    return moving
  }

  moving.add(refKey({ wallId: draggedWall.id, end: draggedEnd }))
  for (const ref of junction.refs) {
    if (ref.wallId === draggedWall.id && ref.end === draggedEnd) continue
    const other = walls.find((item) => item.id === ref.wallId)
    if (!other) continue
    if (isDirectionParallel(slideDir, directionFromEndpoint(other, ref.end))) {
      moving.add(refKey(ref))
    }
  }
  return moving
}

/**
 * Vangnet tegen parallelle stubs: als old->new op een bestaand collineair host-segment ligt
 * en new op een host-endpoint valt, split host op old zodat de connector als echte muur-sectie
 * op die host ontstaat (met tussennode), zonder extra overlappende stub.
 */
function materializeConnectorByHostWallSplit(
  walls: Wall[],
  oldPoint: Point2D,
  newPoint: Point2D,
): boolean {
  for (const wall of walls) {
    const tNew = pointParamOnSegment(wall.a, wall.b, newPoint)
    if (tNew == null) continue
    const tOld = pointParamOnSegment(wall.a, wall.b, oldPoint)
    if (tOld == null) continue
    if (Math.abs(tOld - tNew) < 1e-6) continue

    const newAtEndpoint = tNew <= 1e-6 || tNew >= 1 - 1e-6
    const oldInterior = tOld > 1e-6 && tOld < 1 - 1e-6
    if (!newAtEndpoint || !oldInterior) continue

    if (distance(oldPoint, newPoint) < MIN_CONNECTOR_LENGTH_CM) return true
    if (splitWallAtPoint(walls, wall, oldPoint, tOld)) {
      splitCrossedWallsAlongSegment(walls, oldPoint, newPoint)
      splitCarrierWallsAtJunctionsOnSegment(walls, oldPoint, newPoint)
      return true
    }
  }
  return false
}

function addJunctionSplitStub(
  walls: Wall[],
  oldPoint: Point2D,
  newPoint: Point2D,
  thickness: number,
  balance?: number,
): void {
  if (materializeConnectorByHostWallSplit(walls, oldPoint, newPoint)) return
  addSegmentPathWithJunctionBreaks(walls, oldPoint, newPoint, {
    thickness,
    balance,
    idPrefix: 'slide-stub',
    minLengthCm: MIN_CONNECTOR_LENGTH_CM,
  })
}

/**
 * Als de nieuwe endpoint al op een bestaand staying-segment ligt (vanaf oude junction),
 * split dat segment op de nieuwe positie i.p.v. een parallelle stub toe te voegen.
 * Zo blijven junctions verbonden zonder dubbele overlappende muren.
 */
function relinkViaExistingStayingSegment(
  walls: Wall[],
  stayingRefs: WallEndRef[],
  oldPoint: Point2D,
  newPoint: Point2D,
): boolean {
  const span = distance(oldPoint, newPoint)
  if (span < MIN_CONNECTOR_LENGTH_CM) return false

  for (const ref of stayingRefs) {
    const wall = walls.find((item) => item.id === ref.wallId)
    if (!wall) continue
    if (distance(wall[ref.end], oldPoint) > 0.05) continue

    const oppositeEnd = ref.end === 'a' ? 'b' : 'a'
    const opposite = wall[oppositeEnd]
    const ray = { x: opposite.x - oldPoint.x, y: opposite.y - oldPoint.y }
    const rayLenSq = ray.x * ray.x + ray.y * ray.y
    if (rayLenSq < 1e-9) continue
    const toNew = { x: newPoint.x - oldPoint.x, y: newPoint.y - oldPoint.y }
    const cross = Math.abs(ray.x * toNew.y - ray.y * toNew.x)
    if (cross > 0.05) continue
    const t = (toNew.x * ray.x + toNew.y * ray.y) / rayLenSq

    // Inwards (nieuwe punt binnen/tegen staying-segment):
    // split het bestaande staying-segment op de nieuwe positie.
    // Zo vermijden we een losse relink-stub naar een eerste raak-junction.
    if (t >= 0 && t <= 1 + 1e-4) {
      const clampedT = Math.max(0, Math.min(1, t))
      if (clampedT <= SEGMENT_PARAM_EPS || clampedT >= 1 - SEGMENT_PARAM_EPS) return true
      const splitT = ref.end === 'a' ? clampedT : 1 - clampedT
      if (splitWallAtPoint(walls, wall, newPoint, splitT)) return true
      continue
    }

    // Outwards (nieuwe punt voorbij opposite): houd old junction + staying-segment
    // intact en voeg een connector opposite -> new toe (met tussennode op opposite).
    if (t > 1 + 1e-4) {
      if (distance(newPoint, opposite) < MIN_CONNECTOR_LENGTH_CM) continue
      addSegmentPathWithJunctionBreaks(walls, opposite, newPoint, {
        thickness: wall.thickness,
        balance: wall.balance,
        idPrefix: 'slide-relink',
        minLengthCm: MIN_CONNECTOR_LENGTH_CM,
      })
      return true
    }
  }
  return false
}

function applyEndpointSlideAlongAxis(
  walls: Wall[],
  wallId: string,
  end: 'a' | 'b',
  deltaT: number,
  slideDir: Point2D,
): void {
  const wall = walls.find((item) => item.id === wallId)
  if (!wall || deltaT === 0) return

  const junction = findJunctionForRef(walls, wallId, end)
  if (!junction || junction.refs.length <= 1) {
    moveWallEndpoint(wall, end, deltaT, slideDir)
    return
  }

  const oldPoint = { x: wall[end].x, y: wall[end].y }
  const movingRefs = computeMovingRefsAtJunction(walls, wall, end, junction, slideDir)
  const stayingRefs = junction.refs.filter((ref) => !movingRefs.has(refKey(ref)))
  const hasStaying = stayingRefs.length > 0

  for (const ref of junction.refs) {
    if (!movingRefs.has(refKey(ref))) continue
    const other = walls.find((item) => item.id === ref.wallId)
    if (!other) continue
    moveWallEndpoint(other, ref.end, deltaT, slideDir)
  }

  if (hasStaying && movingRefs.size > 0) {
    const newPoint = { x: wall[end].x, y: wall[end].y }
    if (!relinkViaExistingStayingSegment(walls, stayingRefs, oldPoint, newPoint)) {
      addJunctionSplitStub(walls, oldPoint, newPoint, wall.thickness, wall.balance)
    }
  }
}

function isWallFlatHorizontal(wall: { a: Point2D; b: Point2D }): boolean {
  const spanX = Math.abs(wall.b.x - wall.a.x)
  const spanY = Math.abs(wall.b.y - wall.a.y)
  return spanY <= WALL_AXIS_EPS_CM && spanX > WALL_AXIS_EPS_CM
}

function isWallFlatVertical(wall: { a: Point2D; b: Point2D }): boolean {
  const spanX = Math.abs(wall.b.x - wall.a.x)
  const spanY = Math.abs(wall.b.y - wall.a.y)
  return spanX <= WALL_AXIS_EPS_CM && spanY > WALL_AXIS_EPS_CM
}

/**
 * H/V-muren: verschuif altijd loodrecht op de muuras.
 * Schuine muren: verschuif loodrecht op het segment (haakse delta).
 */
export function resolveWallSlidePointerDelta(
  pointerDelta: Point2D,
  wall: { a: Point2D; b: Point2D },
): { delta: number; slideDir: Point2D } {
  if (isWallFlatHorizontal(wall)) {
    return { delta: pointerDelta.y, slideDir: { x: 0, y: 1 } }
  }
  if (isWallFlatVertical(wall)) {
    return { delta: pointerDelta.x, slideDir: { x: 1, y: 0 } }
  }

  const axisU = normalizeDir({ x: wall.b.x - wall.a.x, y: wall.b.y - wall.a.y })
  const perpU = normalizeDir({ x: axisU.y, y: -axisU.x })
  const delta = pointerDelta.x * perpU.x + pointerDelta.y * perpU.y
  return { delta, slideDir: perpU }
}

/**
 * Schuif een muursegment rigide langs slideDir (beide eindpunten zelfde delta).
 * Per eindpunt: branch-junction blijft vast (T→L); collineaire junction schuift mee.
 */
export function slideWallSegmentAlongAxis(
  walls: Wall[],
  wallId: string,
  deltaT: number,
  slideDir?: Point2D,
): Wall[] {
  if (deltaT === 0) return walls
  const wall = walls.find((item) => item.id === wallId)
  if (!wall) return walls

  const axisU = normalizeDir({ x: wall.b.x - wall.a.x, y: wall.b.y - wall.a.y })
  const moveDir = slideDir ?? axisU
  const next = cloneWalls(walls)

  const beforeById = new Map<string, { a: Point2D; b: Point2D; worldCenters: Point2D[] }>()
  for (const item of next) {
    beforeById.set(item.id, {
      a: { ...item.a },
      b: { ...item.b },
      worldCenters: item.openings.map((opening) => openingWorldCenter(item, opening.t)),
    })
  }

  applyEndpointSlideAlongAxis(next, wallId, 'a', deltaT, moveDir)
  applyEndpointSlideAlongAxis(next, wallId, 'b', deltaT, moveDir)

  const slid = next.find((item) => item.id === wallId)
  if (slid && distance(slid.a, slid.b) < MIN_WALL_LENGTH_CM) {
    return walls
  }

  reprojectOpeningsAfterEndpointSlide(next, beforeById)

  // Zelfde als nieuwe muur tekenen: verschoven segmenten die een andere muur
  // doorsnijden krijgen een echte junction (beide muren splitsen).
  const movedIds: string[] = []
  for (const wall of next) {
    const before = beforeById.get(wall.id)
    if (!before) continue
    const moved =
      Math.abs(before.a.x - wall.a.x) > RIGID_TRANSLATION_EPS_CM ||
      Math.abs(before.a.y - wall.a.y) > RIGID_TRANSLATION_EPS_CM ||
      Math.abs(before.b.x - wall.b.x) > RIGID_TRANSLATION_EPS_CM ||
      Math.abs(before.b.y - wall.b.y) > RIGID_TRANSLATION_EPS_CM
    if (moved) movedIds.push(wall.id)
  }
  for (const wallId of movedIds) {
    materializeCrossingsAlongWall(next, wallId)
    const wall = next.find((item) => item.id === wallId)
    if (!wall) continue
    const exclude = new Set([wallId])
    materializeEndpointJoinsAtPoint(next, wall.a, {
      excludeWallIds: exclude,
      skipCollinearWith: wall,
    })
    materializeEndpointJoinsAtPoint(next, wall.b, {
      excludeWallIds: exclude,
      skipCollinearWith: wall,
    })
  }

  return pruneCollapsedWalls(next)
}

/**
 * Junction verplaatsen + kruisingen/T-joins materialiseren (zoals muur tekenen).
 * Aanroepen vanaf baseWalls bij live drag zodat splits de sleep niet breken.
 */
export function moveJunctionWithWallJoins(
  walls: Wall[],
  node: JunctionNode,
  position: Point2D,
): Wall[] {
  const next = moveJunction(walls, node, position)
  const involved = new Set(node.refs.map((ref) => ref.wallId))
  for (const wallId of involved) {
    materializeCrossingsAlongWall(next, wallId)
  }
  for (const wallId of involved) {
    const wall = next.find((item) => item.id === wallId)
    if (!wall) continue
    materializeEndpointJoinsAtPoint(next, position, {
      excludeWallIds: involved,
      skipCollinearWith: wall,
    })
  }
  return pruneCollapsedWalls(next)
}
