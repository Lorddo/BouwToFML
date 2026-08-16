/**
 * Late FML junction-balance pass (na dikte-tiers).
 *
 * X-01: default balance = 0.5 (geen raw balancePx-ruis in export).
 * Collineaire diktewissel-ketens: alleen flushen bij aantoonbare gezichtstrap
 * (face-evidence); zonder bewijs blijft alles 0.5 — geen faceLo-gok.
 * Mini-stubs: collinear same-T, of ortho jog (kortere keten → langere hartlijn;
 * stub-dikte = max van de armen alleen bij gemeten nabijheid). Geen merge van
 * lange collineaire muren.
 */
import { noteDiscardedMeasurement, tally } from '@/core/diagnostics'
import {
  FML_WALL_BALANCE_FALLBACK,
  FML_WALL_BALANCE_MAX,
  FML_WALL_BALANCE_MIN,
  type Point2D,
} from './extraction-to-plan-geom'
import { floorplannerLeftNormal, wallLengthCm } from './fml-wall-geom'
import type { Opening, Wall } from './types'
import {
  resolveChainFaceStepVerdict,
  type FaceStepVerdict,
  type WallFaceExtentsCm,
} from './wall-face-step-evidence'

const ENDPOINT_KEY_DECIMALS = 4
const COLLINEAR_EPS_DEG = 12
const THICKNESS_EPS_CM = 0.05
/** Alleen stubs korter dan dit (cm) mogen in junction-balance-scope verdwijnen. */
export const JUNCTION_BALANCE_STUB_MAX_CM = 15
/** Ortho jog-stubs bij diktewissel (offset tussen parallelle CLs) mogen iets langer. */
export const JUNCTION_BALANCE_JOG_STUB_MAX_CM = 25
/**
 * Relatieve hysterese: jog-stub mag alleen bumpen naar max-arm als de eigen
 * meting al dichtbij is (geen topologische dikte-uitvinding).
 */
const JOG_STUB_BUMP_HYSTERESIS_RATIO = 0.15
const BALANCE_QUANTIZE_STEPS = [0, 0.25, 0.5, 0.75, 1] as const

function endpointKey(point: Point2D): string {
  const factor = 10 ** ENDPOINT_KEY_DECIMALS
  const rx = Math.round(point.x * factor) / factor
  const ry = Math.round(point.y * factor) / factor
  return `${rx}:${ry}`
}

function wallAngleDeg(wall: Wall): number {
  return (Math.atan2(wall.b.y - wall.a.y, wall.b.x - wall.a.x) * 180) / Math.PI
}

function undirectedAngleDiffDeg(a: number, b: number): number {
  let diff = Math.abs(a - b) % 180
  if (diff > 90) diff = 180 - diff
  return diff
}

export function areCollinearWalls(a: Wall, b: Wall): boolean {
  return undirectedAngleDiffDeg(wallAngleDeg(a), wallAngleDeg(b)) <= COLLINEAR_EPS_DEG
}

function areOrthogonalWalls(a: Wall, b: Wall): boolean {
  return undirectedAngleDiffDeg(wallAngleDeg(a), wallAngleDeg(b)) >= 90 - COLLINEAR_EPS_DEG
}

function clampBalance(value: number): number {
  if (!Number.isFinite(value)) return FML_WALL_BALANCE_FALLBACK
  return Math.min(FML_WALL_BALANCE_MAX, Math.max(FML_WALL_BALANCE_MIN, value))
}

export function quantizeBalance(value: number): number {
  const clamped = clampBalance(value)
  let best: number = BALANCE_QUANTIZE_STEPS[0]
  let bestDist = Math.abs(clamped - best)
  for (const step of BALANCE_QUANTIZE_STEPS) {
    const dist = Math.abs(clamped - step)
    if (dist < bestDist) {
      best = step
      bestDist = dist
    }
  }
  return best
}

function thicknessesDiffer(a: number, b: number): boolean {
  return Math.abs(a - b) > THICKNESS_EPS_CM
}

function cloneWall(wall: Wall): Wall {
  return {
    ...wall,
    a: { ...wall.a },
    b: { ...wall.b },
    openings: wall.openings.map((opening) => ({ ...opening })),
  }
}

function openingWorldCenter(wall: Wall, t: number): Point2D {
  return {
    x: wall.a.x + t * (wall.b.x - wall.a.x),
    y: wall.a.y + t * (wall.b.y - wall.a.y),
  }
}

function projectT(wall: Wall, point: Point2D): number {
  const dx = wall.b.x - wall.a.x
  const dy = wall.b.y - wall.a.y
  const len2 = dx * dx + dy * dy
  if (len2 <= 1e-12) return 0
  const t = ((point.x - wall.a.x) * dx + (point.y - wall.a.y) * dy) / len2
  return Math.max(0, Math.min(1, t))
}

function reprojectOpenings(wall: Wall, worldCenters: Point2D[]): Opening[] {
  return wall.openings.map((opening, index) => ({
    ...opening,
    t: projectT(wall, worldCenters[index] ?? openingWorldCenter(wall, opening.t)),
  }))
}

function buildEndpointIndex(walls: Wall[]): Map<string, number[]> {
  const wallsAtPoint = new Map<string, number[]>()
  for (let index = 0; index < walls.length; index += 1) {
    const wall = walls[index]
    for (const point of [wall.a, wall.b]) {
      const key = endpointKey(point)
      const bucket = wallsAtPoint.get(key) ?? []
      bucket.push(index)
      wallsAtPoint.set(key, bucket)
    }
  }
  return wallsAtPoint
}

/** Dominant axis for jog snap: vertical if |dx| < |dy|. */
function wallIsVertical(wall: Wall): boolean {
  return Math.abs(wall.b.x - wall.a.x) < Math.abs(wall.b.y - wall.a.y)
}

function axisValueOfWall(wall: Wall): number {
  return wallIsVertical(wall) ? (wall.a.x + wall.b.x) / 2 : (wall.a.y + wall.b.y) / 2
}

function snapWallOntoAxis(wall: Wall, targetAxis: number, vertical: boolean): void {
  const centers = wall.openings.map((opening) => openingWorldCenter(wall, opening.t))
  if (vertical) {
    wall.a = { x: targetAxis, y: wall.a.y }
    wall.b = { x: targetAxis, y: wall.b.y }
  } else {
    wall.a = { x: wall.a.x, y: targetAxis }
    wall.b = { x: wall.b.x, y: targetAxis }
  }
  wall.openings = reprojectOpenings(wall, centers)
}

/** Walls that share any endpoint, grouped for tests / diagnostics. */
export function buildCollinearJunctionGroups(walls: Wall[]): number[][] {
  const count = walls.length
  if (count <= 1) return walls.map((_, index) => [index])

  const parent = Array.from({ length: count }, (_, index) => index)
  const find = (index: number): number => {
    let root = index
    while (parent[root] !== root) root = parent[root]
    let current = index
    while (current !== root) {
      const next = parent[current]
      parent[current] = root
      current = next
    }
    return root
  }
  const union = (a: number, b: number): void => {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent[rootB] = rootA
  }

  const wallsAtPoint = buildEndpointIndex(walls)
  for (const indices of wallsAtPoint.values()) {
    for (let i = 0; i < indices.length; i += 1) {
      for (let j = i + 1; j < indices.length; j += 1) {
        const left = indices[i]
        const right = indices[j]
        if (areCollinearWalls(walls[left], walls[right])) union(left, right)
      }
    }
  }

  const groups = new Map<number, number[]>()
  for (let index = 0; index < count; index += 1) {
    const root = find(index)
    const bucket = groups.get(root) ?? []
    bucket.push(index)
    groups.set(root, bucket)
  }
  return [...groups.values()]
}

function touchesThicknessChange(
  index: number,
  walls: Wall[],
  wallsAtPoint: Map<string, number[]>,
): boolean {
  const wall = walls[index]
  for (const point of [wall.a, wall.b]) {
    const neighbors = wallsAtPoint.get(endpointKey(point)) ?? []
    for (const other of neighbors) {
      if (other === index) continue
      if (thicknessesDiffer(wall.thickness, walls[other].thickness)) return true
    }
  }
  return false
}

function findAbsorbHost(
  stubIndex: number,
  walls: Wall[],
  wallsAtPoint: Map<string, number[]>,
): number | null {
  const stub = walls[stubIndex]
  let best: number | null = null
  let bestLen = 0
  for (const point of [stub.a, stub.b]) {
    const neighbors = wallsAtPoint.get(endpointKey(point)) ?? []
    for (const other of neighbors) {
      if (other === stubIndex) continue
      const host = walls[other]
      if (thicknessesDiffer(stub.thickness, host.thickness)) continue
      if (!areCollinearWalls(stub, host)) continue
      const len = wallLengthCm(host)
      if (len > bestLen) {
        bestLen = len
        best = other
      }
    }
  }
  return best
}

function absorbStubIntoHost(host: Wall, stub: Wall): void {
  const hostKeyA = endpointKey(host.a)
  const hostKeyB = endpointKey(host.b)
  const stubKeyA = endpointKey(stub.a)
  const stubKeyB = endpointKey(stub.b)

  const hostCenters = host.openings.map((opening) => openingWorldCenter(host, opening.t))
  const stubCenters = stub.openings.map((opening) => openingWorldCenter(stub, opening.t))

  // Extend the shared end of host to the stub's far end.
  if (hostKeyA === stubKeyA) host.a = { ...stub.b }
  else if (hostKeyA === stubKeyB) host.a = { ...stub.a }
  else if (hostKeyB === stubKeyA) host.b = { ...stub.b }
  else if (hostKeyB === stubKeyB) host.b = { ...stub.a }
  else {
    const dAa = Math.hypot(host.a.x - stub.a.x, host.a.y - stub.a.y)
    const dAb = Math.hypot(host.a.x - stub.b.x, host.a.y - stub.b.y)
    const dBa = Math.hypot(host.b.x - stub.a.x, host.b.y - stub.a.y)
    const dBb = Math.hypot(host.b.x - stub.b.x, host.b.y - stub.b.y)
    const minA = Math.min(dAa, dAb)
    const minB = Math.min(dBa, dBb)
    if (minA <= minB) host.a = { ...(dAa <= dAb ? stub.b : stub.a) }
    else host.b = { ...(dBa <= dBb ? stub.b : stub.a) }
  }

  const hostOpenings = reprojectOpenings({ ...host, openings: host.openings }, hostCenters)
  const stubOpenings = stub.openings.map((opening, index) => ({
    ...opening,
    t: projectT(host, stubCenters[index] ?? openingWorldCenter(stub, opening.t)),
  }))
  host.openings = [...hostOpenings, ...stubOpenings]
}

/**
 * Walk collinear same-thickness walls through shared endpoints (does not merge).
 */
function collectCollinearSameThicknessChain(
  seedIndex: number,
  walls: Wall[],
  wallsAtPoint: Map<string, number[]>,
): number[] {
  const seed = walls[seedIndex]
  const chain = new Set<number>([seedIndex])
  const queue = [seedIndex]
  while (queue.length > 0) {
    const current = queue.pop()!
    const wall = walls[current]
    for (const point of [wall.a, wall.b]) {
      for (const other of wallsAtPoint.get(endpointKey(point)) ?? []) {
        if (chain.has(other)) continue
        const candidate = walls[other]
        if (thicknessesDiffer(seed.thickness, candidate.thickness)) continue
        if (!areCollinearWalls(seed, candidate)) continue
        chain.add(other)
        queue.push(other)
      }
    }
  }
  return [...chain]
}

function neighborsAtEndpoint(
  stubIndex: number,
  point: Point2D,
  wallsAtPoint: Map<string, number[]>,
): number[] {
  return (wallsAtPoint.get(endpointKey(point)) ?? []).filter((index) => index !== stubIndex)
}

function chainLengthCm(indices: number[], walls: Wall[]): number {
  let total = 0
  for (const index of indices) total += wallLengthCm(walls[index])
  return total
}

/**
 * Ortho/bridge stub between parallel arms with different thickness:
 * keep the longer collinear chain's hartlijn, snap the shorter chain onto it, drop stub.
 * (Hand-FML: lange mid-band CL blijft; korte dikke stub schuift ernaartoe — niet andersom.)
 */
function tryAbsorbThicknessChangeJogStub(
  stubIndex: number,
  walls: Wall[],
  wallsAtPoint: Map<string, number[]>,
): boolean {
  const stub = walls[stubIndex]
  if (wallLengthCm(stub) >= JUNCTION_BALANCE_JOG_STUB_MAX_CM) return false

  const armsA = neighborsAtEndpoint(stubIndex, stub.a, wallsAtPoint)
  const armsB = neighborsAtEndpoint(stubIndex, stub.b, wallsAtPoint)
  if (armsA.length === 0 || armsB.length === 0) return false

  let best: { keepIndex: number; moveIndex: number } | null = null
  let bestScore = 0

  for (const a of armsA) {
    for (const b of armsB) {
      if (a === b) continue
      const armA = walls[a]
      const armB = walls[b]
      if (!areCollinearWalls(armA, armB)) continue
      if (!thicknessesDiffer(armA.thickness, armB.thickness)) continue
      // Bridge stub should not itself be collinear with the façade arms.
      if (areCollinearWalls(stub, armA) || areCollinearWalls(stub, armB)) continue
      // Prefer clear jog connectors (near-ortho); allow mild diagonal bridges.
      const stubVsArm = undirectedAngleDiffDeg(wallAngleDeg(stub), wallAngleDeg(armA))
      if (!areOrthogonalWalls(stub, armA) && stubVsArm < 25) continue

      const chainA = collectCollinearSameThicknessChain(a, walls, wallsAtPoint)
      const chainB = collectCollinearSameThicknessChain(b, walls, wallsAtPoint)
      const lenA = chainLengthCm(chainA, walls)
      const lenB = chainLengthCm(chainB, walls)
      const score = lenA + lenB
      if (score <= bestScore) continue
      bestScore = score
      // Longer façade chain keeps its axis; shorter jogs onto it.
      best = lenA >= lenB ? { keepIndex: a, moveIndex: b } : { keepIndex: b, moveIndex: a }
    }
  }
  if (!best) return false

  const keep = walls[best.keepIndex]
  const move = walls[best.moveIndex]
  // Jog stub inherits thickest connected arm (FML thickness), then geometry snaps to longer CL.
  stub.thickness = Math.max(keep.thickness, move.thickness, stub.thickness)
  const moveChain = collectCollinearSameThicknessChain(best.moveIndex, walls, wallsAtPoint)
  const vertical = wallIsVertical(keep)
  const targetAxis = axisValueOfWall(keep)
  for (const index of moveChain) {
    snapWallOntoAxis(walls[index], targetAxis, vertical)
  }

  // Move stub openings onto the kept (longer) host; drop stub geometry.
  if (stub.openings.length > 0) {
    const stubCenters = stub.openings.map((opening) => openingWorldCenter(stub, opening.t))
    keep.openings = [
      ...keep.openings,
      ...stub.openings.map((opening, index) => ({
        ...opening,
        t: projectT(keep, stubCenters[index] ?? openingWorldCenter(stub, opening.t)),
      })),
    ]
  }
  walls.splice(stubIndex, 1)
  tally('X-01', 'jog_stub_absorbed')
  return true
}

/**
 * Remaining ortho jog connectors inherit max thickness of the parallel arms
 * they bridge (even when too long to absorb) — but only when the stub's own
 * measurement is already compatible (same band / hysteresis). Do not invent
 * thickness from topology alone.
 */
function bumpRemainingJogStubThickness(walls: Wall[]): void {
  const wallsAtPoint = buildEndpointIndex(walls)
  for (let stubIndex = 0; stubIndex < walls.length; stubIndex += 1) {
    const stub = walls[stubIndex]
    if (wallLengthCm(stub) >= JUNCTION_BALANCE_JOG_STUB_MAX_CM * 2) continue
    const armsA = neighborsAtEndpoint(stubIndex, stub.a, wallsAtPoint)
    const armsB = neighborsAtEndpoint(stubIndex, stub.b, wallsAtPoint)
    if (armsA.length === 0 || armsB.length === 0) continue
    let maxArmT = 0
    let matched = false
    for (const a of armsA) {
      for (const b of armsB) {
        if (a === b) continue
        const armA = walls[a]
        const armB = walls[b]
        if (!areCollinearWalls(armA, armB)) continue
        if (!thicknessesDiffer(armA.thickness, armB.thickness)) continue
        if (areCollinearWalls(stub, armA) || areCollinearWalls(stub, armB)) continue
        const stubVsArm = undirectedAngleDiffDeg(wallAngleDeg(stub), wallAngleDeg(armA))
        if (!areOrthogonalWalls(stub, armA) && stubVsArm < 25) continue
        matched = true
        maxArmT = Math.max(maxArmT, armA.thickness, armB.thickness)
      }
    }
    if (!matched || !(maxArmT > stub.thickness + THICKNESS_EPS_CM)) continue
    // Measured stub must already be near maxArm (relative hysteresis) — no topology override.
    const larger = Math.max(stub.thickness, maxArmT)
    if (
      larger > 0 &&
      Math.abs(stub.thickness - maxArmT) / larger > JOG_STUB_BUMP_HYSTERESIS_RATIO
    ) {
      tally('X-01', 'jog_stub_bump_rejected')
      continue
    }
    stub.thickness = maxArmT
    tally('X-01', 'jog_stub_thickness_bumped')
  }
}

/**
 * Eat short stubs in junction-balance scope:
 * - collinear same-thickness continuation into a host
 * - ortho/bridge jog between parallel arms with a thickness change (shorter→longer axis)
 * Does not merge long collinear walls into a single segment.
 * Leftover jog stubs get thickness = max(connected arms).
 */
export function absorbJunctionBalanceStubs(walls: Wall[]): Wall[] {
  const result = walls.map(cloneWall)
  let changed = true
  while (changed) {
    changed = false
    const wallsAtPoint = buildEndpointIndex(result)
    for (let index = 0; index < result.length; index += 1) {
      const stub = result[index]
      // Jog path allows longer stubs; collinear path stays at the stricter cap.
      if (wallLengthCm(stub) >= JUNCTION_BALANCE_JOG_STUB_MAX_CM) continue

      if (
        wallLengthCm(stub) < JUNCTION_BALANCE_STUB_MAX_CM &&
        touchesThicknessChange(index, result, wallsAtPoint)
      ) {
        const hostIndex = findAbsorbHost(index, result, wallsAtPoint)
        if (hostIndex != null) {
          absorbStubIntoHost(result[hostIndex], stub)
          result.splice(index, 1)
          tally('X-01', 'stub_absorbed')
          changed = true
          break
        }
      }

      if (tryAbsorbThicknessChangeJogStub(index, result, wallsAtPoint)) {
        changed = true
        break
      }
    }
  }
  bumpRemainingJogStubThickness(result)
  return result
}

type FlushSide = 'plus' | 'minus'

function groupHasThicknessChange(indices: number[], walls: Wall[]): boolean {
  if (indices.length < 2) return false
  const first = walls[indices[0]]?.thickness ?? 0
  return indices.some((index) => thicknessesDiffer(walls[index]?.thickness ?? 0, first))
}

/** Thickness band with the most hartlijn length in the group (ties → upper-median thickness). */
function pickAnchorThicknessCm(indices: number[], walls: Wall[]): number {
  const lengthByThickness = new Map<number, number>()
  for (const index of indices) {
    const thickness = walls[index]?.thickness ?? 0
    const key = Math.round(thickness * 100) / 100
    lengthByThickness.set(key, (lengthByThickness.get(key) ?? 0) + wallLengthCm(walls[index]))
  }
  let bestLen = -1
  for (const len of lengthByThickness.values()) {
    if (len > bestLen) bestLen = len
  }
  const tied = [...lengthByThickness.entries()]
    .filter(([, len]) => len === bestLen)
    .map(([thickness]) => thickness)
    .sort((a, b) => a - b)
  return tied[Math.floor(tied.length / 2)] ?? walls[indices[0]]?.thickness ?? 0
}

function wallDirectionUnit(wall: Wall): Point2D {
  const dx = wall.b.x - wall.a.x
  const dy = wall.b.y - wall.a.y
  const len = Math.hypot(dx, dy)
  if (len <= 1e-12) return { x: 1, y: 0 }
  return { x: dx / len, y: dy / len }
}

/** Left normal of a→b (Floorplanner plus-side, Y-down). */
function leftNormal(unit: Point2D): Point2D {
  return floorplannerLeftNormal(unit)
}

function crossAxisComponent(normal: Point2D, vertical: boolean): number {
  return vertical ? normal.x : normal.y
}

function faceCrossCoord(wall: Wall, side: FlushSide, balance = wall.balance): number {
  const cl = axisValueOfWall(wall)
  const vertical = wallIsVertical(wall)
  const c = crossAxisComponent(leftNormal(wallDirectionUnit(wall)), vertical)
  const thickness = wall.thickness
  const b = clampBalance(balance ?? FML_WALL_BALANCE_FALLBACK)
  if (side === 'plus') return cl + c * (thickness * b)
  return cl - c * (thickness * (1 - b))
}

/**
 * Balance so a wall face lands on a shared world cross-coordinate.
 * Encodes a→b direction: same world face can be B≈0.32 or B≈0.68.
 * Clamped so the CL shift never exceeds half the real Δt (vs anchor).
 */
function balanceForWorldFlushFace(wall: Wall, flushCross: number, maxShiftCm: number): number {
  const cl = axisValueOfWall(wall)
  const vertical = wallIsVertical(wall)
  const c = crossAxisComponent(leftNormal(wallDirectionUnit(wall)), vertical)
  const thickness = wall.thickness
  if (!(thickness > 1e-9) || Math.abs(c) < 1e-12) return FML_WALL_BALANCE_FALLBACK

  const delta = flushCross - cl
  const fromPlus = clampBalance(delta / (c * thickness))
  const fromMinus = clampBalance(1 + delta / (c * thickness))
  const errPlus = Math.abs(faceCrossCoord(wall, 'plus', fromPlus) - flushCross)
  const errMinus = Math.abs(faceCrossCoord(wall, 'minus', fromMinus) - flushCross)
  let next = errPlus <= errMinus ? fromPlus : fromMinus

  // Clamp shift from 0.5 to at most maxShiftCm / thickness.
  if (maxShiftCm > 0 && thickness > 0) {
    const maxDeltaB = Math.min(0.5, maxShiftCm / thickness)
    next = Math.min(0.5 + maxDeltaB, Math.max(0.5 - maxDeltaB, next))
  }
  return quantizeBalance(next)
}

/**
 * Pick world-space flush face from verdict (not directed plus/minus guess).
 * flush_plus → anchor plus face; flush_minus → anchor minus face.
 */
function pickWorldFlushCrossFromVerdict(
  indices: number[],
  walls: Wall[],
  anchorT: number,
  targetCm: number,
  verdict: FaceStepVerdict,
): number | null {
  if (verdict !== 'flush_plus' && verdict !== 'flush_minus') return null
  const anchorIndex =
    indices.find((index) => !thicknessesDiffer(walls[index]?.thickness ?? 0, anchorT)) ?? indices[0]
  const cl = axisValueOfWall(walls[anchorIndex])
  const faceLo = cl - targetCm
  const faceHi = cl + targetCm
  // Map geometric plus/minus onto world lo/hi via the anchor's left-normal sign.
  const anchor = walls[anchorIndex]
  const vertical = wallIsVertical(anchor)
  const c = crossAxisComponent(leftNormal(wallDirectionUnit(anchor)), vertical)
  if (verdict === 'flush_plus') {
    return c >= 0 ? faceHi : faceLo
  }
  return c >= 0 ? faceLo : faceHi
}

/**
 * Longest thickness band stays B=0.5. Others flush only when face-evidence
 * confirms a continuous world face. No evidence → identity 0.5.
 */
function applyChainFlushBalances(
  indices: number[],
  walls: Wall[],
  faceEvidenceById?: Map<string, WallFaceExtentsCm>,
): void {
  const verdict = resolveChainFaceStepVerdict({
    indices,
    thicknessCm: (index) => walls[index]?.thickness ?? 0,
    evidence: (index) => {
      const id = walls[index]?.id
      if (!id || !faceEvidenceById) return undefined
      return faceEvidenceById.get(id)
    },
    lengthCm: (index) => wallLengthCm(walls[index]),
  })

  if (verdict === 'no_evidence' || verdict === 'centered') {
    tally('X-01', verdict === 'centered' ? 'centered_no_flush' : 'no_evidence')
    for (const index of indices) {
      walls[index].balance = FML_WALL_BALANCE_FALLBACK
      tally('X-01', 'preserved')
    }
    return
  }

  const anchorT = pickAnchorThicknessCm(indices, walls)
  const target = anchorT * 0.5
  const flushCross = pickWorldFlushCrossFromVerdict(indices, walls, anchorT, target, verdict)
  if (flushCross == null) {
    tally('X-01', 'no_evidence')
    return
  }

  tally('X-01', 'flush_applied')
  for (const index of indices) {
    const wall = walls[index]
    const prev = wall.balance ?? FML_WALL_BALANCE_FALLBACK
    const deltaT = Math.abs(wall.thickness - anchorT)
    const next = !thicknessesDiffer(wall.thickness, anchorT)
      ? FML_WALL_BALANCE_FALLBACK
      : balanceForWorldFlushFace(wall, flushCross, deltaT * 0.5)
    wall.balance = next
    if (Math.abs(prev - next) > 1e-9) {
      tally('X-01', 'aligned')
      noteDiscardedMeasurement('X-01', 'alignWallJunctionBalance.chainFlush', prev, next, {
        verdict,
      })
    } else {
      tally('X-01', 'preserved')
    }
  }
}

/**
 * After export thickness tiers: wipe balance to 0.5, absorb junction stubs,
 * then flush collinear diktewissel-ketens only when face-evidence confirms a trap.
 */
export function alignWallJunctionBalance(
  walls: Wall[],
  faceEvidenceById?: Map<string, WallFaceExtentsCm>,
): Wall[] {
  if (walls.length === 0) return walls

  // ESC:X-01 — default export balance 0.5 (geen meet-ruis).
  let result: Wall[] = walls.map((wall) => {
    const measured = clampBalance(wall.balance ?? FML_WALL_BALANCE_FALLBACK)
    if (Math.abs(measured - FML_WALL_BALANCE_FALLBACK) > 1e-9) {
      noteDiscardedMeasurement(
        'X-01',
        'alignWallJunctionBalance',
        measured,
        FML_WALL_BALANCE_FALLBACK,
      )
    } else {
      tally('X-01', 'default_0_5')
    }
    return {
      ...cloneWall(wall),
      balance: FML_WALL_BALANCE_FALLBACK,
    }
  })

  result = absorbJunctionBalanceStubs(result)

  const groups = buildCollinearJunctionGroups(result)
  for (const indices of groups) {
    if (!groupHasThicknessChange(indices, result)) {
      for (const _index of indices) tally('X-01', 'preserved')
      continue
    }
    applyChainFlushBalances(indices, result, faceEvidenceById)
  }

  return result
}
