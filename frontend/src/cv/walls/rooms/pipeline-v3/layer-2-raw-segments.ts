/** V3 Laag 2 � native jitter merge (own types + policy; no pipeline-v2 import). */
import type { RoomWallMaskRle } from '@/core/extraction/types'
import type { OpenCV } from '@/cv/loadOpenCV'
import type { Segment } from '@/cv/port/wallGraph'
import { computeJunctionTurnAngleDeg } from '@/cv/port/wallJunctionGraph'
import { reportPipelineProgress } from '@/cv/pipeline/pipeline-progress'
import { hasPerpendicularBranchAt } from '@/cv/walls/rooms/wall-segment-geometry'
import {
  isDominantHorizontal,
  isDominantVertical,
  perpendicularOffsetPx,
  segmentAngleDeg,
  segmentLength,
} from '@/cv/walls/rooms/wall-segment-geometry'
import { buildWallDistanceMap } from '@/cv/walls/rooms/room-wall-segment-thickness'
import type { RoomWallFaceSkeleton, RoomWallJunction } from '../room-wall-skeleton-types'
import type { Layer2JitterPolicy } from './engines/policy-types'
import { rebuildFaceJunctionsOnly } from './engines/segment-ops'
import {
  resolveLayer2JitterPolicy,
  resolveMergeTolerancePx,
} from './policies/layer-2'
import type { PipelineV3Layer1Result, PipelineV3Layer2Result } from './types'

function pointsEqual(
  a: { x: number; y: number },
  b: { x: number; y: number },
): boolean {
  return a.x === b.x && a.y === b.y
}

function pointKeyExact(p: { x: number; y: number }): string {
  return `${p.x},${p.y}`
}

interface ExactDegree2Node {
  point: { x: number; y: number }
  indexA: number
  indexB: number
}

/**
 * Snap=0 fast path voor de merge-loop: bouw exacte degree-2 knopen (kind 'L') met
 * dezelfde first-seen volgorde als `buildJunctionGraph(work, 0)`, maar in O(n) i.p.v.
 * O(n²) (geen RBush/line-intersect/nearest-node). Zelfmelkende (zero-length) segmenten
 * worden — net als in `buildJunctionGraph` (aId===bId) — niet als edge geteld, en punten
 * met een zelfstandige nul-lengte-lus vallen af zodat de degree-telling gelijk blijft aan
 * de oude `segmentsAtExactPoint(...) === 2`-check.
 */
function collectExactDegree2Nodes(segments: Segment[]): ExactDegree2Node[] {
  const byPoint = new Map<string, { point: { x: number; y: number }; indices: number[] }>()
  const selfLoopKeys = new Set<string>()
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i]!
    if (pointsEqual(seg.a, seg.b)) {
      selfLoopKeys.add(pointKeyExact(seg.a))
      continue
    }
    const ka = pointKeyExact(seg.a)
    const existingA = byPoint.get(ka)
    if (existingA) existingA.indices.push(i)
    else byPoint.set(ka, { point: seg.a, indices: [i] })
    const kb = pointKeyExact(seg.b)
    const existingB = byPoint.get(kb)
    if (existingB) existingB.indices.push(i)
    else byPoint.set(kb, { point: seg.b, indices: [i] })
  }

  const nodes: ExactDegree2Node[] = []
  for (const [key, entry] of byPoint) {
    if (entry.indices.length !== 2) continue
    if (selfLoopKeys.has(key)) continue
    nodes.push({ point: entry.point, indexA: entry.indices[0]!, indexB: entry.indices[1]! })
  }
  return nodes
}

/** Draaihoek van een degree-2 knik, identiek aan de graph-node `angleDeg` bij snap=0. */
function exactNodeTurnAngleDeg(
  segA: Segment,
  segB: Segment,
  junction: { x: number; y: number },
): number {
  const directions: Array<{ x: number; y: number }> = []
  for (const seg of [segA, segB]) {
    const far = farEndpointAtJunction(seg, junction)
    if (!far) continue
    const dx = far.x - junction.x
    const dy = far.y - junction.y
    const len = Math.hypot(dx, dy)
    if (len < 1e-6) continue
    directions.push({ x: dx / len, y: dy / len })
  }
  return computeJunctionTurnAngleDeg(directions)
}

function samplePointInsetFromJunction(
  seg: Segment,
  junction: { x: number; y: number },
  insetPx: number,
): { x: number; y: number } {
  const atA = pointsEqual(seg.a, junction)
  const atB = pointsEqual(seg.b, junction)
  const len = segmentLength(seg)
  const inset = len > insetPx + 1 ? insetPx / len : 0.35
  if (atA && !atB) {
    return {
      x: seg.a.x + (seg.b.x - seg.a.x) * inset,
      y: seg.a.y + (seg.b.y - seg.a.y) * inset,
    }
  }
  if (atB && !atA) {
    return {
      x: seg.b.x + (seg.a.x - seg.b.x) * inset,
      y: seg.b.y + (seg.a.y - seg.b.y) * inset,
    }
  }
  return { x: junction.x, y: junction.y }
}

function sampleLocalThicknessPx(params: {
  segA: Segment
  segB: Segment
  junction: { x: number; y: number }
  distanceMap: Float32Array | null
  maskWidth: number
  maskHeight: number
  referenceWallThicknessPx?: number
  policy: Layer2JitterPolicy
}): number {
  const longer = segmentLength(params.segA) >= segmentLength(params.segB) ? params.segA : params.segB
  const sample = samplePointInsetFromJunction(
    longer,
    params.junction,
    params.policy.thicknessSampleInsetPx,
  )
  if (params.distanceMap) {
    const x = Math.round(sample.x)
    const y = Math.round(sample.y)
    if (x >= 0 && y >= 0 && x < params.maskWidth && y < params.maskHeight) {
      const dt = params.distanceMap[y * params.maskWidth + x] ?? 0
      if (Number.isFinite(dt) && dt > 0) return dt * 2
    }
  }
  return params.referenceWallThicknessPx ?? 0
}

/** Loodrechte spreiding van eindpunten rond een degree-2 knik. */
function junctionPerpSpreadPx(segA: Segment, segB: Segment): number {
  const pts = [segA.a, segA.b, segB.a, segB.b]
  const ySpread = Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y))
  const xSpread = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x))
  const aH = isDominantHorizontal(segA)
  const bH = isDominantHorizontal(segB)
  const aV = isDominantVertical(segA)
  const bV = isDominantVertical(segB)
  if (aH && bH) return ySpread
  if (aV && bV) return xSpread
  if (aH || bH) return ySpread
  if (aV || bV) return xSpread
  return perpendicularOffsetPx(segA, segB)
}

function farEndpointAtJunction(
  seg: Segment,
  junction: { x: number; y: number },
): { x: number; y: number } | null {
  const atA = pointsEqual(seg.a, junction)
  const atB = pointsEqual(seg.b, junction)
  if (atA && !atB) return { ...seg.b }
  if (atB && !atA) return { ...seg.a }
  return null
}

/** Verbind ver-eindpunten op een L-knik � verplaatst geen co�rdinaten. */
function mergeSegmentsAtJunction(
  segA: Segment,
  segB: Segment,
  junction: { x: number; y: number },
): Segment {
  const farA = farEndpointAtJunction(segA, junction)
  const farB = farEndpointAtJunction(segB, junction)
  if (!farA || !farB) {
    throw new Error('mergeSegmentsAtJunction: segmenten delen knikpunt niet')
  }
  return {
    a: { x: farA.x, y: farA.y },
    b: { x: farB.x, y: farB.y },
    templateIndex: segA.templateIndex ?? segB.templateIndex,
  }
}

function dedupeExactSegments(segments: Segment[]): { segments: Segment[]; dedupedCount: number } {
  const kept: Segment[] = []
  let dedupedCount = 0
  for (const seg of segments) {
    const duplicate = kept.some((other) => {
      const sameTemplate = (other.templateIndex ?? -1) === (seg.templateIndex ?? -1)
      if (!sameTemplate) return false
      const forward = pointsEqual(seg.a, other.a) && pointsEqual(seg.b, other.b)
      const reverse = pointsEqual(seg.a, other.b) && pointsEqual(seg.b, other.a)
      return forward || reverse
    })
    if (duplicate) {
      dedupedCount += 1
      continue
    }
    kept.push({ ...seg, a: { ...seg.a }, b: { ...seg.b } })
  }
  return { segments: kept, dedupedCount }
}

export function mergeLayer2JitterSegments(params: {
  segments: Segment[]
  distanceMap: Float32Array | null
  maskWidth: number
  maskHeight: number
  referenceWallThicknessPx?: number
  policy?: Layer2JitterPolicy
}): { segments: Segment[]; mergedJunctionCount: number } {
  const policy = params.policy ?? resolveLayer2JitterPolicy(params.referenceWallThicknessPx)
  let work = params.segments.map((seg) => ({ ...seg, a: { ...seg.a }, b: { ...seg.b } }))
  let mergedJunctionCount = 0

  let changed = true
  while (changed) {
    changed = false
    // Snap=0 exact degree-2 knopen — vervangt de O(n²) `buildJunctionGraph`-rebuild per merge.
    const nodes = collectExactDegree2Nodes(work)
    for (const node of nodes) {
      const junction = node.point
      const i = node.indexA
      const j = node.indexB
      const segA = work[i]!
      const segB = work[j]!
      const angleDeg = exactNodeTurnAngleDeg(segA, segB, junction)
      const spreadPx = junctionPerpSpreadPx(segA, segB)
      const localThickness = sampleLocalThicknessPx({
        segA,
        segB,
        junction,
        distanceMap: params.distanceMap,
        maskWidth: params.maskWidth,
        maskHeight: params.maskHeight,
        referenceWallThicknessPx: params.referenceWallThicknessPx,
        policy,
      })
      const tolerancePx = resolveMergeTolerancePx(
        localThickness,
        params.referenceWallThicknessPx,
        policy,
      )

      if (angleDeg >= policy.structuralAngleDeg) continue
      if (angleDeg >= policy.preserveMinAngleDeg && spreadPx > tolerancePx) continue
      if (spreadPx > tolerancePx) continue

      if (
        hasPerpendicularBranchAt(
          junction,
          segmentAngleDeg(segA),
          work,
          new Set([i, j]),
          0,
          policy.preserveMinAngleDeg,
          policy.tArmMinBranchPx,
        )
      ) {
        continue
      }

      work[i] = mergeSegmentsAtJunction(segA, segB, junction)
      work.splice(j, 1)
      mergedJunctionCount += 1
      changed = true
      break
    }
  }

  return { segments: work, mergedJunctionCount }
}

export function runLayer2RawSegments(params: {
  layer1: PipelineV3Layer1Result
  cv: OpenCV
  maskRle: RoomWallMaskRle
  referenceWallThicknessPx?: number
  /** Injected wall distance map (same maskRle); built once if omitted. */
  distanceMap?: Float32Array | null
}): PipelineV3Layer2Result {
  reportPipelineProgress('V3 Skeleton Laag 2…')
  const policy = resolveLayer2JitterPolicy(params.referenceWallThicknessPx)
  const distanceMap =
    params.distanceMap !== undefined
      ? params.distanceMap
      : (buildWallDistanceMap({ cv: params.cv, maskRle: params.maskRle })?.distanceMap ?? null)
  const { width, height } = params.maskRle

  const facesClean: RoomWallFaceSkeleton[] = []
  const allSegmentsClean: Segment[] = []
  const allJunctionsClean: RoomWallJunction[] = []
  let mergedJunctionCount = 0
  let dedupedCount = 0

  for (const face of params.layer1.facesRaw) {
    const merged = mergeLayer2JitterSegments({
      segments: face.segments,
      distanceMap,
      maskWidth: width,
      maskHeight: height,
      referenceWallThicknessPx: params.referenceWallThicknessPx,
      policy,
    })
    const deduped = dedupeExactSegments(merged.segments)
    mergedJunctionCount += merged.mergedJunctionCount
    dedupedCount += deduped.dedupedCount
    const cleanFace = rebuildFaceJunctionsOnly(face, deduped.segments, policy.junctionGraphSnapPx)
    facesClean.push(cleanFace)
    allSegmentsClean.push(...deduped.segments)
    allJunctionsClean.push(...cleanFace.junctions)
  }

  return {
    facesClean,
    allSegmentsClean,
    allJunctionsClean,
    totalSegmentsClean: allSegmentsClean.length,
    totalJunctionsClean: allJunctionsClean.length,
    mergeStats: { mergedJunctionCount, dedupedCount },
  }
}

