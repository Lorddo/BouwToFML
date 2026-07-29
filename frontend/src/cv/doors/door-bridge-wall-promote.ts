import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import { resolvePixelClassification } from '@/cv/walls/rooms/room-ink-classify'
import type { RasterRoomComponent } from '@/cv/walls/rooms/room-raster'
import { cardinalNeighborRoots, resolveMergedLabel } from '@/cv/walls/rooms/room-raster-merge'
import { aggregateRootFaces, type RootFace } from './door-swing-filter-matching'
import type { DoorSwingHypothesis } from './types'

const DEFAULT_SPAN_TOLERANCE_RATIO = 0.15
const DEFAULT_SHORT_AXIS_RATIO = 1.5
const WALL_THICKNESS_RATIO = 2

type BridgeAxis = 'h' | 'v'

function resolveAxis(bbox: { width: number; height: number }): BridgeAxis {
  return bbox.width >= bbox.height ? 'h' : 'v'
}

function resolveSpan(bbox: { width: number; height: number }): number {
  return Math.max(1, bbox.width, bbox.height)
}

function resolveShort(bbox: { width: number; height: number }): number {
  return Math.max(1, Math.min(bbox.width, bbox.height))
}

function isPromotableClass(className: RoomRasterClass): boolean {
  return className === 'surface' || className === 'unknown'
}

function withinBridgeBand(params: {
  face: RootFace
  doorSpanPx: number
  doorShortPx: number
  referenceWallThicknessPx: number
  spanToleranceRatio: number
}): boolean {
  const faceLong = resolveSpan(params.face.bbox)
  const faceShort = resolveShort(params.face.bbox)
  const minLong = Math.max(1, Math.round(params.doorSpanPx * (1 - params.spanToleranceRatio)))
  const maxLong = Math.max(minLong, Math.round(params.doorSpanPx * (1 + params.spanToleranceRatio)))
  if (faceLong < minLong || faceLong > maxLong) return false

  const maxShort = Math.max(
    Math.round(params.doorShortPx * DEFAULT_SHORT_AXIS_RATIO),
    Math.round(params.referenceWallThicknessPx * WALL_THICKNESS_RATIO),
  )
  return faceShort <= Math.max(1, maxShort)
}

/** Seed alleen als de face een deur-face raakt (adjacency). Geen bbox-gap jumps. */
function touchesDoorFace(params: {
  candidateRoot: number
  doorRoots: Set<number>
  adjacency: Map<number, Set<number>>
}): boolean {
  for (const doorRoot of params.doorRoots) {
    if (params.adjacency.get(doorRoot)?.has(params.candidateRoot)) return true
  }
  return false
}

function isSeedBetweenTwoWalls(params: {
  face: RootFace
  axis: BridgeAxis
  componentsByLabel: Map<number, RasterRoomComponent>
  labelsData: Int32Array
  width: number
  height: number
  parentMap: Map<number, number>
  rootFaces: Map<number, RootFace>
  classificationByLabel: Map<number, RoomRasterClass>
  classificationGroupBy: 'merged' | 'component'
}): boolean {
  const labelAt = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= params.width || y >= params.height) return 0
    return params.labelsData[y * params.width + x] ?? 0
  }
  const resolve = (label: number) => resolveMergedLabel(label, params.parentMap)
  const neighbors = cardinalNeighborRoots({
    child: {
      label: params.face.root,
      areaPx: params.face.areaPx,
      bbox: { ...params.face.bbox },
      touchesBorder: false,
    },
    labelAt,
    imageWidth: params.width,
    imageHeight: params.height,
    resolve,
    componentsByLabel: params.componentsByLabel,
  })
  const [left, right, top, bottom] = neighbors

  const classForRoot = (root: number | null): RoomRasterClass | null => {
    if (root == null) return null
    const hit = params.rootFaces.get(root)
    if (hit) return hit.className
    return resolvePixelClassification(
      root,
      params.parentMap,
      params.classificationByLabel,
      params.classificationGroupBy,
    )
  }

  if (params.axis === 'h') {
    if (left == null || right == null || left === right) return false
    return classForRoot(left) === 'wall' && classForRoot(right) === 'wall'
  }
  if (top == null || bottom == null || top === bottom) return false
  return classForRoot(top) === 'wall' && classForRoot(bottom) === 'wall'
}

export type DoorBridgeWallFacesResult = {
  allFaceIds: number[]
  byHypothesisId: Map<string, number[]>
}

export function findDoorBridgeWallFaces(params: {
  hypotheses: DoorSwingHypothesis[]
  components: RasterRoomComponent[]
  labelsData: Int32Array
  width: number
  height: number
  parentMap: Map<number, number>
  classificationByLabel: Map<number, RoomRasterClass>
  classificationGroupBy?: 'merged' | 'component'
  adjacency: Map<number, Set<number>>
  referenceWallThicknessPx?: number | null
  spanToleranceRatio?: number
}): DoorBridgeWallFacesResult {
  const empty: DoorBridgeWallFacesResult = {
    allFaceIds: [],
    byHypothesisId: new Map(),
  }
  if (params.hypotheses.length === 0 || params.components.length === 0) return empty

  const classificationGroupBy = params.classificationGroupBy ?? 'component'
  const referenceWallThicknessPx = Math.max(0, params.referenceWallThicknessPx ?? 0)
  const spanToleranceRatio = Math.max(0, params.spanToleranceRatio ?? DEFAULT_SPAN_TOLERANCE_RATIO)
  const rootFaces = aggregateRootFaces({
    components: params.components,
    parentMap: params.parentMap,
    classificationByLabel: params.classificationByLabel,
    classificationGroupBy,
  })
  if (rootFaces.size === 0) return empty

  const componentsByLabel = new Map(
    params.components.map((component) => [component.label, component]),
  )
  const promoted = new Set<number>()
  const byHypothesisId = new Map<string, number[]>()

  for (const hypothesis of params.hypotheses) {
    const doorRoots = new Set(hypothesis.faceIds.filter((faceId) => faceId > 0))
    if (doorRoots.size === 0) continue

    const doorSpanPx = resolveSpan(hypothesis.unionBBox)
    const doorShortPx = resolveShort(hypothesis.unionBBox)
    const axis = resolveAxis(hypothesis.unionBBox)

    const seedRoots: number[] = []
    for (const [root, face] of rootFaces.entries()) {
      if (doorRoots.has(root) || promoted.has(root)) continue
      if (!isPromotableClass(face.className)) continue
      if (
        !withinBridgeBand({
          face,
          doorSpanPx,
          doorShortPx,
          referenceWallThicknessPx,
          spanToleranceRatio,
        })
      ) {
        continue
      }
      // Alleen echte buren van de deur — geen bbox-gap “dichtbij” over tussenliggende faces.
      if (
        !touchesDoorFace({
          candidateRoot: root,
          doorRoots,
          adjacency: params.adjacency,
        })
      ) {
        continue
      }
      if (
        !isSeedBetweenTwoWalls({
          face,
          axis,
          componentsByLabel,
          labelsData: params.labelsData,
          width: params.width,
          height: params.height,
          parentMap: params.parentMap,
          rootFaces,
          classificationByLabel: params.classificationByLabel,
          classificationGroupBy,
        })
      ) {
        continue
      }
      seedRoots.push(root)
    }

    const hypPromoted = new Set<number>()
    if (seedRoots.length > 0) {
      const visited = new Set<number>(doorRoots)
      const queue = [...seedRoots]
      for (const root of seedRoots) {
        visited.add(root)
        promoted.add(root)
        hypPromoted.add(root)
      }

      // Van seed doorlopen naar in-band buren van buren (adjacency BFS).
      while (queue.length > 0) {
        const current = queue.shift()!
        for (const neighborRaw of params.adjacency.get(current) ?? []) {
          const neighbor = resolveMergedLabel(neighborRaw, params.parentMap)
          if (visited.has(neighbor) || doorRoots.has(neighbor)) continue
          visited.add(neighbor)
          const face = rootFaces.get(neighbor)
          if (!face) continue
          if (!isPromotableClass(face.className)) continue
          if (
            !withinBridgeBand({
              face,
              doorSpanPx,
              doorShortPx,
              referenceWallThicknessPx,
              spanToleranceRatio,
            })
          ) {
            continue
          }
          promoted.add(neighbor)
          hypPromoted.add(neighbor)
          queue.push(neighbor)
        }
      }
    }

    // Sticky class=`doorframe` (window Stage-2/3 of eerdere bridge): wel koppelen
    // aan de hyp, niet opnieuw promoten (geen allFaceIds — pin blijft sticky).
    for (const doorRoot of doorRoots) {
      const cls = rootFaces.get(doorRoot)?.className
      if (cls === 'doorframe') hypPromoted.add(doorRoot)
      for (const neighborRaw of params.adjacency.get(doorRoot) ?? []) {
        const neighbor = resolveMergedLabel(neighborRaw, params.parentMap)
        if (neighbor <= 0 || doorRoots.has(neighbor)) continue
        const face = rootFaces.get(neighbor)
        if (!face || face.className !== 'doorframe') continue
        if (
          !withinBridgeBand({
            face,
            doorSpanPx,
            doorShortPx,
            referenceWallThicknessPx,
            spanToleranceRatio,
          })
        ) {
          continue
        }
        hypPromoted.add(neighbor)
      }
    }

    if (hypPromoted.size > 0) {
      byHypothesisId.set(
        hypothesis.id,
        [...hypPromoted].sort((a, b) => a - b),
      )
    }
  }

  return {
    allFaceIds: [...promoted].sort((a, b) => a - b),
    byHypothesisId,
  }
}
