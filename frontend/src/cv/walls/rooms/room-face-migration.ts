import { resolveMergedLabel } from './room-raster-merge'
import type { RoomRasterClass } from './room-ink-classify'
import type { SerializedRoomClassifyState } from '../strategies/room-first'
import type { RoomRasterCache } from './room-raster-cache'
import { createRoomRasterCache } from './room-raster-cache'
import { mapFromEntries } from './room-raster-cache-dual'
import { applyFaceClassificationOverrides } from './room-ink-classify'

export interface FaceComponentSignature {
  areaPx: number
  perimeterPx: number
  bbox: { x: number; y: number; width: number; height: number }
}

export interface FaceAssignmentMigration {
  signature: FaceComponentSignature
  class: RoomRasterClass
}

/** Ankerpunt (centroid) + class — robuuster dan omtrek-match na CC-herbouw. */
export interface FaceSpatialAssignment {
  x: number
  y: number
  class: RoomRasterClass
}

function resolveComponentLabel(
  rawLabel: number,
  parentMap: Map<number, number>,
  groupBy: 'component' | 'merged',
): number {
  if (rawLabel <= 0) return 0
  if (groupBy === 'merged') return resolveMergedLabel(rawLabel, parentMap)
  return rawLabel
}

/** Pixel-omtrek + bbox per face-component (voor handmatige override-migratie). */
export function computeFaceSignatures(state: SerializedRoomClassifyState): Map<number, FaceComponentSignature> {
  const { width, height, labelsData } = state
  const parentMap = mapFromEntries(state.parentMap)
  const groupBy = state.classificationGroupBy ?? 'component'

  const componentAt = (x: number, y: number): number =>
    resolveComponentLabel(labelsData[y * width + x] ?? 0, parentMap, groupBy)

  const areaByLabel = new Map<number, number>()
  const minX = new Map<number, number>()
  const minY = new Map<number, number>()
  const maxX = new Map<number, number>()
  const maxY = new Map<number, number>()
  const perimeterByLabel = new Map<number, number>()

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const label = componentAt(x, y)
      if (label <= 0) continue
      areaByLabel.set(label, (areaByLabel.get(label) ?? 0) + 1)
      minX.set(label, Math.min(minX.get(label) ?? x, x))
      minY.set(label, Math.min(minY.get(label) ?? y, y))
      maxX.set(label, Math.max(maxX.get(label) ?? x, x))
      maxY.set(label, Math.max(maxY.get(label) ?? y, y))

      const neighbors = [
        [x > 0 ? componentAt(x - 1, y) : -1, true],
        [x < width - 1 ? componentAt(x + 1, y) : -1, true],
        [y > 0 ? componentAt(x, y - 1) : -1, true],
        [y < height - 1 ? componentAt(x, y + 1) : -1, true],
      ] as const
      let boundaryEdges = 0
      for (const [neighbor] of neighbors) {
        if (neighbor !== label) boundaryEdges += 1
      }
      if (boundaryEdges > 0) {
        perimeterByLabel.set(label, (perimeterByLabel.get(label) ?? 0) + boundaryEdges)
      }
    }
  }

  const signatures = new Map<number, FaceComponentSignature>()
  for (const label of areaByLabel.keys()) {
    const x0 = minX.get(label) ?? 0
    const y0 = minY.get(label) ?? 0
    const x1 = maxX.get(label) ?? 0
    const y1 = maxY.get(label) ?? 0
    signatures.set(label, {
      areaPx: areaByLabel.get(label) ?? 0,
      perimeterPx: perimeterByLabel.get(label) ?? 0,
      bbox: { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 },
    })
  }
  return signatures
}

/** Zwaartepunt per face-component in `labelsData` (component-niveau). */
function computeFaceCentroids(
  state: SerializedRoomClassifyState,
): Map<number, { x: number; y: number }> {
  const { width, height, labelsData } = state
  const parentMap = mapFromEntries(state.parentMap)
  const groupBy = state.classificationGroupBy ?? 'component'
  const sumX = new Map<number, number>()
  const sumY = new Map<number, number>()
  const count = new Map<number, number>()

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const label = resolveComponentLabel(labelsData[y * width + x] ?? 0, parentMap, groupBy)
      if (label <= 0) continue
      sumX.set(label, (sumX.get(label) ?? 0) + x)
      sumY.set(label, (sumY.get(label) ?? 0) + y)
      count.set(label, (count.get(label) ?? 0) + 1)
    }
  }

  const centroids = new Map<number, { x: number; y: number }>()
  for (const label of count.keys()) {
    const n = count.get(label) ?? 1
    centroids.set(label, {
      x: (sumX.get(label) ?? 0) / n,
      y: (sumY.get(label) ?? 0) / n,
    })
  }
  return centroids
}

export function faceSignaturesMatch(a: FaceComponentSignature, b: FaceComponentSignature): boolean {
  return (
    a.areaPx === b.areaPx &&
    a.perimeterPx === b.perimeterPx &&
    a.bbox.x === b.bbox.x &&
    a.bbox.y === b.bbox.y &&
    a.bbox.width === b.bbox.width &&
    a.bbox.height === b.bbox.height
  )
}

function effectiveClassification(cache: RoomRasterCache): Map<number, RoomRasterClass> {
  return applyFaceClassificationOverrides(
    mapFromEntries(cache.state.classificationByLabel),
    cache.faceOverrides,
  )
}

/** Verzamel handmatige toewijzingen vóór een nieuwe classify-run. */
export function collectAssignmentsForMigration(cache: RoomRasterCache): FaceAssignmentMigration[] {
  const signatures = computeFaceSignatures(cache.state)
  const effective = effectiveClassification(cache)
  const assignments: FaceAssignmentMigration[] = []
  const seen = new Set<string>()

  const labelsToMigrate =
    cache.pinnedRoots.size > 0
      ? [...cache.pinnedRoots]
      : cache.faceOverrides.size > 0
        ? [...cache.faceOverrides.keys()]
        : [...effective.keys()].filter((label) => {
            const cls = effective.get(label)
            return cls != null && cls !== 'outside'
          })

  for (const label of labelsToMigrate) {
    const signature = signatures.get(label)
    const cls = cache.faceOverrides.get(label) ?? effective.get(label)
    if (!signature || !cls || cls === 'outside') continue
    const key = `${signature.areaPx}:${signature.perimeterPx}:${cls}`
    if (seen.has(key)) continue
    seen.add(key)
    assignments.push({ signature, class: cls })
  }

  return assignments
}

/** Verzamel handmatige keuzes als ruimtelijke ankers (vóór CC-herbouw). */
export function collectSpatialAssignmentsForMigration(params: {
  state: SerializedRoomClassifyState
  priorOverrides: Map<number, RoomRasterClass>
  pinnedRoots: Set<number>
}): FaceSpatialAssignment[] {
  const centroids = computeFaceCentroids(params.state)
  const assignments: FaceSpatialAssignment[] = []
  const seen = new Set<string>()

  const labelsToMigrate =
    params.pinnedRoots.size > 0
      ? [...params.pinnedRoots]
      : [...params.priorOverrides.keys()]

  for (const label of labelsToMigrate) {
    const centroid = centroids.get(label)
    const cls = params.priorOverrides.get(label)
    if (!centroid || !cls || cls === 'outside') continue
    const key = `${Math.round(centroid.x)}:${Math.round(centroid.y)}:${cls}`
    if (seen.has(key)) continue
    seen.add(key)
    assignments.push({ x: centroid.x, y: centroid.y, class: cls })
  }

  return assignments
}

/** Zoek face-label op positie; spiraal bij inkt (label 0). */
function resolveFaceLabelAtPosition(
  labelsData: Int32Array,
  width: number,
  height: number,
  x: number,
  y: number,
  maxRadius = 16,
): number | null {
  const labelAt = (px: number, py: number): number => {
    if (px < 0 || py < 0 || px >= width || py >= height) return 0
    return labelsData[py * width + px] ?? 0
  }

  const cx = Math.round(x)
  const cy = Math.round(y)
  const direct = labelAt(cx, cy)
  if (direct > 0) return direct

  for (let r = 1; r <= maxRadius; r += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      for (let dy = -r; dy <= r; dy += 1) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue
        const label = labelAt(cx + dx, cy + dy)
        if (label > 0) return label
      }
    }
  }
  return null
}

/** Map handmatige keuzes naar nieuwe labels via ruimtelijk anker (niet omtrek-match). */
function applySpatialFaceOverrides(
  newState: SerializedRoomClassifyState,
  assignments: FaceSpatialAssignment[],
): { faceOverrides: Map<number, RoomRasterClass>; pinnedRoots: Set<number>; applied: number; dropped: number } {
  const faceOverrides = new Map<number, RoomRasterClass>()
  const pinnedRoots = new Set<number>()
  if (assignments.length === 0) {
    return { faceOverrides, pinnedRoots, applied: 0, dropped: 0 }
  }

  const { width, height, labelsData } = newState
  const labels =
    labelsData instanceof Int32Array ? labelsData : new Int32Array(labelsData)
  const claimed = new Set<number>()
  let applied = 0
  let dropped = 0

  for (const assignment of assignments) {
    const matchLabel = resolveFaceLabelAtPosition(
      labels,
      width,
      height,
      assignment.x,
      assignment.y,
    )
    if (matchLabel == null || claimed.has(matchLabel)) {
      dropped += 1
      continue
    }
    claimed.add(matchLabel)
    faceOverrides.set(matchLabel, assignment.class)
    pinnedRoots.add(matchLabel)
    applied += 1
  }

  return { faceOverrides, pinnedRoots, applied, dropped }
}

/** Herbereken: behoud handmatige keuzes via centroid → nieuw label na CC-herbouw. */
export function migratePinnedOverridesSpatially(params: {
  priorState: SerializedRoomClassifyState
  priorOverrides: Map<number, RoomRasterClass>
  pinnedRoots: Set<number>
  newState: SerializedRoomClassifyState
}): { faceOverrides: Map<number, RoomRasterClass>; pinnedRoots: Set<number>; applied: number; dropped: number } {
  const assignments = collectSpatialAssignmentsForMigration({
    state: params.priorState,
    priorOverrides: params.priorOverrides,
    pinnedRoots: params.pinnedRoots,
  })
  return applySpatialFaceOverrides(params.newState, assignments)
}

/** Pas handmatige toewijzingen toe op nieuwe topologie; verwerp bij gewijzigde omtrek. */
export function applyMigratedFaceOverrides(
  cache: RoomRasterCache,
  assignments: FaceAssignmentMigration[],
): { applied: number; dropped: number } {
  if (assignments.length === 0) return { applied: 0, dropped: 0 }

  const newSignatures = computeFaceSignatures(cache.state)
  const claimed = new Set<number>()
  let applied = 0
  let dropped = 0

  for (const assignment of assignments) {
    let matchLabel: number | null = null
    for (const [label, signature] of newSignatures.entries()) {
      if (claimed.has(label)) continue
      if (!faceSignaturesMatch(assignment.signature, signature)) continue
      matchLabel = label
      break
    }
    if (matchLabel == null) {
      dropped += 1
      continue
    }
    claimed.add(matchLabel)
    cache.faceOverrides.set(matchLabel, assignment.class)
    cache.pinnedRoots.add(matchLabel)
    applied += 1
  }

  return { applied, dropped }
}

/** Behoud pinned handmatige keuzes na topologie-wijziging (ink-resolve, merge, splits). */
export function migratePinnedOverridesToTopology(params: {
  priorState: SerializedRoomClassifyState
  priorOverrides: Map<number, RoomRasterClass>
  pinnedRoots: Set<number>
  newLabelsData: Int32Array
  newParentMap?: Array<[number, number]>
  width: number
  height: number
}): { faceOverrides: Map<number, RoomRasterClass>; pinnedRoots: Set<number> } {
  const priorCache = createRoomRasterCache({
    ...params.priorState,
    labelsData:
      params.priorState.labelsData instanceof Int32Array
        ? params.priorState.labelsData
        : new Int32Array(params.priorState.labelsData),
  })
  priorCache.faceOverrides = new Map(params.priorOverrides)
  priorCache.pinnedRoots = new Set(params.pinnedRoots)

  const assignments = collectAssignmentsForMigration(priorCache)
  const newCache = createRoomRasterCache({
    ...params.priorState,
    width: params.width,
    height: params.height,
    labelsData: params.newLabelsData,
    parentMap: params.newParentMap ?? [],
  })
  applyMigratedFaceOverrides(newCache, assignments)
  return {
    faceOverrides: newCache.faceOverrides,
    pinnedRoots: newCache.pinnedRoots,
  }
}
