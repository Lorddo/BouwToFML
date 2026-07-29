/**
 * Exact endpoint adjacency for inter-junction chain collapse (CURRENT L7).
 */
import { computeJunctionTurnAngleDeg } from '@/cv/port/wallJunctionGraph'
import type { Segment } from '@/cv/port/wallGraph'
import { classifyLayer6Segment } from '../connector/segment-classify'
import type { CollapsePolicy } from '../policy-types'

export type CollapseAxis = 'H' | 'V'

export type ExactPoint = { x: number; y: number }

export type ExactIncident = {
  segIndex: number
  endpoint: 'a' | 'b'
}

export type ExactAdjacencyNode = {
  x: number
  y: number
  incidents: ExactIncident[]
}

/** Exacte endpoint-key — geen snap, geen afronding. */
export function exactPointKey(point: ExactPoint): string {
  return `${point.x}:${point.y}`
}

export function exactPointsEqual(a: ExactPoint, b: ExactPoint): boolean {
  return a.x === b.x && a.y === b.y
}

export function buildExactAdjacency(segments: Segment[]): Map<string, ExactAdjacencyNode> {
  const map = new Map<string, ExactAdjacencyNode>()
  const add = (point: ExactPoint, segIndex: number, endpoint: 'a' | 'b') => {
    const key = exactPointKey(point)
    const existing = map.get(key)
    if (existing) {
      existing.incidents.push({ segIndex, endpoint })
      return
    }
    map.set(key, { x: point.x, y: point.y, incidents: [{ segIndex, endpoint }] })
  }
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i]!
    add(seg.a, i, 'a')
    add(seg.b, i, 'b')
  }
  return map
}

/** Distinct segment indices incident at a node (self-loops count once). */
export function uniqueIncidentCount(node: ExactAdjacencyNode): number {
  return new Set(node.incidents.map((inc) => inc.segIndex)).size
}

/** The other unique segment at a degree-2 node, or null if not exactly one. */
export function otherIncidentSegIndex(
  node: ExactAdjacencyNode,
  excludeSegIndex: number,
): number | null {
  const indices = [...new Set(node.incidents.map((inc) => inc.segIndex))].filter(
    (idx) => idx !== excludeSegIndex,
  )
  return indices.length === 1 ? indices[0]! : null
}

export function segmentAxis(
  seg: Segment,
  segIndex: number,
  hvBandPx: number,
): CollapseAxis | null {
  const classified = classifyLayer6Segment(seg, segIndex, hvBandPx)
  if (classified.kind === 'H') return 'H'
  if (classified.kind === 'V') return 'V'
  return null
}

export function otherEndpoint(seg: Segment, at: ExactPoint): ExactPoint {
  if (exactPointsEqual(seg.a, at)) return seg.b
  if (exactPointsEqual(seg.b, at)) return seg.a
  throw new Error('otherEndpoint: punt ligt niet op segment')
}

function directionFromPoint(seg: Segment, at: ExactPoint): { x: number; y: number } {
  const other = otherEndpoint(seg, at)
  const dx = other.x - at.x
  const dy = other.y - at.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return { x: 0, y: 0 }
  return { x: dx / len, y: dy / len }
}

export function turnAngleDegAtPoint(
  point: ExactPoint,
  segInIndex: number,
  segOutIndex: number,
  segments: Segment[],
): number {
  const segIn = segments[segInIndex]!
  const segOut = segments[segOutIndex]!
  const dirs = [
    directionFromPoint(segIn, point),
    directionFromPoint(segOut, point),
  ]
  return computeJunctionTurnAngleDeg(dirs)
}

function uniqueIncidentSegmentIndices(node: ExactAdjacencyNode): number[] {
  return [...new Set(node.incidents.map((incident) => incident.segIndex))]
}

function perpendicularAxis(axis: CollapseAxis): CollapseAxis {
  return axis === 'H' ? 'V' : 'H'
}

function isThroughFootJunctionNode(
  node: ExactAdjacencyNode,
  chainAxis: CollapseAxis,
  segments: Segment[],
  hvBandPx: number,
): boolean {
  const segIndices = uniqueIncidentSegmentIndices(node)
  let hasChainAxisArm = false
  let hasPerpAxisArm = false
  for (const idx of segIndices) {
    const classified = classifyLayer6Segment(segments[idx]!, idx, hvBandPx)
    if (classified.kind === chainAxis) hasChainAxisArm = true
    if (classified.kind === perpendicularAxis(chainAxis)) hasPerpAxisArm = true
  }
  return hasChainAxisArm && hasPerpAxisArm
}

function isPerpendicularArmNearChainPoint(params: {
  point: ExactPoint
  chainAxis: CollapseAxis
  excludeSegIndices: Set<number>
  segments: Segment[]
  adjacency: Map<string, ExactAdjacencyNode>
  armDetectPx: number
  crossAxisTolPx: number
  hvBandPx: number
}): boolean {
  const perpKind = perpendicularAxis(params.chainAxis)
  for (let i = 0; i < params.segments.length; i += 1) {
    if (params.excludeSegIndices.has(i)) continue
    const seg = params.segments[i]!
    const classified = classifyLayer6Segment(seg, i, params.hvBandPx)
    if (classified.kind !== perpKind) continue

    for (const endpoint of [seg.a, seg.b]) {
      if (exactPointsEqual(endpoint, params.point)) continue
      if (Math.hypot(endpoint.x - params.point.x, endpoint.y - params.point.y) > params.armDetectPx) {
        continue
      }
      const perpNode = params.adjacency.get(exactPointKey(endpoint))
      if (perpNode && isThroughFootJunctionNode(perpNode, params.chainAxis, params.segments, params.hvBandPx)) {
        continue
      }
      return true
    }

    if (perpKind === 'V') {
      const axisDist = Math.abs(params.point.x - (seg.a.x + seg.b.x) / 2)
      const minY = Math.min(seg.a.y, seg.b.y) - params.crossAxisTolPx
      const maxY = Math.max(seg.a.y, seg.b.y) + params.crossAxisTolPx
      if (axisDist <= params.crossAxisTolPx && params.point.y >= minY && params.point.y <= maxY) {
        return true
      }
      continue
    }

    const axisDist = Math.abs(params.point.y - (seg.a.y + seg.b.y) / 2)
    const minX = Math.min(seg.a.x, seg.b.x) - params.crossAxisTolPx
    const maxX = Math.max(seg.a.x, seg.b.x) + params.crossAxisTolPx
    if (axisDist <= params.crossAxisTolPx && params.point.x >= minX && params.point.x <= maxX) {
      return true
    }
  }
  return false
}

/**
 * Keten mag nooit door dit punt heen lopen — T/X/I-einde en echte L blijven anker.
 * Fake L (degree 2, hoek < drempel) is doorlaatbaar.
 */
export function isHardChainAnchor(
  node: ExactAdjacencyNode,
  segments: Segment[],
  policy: CollapsePolicy,
  chainAxis?: CollapseAxis,
  excludeSegIndices?: Set<number>,
  adjacency?: Map<string, ExactAdjacencyNode>,
  hvBandPx?: number,
): boolean {
  const classifyBandPx = hvBandPx ?? policy.hvBandPx
  const point = { x: node.x, y: node.y }
  if (
    chainAxis
    && adjacency
    && isPerpendicularArmNearChainPoint({
      point,
      chainAxis,
      excludeSegIndices: excludeSegIndices ?? new Set(),
      segments,
      adjacency,
      armDetectPx: policy.junctionAnchorPx,
      crossAxisTolPx: policy.crossAxisTolPx,
      hvBandPx: classifyBandPx,
    })
  ) {
    return true
  }

  const segIndices = uniqueIncidentSegmentIndices(node)
  const degree = segIndices.length
  if (degree <= 1) return true
  if (degree >= 3) return true
  if (segIndices.length < 2) return true
  return turnAngleDegAtPoint(point, segIndices[0]!, segIndices[1]!, segments) >= policy.structuralLDeg
}

export function isPassableInternalTurn(
  point: ExactPoint,
  segInIndex: number,
  segOutIndex: number,
  segments: Segment[],
  policy: CollapsePolicy,
): boolean {
  const angle = turnAngleDegAtPoint(point, segInIndex, segOutIndex, segments)
  return angle < policy.collinearMaxDeg
}
