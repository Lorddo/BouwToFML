import { tally } from '@/core/diagnostics'
import {
  isWallMaskClass,
  resolvePixelClassification,
  type RoomRasterClass,
} from '@/cv/walls/rooms/room-ink-classify'
import type { RasterRoomComponent } from '@/cv/walls/rooms/room-raster'
import { resolveMergedLabel, type CardinalDirection } from '@/cv/walls/rooms/room-raster-merge'
import { resolveDoorBetweenWallsAxis } from './door-bridge-wall-promote'
import { aggregateRootFaces, type RootFace } from './door-swing-filter-matching'
import type { DoorSwingHypothesis } from './types'

function resolveRoots(faceIds: readonly number[], parentMap: Map<number, number>): Set<number> {
  const roots = new Set<number>()
  for (const faceId of faceIds) {
    if (faceId <= 0) continue
    const root = resolveMergedLabel(faceId, parentMap)
    if (root > 0) roots.add(root)
  }
  return roots
}

/** 1-hop ink-adjacency tussen twee hypotheses (gedeelde face-buur). */
function hypothesesAreAdjacent(params: {
  a: DoorSwingHypothesis
  b: DoorSwingHypothesis
  adjacency: Map<number, Set<number>>
  parentMap: Map<number, number>
}): boolean {
  const aRoots = resolveRoots(params.a.faceIds, params.parentMap)
  const bRoots = resolveRoots(params.b.faceIds, params.parentMap)
  if (aRoots.size === 0 || bRoots.size === 0) return false
  for (const root of aRoots) {
    for (const raw of params.adjacency.get(root) ?? []) {
      const n = resolveMergedLabel(raw, params.parentMap)
      if (n > 0 && bRoots.has(n)) return true
    }
  }
  return false
}

function samplePointsOnSide(
  bbox: { x: number; y: number; width: number; height: number },
  direction: CardinalDirection,
): Array<{ x: number; y: number; dx: number; dy: number }> {
  const { x, y, width, height } = bbox
  const along = [0.25, 0.5, 0.75]
  switch (direction) {
    case 'left':
      return along.map((q) => ({
        x: x - 1,
        y: y + Math.floor(height * q),
        dx: -1,
        dy: 0,
      }))
    case 'right':
      return along.map((q) => ({
        x: x + width,
        y: y + Math.floor(height * q),
        dx: 1,
        dy: 0,
      }))
    case 'top':
      return along.map((q) => ({
        x: x + Math.floor(width * q),
        y: y - 1,
        dx: 0,
        dy: -1,
      }))
    case 'bottom':
      return along.map((q) => ({
        x: x + Math.floor(width * q),
        y: y + height,
        dx: 0,
        dy: 1,
      }))
  }
}

/** Eerste face buiten skipRoots — géén micro-skip (arceringsmuren ≤3% short-side). */
function firstNeighborRootNoMicroSkip(params: {
  x: number
  y: number
  dx: number
  dy: number
  skipRoots: ReadonlySet<number>
  labelAt: (x: number, y: number) => number
  width: number
  height: number
  resolve: (label: number) => number
  maxMarchPx: number
}): number | null {
  let x = params.x
  let y = params.y
  let marched = 0
  while (marched < params.maxMarchPx) {
    if (x < 0 || y < 0 || x >= params.width || y >= params.height) return null
    const raw = params.labelAt(x, y)
    if (raw === 0) {
      x += params.dx
      y += params.dy
      marched += 1
      continue
    }
    const hit = params.resolve(raw)
    if (params.skipRoots.has(hit)) {
      x += params.dx
      y += params.dy
      marched += 1
      continue
    }
    return hit
  }
  return null
}

function sideIsWalledByAnyWallish(params: {
  bbox: { x: number; y: number; width: number; height: number }
  direction: CardinalDirection
  skipRoots: ReadonlySet<number>
  labelAt: (x: number, y: number) => number
  width: number
  height: number
  resolve: (label: number) => number
  classForRoot: (root: number) => RoomRasterClass | null
}): boolean {
  const maxMarchPx = Math.max(params.width, params.height)
  const samples = samplePointsOnSide(params.bbox, params.direction)
  for (const sample of samples) {
    const neighbor = firstNeighborRootNoMicroSkip({
      x: sample.x,
      y: sample.y,
      dx: sample.dx,
      dy: sample.dy,
      skipRoots: params.skipRoots,
      labelAt: params.labelAt,
      width: params.width,
      height: params.height,
      resolve: params.resolve,
      maxMarchPx,
    })
    if (neighbor == null) return false
    const cls = params.classForRoot(neighbor)
    if (cls == null || !isWallMaskClass(cls)) return false
  }
  return true
}

/**
 * D-62 only — licht: micro-wall fragments tellen als muur; unanieme samples.
 * Niet delen met D-40 bridge (`isBridgeSeedBetweenTwoWalls`).
 */
function isDoorHitBetweenTwoWalls(params: {
  face: RootFace
  axis: 'h' | 'v'
  labelsData: Int32Array
  width: number
  height: number
  parentMap: Map<number, number>
  rootFaces: Map<number, RootFace>
  classificationByLabel: Map<number, RoomRasterClass>
  classificationGroupBy: 'merged' | 'component'
  skipRoots?: ReadonlySet<number>
}): boolean {
  const labelAt = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= params.width || y >= params.height) return 0
    return params.labelsData[y * params.width + x] ?? 0
  }
  const resolve = (label: number) => resolveMergedLabel(label, params.parentMap)
  const skipRoots = new Set<number>(params.skipRoots ?? [])
  skipRoots.add(params.face.root)

  const classForRoot = (root: number): RoomRasterClass | null => {
    if (root <= 0) return null
    const hit = params.rootFaces.get(root)
    if (hit) return hit.className
    return resolvePixelClassification(
      root,
      params.parentMap,
      params.classificationByLabel,
      params.classificationGroupBy,
    )
  }

  const sideParams = {
    bbox: params.face.bbox,
    skipRoots,
    labelAt,
    width: params.width,
    height: params.height,
    resolve,
    classForRoot,
  }

  if (params.axis === 'h') {
    return (
      sideIsWalledByAnyWallish({ ...sideParams, direction: 'left' }) &&
      sideIsWalledByAnyWallish({ ...sideParams, direction: 'right' })
    )
  }
  return (
    sideIsWalledByAnyWallish({ ...sideParams, direction: 'top' }) &&
    sideIsWalledByAnyWallish({ ...sideParams, direction: 'bottom' })
  )
}

function hypothesisBetweenTwoWalls(params: {
  hypothesis: DoorSwingHypothesis
  labelsData: Int32Array
  width: number
  height: number
  parentMap: Map<number, number>
  rootFaces: Map<number, RootFace>
  classificationByLabel: Map<number, RoomRasterClass>
  classificationGroupBy: 'merged' | 'component'
}): boolean {
  const roots = resolveRoots(params.hypothesis.faceIds, params.parentMap)
  if (roots.size === 0) return false
  const primaryRoot = [...roots].sort((a, b) => a - b)[0]
  const primaryFace = params.rootFaces.get(primaryRoot)
  const face: RootFace = {
    root: primaryRoot,
    areaPx: params.hypothesis.filledAreaPx,
    bbox: { ...params.hypothesis.unionBBox },
    className: primaryFace?.className ?? 'door',
  }
  return isDoorHitBetweenTwoWalls({
    face,
    axis: resolveDoorBetweenWallsAxis(params.hypothesis.unionBBox),
    labelsData: params.labelsData,
    width: params.width,
    height: params.height,
    parentMap: params.parentMap,
    rootFaces: params.rootFaces,
    classificationByLabel: params.classificationByLabel,
    classificationGroupBy: params.classificationGroupBy,
    skipRoots: roots,
  })
}

function mergeDoorframeIds(existing: number[] | undefined, extra: number[]): number[] | undefined {
  if (extra.length <= 0) return existing && existing.length > 0 ? [...existing] : undefined
  const merged = new Set<number>(existing ?? [])
  for (const id of extra) {
    if (id > 0) merged.add(id)
  }
  if (merged.size <= 0) return undefined
  return [...merged].sort((a, b) => a - b)
}

export type DoorPairDemoteResult = {
  /** Overgebleven swing-hypotheses (kozijn-paren gedemote). */
  swings: DoorSwingHypothesis[]
  /** FaceIds van gekoppelde kozijnen (push → class doorframe; alleen bij swing). */
  demotedDoorframeFaceIds: number[]
  /** FaceIds van wees-kozijnen (tussen muren, geen swing) → push class wall. */
  demotedWallFaceIds: number[]
  /** Kozijn-faces per swing-hypothese-id (pair only). */
  byHypothesisId: Map<string, number[]>
}

/**
 * ESC:D-62 — Stage-2 pair/demote: adjacent deur-hits waarvan exact één
 * `betweenTwoWalls` is → kozijn wordt doorframe, boog blijft deur.
 * Wees-kozijn (tussen muren, geen swing) → wall (geen losse doorframe).
 */
export function pairDemoteDoorHypotheses(params: {
  hypotheses: DoorSwingHypothesis[]
  components: RasterRoomComponent[]
  labelsData: Int32Array
  width: number
  height: number
  parentMap: Map<number, number>
  classificationByLabel: Map<number, RoomRasterClass>
  classificationGroupBy?: 'merged' | 'component'
  adjacency: Map<number, Set<number>>
}): DoorPairDemoteResult {
  const empty: DoorPairDemoteResult = {
    swings: params.hypotheses,
    demotedDoorframeFaceIds: [],
    demotedWallFaceIds: [],
    byHypothesisId: new Map(),
  }
  if (params.hypotheses.length === 0 || params.components.length === 0) return empty

  const classificationGroupBy = params.classificationGroupBy ?? 'component'
  const rootFaces = aggregateRootFaces({
    components: params.components,
    parentMap: params.parentMap,
    classificationByLabel: params.classificationByLabel,
    classificationGroupBy,
  })
  if (rootFaces.size === 0) return empty

  const sorted = [...params.hypotheses].sort((a, b) => a.id.localeCompare(b.id))
  const betweenById = new Map<string, boolean>()
  for (const hyp of sorted) {
    betweenById.set(
      hyp.id,
      hypothesisBetweenTwoWalls({
        hypothesis: hyp,
        labelsData: params.labelsData,
        width: params.width,
        height: params.height,
        parentMap: params.parentMap,
        rootFaces,
        classificationByLabel: params.classificationByLabel,
        classificationGroupBy,
      }),
    )
  }

  const demotedFrameIds = new Set<string>()
  const pairedSwingIds = new Set<string>()
  const framesBySwing = new Map<string, number[]>()
  const demotedDoorframeFaceIds = new Set<number>()
  const demotedWallFaceIds = new Set<number>()

  for (let i = 0; i < sorted.length; i += 1) {
    const a = sorted[i]
    if (demotedFrameIds.has(a.id) || pairedSwingIds.has(a.id)) continue
    for (let j = i + 1; j < sorted.length; j += 1) {
      const b = sorted[j]
      if (demotedFrameIds.has(b.id) || pairedSwingIds.has(b.id)) continue
      const aBetween = betweenById.get(a.id) === true
      const bBetween = betweenById.get(b.id) === true
      if (aBetween === bBetween) continue
      if (
        !hypothesesAreAdjacent({
          a,
          b,
          adjacency: params.adjacency,
          parentMap: params.parentMap,
        })
      ) {
        continue
      }
      const frame = aBetween ? a : b
      const swing = aBetween ? b : a
      demotedFrameIds.add(frame.id)
      pairedSwingIds.add(swing.id)
      const frameFaces = frame.faceIds.filter((id) => id > 0)
      for (const id of frameFaces) demotedDoorframeFaceIds.add(id)
      const prev = framesBySwing.get(swing.id) ?? []
      framesBySwing.set(swing.id, [...prev, ...frameFaces])
      // ESC:D-62 (A)
      tally('D-62', 'paired_frame_to_doorframe')
      break
    }
  }

  for (const hyp of sorted) {
    if (demotedFrameIds.has(hyp.id) || pairedSwingIds.has(hyp.id)) continue
    if (betweenById.get(hyp.id) !== true) continue
    demotedFrameIds.add(hyp.id)
    for (const id of hyp.faceIds) {
      if (id > 0) demotedWallFaceIds.add(id)
    }
    // ESC:D-62 (A) — geen losse doorframe; terug naar muur.
    tally('D-62', 'orphan_frame_to_wall')
  }

  const byHypothesisId = new Map<string, number[]>()
  for (const [swingId, faces] of framesBySwing) {
    byHypothesisId.set(
      swingId,
      [...new Set(faces)].sort((a, b) => a - b),
    )
  }

  const swings = sorted
    .filter((hyp) => !demotedFrameIds.has(hyp.id))
    .map((hyp) => {
      const paired = byHypothesisId.get(hyp.id)
      if (!paired || paired.length <= 0) return hyp
      const doorframeFaceIds = mergeDoorframeIds(hyp.doorframeFaceIds, paired)
      return doorframeFaceIds ? { ...hyp, doorframeFaceIds } : hyp
    })

  return {
    swings,
    demotedDoorframeFaceIds: [...demotedDoorframeFaceIds].sort((a, b) => a - b),
    demotedWallFaceIds: [...demotedWallFaceIds].sort((a, b) => a - b),
    byHypothesisId,
  }
}
