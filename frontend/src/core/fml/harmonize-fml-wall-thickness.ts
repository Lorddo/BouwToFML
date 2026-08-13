import { noteDiscardedMeasurement, tally } from '@/core/diagnostics'
import { alignWallJunctionBalance } from './align-wall-junction-balance'
import type { FloorPlan, Wall } from './types'
import type { FmlWallThicknessLimits } from './fml-wall-thickness-limits'
import { resolveEffectiveFmlWallThicknessLimits } from './fml-wall-thickness-limits'
import {
  classifyFmlThicknessBand,
  DEFAULT_FML_BAND_BOUNDARIES,
  type FmlThicknessBand,
  type FmlThicknessBandBoundaries,
} from './fml-wall-thickness-tiers'
import { wallLengthCm } from './fml-wall-geom'

const ENDPOINT_KEY_DECIMALS = 4
import { WALL_CHAIN_BRIDGE_MAX_RATIO } from './wall-thickness-chain'

const CHAIN_BRIDGE_MAX_CM = 40
const COLLINEAR_EPS_DEG = 12

function endpointKey(point: { x: number; y: number }): string {
  const factor = 10 ** ENDPOINT_KEY_DECIMALS
  const rx = Math.round(point.x * factor) / factor
  const ry = Math.round(point.y * factor) / factor
  return `${rx}:${ry}`
}

class UnionFind {
  private parent: number[]

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, index) => index)
  }

  find(index: number): number {
    let root = index
    while (this.parent[root] !== root) root = this.parent[root]
    let current = index
    while (current !== root) {
      const next = this.parent[current]
      this.parent[current] = root
      current = next
    }
    return root
  }

  union(a: number, b: number): void {
    const rootA = this.find(a)
    const rootB = this.find(b)
    if (rootA === rootB) return
    this.parent[rootB] = rootA
  }
}

function wallAngleDeg(wall: Wall): number {
  return (Math.atan2(wall.b.y - wall.a.y, wall.b.x - wall.a.x) * 180) / Math.PI
}

function undirectedAngleDiffDeg(a: number, b: number): number {
  let diff = Math.abs(a - b) % 180
  if (diff > 90) diff = 180 - diff
  return diff
}

function areCollinearWalls(a: Wall, b: Wall): boolean {
  return undirectedAngleDiffDeg(wallAngleDeg(a), wallAngleDeg(b)) <= COLLINEAR_EPS_DEG
}

/**
 * Groepeer muren in dikte-ketens: gedeeld knooppunt (incl. T/L/X) + dezelfde meetband.
 * Keten loopt door junctions; breekt alleen bij andere band.
 */
export function buildFmlThicknessChains(
  walls: Wall[],
  boundaries: FmlThicknessBandBoundaries = DEFAULT_FML_BAND_BOUNDARIES,
): number[][] {
  const count = walls.length
  if (count <= 1) return walls.map((_, index) => [index])

  const uf = new UnionFind(count)
  const wallsAtPoint = new Map<string, number[]>()

  for (let index = 0; index < count; index += 1) {
    const wall = walls[index]
    for (const point of [wall.a, wall.b]) {
      const key = endpointKey(point)
      const bucket = wallsAtPoint.get(key) ?? []
      bucket.push(index)
      wallsAtPoint.set(key, bucket)
    }
  }

  for (const indices of wallsAtPoint.values()) {
    for (let i = 0; i < indices.length; i += 1) {
      for (let j = i + 1; j < indices.length; j += 1) {
        const left = indices[i]
        const right = indices[j]
        const bandLeft = classifyFmlThicknessBand(walls[left].thickness, boundaries)
        const bandRight = classifyFmlThicknessBand(walls[right].thickness, boundaries)
        if (bandLeft === bandRight) uf.union(left, right)
      }
    }
  }

  // ESC:X-04 (A)
  // Brug-regel: dik-dun-dik op dezelfde lijn blijft één keten.
  // Dunne tussensegmenten (bv kozijn/ruis) verbinden twee gelijke buitenbanden.
  for (let bridgeIndex = 0; bridgeIndex < count; bridgeIndex += 1) {
    const bridge = walls[bridgeIndex]
    const bridgeBand = classifyFmlThicknessBand(bridge.thickness, boundaries)
    const bridgeLength = wallLengthCm(bridge)
    const pointA = wallsAtPoint.get(endpointKey(bridge.a)) ?? []
    const pointB = wallsAtPoint.get(endpointKey(bridge.b)) ?? []
    if (pointA.length < 2 || pointB.length < 2) continue

    const neighborsA = pointA.filter(
      (index) => index !== bridgeIndex && areCollinearWalls(bridge, walls[index]),
    )
    const neighborsB = pointB.filter(
      (index) => index !== bridgeIndex && areCollinearWalls(bridge, walls[index]),
    )
    if (neighborsA.length !== 1 || neighborsB.length !== 1) continue

    const leftIndex = neighborsA[0]
    const rightIndex = neighborsB[0]
    const leftBand = classifyFmlThicknessBand(walls[leftIndex].thickness, boundaries)
    const rightBand = classifyFmlThicknessBand(walls[rightIndex].thickness, boundaries)
    if (leftBand !== rightBand || leftBand === bridgeBand) continue

    const maxNeighborLength = Math.min(
      wallLengthCm(walls[leftIndex]),
      wallLengthCm(walls[rightIndex]),
    )
    if (bridgeLength > CHAIN_BRIDGE_MAX_CM) continue
    if (bridgeLength > maxNeighborLength * WALL_CHAIN_BRIDGE_MAX_RATIO) continue

    tally('X-04', 'bridge_merged')
    uf.union(bridgeIndex, leftIndex)
    uf.union(bridgeIndex, rightIndex)
    uf.union(leftIndex, rightIndex)
  }

  const groups = new Map<number, number[]>()
  for (let index = 0; index < count; index += 1) {
    const root = uf.find(index)
    const bucket = groups.get(root) ?? []
    bucket.push(index)
    groups.set(root, bucket)
  }
  return [...groups.values()]
}

function averageThicknessCm(values: number[]): number {
  const finite = values.filter((value) => Number.isFinite(value))
  if (!finite.length) return 10
  return finite.reduce((sum, value) => sum + value, 0) / finite.length
}

// ESC:X-03 (E)
function resolveChainBand(
  chain: number[],
  walls: Wall[],
  boundaries: FmlThicknessBandBoundaries,
): FmlThicknessBand {
  const bandLengths: Record<FmlThicknessBand, number> = { min: 0, mid: 0, max: 0 }
  for (const index of chain) {
    const wall = walls[index]
    if (!wall) continue
    const band = classifyFmlThicknessBand(wall.thickness, boundaries)
    bandLengths[band] += Math.max(0, wallLengthCm(wall))
  }
  const ordered: FmlThicknessBand[] = ['max', 'mid', 'min']
  const best = ordered.reduce(
    (current, band) => (bandLengths[band] >= bandLengths[current] ? band : current),
    'min' as FmlThicknessBand,
  )
  if (bandLengths[best] > 0) return best
  tally('X-03', 'no_chain_length')
  const rawValues = chain.map((index) => walls[index]?.thickness ?? 10)
  return classifyFmlThicknessBand(roundFmlThicknessCm(averageThicknessCm(rawValues)), boundaries)
}

function resolveBandThicknessCm(band: FmlThicknessBand, limits: FmlWallThicknessLimits): number {
  const effective = resolveEffectiveFmlWallThicknessLimits(limits)
  if (band === 'min') return effective.minCm
  if (band === 'mid') return effective.midCm
  return effective.maxCm
}

// ESC:X-05 (E)
/** Afronden op 1 decimaal — discrete FML-waarde uit ketengemiddelde. */
export function roundFmlThicknessCm(value: number): number {
  if (!Number.isFinite(value)) {
    tally('X-05', 'non_finite')
    return 10
  }
  return Math.round(value * 10) / 10
}

// ESC:X-02 (E) + ESC:X-01 (E)
/**
 * Harmoniseert muurdikte per keten en mapt naar absolute min/mid/max exportdiktes.
 * Ruwe meting bepaalt alleen de band; exportedikte komt altijd uit limits (bewust beleid).
 * Balance: default 0.5; collineaire diktewissel-ketens krijgen gedeelde flush-face
 * op alle leden (hint vanaf dikste); junction stubs in die scope mogen verdwijnen — ESC:X-01.
 */
export function harmonizeFmlWallThickness(
  plan: FloorPlan,
  limits: FmlWallThicknessLimits,
  boundaries: FmlThicknessBandBoundaries = DEFAULT_FML_BAND_BOUNDARIES,
): FloorPlan {
  return {
    ...plan,
    floors: plan.floors.map((floor) => {
      const chains = buildFmlThicknessChains(floor.walls, boundaries)
      const thicknessByIndex = new Map<number, number>()

      for (const chain of chains) {
        const band = resolveChainBand(chain, floor.walls, boundaries)
        const exportThickness = resolveBandThicknessCm(band, limits)
        for (const index of chain) thicknessByIndex.set(index, exportThickness)
      }

      const thicknessAssigned = floor.walls.map((wall, index) => {
        const exportThickness =
          thicknessByIndex.get(index) ??
          resolveBandThicknessCm(
            classifyFmlThicknessBand(roundFmlThicknessCm(wall.thickness), boundaries),
            limits,
          )
        if (exportThickness !== wall.thickness) {
          noteDiscardedMeasurement(
            'X-02',
            'harmonizeFmlWallThickness',
            wall.thickness,
            exportThickness,
            { chained: thicknessByIndex.has(index) },
          )
        }
        return {
          ...wall,
          thickness: exportThickness,
        }
      })

      return {
        ...floor,
        walls: alignWallJunctionBalance(thicknessAssigned),
      }
    }),
  }
}
