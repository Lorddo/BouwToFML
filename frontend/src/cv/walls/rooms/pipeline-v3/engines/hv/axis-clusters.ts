import type { Segment } from '@/cv/port/wallGraph'
import { segmentLength } from '@/cv/walls/rooms/wall-segment-geometry'
import type { HvPolicy } from '../policy-types'
import type { HvOrientation } from './qualify'

type SegmentOrientation = {
  orientation: HvOrientation
  targetAxis: number | null
}

export type SegmentEndpointRef = {
  aJunctionIndex: number | null
  bJunctionIndex: number | null
}

type AxisItem = {
  index: number
  pos: number
  thicknessPx: number
  lengthPx: number
}

function resolveRepositionTolerancePx(policy: HvPolicy, localThicknessPx: number, referenceFallbackPx?: number): number {
  const base = Math.max(localThicknessPx, referenceFallbackPx ?? 0, policy.thicknessFallbackPx)
  const raw = policy.repositionToleranceRatio * base
  return Math.min(
    policy.repositionToleranceMaxPx,
    Math.max(policy.repositionToleranceMinPx, Math.round(raw)),
  )
}

function resolveMaxAxisShiftFromOwnPx(
  policy: HvPolicy,
  localThicknessPx: number,
  referenceFallbackPx?: number,
): number {
  const base = Math.max(localThicknessPx, referenceFallbackPx ?? 0, policy.thicknessFallbackPx)
  return Math.min(
    resolveRepositionTolerancePx(policy, localThicknessPx, referenceFallbackPx),
    Math.max(2, Math.round(base * policy.maxAxisShiftFromOwnRatio)),
  )
}

function axisPosition(seg: Segment, orientation: 'H' | 'V'): number {
  return orientation === 'H' ? (seg.a.y + seg.b.y) / 2 : (seg.a.x + seg.b.x) / 2
}

function canClusterParallelOffsetWall(params: {
  policy: HvPolicy
  offsetPx: number
  thicknessA: number
  thicknessB: number
  referenceWallThicknessPx?: number
}): boolean {
  const minThickness = Math.min(params.thicknessA, params.thicknessB)
  const maxThickness = Math.max(params.thicknessA, params.thicknessB)
  if (maxThickness > 0 && minThickness / maxThickness < params.policy.thicknessMatchMinRatio) {
    return false
  }
  const separateWallThreshold = Math.max(1, Math.round(minThickness * params.policy.separateWallRatio))
  if (params.offsetPx >= separateWallThreshold) return false
  const tolerancePx = Math.min(
    resolveRepositionTolerancePx(params.policy, params.thicknessA, params.referenceWallThicknessPx),
    resolveRepositionTolerancePx(params.policy, params.thicknessB, params.referenceWallThicknessPx),
    resolveMaxAxisShiftFromOwnPx(params.policy, params.thicknessA, params.referenceWallThicknessPx),
    resolveMaxAxisShiftFromOwnPx(params.policy, params.thicknessB, params.referenceWallThicknessPx),
  )
  return params.offsetPx <= tolerancePx
}

function canUnionAtJunction(params: {
  policy: HvPolicy
  offsetPx: number
  orientation: 'H' | 'V'
  thicknessA: number
  thicknessB: number
  referenceWallThicknessPx?: number
}): boolean {
  if (params.orientation === 'H' && params.offsetPx <= params.policy.collinearChainMaxSpreadPx) {
    return true
  }
  return canClusterParallelOffsetWall({
    policy: params.policy,
    offsetPx: params.offsetPx,
    thicknessA: params.thicknessA,
    thicknessB: params.thicknessB,
    referenceWallThicknessPx: params.referenceWallThicknessPx,
  })
}

function buildConnectedAxisClusters(params: {
  policy: HvPolicy
  orientation: 'H' | 'V'
  items: AxisItem[]
  endpointRefs: SegmentEndpointRef[]
  referenceWallThicknessPx?: number
}): Array<{ targetAxis: number | null; indices: number[]; maxShiftPx: number }> {
  if (params.items.length === 0) return []
  const indexSet = new Set(params.items.map((item) => item.index))

  const ufParent: number[] = []
  for (const item of params.items) ufParent[item.index] = item.index
  function ufFind(i: number): number {
    if (ufParent[i] !== i) ufParent[i] = ufFind(ufParent[i]!)
    return ufParent[i]!
  }
  function ufUnion(a: number, b: number): void {
    ufParent[ufFind(b)] = ufFind(a)
  }

  const junctionToSegments = new Map<number, number[]>()
  for (const item of params.items) {
    const refs = params.endpointRefs[item.index]
    if (!refs) continue
    for (const junctionIndex of [refs.aJunctionIndex, refs.bJunctionIndex]) {
      if (junctionIndex == null) continue
      const list = junctionToSegments.get(junctionIndex) ?? []
      list.push(item.index)
      junctionToSegments.set(junctionIndex, list)
    }
  }

  const itemByIndex = new Map(params.items.map((item) => [item.index, item]))
  for (const segmentIndices of junctionToSegments.values()) {
    const sameOrientation = segmentIndices.filter((index) => indexSet.has(index))
    for (let i = 0; i < sameOrientation.length; i += 1) {
      for (let j = i + 1; j < sameOrientation.length; j += 1) {
        const a = itemByIndex.get(sameOrientation[i]!)!
        const b = itemByIndex.get(sameOrientation[j]!)!
        if (
          canUnionAtJunction({
            policy: params.policy,
            offsetPx: Math.abs(a.pos - b.pos),
            orientation: params.orientation,
            thicknessA: a.thicknessPx,
            thicknessB: b.thicknessPx,
            referenceWallThicknessPx: params.referenceWallThicknessPx,
          })
        ) {
          ufUnion(a.index, b.index)
        }
      }
    }
  }

  const components = new Map<number, AxisItem[]>()
  for (const item of params.items) {
    const root = ufFind(item.index)
    const list = components.get(root) ?? []
    list.push(item)
    components.set(root, list)
  }

  return [...components.values()].map((component) => {
    const positions = component.map((item) => item.pos)
    const clusterSpread = Math.max(...positions) - Math.min(...positions)
    const refThickness = Math.max(
      ...component.map((item) => item.thicknessPx),
      params.referenceWallThicknessPx ?? 0,
    )
    const maxShiftPx = resolveMaxAxisShiftFromOwnPx(
      params.policy,
      refThickness,
      params.referenceWallThicknessPx,
    )
    const spreadLimitPx =
      params.orientation === 'H' ? params.policy.collinearChainMaxSpreadPx : maxShiftPx
    const totalLength = component.reduce((sum, item) => sum + Math.max(1, item.lengthPx), 0)
    const weighted = component.reduce((sum, item) => sum + item.pos * Math.max(1, item.lengthPx), 0)
    const clusterAxis = totalLength > 0 ? weighted / totalLength : component[0]!.pos
    return {
      targetAxis: clusterSpread <= spreadLimitPx ? clusterAxis : null,
      indices: component.map((item) => item.index),
      maxShiftPx,
    }
  })
}

export function resolveSegmentAxisTargets(params: {
  policy: HvPolicy
  segments: Segment[]
  thicknessBySegment: number[]
  orientationBySegment: HvOrientation[]
  endpointRefs: SegmentEndpointRef[]
  referenceWallThicknessPx?: number
}): SegmentOrientation[] {
  const out: SegmentOrientation[] = params.segments.map((segment, index) => {
    const orientation = params.orientationBySegment[index] ?? null
    if (orientation === 'H') {
      return { orientation, targetAxis: axisPosition(segment, 'H') }
    }
    if (orientation === 'V') {
      return { orientation, targetAxis: axisPosition(segment, 'V') }
    }
    return { orientation, targetAxis: null }
  })

  for (const orientation of ['H', 'V'] as const) {
    const items: AxisItem[] = []
    for (let index = 0; index < params.segments.length; index += 1) {
      if (params.orientationBySegment[index] !== orientation) continue
      const seg = params.segments[index]!
      items.push({
        index,
        pos: axisPosition(seg, orientation),
        thicknessPx: params.thicknessBySegment[index] ?? 0,
        lengthPx: segmentLength(seg),
      })
    }
    const clusters = buildConnectedAxisClusters({
      policy: params.policy,
      orientation,
      items,
      endpointRefs: params.endpointRefs,
      referenceWallThicknessPx: params.referenceWallThicknessPx,
    })
    for (const cluster of clusters) {
      for (const index of cluster.indices) {
        const item = items.find((entry) => entry.index === index)
        if (!item) continue
        const targetAxis =
          cluster.targetAxis != null && Math.abs(cluster.targetAxis - item.pos) <= cluster.maxShiftPx
            ? cluster.targetAxis
            : item.pos
        out[index] = { orientation, targetAxis }
      }
    }
  }

  return out
}

export { resolveMaxAxisShiftFromOwnPx }
