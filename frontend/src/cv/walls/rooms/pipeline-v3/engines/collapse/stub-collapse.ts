/**
 * Ortho stair-stub collapse — CURRENT layer-9-stub-collapse, policy-gated (L9 only).
 */
import type { Segment } from '@/cv/port/wallGraph'
import { segmentLength } from '@/cv/walls/rooms/wall-segment-geometry'
import { cloneSegments } from '../segment-ops'
import type { CollapsePolicy } from '../policy-types'
import {
  buildExactAdjacency,
  exactPointKey,
  otherEndpoint,
  otherIncidentSegIndex,
  segmentAxis,
  uniqueIncidentCount,
  type ExactPoint,
  type CollapseAxis,
} from './adjacency'

export interface StubCollapseStats {
  stubsCollapsed: number
  segmentsRemoved: number
  chainsCollapsed: number
}

function parallelAxisValue(seg: Segment, axis: CollapseAxis): number {
  return axis === 'H' ? (seg.a.y + seg.b.y) / 2 : (seg.a.x + seg.b.x) / 2
}

function walkStairFromFarEnd(params: {
  farEnd: ExactPoint
  armIndex: number
  armAxis: CollapseAxis
  stubAxis: CollapseAxis
  segments: Segment[]
  adjacency: ReturnType<typeof buildExactAdjacency>
  chain: Set<number>
  stubMaxPx: number
  tierMaxPx: number
  hvBandPx: number
}): ExactPoint {
  let currentArmIndex = params.armIndex
  let currentPoint = params.farEnd

  while (true) {
    const node = params.adjacency.get(exactPointKey(currentPoint))
    if (!node || uniqueIncidentCount(node) !== 2) break

    const stubIndex = otherIncidentSegIndex(node, currentArmIndex)
    if (stubIndex == null) break

    const stubSeg = params.segments[stubIndex]!
    if (segmentAxis(stubSeg, stubIndex, params.hvBandPx) !== params.stubAxis) break
    const stubLen = segmentLength(stubSeg)
    if (stubLen <= 0 || stubLen > params.stubMaxPx) break

    const stubFar = otherEndpoint(stubSeg, currentPoint)
    const stubFarNode = params.adjacency.get(exactPointKey(stubFar))
    if (!stubFarNode || uniqueIncidentCount(stubFarNode) !== 2) break

    const nextArmIndex = otherIncidentSegIndex(stubFarNode, stubIndex)
    if (nextArmIndex == null) break

    const currentArm = params.segments[currentArmIndex]!
    const nextArm = params.segments[nextArmIndex]!
    if (segmentAxis(nextArm, nextArmIndex, params.hvBandPx) !== params.armAxis) break

    const tierDelta = Math.abs(
      parallelAxisValue(currentArm, params.armAxis) - parallelAxisValue(nextArm, params.armAxis),
    )
    if (tierDelta > params.tierMaxPx) break

    params.chain.add(stubIndex)
    params.chain.add(nextArmIndex)
    currentArmIndex = nextArmIndex
    currentPoint = otherEndpoint(nextArm, stubFar)
  }

  return currentPoint
}

function collectOrthoStairChain(params: {
  stubIndex: number
  segments: Segment[]
  adjacency: ReturnType<typeof buildExactAdjacency>
  stubMaxPx: number
  tierMaxPx: number
  hvBandPx: number
}): { chain: Set<number>; farA: ExactPoint; farB: ExactPoint } | null {
  const stub = params.segments[params.stubIndex]!
  const stubLen = segmentLength(stub)
  if (stubLen <= 0 || stubLen > params.stubMaxPx) return null

  const stubAxis = segmentAxis(stub, params.stubIndex, params.hvBandPx)
  if (stubAxis !== 'H' && stubAxis !== 'V') return null
  const armAxis: CollapseAxis = stubAxis === 'V' ? 'H' : 'V'

  const nodeA = params.adjacency.get(exactPointKey(stub.a))
  const nodeB = params.adjacency.get(exactPointKey(stub.b))
  if (!nodeA || !nodeB) return null
  if (uniqueIncidentCount(nodeA) !== 2 || uniqueIncidentCount(nodeB) !== 2) return null

  const armAIndex = otherIncidentSegIndex(nodeA, params.stubIndex)
  const armBIndex = otherIncidentSegIndex(nodeB, params.stubIndex)
  if (armAIndex == null || armBIndex == null) return null

  const armA = params.segments[armAIndex]!
  const armB = params.segments[armBIndex]!
  if (
    segmentAxis(armA, armAIndex, params.hvBandPx) !== armAxis ||
    segmentAxis(armB, armBIndex, params.hvBandPx) !== armAxis
  ) {
    return null
  }

  const joinA: ExactPoint = { x: nodeA.x, y: nodeA.y }
  const joinB: ExactPoint = { x: nodeB.x, y: nodeB.y }
  if (
    Math.abs(parallelAxisValue(armA, armAxis) - parallelAxisValue(armB, armAxis)) > params.tierMaxPx
  ) {
    return null
  }

  const chain = new Set<number>([params.stubIndex, armAIndex, armBIndex])
  let farA = otherEndpoint(armA, joinA)
  let farB = otherEndpoint(armB, joinB)

  farA = walkStairFromFarEnd({
    farEnd: farA,
    armIndex: armAIndex,
    armAxis,
    stubAxis,
    segments: params.segments,
    adjacency: params.adjacency,
    chain,
    stubMaxPx: params.stubMaxPx,
    tierMaxPx: params.tierMaxPx,
    hvBandPx: params.hvBandPx,
  })
  farB = walkStairFromFarEnd({
    farEnd: farB,
    armIndex: armBIndex,
    armAxis,
    stubAxis,
    segments: params.segments,
    adjacency: params.adjacency,
    chain,
    stubMaxPx: params.stubMaxPx,
    tierMaxPx: params.tierMaxPx,
    hvBandPx: params.hvBandPx,
  })

  return { chain, farA, farB }
}

function pickTemplateIndex(segments: Segment[], chain: Set<number>): number | undefined {
  let bestIdx: number | undefined
  let bestLen = -1
  for (const idx of chain) {
    const len = segmentLength(segments[idx]!)
    if (len > bestLen) {
      bestLen = len
      bestIdx = idx
    }
  }
  return bestIdx == null ? undefined : segments[bestIdx]?.templateIndex
}

function chainExtremeDiagonal(
  chain: Set<number>,
  segments: Segment[],
): { a: ExactPoint; b: ExactPoint } {
  const points: ExactPoint[] = []
  for (const idx of chain) {
    const seg = segments[idx]!
    points.push(seg.a, seg.b)
  }
  let bestDist = -1
  let bestA = points[0]!
  let bestB = points[1] ?? points[0]!
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const pi = points[i]!
      const pj = points[j]!
      const d = Math.hypot(pi.x - pj.x, pi.y - pj.y)
      if (d > bestDist) {
        bestDist = d
        bestA = pi
        bestB = pj
      }
    }
  }
  return { a: bestA, b: bestB }
}

/**
 * Vouw H—(korte V)—H—… en V—(korte H)—V—… trap-ketens naar één schuine muur.
 * Alleen degree-2 knopen (geen T/X). L9 only (`enableStubCollapse`).
 */
export function collapseOrthoStairStubs(
  segments: Segment[],
  policy: CollapsePolicy,
): { segments: Segment[]; stats: StubCollapseStats } {
  if (!policy.enableStubCollapse) {
    throw new Error('V3 collapseOrthoStairStubs: disabled for this layer policy')
  }

  const stubMaxPx = policy.orthoStubMaxPx
  const tierMaxPx = policy.orthoStubTierMaxPx
  const hvBandPx = policy.hvBandPx
  const work = cloneSegments(segments)
  const consumed = new Set<number>()
  const toAdd: Segment[] = []
  let chainsCollapsed = 0
  let segmentsRemoved = 0

  let changed = true
  while (changed) {
    changed = false
    const adjacency = buildExactAdjacency(work)
    for (let stubIndex = 0; stubIndex < work.length; stubIndex += 1) {
      if (consumed.has(stubIndex)) continue
      const axis = segmentAxis(work[stubIndex]!, stubIndex, hvBandPx)
      if (axis !== 'H' && axis !== 'V') continue

      const collected = collectOrthoStairChain({
        stubIndex,
        segments: work,
        adjacency,
        stubMaxPx,
        tierMaxPx,
        hvBandPx,
      })
      if (!collected || collected.chain.size < 3) continue

      for (const idx of collected.chain) consumed.add(idx)
      const diagonal = chainExtremeDiagonal(collected.chain, work)
      toAdd.push({
        a: { x: diagonal.a.x, y: diagonal.a.y },
        b: { x: diagonal.b.x, y: diagonal.b.y },
        templateIndex: pickTemplateIndex(work, collected.chain),
      })
      chainsCollapsed += 1
      segmentsRemoved += collected.chain.size - 1
      changed = true
      break
    }
  }

  const kept = work.filter((_, index) => !consumed.has(index))
  kept.push(...toAdd)
  return {
    segments: kept,
    stats: {
      stubsCollapsed: chainsCollapsed,
      segmentsRemoved,
      chainsCollapsed,
    },
  }
}
