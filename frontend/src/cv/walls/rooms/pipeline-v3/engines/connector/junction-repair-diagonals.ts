/**
 * L6 junction-repair — diagonal / unretractable-chamfer helpers + arm endpoint snap.
 */
import { tally } from '@/core/diagnostics'
import type { Segment } from '@/cv/port/wallGraph'
import { segmentLength } from '@/cv/walls/rooms/wall-segment-geometry'
import { incidentAt, removeSegmentAt, replaceSegmentEndpoint } from '../segment-ops'
import { collectLayer6HvArmsAtPoint } from './arm-detect'
import { LAYER6_ENDPOINT_SNAP_PX, LAYER6_NEAR_GROUP_AXIS_CHAIN_RATIO } from './constants'
import { isLandingChamferAtJunction } from './chamfer-chain'
import { classifyLayer6Segment } from './segment-classify'

export type IncidentTyped = ReturnType<typeof incidentAt>[number] & {
  kind: 'H' | 'V' | 'D'
  axis: number | null
}

export type HvArmTyped = ReturnType<typeof collectLayer6HvArmsAtPoint>[number]

export function otherEndpoint(
  seg: Segment,
  point: { x: number; y: number },
): { x: number; y: number } {
  const da = Math.hypot(seg.a.x - point.x, seg.a.y - point.y)
  const db = Math.hypot(seg.b.x - point.x, seg.b.y - point.y)
  return da <= db ? { ...seg.b } : { ...seg.a }
}

export function diagonalIncidentsAtPoint(
  segments: Segment[],
  point: { x: number; y: number },
  armDetectPx: number,
  hvBandPx: number,
): IncidentTyped[] {
  return incidentAt(segments, point, armDetectPx)
    .map((incident) => {
      const classified = classifyLayer6Segment(incident.segment, incident.segIndex, hvBandPx)
      return {
        ...incident,
        kind: classified.kind,
        axis: classified.targetAxis,
      }
    })
    .filter((incident) => incident.kind === 'D')
}

// ESC:W-41 (B)
/** Chamfer-diagonaal waarvan het verre eind buiten armDetect ligt → connector-pad, niet junction-snap. */
function isUnretractableChamferDiagonal(params: {
  segment: Segment
  junctionPoint: { x: number; y: number }
  armDetectPx: number
  maxConnectorPx: number
  lengthPx: number
}): boolean {
  if (params.lengthPx < 1 || params.lengthPx > params.maxConnectorPx) return false
  const far = otherEndpoint(params.segment, params.junctionPoint)
  const farDist = Math.hypot(far.x - params.junctionPoint.x, far.y - params.junctionPoint.y)
  return farDist > params.armDetectPx
}

export function removeShortDiagonalIncidents(params: {
  segments: Segment[]
  incidents: IncidentTyped[]
  junctionPoint: { x: number; y: number }
  armDetectPx: number
  maxConnectorPx: number
  armStrictPx: number
  hvBandPx: number
}): number {
  const toRemove: number[] = []
  for (const incident of params.incidents) {
    if (incident.kind !== 'D') continue
    if (segmentLength(incident.segment) > params.maxConnectorPx) {
      tally('W-41', 'skip_too_long')
      continue
    }
    if (
      isLandingChamferAtJunction({
        segments: params.segments,
        diagonal: incident.segment,
        junctionPoint: params.junctionPoint,
        minArmPx: Math.max(
          params.armStrictPx,
          params.maxConnectorPx * LAYER6_NEAR_GROUP_AXIS_CHAIN_RATIO,
        ),
        hvBandPx: params.hvBandPx,
      })
    ) {
      tally('W-41', 'skip_landing')
      continue
    }
    // Alleen stub-diagonalen waarvan BEIDE eindpunten nabij de (geweld) junction liggen.
    // Anders ontstaat een gat aan de verre chamfer-kant (T→L+I).
    if (
      isUnretractableChamferDiagonal({
        segment: incident.segment,
        junctionPoint: params.junctionPoint,
        armDetectPx: params.armDetectPx,
        maxConnectorPx: params.maxConnectorPx,
        lengthPx: incident.lengthPx,
      })
    ) {
      tally('W-41', 'skip_unretractable')
      continue
    }
    toRemove.push(incident.segIndex)
  }
  toRemove.sort((a, b) => b - a)
  for (const segIndex of toRemove) {
    tally('W-41', 'removed')
    removeSegmentAt(params.segments, segIndex)
  }
  return toRemove.length
}

export function replaceLongArmEndpointAtJunction(params: {
  segments: Segment[]
  arm: HvArmTyped
  junctionPoint: { x: number; y: number }
  target: { x: number; y: number }
  minArmPx: number
  endpointSnapPx?: number
}): void {
  const endpointSnapPx = params.endpointSnapPx ?? LAYER6_ENDPOINT_SNAP_PX
  if (params.arm.lengthPx < params.minArmPx) return
  const da = Math.hypot(
    params.arm.segment.a.x - params.junctionPoint.x,
    params.arm.segment.a.y - params.junctionPoint.y,
  )
  const db = Math.hypot(
    params.arm.segment.b.x - params.junctionPoint.x,
    params.arm.segment.b.y - params.junctionPoint.y,
  )
  const end = da <= db ? params.arm.segment.a : params.arm.segment.b
  if (Math.hypot(end.x - params.junctionPoint.x, end.y - params.junctionPoint.y) > endpointSnapPx) {
    return
  }
  replaceSegmentEndpoint(
    params.segments,
    params.arm.segIndex,
    { x: end.x, y: end.y },
    params.target,
    endpointSnapPx,
  )
}

/**
 * All-or-nothing: geen arm-snap als er een chamfer-diagonaal hangt die we niet mogen
 * verwijderen (verre tip buiten armDetect). Dat half-pad maakt I's (2D_3E SE-hoek).
 * Zulke cases horen bij connector/chamfer-group, niet bij junction-snap.
 */
export function hasUnretractableChamferAtPoint(params: {
  incidents: IncidentTyped[]
  junctionPoint: { x: number; y: number }
  armDetectPx: number
  maxConnectorPx: number
}): boolean {
  return params.incidents.some((incident) =>
    isUnretractableChamferDiagonal({
      segment: incident.segment,
      junctionPoint: params.junctionPoint,
      armDetectPx: params.armDetectPx,
      maxConnectorPx: params.maxConnectorPx,
      lengthPx: incident.lengthPx,
    }),
  )
}
