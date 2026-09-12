import { noteDiscardedMeasurement, tally } from '@/core/diagnostics'
import { alignWallJunctionBalance } from './align-wall-junction-balance'
import { ensureDesignsSynced } from './design-sync'
import { sanitizeFmlWalls } from './sanitize-fml-walls'
import type { FloorPlan, Wall } from './types'
import type { FmlWallThicknessLimits } from './fml-wall-thickness-limits'
import { resolveEffectiveFmlWallThicknessLimits } from './fml-wall-thickness-limits'
import {
  catalogMaxCm,
  classifyThicknessSlot,
  nearestCatalogCm,
  normalizeThicknessCatalog,
} from './fml-wall-thickness-catalog'
import {
  classifyFmlThicknessBand,
  DEFAULT_FML_BAND_BOUNDARIES,
  type FmlThicknessBand,
  type FmlThicknessBandBoundaries,
} from './fml-wall-thickness-tiers'
import { wallEndpointKey, wallLengthCm } from './fml-wall-geom'
import type { WallFaceExtentsCm } from './wall-face-step-evidence'

import { WALL_CHAIN_BRIDGE_MAX_RATIO } from './wall-thickness-chain'

const CHAIN_BRIDGE_MAX_CM = 40
const COLLINEAR_EPS_DEG = 12
/**
 * Relatieve hysterese bij keten-union.
 * 15% van de meting: 10 vs 11 / 22 vs 24 = meetruis; 10 vs 12 (~17%) splitst
 * zonder catalogus. Zelfde ratio t.o.v. catalogus-max voor aangrenzende slots:
 * 7 vs 10 bij max 47 (Δ 3 ≤ 7,05) wordt één keten; 10 vs 22 (Δ 12) blijft split.
 */
export const CHAIN_THICKNESS_HYSTERESIS_RATIO = 0.15

function adjacentCatalogSlotsClose(
  slotA: number,
  slotB: number,
  catalog: readonly number[],
): boolean {
  if (Math.abs(slotA - slotB) !== 1) return false
  const cmA = catalog[slotA]
  const cmB = catalog[slotB]
  if (cmA == null || cmB == null) return false
  const maxCm = catalogMaxCm(catalog)
  if (!(maxCm > 0)) return false
  return Math.abs(cmA - cmB) <= maxCm * CHAIN_THICKNESS_HYSTERESIS_RATIO
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
 * Zelfde meetband / catalogus-slot, aangrenzende slots binnen 15% van de
 * catalogus-max, of naburige metingen binnen hysterese (meetruis).
 */
export function thicknessesCompatibleForChain(
  aCm: number,
  bCm: number,
  boundaries: FmlThicknessBandBoundaries = DEFAULT_FML_BAND_BOUNDARIES,
  catalogCms?: readonly number[],
): boolean {
  if (!(aCm > 0) || !(bCm > 0)) return true
  if (catalogCms && catalogCms.length >= 3) {
    const catalog = normalizeThicknessCatalog(catalogCms)
    const slotA = classifyThicknessSlot(aCm, catalog)
    const slotB = classifyThicknessSlot(bCm, catalog)
    if (slotA === slotB) return true
    if (adjacentCatalogSlotsClose(slotA, slotB, catalog)) return true
  } else if (
    classifyFmlThicknessBand(aCm, boundaries) === classifyFmlThicknessBand(bCm, boundaries)
  ) {
    return true
  }
  const larger = Math.max(aCm, bCm)
  return Math.abs(aCm - bCm) / larger <= CHAIN_THICKNESS_HYSTERESIS_RATIO
}

/**
 * Groepeer muren in dikte-ketens.
 * Collineair door T/X alleen bij dezelfde slot/band, aangrenzende slots
 * binnen 15% van de catalogus-max, of 15% meet-hysterese —
 * een echte stap (7 vs 15 vs 30, 10 vs 22) blijft gesplitst zodat balance kan flushen.
 * Meetruis (10 vs 11) en dichte buren (7 vs 10 bij max 47) blijven één keten.
 * T-arm / L daarna op ketengemiddelde. Korte dik-dun-dik brug (kozijn) mag mergen.
 */
export function buildFmlThicknessChains(
  walls: Wall[],
  boundaries: FmlThicknessBandBoundaries = DEFAULT_FML_BAND_BOUNDARIES,
  catalogCms?: readonly number[],
): number[][] {
  const count = walls.length
  if (count <= 1) return walls.map((_, index) => [index])

  const uf = new UnionFind(count)
  const wallsAtPoint = new Map<string, number[]>()

  for (let index = 0; index < count; index += 1) {
    const wall = walls[index]
    for (const point of [wall.a, wall.b]) {
      const key = wallEndpointKey(point)
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
        if (!areCollinearWalls(walls[left], walls[right])) continue
        if (
          !thicknessesCompatibleForChain(
            walls[left].thickness,
            walls[right].thickness,
            boundaries,
            catalogCms,
          )
        ) {
          continue
        }
        uf.union(left, right)
      }
    }
  }

  const chainLength = new Array<number>(count).fill(0)
  const chainWeighted = new Array<number>(count).fill(0)
  for (let index = 0; index < count; index += 1) {
    const root = uf.find(index)
    const length = Math.max(0, wallLengthCm(walls[index]))
    chainLength[root] += length
    chainWeighted[root] += walls[index].thickness * length
  }

  const chainAverageCm = (index: number): number => {
    const root = uf.find(index)
    const length = chainLength[root]
    return length > 0 ? chainWeighted[root] / length : walls[index].thickness
  }

  // T-arm / L: alleen als de ketens ná de collineaire merge nog compatibel zijn.
  // Zo trekt een ruizig 10 cm-middenstuk geen 10 cm-T-arm de 15 cm-lijn in.
  for (const indices of wallsAtPoint.values()) {
    for (let i = 0; i < indices.length; i += 1) {
      for (let j = i + 1; j < indices.length; j += 1) {
        const left = indices[i]
        const right = indices[j]
        if (uf.find(left) === uf.find(right)) continue
        if (areCollinearWalls(walls[left], walls[right])) continue
        if (
          !thicknessesCompatibleForChain(
            chainAverageCm(left),
            chainAverageCm(right),
            boundaries,
            catalogCms,
          )
        ) {
          continue
        }
        const rootA = uf.find(left)
        const rootB = uf.find(right)
        chainLength[rootA] += chainLength[rootB]
        chainWeighted[rootA] += chainWeighted[rootB]
        uf.union(left, right)
      }
    }
  }

  // ESC:X-04 (A)
  // Brug-regel: dik-dun-dik op dezelfde lijn blijft één keten.
  // Dunne tussensegmenten (bv kozijn/ruis) verbinden twee gelijke buitenbanden.
  for (let bridgeIndex = 0; bridgeIndex < count; bridgeIndex += 1) {
    const bridge = walls[bridgeIndex]
    const bridgeBand = classifyChainSlot(bridge.thickness, boundaries, catalogCms)
    const bridgeLength = wallLengthCm(bridge)
    const pointA = wallsAtPoint.get(wallEndpointKey(bridge.a)) ?? []
    const pointB = wallsAtPoint.get(wallEndpointKey(bridge.b)) ?? []
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
    const leftBand = classifyChainSlot(walls[leftIndex].thickness, boundaries, catalogCms)
    const rightBand = classifyChainSlot(walls[rightIndex].thickness, boundaries, catalogCms)
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
function classifyChainSlot(
  thicknessCm: number,
  boundaries: FmlThicknessBandBoundaries,
  catalogCms?: readonly number[],
): string {
  if (catalogCms && catalogCms.length >= 3) {
    return String(classifyThicknessSlot(thicknessCm, catalogCms))
  }
  return classifyFmlThicknessBand(thicknessCm, boundaries)
}

function resolveChainCatalogCm(
  chain: number[],
  walls: Wall[],
  catalogCms: readonly number[],
): number {
  const catalog = normalizeThicknessCatalog(catalogCms)
  let weighted = 0
  let lengthSum = 0
  for (const index of chain) {
    const wall = walls[index]
    if (!wall) continue
    const len = Math.max(0, wallLengthCm(wall))
    weighted += wall.thickness * len
    lengthSum += len
  }
  const avg =
    lengthSum > 0 ? weighted / lengthSum : (walls[chain[0]]?.thickness ?? catalog[0] ?? 10)
  return nearestCatalogCm(roundFmlThicknessCm(avg), catalog)
}

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
 * Harmoniseert muurdikte per keten en mapt naar catalogus-cm of min/mid/max.
 * Collineaire T/X-stukken delen een keten alleen bij dezelfde slot/band,
 * dichte aangrenzende slots (Δcatalog ≤ 15% van max) of 15% hysterese;
 * een echte stap blijft gesplitst. T-arm breekt bij incompatibele
 * ketengemiddeldes. Balance: default 0.5; collineaire diktewissel-ketens flushen
 * alleen bij face-evidence (hint vanaf dikste); junction stubs in die scope
 * mogen verdwijnen — ESC:X-01.
 * Daarna sanitize (weld + near-H/V op as + collinear cover). Viewer = export.
 *
 * Flush is keep-axis (gedeelde L10-lijn): alleen `balance`, `a`/`b` blijven.
 */
export function harmonizeFmlWallThickness(
  plan: FloorPlan,
  limits: FmlWallThicknessLimits,
  boundaries: FmlThicknessBandBoundaries = DEFAULT_FML_BAND_BOUNDARIES,
  faceEvidenceById?: Map<string, WallFaceExtentsCm>,
  pinnedWallIds?: ReadonlySet<string> | readonly string[],
  catalogCms?: readonly number[],
): FloorPlan {
  const pinned =
    pinnedWallIds == null
      ? null
      : pinnedWallIds instanceof Set
        ? pinnedWallIds
        : new Set(pinnedWallIds)
  const catalog =
    catalogCms && catalogCms.length >= 3
      ? normalizeThicknessCatalog(catalogCms)
      : limits.thicknessCms && limits.thicknessCms.length >= 3
        ? normalizeThicknessCatalog(limits.thicknessCms)
        : null

  return {
    ...plan,
    floors: plan.floors.map((floor) => {
      const freeIndices: number[] = []
      for (let index = 0; index < floor.walls.length; index += 1) {
        const wall = floor.walls[index]
        if (!wall) continue
        if (pinned?.has(wall.id)) continue
        freeIndices.push(index)
      }

      const freeWalls = freeIndices.map((index) => floor.walls[index])
      const freeChains = buildFmlThicknessChains(freeWalls, boundaries, catalog ?? undefined)
      const thicknessByIndex = new Map<number, number>()

      for (const chain of freeChains) {
        const exportThickness = catalog
          ? resolveChainCatalogCm(chain, freeWalls, catalog)
          : resolveBandThicknessCm(resolveChainBand(chain, freeWalls, boundaries), limits)
        for (const local of chain) {
          const globalIndex = freeIndices[local]
          if (globalIndex != null) thicknessByIndex.set(globalIndex, exportThickness)
        }
      }

      const thicknessAssigned = floor.walls.map((wall, index) => {
        if (pinned?.has(wall.id)) {
          return wall
        }
        const exportThickness =
          thicknessByIndex.get(index) ??
          (catalog
            ? nearestCatalogCm(roundFmlThicknessCm(wall.thickness), catalog)
            : resolveBandThicknessCm(
                classifyFmlThicknessBand(roundFmlThicknessCm(wall.thickness), boundaries),
                limits,
              ))
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

      const nextWalls = sanitizeFmlWalls(
        alignWallJunctionBalance(thicknessAssigned, faceEvidenceById),
      )
      // designs[0] is een snapshot (ensureRidgeDesign bij generate). Zonder flush
      // blijft daar de ruwe L10-meting staan — project-download las die snapshot.
      return ensureDesignsSynced({
        ...floor,
        walls: nextWalls,
      })
    }),
  }
}
