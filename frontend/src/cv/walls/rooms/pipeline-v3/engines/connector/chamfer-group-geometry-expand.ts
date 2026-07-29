/**
 * L6 chamfer-group geometry — diagonal group expand from seed.
 */
import type { Segment } from '@/cv/port/wallGraph'
import { segmentLength } from '@/cv/walls/rooms/wall-segment-geometry'
import { incidentAt } from '../segment-ops'
import {
  collectChamferChainSegmentIndices,
  walkDiagonalChamferChain,
} from './chamfer-chain'
import { LAYER6_GROUP_EXPAND_MAX_STEPS } from './constants'
import { classifyLayer6Segment } from './segment-classify'

/** Internal to geometry package — used by resolve-entry. */
export function collectDiagonalGroupIndices(params: {
  segments: Segment[]
  seedIndex: number
  maxChainPx: number
  maxStubPx: number
  hvBandPx: number
  endpointSnapPx: number
}): number[] {
  const seed = params.segments[params.seedIndex]
  if (!seed) return []
  const indices = new Set<number>([params.seedIndex])
  let totalLen = segmentLength(seed)

  for (const root of [seed.a, seed.b]) {
    const chain = collectChamferChainSegmentIndices({
      segments: params.segments,
      tPoint: root,
      maxChainPx: params.maxChainPx,
      maxStubSegmentPx: params.maxStubPx,
      hvBandPx: params.hvBandPx,
      endpointSnapPx: params.endpointSnapPx,
    })
    for (const idx of chain) {
      if (indices.has(idx)) continue
      const len = segmentLength(params.segments[idx]!)
      if (totalLen + len > params.maxChainPx) continue
      indices.add(idx)
      totalLen += len
    }

    const walkA = walkDiagonalChamferChain({
      segments: params.segments,
      fromPoint: root,
      hvBandPx: params.hvBandPx,
      excludeSegIndex: params.seedIndex,
      maxLengthPx: params.maxChainPx,
      endpointSnapPx: params.endpointSnapPx,
    })
    if (walkA) {
      for (const idx of walkA.segIndices) {
        if (indices.has(idx)) continue
        const len = segmentLength(params.segments[idx]!)
        if (totalLen + len > params.maxChainPx) continue
        indices.add(idx)
        totalLen += len
      }
    }
  }

  // Beperkte uitbreiding via anti-parallel knopen (max 8 stappen, lengtebudget).
  for (let step = 0; step < LAYER6_GROUP_EXPAND_MAX_STEPS; step += 1) {
    let grew = false
    const current = [...indices]
    for (const idx of current) {
      const seg = params.segments[idx]
      if (!seg) continue
      for (const point of [seg.a, seg.b]) {
        for (const inc of incidentAt(params.segments, point, params.endpointSnapPx)) {
          if (indices.has(inc.segIndex)) continue
          if (classifyLayer6Segment(inc.segment, inc.segIndex, params.hvBandPx).kind !== 'D') continue
          if (inc.lengthPx > params.maxStubPx) continue
          if (totalLen + inc.lengthPx > params.maxChainPx) continue
          indices.add(inc.segIndex)
          totalLen += inc.lengthPx
          grew = true
        }
      }
    }
    if (!grew) break
  }

  return [...indices]
}
