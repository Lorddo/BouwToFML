/**
 * Inter-junction chain collapse — CURRENT L7 golden (policy-driven).
 */
import type { Segment } from '@/cv/port/wallGraph'
import { segmentLength } from '@/cv/walls/rooms/wall-segment-geometry'
import {
  buildExactAdjacency,
  exactPointKey,
  exactPointsEqual,
  isHardChainAnchor,
  isPassableInternalTurn,
  otherEndpoint,
  segmentAxis,
  turnAngleDegAtPoint,
  type ExactIncident,
  type ExactPoint,
  type CollapseAxis,
} from './adjacency'
import {
  collinearThicknessWithinMaxBandNoise,
  isWallThicknessBridgeCandidatePx,
  thicknessCompatible,
} from './thickness'
import type { CollapsePolicy } from '../policy-types'
import { cloneSegments } from '../segment-ops'

export interface ChainCollapseStats {
  chainsCollapsed: number
  segmentsRemoved: number
  fakeLRemoved: number
}

function filterCollinearChainCandidates(params: {
  atPoint: ExactPoint
  viaSegIndex: number
  axis: CollapseAxis
  segments: Segment[]
  consumed: Set<number>
  chainSegIndices: number[]
  collected: number[]
  adjacency: ReturnType<typeof buildExactAdjacency>
  policy: CollapsePolicy
  hvBandPx: number
}): ExactIncident[] {
  const node = params.adjacency.get(exactPointKey(params.atPoint))
  if (!node) return []

  const excludeSegIndices = new Set([
    ...params.consumed,
    ...params.chainSegIndices,
    ...params.collected,
    params.viaSegIndex,
  ])

  if (
    isHardChainAnchor(
      node,
      params.segments,
      params.policy,
      params.axis,
      excludeSegIndices,
      params.adjacency,
      params.hvBandPx,
    )
  ) {
    return []
  }

  return node.incidents.filter((inc) => {
    if (inc.segIndex === params.viaSegIndex) return false
    if (params.consumed.has(inc.segIndex)) return false
    if (params.collected.includes(inc.segIndex)) return false
    const axis = segmentAxis(params.segments[inc.segIndex]!, inc.segIndex, params.hvBandPx)
    if (axis !== params.axis) return false
    if (
      !isPassableInternalTurn(
        params.atPoint,
        params.viaSegIndex,
        inc.segIndex,
        params.segments,
        params.policy,
      )
    ) {
      return false
    }
    return true
  })
}

function pickChainExtension(params: {
  atPoint: ExactPoint
  viaSegIndex: number
  axis: CollapseAxis
  segments: Segment[]
  thicknessBySegment: number[]
  referenceWallThicknessPx: number
  consumed: Set<number>
  chainSegIndices: number[]
  collected: number[]
  adjacency: ReturnType<typeof buildExactAdjacency>
  policy: CollapsePolicy
  hvBandPx: number
}): { segIndices: number[]; endPoint: ExactPoint } | null {
  const candidates = filterCollinearChainCandidates({
    atPoint: params.atPoint,
    viaSegIndex: params.viaSegIndex,
    axis: params.axis,
    segments: params.segments,
    consumed: params.consumed,
    chainSegIndices: params.chainSegIndices,
    collected: params.collected,
    adjacency: params.adjacency,
    policy: params.policy,
    hvBandPx: params.hvBandPx,
  })
  if (candidates.length === 0) return null

  const viaThickness = params.thicknessBySegment[params.viaSegIndex] ?? 0
  const compatible = candidates.filter((inc) => {
    const otherThickness = params.thicknessBySegment[inc.segIndex] ?? 0
    const angle = turnAngleDegAtPoint(
      params.atPoint,
      params.viaSegIndex,
      inc.segIndex,
      params.segments,
    )
    if (
      angle < params.policy.collinearThicknessBypassDeg
      && collinearThicknessWithinMaxBandNoise(
        viaThickness,
        otherThickness,
        params.referenceWallThicknessPx,
      )
    ) {
      return true
    }
    return thicknessCompatible(
      viaThickness,
      otherThickness,
      params.policy,
      params.referenceWallThicknessPx,
    )
  })
  if (compatible.length === 1) {
    const next = compatible[0]!
    return {
      segIndices: [next.segIndex],
      endPoint: otherEndpoint(params.segments[next.segIndex]!, params.atPoint),
    }
  }
  if (compatible.length > 1) return null

  const incompatible = candidates.filter((inc) =>
    !thicknessCompatible(
      viaThickness,
      params.thicknessBySegment[inc.segIndex] ?? 0,
      params.policy,
      params.referenceWallThicknessPx,
    ),
  )
  if (incompatible.length !== 1) return null

  const bridgeInc = incompatible[0]!
  const bridgeIndex = bridgeInc.segIndex
  const bridgeSeg = params.segments[bridgeIndex]!
  const bridgeOther = otherEndpoint(bridgeSeg, params.atPoint)
  const beyondCandidates = filterCollinearChainCandidates({
    atPoint: bridgeOther,
    viaSegIndex: bridgeIndex,
    axis: params.axis,
    segments: params.segments,
    consumed: params.consumed,
    chainSegIndices: params.chainSegIndices,
    collected: [...params.collected, bridgeIndex],
    adjacency: params.adjacency,
    policy: params.policy,
    hvBandPx: params.hvBandPx,
  }).filter((inc) =>
    thicknessCompatible(
      viaThickness,
      params.thicknessBySegment[inc.segIndex] ?? 0,
      params.policy,
      params.referenceWallThicknessPx,
    ),
  )
  if (beyondCandidates.length !== 1) return null

  const beyondInc = beyondCandidates[0]!
  const beyondIndex = beyondInc.segIndex
  const viaLen = segmentLength(params.segments[params.viaSegIndex]!)
  const beyondLen = segmentLength(params.segments[beyondIndex]!)
  if (
    !isWallThicknessBridgeCandidatePx({
      bridgeThicknessPx: params.thicknessBySegment[bridgeIndex] ?? 0,
      neighborThicknessPx: viaThickness,
      beyondThicknessPx: params.thicknessBySegment[beyondIndex] ?? 0,
      bridgeLengthPx: segmentLength(bridgeSeg),
      neighborLengthPx: Math.max(viaLen, beyondLen),
      referenceWallThicknessPx: params.referenceWallThicknessPx,
    })
  ) {
    return null
  }

  return {
    segIndices: [bridgeIndex, beyondIndex],
    endPoint: otherEndpoint(params.segments[beyondIndex]!, bridgeOther),
  }
}

function extendChainArm(params: {
  atPoint: ExactPoint
  viaSegIndex: number
  axis: CollapseAxis
  segments: Segment[]
  thicknessBySegment: number[]
  referenceWallThicknessPx: number
  adjacency: ReturnType<typeof buildExactAdjacency>
  consumed: Set<number>
  chainSegIndices: number[]
  policy: CollapsePolicy
  hvBandPx: number
}): { segIndices: number[]; endPoint: ExactPoint } {
  const collected: number[] = []
  let atPoint = params.atPoint
  let viaSegIndex = params.viaSegIndex

  while (true) {
    const step = pickChainExtension({
      atPoint,
      viaSegIndex,
      axis: params.axis,
      segments: params.segments,
      thicknessBySegment: params.thicknessBySegment,
      referenceWallThicknessPx: params.referenceWallThicknessPx,
      consumed: params.consumed,
      chainSegIndices: params.chainSegIndices,
      collected,
      adjacency: params.adjacency,
      policy: params.policy,
      hvBandPx: params.hvBandPx,
    })
    if (!step) break

    collected.push(...step.segIndices)
    viaSegIndex = step.segIndices[step.segIndices.length - 1]!
    atPoint = step.endPoint
  }

  return { segIndices: collected, endPoint: atPoint }
}

function buildCollapsedSegment(params: {
  start: ExactPoint
  end: ExactPoint
  chainIndices: number[]
  segments: Segment[]
}): Segment {
  let longestIdx = params.chainIndices[0]!
  let longestLen = -1
  for (const idx of params.chainIndices) {
    const len = segmentLength(params.segments[idx]!)
    if (len > longestLen) {
      longestLen = len
      longestIdx = idx
    }
  }
  const templateIndex = params.segments[longestIdx]?.templateIndex
  return {
    a: { x: params.start.x, y: params.start.y },
    b: { x: params.end.x, y: params.end.y },
    templateIndex,
  }
}

function countFakeLInChain(params: {
  chainIndices: number[]
  segments: Segment[]
  adjacency: ReturnType<typeof buildExactAdjacency>
  policy: CollapsePolicy
}): number {
  let fakeL = 0
  const chainSet = new Set(params.chainIndices)
  for (const idx of params.chainIndices) {
    const seg = params.segments[idx]!
    for (const point of [seg.a, seg.b]) {
      const node = params.adjacency.get(exactPointKey(point))
      if (!node || node.incidents.length !== 2) continue
      const bothInChain = node.incidents.every((inc) => chainSet.has(inc.segIndex))
      if (!bothInChain) continue
      const [a, b] = node.incidents
      if (a.segIndex === b.segIndex) continue
      if (
        isPassableInternalTurn(
          point,
          a.segIndex,
          b.segIndex,
          params.segments,
          params.policy,
        )
      ) {
        fakeL += 1
      }
    }
  }
  return Math.round(fakeL / 2)
}

export function collapseInterJunctionChains(params: {
  segments: Segment[]
  thicknessBySegment: number[]
  policy: CollapsePolicy
  referenceWallThicknessPx?: number
}): { segments: Segment[]; stats: ChainCollapseStats } {
  const referenceWallThicknessPx =
    params.referenceWallThicknessPx ?? params.policy.thicknessFallbackPx
  const hvBandPx = params.policy.hvBandPx
  const work = cloneSegments(params.segments)
  const adjacency = buildExactAdjacency(work)
  const consumed = new Set<number>()
  const toAdd: Segment[] = []

  let chainsCollapsed = 0
  let segmentsRemoved = 0
  let fakeLRemoved = 0

  for (let seedIndex = 0; seedIndex < work.length; seedIndex += 1) {
    if (consumed.has(seedIndex)) continue
    const seed = work[seedIndex]!
    const axis = segmentAxis(seed, seedIndex, hvBandPx)
    if (!axis) continue

    const backward = extendChainArm({
      atPoint: seed.a,
      viaSegIndex: seedIndex,
      axis,
      segments: work,
      thicknessBySegment: params.thicknessBySegment,
      referenceWallThicknessPx,
      adjacency,
      consumed,
      chainSegIndices: [seedIndex],
      policy: params.policy,
      hvBandPx,
    })
    const forward = extendChainArm({
      atPoint: seed.b,
      viaSegIndex: seedIndex,
      axis,
      segments: work,
      thicknessBySegment: params.thicknessBySegment,
      referenceWallThicknessPx,
      adjacency,
      consumed,
      chainSegIndices: [seedIndex],
      policy: params.policy,
      hvBandPx,
    })

    const chainIndices = [...backward.segIndices.slice().reverse(), seedIndex, ...forward.segIndices]
    if (chainIndices.length < params.policy.minChainSegments) continue

    const startPoint = backward.endPoint
    const endPoint = forward.endPoint
    if (exactPointsEqual(startPoint, endPoint)) continue

    const collapsed = buildCollapsedSegment({
      start: startPoint,
      end: endPoint,
      chainIndices,
      segments: work,
    })
    if (segmentLength(collapsed) < 1) continue

    fakeLRemoved += countFakeLInChain({
      chainIndices,
      segments: work,
      adjacency,
      policy: params.policy,
    })
    for (const idx of chainIndices) consumed.add(idx)
    toAdd.push(collapsed)
    chainsCollapsed += 1
    segmentsRemoved += chainIndices.length - 1
  }

  const kept = work.filter((_, index) => !consumed.has(index))
  kept.push(...toAdd)

  return {
    segments: kept,
    stats: {
      chainsCollapsed,
      segmentsRemoved,
      fakeLRemoved,
    },
  }
}
