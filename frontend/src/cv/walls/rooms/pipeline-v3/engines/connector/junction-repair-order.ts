/**
 * L6 junction-repair — node order + chamfer-landing L-skip.
 */
import type { Segment } from '@/cv/port/wallGraph'
import { buildJunctionGraph } from '@/cv/port/wallJunctionGraph'
import { incidentAt } from '../segment-ops'
import { collectLayer6HvArmsAtPoint } from './arm-detect'
import { resolveLayer6HvConsensusTarget } from './consensus'
import { otherEndpoint } from './junction-repair-diagonals'
import { classifyLayer6Segment } from './segment-classify'

/** L op chamfer-landing naar nog niet gerepareerde T overslaan (bv. 644,61 → T@659). */
export function isChamferLandingForTNode(params: {
  segments: Segment[]
  point: { x: number; y: number }
  tNodes: Array<{ x: number; y: number }>
  maxConnectorPx: number
  hvBandPx: number
  endpointSnapPx: number
  chamferLGuardPx: number
}): boolean {
  return incidentAt(params.segments, params.point, params.endpointSnapPx).some((incident) => {
    const classified = classifyLayer6Segment(incident.segment, incident.segIndex, params.hvBandPx)
    if (classified.kind !== 'D' || classified.lengthPx > params.maxConnectorPx) return false
    const other = otherEndpoint(incident.segment, params.point)
    return params.tNodes.some(
      (t) => Math.hypot(t.x - other.x, t.y - other.y) <= params.chamferLGuardPx,
    )
  })
}

function chamferOuterPriority(
  segments: Segment[],
  point: { x: number; y: number },
  armDetectPx: number,
  hvBandPx: number,
  endpointSnapPx: number,
): number {
  const hasChamfer = incidentAt(segments, point, endpointSnapPx).some((incident) => {
    return classifyLayer6Segment(incident.segment, incident.segIndex, hvBandPx).kind === 'D'
  })
  if (!hasChamfer) return 0
  const arms = collectLayer6HvArmsAtPoint({
    segments,
    point,
    armDetectPx,
    hvBandPx,
    junctionKind: 'L',
    endpointSnapPx,
  })
  const hs = arms.filter((arm) => arm.kind === 'H')
  const vs = arms.filter((arm) => arm.kind === 'V')
  if (hs.length === 0 || vs.length === 0) return 0
  const target = resolveLayer6HvConsensusTarget(hs, vs)
  if (!target) return 0
  return Math.hypot(target.x - point.x, target.y - point.y)
}

export function orderJunctionNodesForRepair(
  nodes: ReturnType<typeof buildJunctionGraph>['nodes'],
  segments: Segment[],
  armDetectPx: number,
  hvBandPx: number,
  endpointSnapPx: number,
): ReturnType<typeof buildJunctionGraph>['nodes'] {
  const txNodes = nodes
    .filter((node) => node.kind === 'T' || node.kind === 'X')
    .sort(
      (a, b) =>
        chamferOuterPriority(segments, { x: b.x, y: b.y }, armDetectPx, hvBandPx, endpointSnapPx) -
        chamferOuterPriority(segments, { x: a.x, y: a.y }, armDetectPx, hvBandPx, endpointSnapPx),
    )
  const lNodes = nodes
    .filter((node) => node.kind === 'L')
    .sort(
      (a, b) =>
        chamferOuterPriority(segments, { x: b.x, y: b.y }, armDetectPx, hvBandPx, endpointSnapPx) -
        chamferOuterPriority(segments, { x: a.x, y: a.y }, armDetectPx, hvBandPx, endpointSnapPx),
    )
  return [...txNodes, ...lNodes]
}
