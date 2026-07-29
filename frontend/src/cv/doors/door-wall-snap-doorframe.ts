import type { SemanticWallSegment } from '@/core/extraction/types'
import {
  resolveClassAtLabel,
  type RoomRasterClass,
} from '@/cv/walls/rooms/room-ink-classify'
import { resolveMergedLabel } from '@/cv/walls/rooms/room-raster-merge'
import { collectDirectionalAdjacentClassRoots } from './door-attach-doorframes'
import { tryBindDoorToAnchorSegment, tryBindDoorToBounds } from './door-wall-snap-bind'
import { closestPointOnSegment, overlapLength, round2 } from './door-wall-snap-geom'
import { DOOR_WALL_SNAP_TUNING, type BBoxBounds } from './door-wall-snap-tuning'
import type { BoundDoor, DoorOpeningAxis, ResolvedDoorCandidate } from './types'

const T = DOOR_WALL_SNAP_TUNING

/** Path A doorframe lookup: missing → undefined (sticky window/bridge DF). */
function classAt(
  label: number,
  parentMap: Map<number, number>,
  classificationByLabel: Map<number, RoomRasterClass>,
): RoomRasterClass | undefined {
  return resolveClassAtLabel(label, parentMap, classificationByLabel, undefined)
}

/**
 * 1-hop ink-buren met class `doorframe`, daarna alleen verder in diezelfde
 * cardinale richting. Geen bbox-near.
 */
export function findAdjacentDoorframeUnionBounds(params: {
  doorBounds: BBoxBounds
  faceSet: Set<number>
  labelsData: Int32Array
  width: number
  height: number
  parentMap: Map<number, number>
  classificationByLabel: Map<number, RoomRasterClass>
  doorframeBBoxByRoot: Map<number, BBoxBounds>
  expandPx: number
}): BBoxBounds | null {
  const doorframeRoots = collectDirectionalAdjacentClassRoots({
    doorBounds: params.doorBounds,
    faceSet: params.faceSet,
    labelsData: params.labelsData,
    width: params.width,
    height: params.height,
    parentMap: params.parentMap,
    classificationByLabel: params.classificationByLabel,
    targetClass: 'doorframe',
  })
  if (doorframeRoots.length <= 0) return null

  let union: BBoxBounds | null = null
  for (const root of doorframeRoots) {
    const bbox = params.doorframeBBoxByRoot.get(root)
    if (!bbox) continue
    union = union ? unionBBoxBounds(union, bbox) : { ...bbox }
  }
  return union
}

export function buildClassBBoxesByRoot(params: {
  labelsData: Int32Array
  width: number
  height: number
  parentMap: Map<number, number>
  classificationByLabel: Map<number, RoomRasterClass>
}): { doorframe: Map<number, BBoxBounds>; wall: Map<number, BBoxBounds> } {
  const doorframe = new Map<number, BBoxBounds>()
  const wall = new Map<number, BBoxBounds>()
  const absorb = (map: Map<number, BBoxBounds>, key: number, x: number, y: number): void => {
    const existing = map.get(key)
    if (!existing) {
      map.set(key, { x0: x, y0: y, x1: x + 1, y1: y + 1 })
      return
    }
    if (x < existing.x0) existing.x0 = x
    if (y < existing.y0) existing.y0 = y
    if (x + 1 > existing.x1) existing.x1 = x + 1
    if (y + 1 > existing.y1) existing.y1 = y + 1
  }
  for (let y = 0; y < params.height; y += 1) {
    for (let x = 0; x < params.width; x += 1) {
      const label = params.labelsData[y * params.width + x] ?? 0
      if (label <= 0) continue
      const cls = classAt(label, params.parentMap, params.classificationByLabel)
      if (cls !== 'doorframe' && cls !== 'wall') continue
      const root = resolveMergedLabel(label, params.parentMap)
      const key = root > 0 ? root : label
      if (cls === 'doorframe') absorb(doorframe, key, x, y)
      else absorb(wall, key, x, y)
    }
  }
  return { doorframe, wall }
}

export function unionBBoxBounds(a: BBoxBounds, b: BBoxBounds): BBoxBounds {
  return {
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1),
  }
}

function unionFromDoorframeRoots(
  roots: Iterable<number>,
  doorframeBBoxByRoot: Map<number, BBoxBounds>,
): BBoxBounds | null {
  let union: BBoxBounds | null = null
  for (const root of roots) {
    const bbox = doorframeBBoxByRoot.get(root)
    if (!bbox) continue
    union = union ? unionBBoxBounds(union, bbox) : { ...bbox }
  }
  return union
}

export function resolveExplicitDoorframeUnion(params: {
  doorframeFaceIds: number[]
  parentMap: Map<number, number>
  doorframeBBoxByRoot: Map<number, BBoxBounds>
}): BBoxBounds | null {
  const roots = new Set<number>()
  for (const id of params.doorframeFaceIds) {
    if (id <= 0) continue
    const root = resolveMergedLabel(id, params.parentMap)
    roots.add(root > 0 ? root : id)
  }
  return unionFromDoorframeRoots(roots, params.doorframeBBoxByRoot)
}

/**
 * Multi-hop vanaf deur-roots langs wall/doorframe tot class doorframe in as-band.
 */
export function growDoorframeUnionAlongAxis(params: {
  doorBounds: BBoxBounds
  doorRoots: Set<number>
  adjacency: Map<number, Set<number>>
  parentMap: Map<number, number>
  classificationByLabel: Map<number, RoomRasterClass>
  doorframeBBoxByRoot: Map<number, BBoxBounds>
  expandPx: number
}): BBoxBounds | null {
  const door = params.doorBounds
  const axis: DoorOpeningAxis =
    door.y1 - door.y0 >= door.x1 - door.x0 ? 'v' : 'h'
  const found = new Set<number>()
  const visited = new Set<number>(params.doorRoots)
  const queue: Array<{ root: number; hops: number }> = [...params.doorRoots].map((root) => ({
    root,
    hops: 0,
  }))

  const inBand = (bb: BBoxBounds): boolean => {
    const gapPerp =
      axis === 'v'
        ? door.x1 < bb.x0
          ? bb.x0 - door.x1
          : bb.x1 < door.x0
            ? door.x0 - bb.x1
            : 0
        : door.y1 < bb.y0
          ? bb.y0 - door.y1
          : bb.y1 < door.y0
            ? door.y0 - bb.y1
            : 0
    if (gapPerp > params.expandPx) return false
    const spanOv =
      axis === 'v'
        ? overlapLength(door.y0, door.y1 - 1, bb.y0, bb.y1 - 1)
        : overlapLength(door.x0, door.x1 - 1, bb.x0, bb.x1 - 1)
    return spanOv > 0
  }

  while (queue.length > 0) {
    const current = queue.shift()!
    if (current.hops >= T.growHopCap) continue
    for (const neighborRaw of params.adjacency.get(current.root) ?? []) {
      const neighbor = resolveMergedLabel(neighborRaw, params.parentMap)
      if (neighbor <= 0 || visited.has(neighbor)) continue
      visited.add(neighbor)
      const cls = classAt(neighbor, params.parentMap, params.classificationByLabel)
      if (cls !== 'wall' && cls !== 'doorframe') continue
      if (cls === 'doorframe') {
        const bb = params.doorframeBBoxByRoot.get(neighbor)
        if (!bb || !inBand(bb)) {
          // Buiten band: niet verzamelen, wel doorlopen als brug.
        } else {
          found.add(neighbor)
        }
      }
      queue.push({ root: neighbor, hops: current.hops + 1 })
    }
  }

  return unionFromDoorframeRoots(found, params.doorframeBBoxByRoot)
}

function projectDoorframeClearOpening(params: {
  doorframeUnion: BBoxBounds
  segment: SemanticWallSegment
  axis: DoorOpeningAxis
}): { startPx: { x: number; y: number }; endPx: { x: number; y: number } } {
  const df = params.doorframeUnion
  if (params.axis === 'v') {
    const x = (df.x0 + df.x1 - 1) / 2
    const a = closestPointOnSegment({ x, y: df.y0 }, params.segment)
    const b = closestPointOnSegment({ x, y: df.y1 - 1 }, params.segment)
    return {
      startPx: { x: round2(a.x), y: round2(a.y) },
      endPx: { x: round2(b.x), y: round2(b.y) },
    }
  }
  const y = (df.y0 + df.y1 - 1) / 2
  const a = closestPointOnSegment({ x: df.x0, y }, params.segment)
  const b = closestPointOnSegment({ x: df.x1 - 1, y }, params.segment)
  return {
    startPx: { x: round2(a.x), y: round2(a.y) },
    endPx: { x: round2(b.x), y: round2(b.y) },
  }
}

function clearSpanPxFromOpening(opening: {
  startPx: { x: number; y: number }
  endPx: { x: number; y: number }
}): number {
  return Math.max(
    1,
    Math.hypot(opening.endPx.x - opening.startPx.x, opening.endPx.y - opening.startPx.y),
  )
}

function buildPathASnappedBBox(params: {
  door: ResolvedDoorCandidate
  shiftX: number
  shiftY: number
  openingAxis: DoorOpeningAxis
  clearSpanPx: number
}): BoundDoor['snappedBBox'] {
  // Langs muur = deurblad (L11 clear) + REF framing (kozijn-tot-kozijn).
  const framing =
    Math.max(0, params.door.framingAlongPx) + Math.max(0, params.door.framingOppositePx)
  const along = Math.max(1, params.clearSpanPx + framing)
  const sx = params.door.bbox.x + params.shiftX
  const sy = params.door.bbox.y + params.shiftY
  if (params.openingAxis === 'v') {
    const cy = sy + params.door.bbox.height / 2
    return {
      x: round2(sx),
      y: round2(cy - along / 2),
      width: round2(params.door.bbox.width),
      height: round2(along),
    }
  }
  const cx = sx + params.door.bbox.width / 2
  return {
    x: round2(cx - along / 2),
    y: round2(sy),
    width: round2(along),
    height: round2(params.door.bbox.height),
  }
}

function finalizePathABound(params: {
  bound: BoundDoor
  door: ResolvedDoorCandidate
  doorframeUnion: BBoxBounds
  segment: SemanticWallSegment
}): BoundDoor {
  const clear = projectDoorframeClearOpening({
    doorframeUnion: params.doorframeUnion,
    segment: params.segment,
    axis: params.bound.openingAxis,
  })
  const shiftX = params.bound.snappedBBox.x - params.door.bbox.x
  const shiftY = params.bound.snappedBBox.y - params.door.bbox.y
  return {
    ...params.bound,
    doorframeClearOpening: clear,
    snappedBBox: buildPathASnappedBBox({
      door: params.door,
      shiftX,
      shiftY,
      openingAxis: params.bound.openingAxis,
      clearSpanPx: clearSpanPxFromOpening(clear),
    }),
  }
}

/**
 * Path A segment-first: bind op muursegment langs doorframe zonder wallMask-gate.
 */
function tryBindDoorToDoorframeSegment(params: {
  door: ResolvedDoorCandidate
  doorBounds: BBoxBounds
  doorframeUnion: BBoxBounds
  segments: SemanticWallSegment[]
  referenceWallThicknessPx?: number
}): BoundDoor | null {
  const bound = tryBindDoorToAnchorSegment({
    door: params.door,
    doorBounds: params.doorBounds,
    anchorUnion: params.doorframeUnion,
    segments: params.segments,
    referenceWallThicknessPx: params.referenceWallThicknessPx,
  })
  if (!bound) return null
  const segment = params.segments[bound.segmentIndex]
  if (!segment) return bound
  return finalizePathABound({
    bound,
    door: params.door,
    doorframeUnion: params.doorframeUnion,
    segment,
  })
}

export function tryPathABind(params: {
  door: ResolvedDoorCandidate
  doorBounds: BBoxBounds
  doorframeUnion: BBoxBounds
  wallMask: Uint8Array
  width: number
  height: number
  segments: SemanticWallSegment[]
  referenceWallThicknessPx?: number
}): BoundDoor | null {
  const pathASeg = tryBindDoorToDoorframeSegment({
    door: params.door,
    doorBounds: params.doorBounds,
    doorframeUnion: params.doorframeUnion,
    segments: params.segments,
    referenceWallThicknessPx: params.referenceWallThicknessPx,
  })
  if (pathASeg) return pathASeg

  const dfW = params.doorframeUnion.x1 - params.doorframeUnion.x0
  const dfH = params.doorframeUnion.y1 - params.doorframeUnion.y0
  const pathABounds: BBoxBounds =
    dfH >= dfW
      ? {
          x0: params.doorBounds.x0,
          x1: params.doorBounds.x1,
          y0: Math.min(params.doorBounds.y0, params.doorframeUnion.y0),
          y1: Math.max(params.doorBounds.y1, params.doorframeUnion.y1),
        }
      : {
          x0: Math.min(params.doorBounds.x0, params.doorframeUnion.x0),
          x1: Math.max(params.doorBounds.x1, params.doorframeUnion.x1),
          y0: params.doorBounds.y0,
          y1: params.doorBounds.y1,
        }
  const pathAMask = tryBindDoorToBounds({
    door: params.door,
    bounds: pathABounds,
    wallMask: params.wallMask,
    width: params.width,
    height: params.height,
    segments: params.segments,
    referenceWallThicknessPx: params.referenceWallThicknessPx,
  })
  if (!pathAMask) return null
  const segment = params.segments[pathAMask.segmentIndex]
  if (!segment) return pathAMask
  return finalizePathABound({
    bound: pathAMask,
    door: params.door,
    doorframeUnion: params.doorframeUnion,
    segment,
  })
}
