import { tally } from '@/core/diagnostics'
import { CONCEPT_DOOR_REFID, DOUBLE_WIDE_DOOR_REFID, type Opening } from './types'
import type { Layer12DoorForFml } from './extraction-to-plan-types'
import {
  type Point2D,
  dot,
  flipMirrored,
  normalize,
  pointAlongSegment,
  projectPointToSegmentT,
} from './extraction-to-plan-geom'
import { filterOpeningsForEdge, openingSpanOnEdge } from './extraction-to-plan-edge-openings'

// ESC:X-10 (A)
/** Maximaal gat langs de muur (px) waarbij twee standaarddeuren nog als paar gelden. */
export const DOUBLE_DOOR_MERGE_GAP_PX = 24

function doorWallInterval(
  door: Layer12DoorForFml,
  edgeSegment: { a: Point2D; b: Point2D },
): { t0: number; t1: number; tMid: number } {
  const tStart = projectPointToSegmentT(door.openingStartPx, edgeSegment.a, edgeSegment.b)
  const tEnd = projectPointToSegmentT(door.openingEndPx, edgeSegment.a, edgeSegment.b)
  const t0 = Math.min(tStart, tEnd)
  const t1 = Math.max(tStart, tEnd)
  return { t0, t1, tMid: (t0 + t1) / 2 }
}

function wallIntervalsAdjacent(
  a: { t0: number; t1: number },
  b: { t0: number; t1: number },
  gapT: number,
): boolean {
  if (a.t1 < b.t0) return b.t0 - a.t1 <= gapT
  if (b.t1 < a.t0) return a.t0 - b.t1 <= gapT
  return true
}

function mergeTwoDoorsForDoubleWide(
  left: Layer12DoorForFml,
  right: Layer12DoorForFml,
  edgeSegment: { a: Point2D; b: Point2D },
): Layer12DoorForFml {
  const leftIv = doorWallInterval(left, edgeSegment)
  const rightIv = doorWallInterval(right, edgeSegment)
  const t0 = Math.min(leftIv.t0, rightIv.t0)
  const t1 = Math.max(leftIv.t1, rightIv.t1)
  // Eindpunten op de muur-as — hart = midden van gecombineerde span.
  const openingStartPx = pointAlongSegment(edgeSegment.a, edgeSegment.b, t0)
  const openingEndPx = pointAlongSegment(edgeSegment.a, edgeSegment.b, t1)
  const mirrored1 = left.mirrored?.[1] === 1 || right.mirrored?.[1] === 1 ? 1 : 0
  const snappedBBox =
    left.snappedBBox && right.snappedBBox
      ? {
          x: Math.min(left.snappedBBox.x, right.snappedBBox.x),
          y: Math.min(left.snappedBBox.y, right.snappedBBox.y),
          width:
            Math.max(
              left.snappedBBox.x + left.snappedBBox.width,
              right.snappedBBox.x + right.snappedBBox.width,
            ) - Math.min(left.snappedBBox.x, right.snappedBBox.x),
          height:
            Math.max(
              left.snappedBBox.y + left.snappedBBox.height,
              right.snappedBBox.y + right.snappedBBox.height,
            ) - Math.min(left.snappedBBox.y, right.snappedBBox.y),
        }
      : undefined
  return {
    doorId: `${left.doorId}__${right.doorId}`,
    segmentIndex: left.segmentIndex,
    fmlRefId: DOUBLE_WIDE_DOOR_REFID,
    mirrored: [0, mirrored1],
    snappedBBox,
    openingStartPx,
    openingEndPx,
  }
}

function mergeAdjacentStandardDoors(params: {
  doors: Layer12DoorForFml[]
  edgeSegment: { a: Point2D; b: Point2D }
}): Layer12DoorForFml[] {
  if (params.doors.length < 2) return params.doors
  const wallLenPx = Math.hypot(
    params.edgeSegment.b.x - params.edgeSegment.a.x,
    params.edgeSegment.b.y - params.edgeSegment.a.y,
  )
  const gapT = wallLenPx > 1e-6 ? DOUBLE_DOOR_MERGE_GAP_PX / wallLenPx : 0
  const sorted = [...params.doors].sort((a, b) => {
    const ta = doorWallInterval(a, params.edgeSegment).tMid
    const tb = doorWallInterval(b, params.edgeSegment).tMid
    return ta - tb
  })
  const merged: Layer12DoorForFml[] = []
  let i = 0
  while (i < sorted.length) {
    const current = sorted[i]
    const next = sorted[i + 1]
    if (
      next &&
      current.fmlRefId === CONCEPT_DOOR_REFID &&
      next.fmlRefId === CONCEPT_DOOR_REFID &&
      wallIntervalsAdjacent(
        doorWallInterval(current, params.edgeSegment),
        doorWallInterval(next, params.edgeSegment),
        gapT,
      )
    ) {
      // Beide singles verdwijnen; één double_wide over de gecombineerde span.
      tally('X-10', 'double_wide_merged')
      merged.push(mergeTwoDoorsForDoubleWide(current, next, params.edgeSegment))
      i += 2
      continue
    }
    merged.push(current)
    i += 1
  }
  return merged
}

export function mapLayer12DoorsToOpenings(params: {
  layer12Doors: Layer12DoorForFml[]
  semanticSegmentIndex: number | null
  fallbackEdgeIndex: number
  edgeSegment: { a: Point2D; b: Point2D }
  pxPerMmX: number
  pxPerMmY: number
  defaultDoorHeightCm: number
  /** Deuren die al op een eerdere muur gezet zijn — voorkomt double+singles duplicaat. */
  consumedDoorIds: Set<string>
  /** Twin→double_wide (X-10). Default true. */
  mergeDoubleDoors?: boolean
}): Opening[] {
  const sourceDoors = filterOpeningsForEdge({
    openings: params.layer12Doors,
    getId: (door) => door.doorId,
    semanticSegmentIndex: params.semanticSegmentIndex,
    fallbackEdgeIndex: params.fallbackEdgeIndex,
    consumedIds: params.consumedDoorIds,
  })
  if (sourceDoors.length <= 0) return []
  const normalizedDoors =
    params.mergeDoubleDoors === false
      ? sourceDoors
      : mergeAdjacentStandardDoors({
          doors: sourceDoors,
          edgeSegment: params.edgeSegment,
        })

  const targetUnit = normalize({
    x: params.edgeSegment.b.x - params.edgeSegment.a.x,
    y: params.edgeSegment.b.y - params.edgeSegment.a.y,
  })
  if (!targetUnit) return []

  return normalizedDoors.map((door) => {
    const sourceUnit = normalize({
      x: door.openingEndPx.x - door.openingStartPx.x,
      y: door.openingEndPx.y - door.openingStartPx.y,
    })
    const span = openingSpanOnEdge(
      door.openingStartPx,
      door.openingEndPx,
      params.edgeSegment,
      params.pxPerMmX,
      params.pxPerMmY,
    )
    // ESC:X-12 (A)
    const sourceMirrored = door.mirrored ?? [0, 0]
    const flips = sourceUnit ? dot(sourceUnit, targetUnit) < 0 : false
    if (flips) tally('X-12', 'mirrored_flip')
    const mirrored = flips ? flipMirrored(sourceMirrored) : sourceMirrored
    return {
      refid: door.fmlRefId,
      type: 'door',
      t: span.tMid,
      width: span.widthCm,
      z_height: params.defaultDoorHeightCm,
      mirrored,
      guid: door.doorId,
      // Boog-inset: opening-refid-catalog.swingInsetCm (FML-viewer), niet gemeten framing.
    } satisfies Opening
  })
}
