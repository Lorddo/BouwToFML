/**
 * Uniforme L6 chamfer-groep repair:
 * detect groep → H/V-assen (3.5×ref) → H×V-hit → weld → diagonalen weg.
 * Nooit diagonalen verwijderen zonder geslaagde weld (geen gaten, geen T→L/I).
 */
import type { Segment } from '@/cv/port/wallGraph'
import { segmentLength } from '@/cv/walls/rooms/wall-segment-geometry'
import { cloneSegments } from '../segment-ops'
import { applyChamferGroupRepair } from './chamfer-group-apply'
import { resolveChamferGroupGeometry } from './chamfer-group-geometry'
import { resolveLayer6Scale, resolveLayer6ThicknessMarginPx } from './constants'
import { classifyLayer6Segment } from './segment-classify'
import {
  baselineTxJunctionsPreserved,
  collectBaselineTxJunctions,
  layer6RepairTopologyOk,
} from './junction-guard'

export type { ChamferGroupGeometry, ChamferGroupKind } from './chamfer-group-geometry'
export { isAlternatingStairDiagonalChain, resolveChamferGroupGeometry } from './chamfer-group-geometry'

export function tryRepairChamferGroup(params: {
  segments: Segment[]
  connectorIndex: number
  referenceWallThicknessPx?: number
  validate?: (before: Segment[], after: Segment[]) => boolean
}): { segments: Segment[]; repaired: boolean; removed: number } | null {
  const scale = resolveLayer6Scale(params.referenceWallThicknessPx)
  const hvBandPx = scale.hvBandPx
  const geometry = resolveChamferGroupGeometry({
    segments: params.segments,
    connectorIndex: params.connectorIndex,
    referenceWallThicknessPx: scale.refPx,
  })
  if (!geometry) return null

  const before = cloneSegments(params.segments)
  const applied = applyChamferGroupRepair({
    segments: cloneSegments(params.segments),
    geometry,
    referenceWallThicknessPx: params.referenceWallThicknessPx,
  })

  if (params.validate && !params.validate(before, applied.segments)) {
    return { segments: before, repaired: false, removed: 0 }
  }

  // Hard contract: geen T/X-downgrade, geen I-explosie, connectivity elders.
  const txBaseline = collectBaselineTxJunctions(before)
  if (!baselineTxJunctionsPreserved(txBaseline, applied.segments, resolveLayer6ThicknessMarginPx(params.referenceWallThicknessPx))) {
    return { segments: before, repaired: false, removed: 0 }
  }
  if (!layer6RepairTopologyOk({ baselineSegments: before, repairedSegments: applied.segments })) {
    return { segments: before, repaired: false, removed: 0 }
  }

  // Sanity: minstens één diagonaal weg, anders geen echte repair.
  const beforeDiags = before.filter((seg, i) => classifyLayer6Segment(seg, i, hvBandPx).kind === 'D').length
  const afterDiags = applied.segments.filter((seg, i) => classifyLayer6Segment(seg, i, hvBandPx).kind === 'D').length
  if (afterDiags >= beforeDiags && segmentLength(before[params.connectorIndex]!) > 0) {
    // Groep kan gedeeld zijn; check seed weg.
    const seedGone = !applied.segments.some((seg) => {
      const s = before[params.connectorIndex]!
      return (
        Math.hypot(seg.a.x - s.a.x, seg.a.y - s.a.y) < 1e-3
        && Math.hypot(seg.b.x - s.b.x, seg.b.y - s.b.y) < 1e-3
      )
    })
    if (!seedGone && afterDiags >= beforeDiags) {
      return { segments: before, repaired: false, removed: 0 }
    }
  }

  return {
    segments: applied.segments,
    repaired: true,
    removed: applied.removedDiagonalCount,
  }
}
