/**
 * L6 junction-repair orchestrator — L/T/X node pass (public API).
 */
import type { Segment } from '@/cv/port/wallGraph'
import { buildJunctionGraph } from '@/cv/port/wallJunctionGraph'
import { cloneSegments, dropZeroLengthSegments } from '../segment-ops'
import { LAYER6_HV_BAND_FALLBACK_PX, resolveLayer6Scale } from './constants'
import { prepareSegmentsForConnectorGraph } from './junction-guard'
import { repairLAtPoint } from './junction-repair-l'
import { isChamferLandingForTNode, orderJunctionNodesForRepair } from './junction-repair-order'
import { repairTAtPoint } from './junction-repair-t'
import { repairLayer6XAtPoint } from './x-repair'

export interface Layer6JunctionRepairStats {
  repaired: number
  skipped: number
  lRepaired: number
  tRepaired: number
  xRepaired: number
  removedDiagonals: number
}

export function repairLayer6JunctionNodes(params: {
  segments: Segment[]
  referenceWallThicknessPx?: number
  validateCandidate?: (before: Segment[], after: Segment[]) => boolean
}): { segments: Segment[]; stats: Layer6JunctionRepairStats } {
  const work = prepareSegmentsForConnectorGraph(cloneSegments(params.segments))
  const scale = resolveLayer6Scale(params.referenceWallThicknessPx)
  const hvBandPx = scale.hvBandPx ?? LAYER6_HV_BAND_FALLBACK_PX
  const endpointSnapPx = scale.endpointSnapPx
  const chamferLGuardPx = scale.chamferLGuardPx
  const maxConnectorPx = scale.connectorMaxPx
  const armDetectPx = scale.armDetectPx
  const maxShiftPx = Math.max(
    scale.maxAttachmentShiftPx,
    Math.round(maxConnectorPx * 0.75),
    armDetectPx,
  )
  const stats: Layer6JunctionRepairStats = {
    repaired: 0,
    skipped: 0,
    lRepaired: 0,
    tRepaired: 0,
    xRepaired: 0,
    removedDiagonals: 0,
  }

  const graph = buildJunctionGraph(work, 0)
  const orderedNodes = orderJunctionNodesForRepair(
    graph.nodes,
    work,
    armDetectPx,
    hvBandPx,
    endpointSnapPx,
  )
  const pendingTNodes = graph.nodes
    .filter((node) => node.kind === 'T' || node.kind === 'X')
    .map((node) => ({ x: node.x, y: node.y }))
  for (const node of orderedNodes) {
    const before = cloneSegments(work)
    let changed = false
    let removed = 0
    // ESC:W-40 (B)
    if (node.kind === 'L') {
      if (
        isChamferLandingForTNode({
          segments: work,
          point: { x: node.x, y: node.y },
          tNodes: pendingTNodes,
          maxConnectorPx,
          hvBandPx,
          endpointSnapPx,
          chamferLGuardPx,
        })
      ) {
        stats.skipped += 1
        continue
      }
      const l = repairLAtPoint({
        segments: work,
        point: { x: node.x, y: node.y },
        maxShiftPx,
        maxConnectorPx,
        armDetectPx,
        armStrictPx: scale.armStrictPx,
        hvBandPx,
        endpointSnapPx,
      })
      changed = l.changed
      removed = l.removed
      if (changed) stats.lRepaired += 1
    } else if (node.kind === 'T') {
      const t = repairTAtPoint({
        segments: work,
        point: { x: node.x, y: node.y },
        maxShiftPx,
        maxConnectorPx,
        armDetectPx,
        armStrictPx: scale.armStrictPx,
        hvBandPx,
        endpointSnapPx,
      })
      changed = t.changed
      removed = t.removed
      if (changed) stats.tRepaired += 1
    } else if (node.kind === 'X') {
      changed = repairLayer6XAtPoint({
        segments: work,
        point: { x: node.x, y: node.y },
        maxShiftPx,
        hvBandPx,
        endpointSnapPx,
      })
      if (changed) stats.xRepaired += 1
    }

    if (!changed) {
      stats.skipped += 1
      continue
    }

    // ESC:W-39 (B)
    if (params.validateCandidate) {
      const compact = dropZeroLengthSegments(work)
      const ok = params.validateCandidate(before, compact.segments)
      if (!ok) {
        work.splice(0, work.length, ...before)
        stats.skipped += 1
        if (node.kind === 'L') stats.lRepaired -= 1
        if (node.kind === 'T') stats.tRepaired -= 1
        if (node.kind === 'X') stats.xRepaired -= 1
        continue
      }
      work.splice(0, work.length, ...compact.segments)
    }

    stats.removedDiagonals += removed
    stats.repaired += 1
  }

  const sanitized = dropZeroLengthSegments(work)
  return { segments: sanitized.segments, stats }
}
