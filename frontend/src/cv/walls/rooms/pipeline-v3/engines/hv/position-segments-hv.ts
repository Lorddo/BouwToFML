import { computeJunctionTurnAngleDeg } from '@/cv/port/wallJunctionGraph'
import type { Segment } from '@/cv/port/wallGraph'
import { segmentLength } from '@/cv/walls/rooms/wall-segment-geometry'
import type { RoomWallFaceSkeleton, RoomWallJunction } from '../../../room-wall-skeleton-types'
import type { HvPolicy } from '../policy-types'
import { resolveSegmentAxisTargets, type SegmentEndpointRef } from './axis-clusters'
import { resolveJunctionPosition, type JunctionArmInfo } from './junction-position'
import { classifyHvOrientation } from './qualify'

function cloneSegment(seg: Segment): Segment {
  return {
    ...seg,
    a: { ...seg.a },
    b: { ...seg.b },
  }
}

function nearestJunctionIndex(
  point: { x: number; y: number },
  junctions: RoomWallJunction[],
  snapPx: number,
): number | null {
  let bestIndex: number | null = null
  let bestDistance = snapPx
  for (let i = 0; i < junctions.length; i += 1) {
    const junction = junctions[i]!
    const distance = Math.hypot(point.x - junction.x, point.y - junction.y)
    if (distance <= bestDistance) {
      bestDistance = distance
      bestIndex = i
    }
  }
  return bestIndex
}

function mapSegmentEndpointsToJunctions(params: {
  segments: Segment[]
  junctions: RoomWallJunction[]
  snapPx: number
}): SegmentEndpointRef[] {
  return params.segments.map((segment) => ({
    aJunctionIndex: nearestJunctionIndex(segment.a, params.junctions, params.snapPx),
    bJunctionIndex: nearestJunctionIndex(segment.b, params.junctions, params.snapPx),
  }))
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]!
  return (sorted[mid - 1]! + sorted[mid]!) / 2
}

function sampleSegmentThicknessFromMaskPx(params: {
  policy: HvPolicy
  segment: Segment
  distanceMap: Float32Array | null
  maskWidth: number
  maskHeight: number
}): number | null {
  if (!params.distanceMap) return null
  const len = segmentLength(params.segment)
  if (len <= 1e-3) return null

  const inset =
    len > params.policy.thicknessSampleInsetPx * 2 + 1
      ? params.policy.thicknessSampleInsetPx / len
      : 0.5

  const start = {
    x: params.segment.a.x + (params.segment.b.x - params.segment.a.x) * inset,
    y: params.segment.a.y + (params.segment.b.y - params.segment.a.y) * inset,
  }
  const end = {
    x: params.segment.b.x - (params.segment.b.x - params.segment.a.x) * inset,
    y: params.segment.b.y - (params.segment.b.y - params.segment.a.y) * inset,
  }
  const sampledLength = Math.hypot(end.x - start.x, end.y - start.y)
  const sampleCount = Math.max(1, Math.min(9, Math.floor(sampledLength / Math.max(2, params.policy.thicknessSampleInsetPx)) + 1))
  const values: number[] = []
  for (let i = 0; i < sampleCount; i += 1) {
    const t = sampleCount === 1 ? 0.5 : i / (sampleCount - 1)
    const sx = start.x + (end.x - start.x) * t
    const sy = start.y + (end.y - start.y) * t
    const x = Math.round(sx)
    const y = Math.round(sy)
    if (x < 0 || y < 0 || x >= params.maskWidth || y >= params.maskHeight) continue
    const dt = params.distanceMap[y * params.maskWidth + x] ?? 0
    if (Number.isFinite(dt) && dt > 0) {
      values.push(dt * 2)
    }
  }
  if (values.length === 0) return null
  return median(values)
}

function resolveSegmentThicknessPx(params: {
  sampledThicknessPx: number | null
  faceThicknessPx: number
  referenceWallThicknessPx?: number
  policy: HvPolicy
}): number {
  if (params.sampledThicknessPx != null && params.sampledThicknessPx > 0) return params.sampledThicknessPx
  if (params.faceThicknessPx > 0) return params.faceThicknessPx
  return params.referenceWallThicknessPx ?? params.policy.thicknessFallbackPx
}

function buildJunctionAngleDeg(params: {
  junctionIndex: number
  junctions: Array<{ x: number; y: number }>
  segments: Segment[]
  endpointMap: SegmentEndpointRef[]
}): number {
  const center = params.junctions[params.junctionIndex]
  if (!center) return 0
  const directions: Array<{ x: number; y: number }> = []
  for (let segIndex = 0; segIndex < params.segments.length; segIndex += 1) {
    const refs = params.endpointMap[segIndex]!
    const seg = params.segments[segIndex]!
    if (refs.aJunctionIndex === params.junctionIndex) {
      const dx = seg.b.x - center.x
      const dy = seg.b.y - center.y
      const len = Math.hypot(dx, dy)
      if (len > 1e-6) directions.push({ x: dx / len, y: dy / len })
    } else if (refs.bJunctionIndex === params.junctionIndex) {
      const dx = seg.a.x - center.x
      const dy = seg.a.y - center.y
      const len = Math.hypot(dx, dy)
      if (len > 1e-6) directions.push({ x: dx / len, y: dy / len })
    }
  }
  return computeJunctionTurnAngleDeg(directions)
}

/**
 * Copy6/7 bare HV: move junctions, then set every mapped endpoint to that exact point.
 * Free endpoints (no junction) only get axis update. No post-seal / weld.
 */
export function positionSegmentsHv(params: {
  face: RoomWallFaceSkeleton
  distanceMap: Float32Array | null
  maskWidth: number
  maskHeight: number
  policy: HvPolicy
  referenceWallThicknessPx?: number
}): {
  face: RoomWallFaceSkeleton
  movedSegmentCount: number
  movedJunctionCount: number
} {
  const sourceSegments = params.face.segments.map(cloneSegment)
  const endpointMap = mapSegmentEndpointsToJunctions({
    segments: sourceSegments,
    junctions: params.face.junctions,
    snapPx: params.policy.prePositionSnapPx,
  })

  const orientationBySegment = sourceSegments.map((segment) =>
    classifyHvOrientation(segment, params.policy.flatBandPx),
  )
  const sampledThicknessBySegment = sourceSegments.map((segment) =>
    sampleSegmentThicknessFromMaskPx({
      policy: params.policy,
      segment,
      distanceMap: params.distanceMap,
      maskWidth: params.maskWidth,
      maskHeight: params.maskHeight,
    }),
  )
  const faceThicknessPx = median(
    sampledThicknessBySegment.filter((value): value is number => value != null && value > 0),
  )
  const thicknessBySegment = sourceSegments.map((_, index) =>
    resolveSegmentThicknessPx({
      sampledThicknessPx: sampledThicknessBySegment[index] ?? null,
      faceThicknessPx,
      referenceWallThicknessPx: params.referenceWallThicknessPx,
      policy: params.policy,
    }),
  )
  const axisBySegment = resolveSegmentAxisTargets({
    policy: params.policy,
    segments: sourceSegments,
    thicknessBySegment,
    orientationBySegment,
    endpointRefs: endpointMap,
    referenceWallThicknessPx: params.referenceWallThicknessPx,
  })

  const armsByJunction = new Map<number, JunctionArmInfo[]>()
  for (let segmentIndex = 0; segmentIndex < sourceSegments.length; segmentIndex += 1) {
    const refs = endpointMap[segmentIndex]!
    const axis = axisBySegment[segmentIndex]!
    const thicknessPx =
      thicknessBySegment[segmentIndex] ??
      params.referenceWallThicknessPx ??
      params.policy.thicknessFallbackPx
    const attach = (junctionIndex: number | null) => {
      if (junctionIndex == null) return
      const list = armsByJunction.get(junctionIndex) ?? []
      list.push({
        segmentIndex,
        orientation: axis.orientation,
        targetAxis: axis.targetAxis,
        thicknessPx,
        lengthPx: segmentLength(sourceSegments[segmentIndex]!),
      })
      armsByJunction.set(junctionIndex, list)
    }
    attach(refs.aJunctionIndex)
    attach(refs.bJunctionIndex)
  }

  const positionedJunctionCoords = params.face.junctions.map((junction, junctionIndex) =>
    resolveJunctionPosition({
      policy: params.policy,
      junction,
      arms: armsByJunction.get(junctionIndex) ?? [],
      referenceWallThicknessPx: params.referenceWallThicknessPx,
    }),
  )

  const movedSegments: Segment[] = sourceSegments.map((segment, segmentIndex) => {
    const next = cloneSegment(segment)
    const refs = endpointMap[segmentIndex]!
    const axis = axisBySegment[segmentIndex]!
    // Co-move: every endpoint mapped to a junction copies the new junction XY exactly.
    if (refs.aJunctionIndex != null) next.a = { ...positionedJunctionCoords[refs.aJunctionIndex]! }
    if (refs.bJunctionIndex != null) next.b = { ...positionedJunctionCoords[refs.bJunctionIndex]! }

    if (axis.orientation === 'H' && axis.targetAxis != null) {
      if (refs.aJunctionIndex == null) next.a.y = axis.targetAxis
      if (refs.bJunctionIndex == null) next.b.y = axis.targetAxis
    } else if (axis.orientation === 'V' && axis.targetAxis != null) {
      if (refs.aJunctionIndex == null) next.a.x = axis.targetAxis
      if (refs.bJunctionIndex == null) next.b.x = axis.targetAxis
    }
    return next
  })

  const positionedJunctions: RoomWallJunction[] = params.face.junctions.map((junction, junctionIndex) => ({
    ...junction,
    x: positionedJunctionCoords[junctionIndex]!.x,
    y: positionedJunctionCoords[junctionIndex]!.y,
    angleDeg: buildJunctionAngleDeg({
      junctionIndex,
      junctions: positionedJunctionCoords,
      segments: movedSegments,
      endpointMap,
    }),
  }))

  let movedSegmentCount = 0
  for (let i = 0; i < sourceSegments.length; i += 1) {
    const before = sourceSegments[i]!
    const after = movedSegments[i]!
    if (
      Math.abs(before.a.x - after.a.x) > 1e-3 ||
      Math.abs(before.a.y - after.a.y) > 1e-3 ||
      Math.abs(before.b.x - after.b.x) > 1e-3 ||
      Math.abs(before.b.y - after.b.y) > 1e-3
    ) {
      movedSegmentCount += 1
    }
  }

  let movedJunctionCount = 0
  for (let i = 0; i < params.face.junctions.length; i += 1) {
    const before = params.face.junctions[i]!
    const after = positionedJunctions[i]!
    if (Math.abs(before.x - after.x) > 1e-3 || Math.abs(before.y - after.y) > 1e-3) {
      movedJunctionCount += 1
    }
  }

  return {
    face: {
      ...params.face,
      segments: movedSegments,
      junctions: positionedJunctions,
      stats: {
        ...params.face.stats,
        segmentCount: movedSegments.length,
        junctionCount: positionedJunctions.length,
      },
    },
    movedSegmentCount,
    movedJunctionCount,
  }
}
