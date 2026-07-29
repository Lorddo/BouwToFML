/**
 * L6 junction-repair — L-node snap at a point.
 */
import type { Segment } from '@/cv/port/wallGraph'
import { infiniteLineIntersection } from '@/cv/walls/rooms/wall-segment-geometry'
import { collectLayer6HvArmsAtPoint } from './arm-detect'
import { LAYER6_LANDING_DIAGONAL_GUARD_RATIO } from './constants'
import {
  diagonalIncidentsAtPoint,
  hasUnretractableChamferAtPoint,
  removeShortDiagonalIncidents,
  replaceLongArmEndpointAtJunction,
} from './junction-repair-diagonals'

export function repairLAtPoint(params: {
  segments: Segment[]
  point: { x: number; y: number }
  maxShiftPx: number
  maxConnectorPx: number
  armDetectPx: number
  armStrictPx: number
  hvBandPx: number
  endpointSnapPx: number
}): { changed: boolean; removed: number } {
  const diagIncidentsBefore = diagonalIncidentsAtPoint(
    params.segments,
    params.point,
    params.armDetectPx,
    params.hvBandPx,
  )
  if (
    diagIncidentsBefore.some(
      (incident) =>
        incident.lengthPx >
        Math.max(params.armStrictPx, params.maxConnectorPx * LAYER6_LANDING_DIAGONAL_GUARD_RATIO),
    )
  ) {
    return { changed: false, removed: 0 }
  }
  if (
    hasUnretractableChamferAtPoint({
      incidents: diagIncidentsBefore,
      junctionPoint: params.point,
      armDetectPx: params.armDetectPx,
      maxConnectorPx: params.maxConnectorPx,
    })
  ) {
    return { changed: false, removed: 0 }
  }
  const hvArms = collectLayer6HvArmsAtPoint({
    segments: params.segments,
    point: params.point,
    armDetectPx: params.armDetectPx,
    hvBandPx: params.hvBandPx,
    junctionKind: 'L',
    endpointSnapPx: params.endpointSnapPx,
  })
  const h = hvArms.filter((arm) => arm.kind === 'H')
  const v = hvArms.filter((arm) => arm.kind === 'V')
  if (h.length === 0 || v.length === 0) return { changed: false, removed: 0 }
  const longestH = h.sort((a, b) => b.lengthPx - a.lengthPx)[0]
  const longestV = v.sort((a, b) => b.lengthPx - a.lengthPx)[0]
  const hit = infiniteLineIntersection(longestH.segment, longestV.segment)
  if (!hit) return { changed: false, removed: 0 }
  if (Math.hypot(hit.x - params.point.x, hit.y - params.point.y) > params.maxShiftPx) {
    return { changed: false, removed: 0 }
  }
  for (const arm of h) {
    replaceLongArmEndpointAtJunction({
      segments: params.segments,
      arm,
      junctionPoint: params.point,
      target: hit,
      minArmPx: 0,
      endpointSnapPx: params.endpointSnapPx,
    })
  }
  for (const arm of v) {
    replaceLongArmEndpointAtJunction({
      segments: params.segments,
      arm,
      junctionPoint: params.point,
      target: hit,
      minArmPx: 0,
      endpointSnapPx: params.endpointSnapPx,
    })
  }
  const removed = removeShortDiagonalIncidents({
    segments: params.segments,
    incidents: diagIncidentsBefore,
    junctionPoint: params.point,
    armDetectPx: params.armDetectPx,
    maxConnectorPx: params.maxConnectorPx,
    armStrictPx: params.armStrictPx,
    hvBandPx: params.hvBandPx,
  })
  return { changed: true, removed }
}
