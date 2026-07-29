/**
 * L6 junction-repair — T-node snap at a point.
 */
import type { Segment } from '@/cv/port/wallGraph'
import { infiniteLineIntersection } from '@/cv/walls/rooms/wall-segment-geometry'
import { collectLayer6HvArmsAtPoint } from './arm-detect'
import { LAYER6_NEAR_GROUP_AXIS_CHAIN_RATIO } from './constants'
import { resolveLayer6HvConsensusTarget } from './consensus'
import {
  diagonalIncidentsAtPoint,
  hasUnretractableChamferAtPoint,
  removeShortDiagonalIncidents,
  replaceLongArmEndpointAtJunction,
} from './junction-repair-diagonals'

export function repairTAtPoint(params: {
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
    junctionKind: 'T',
    endpointSnapPx: params.endpointSnapPx,
  })
  const hs = hvArms.filter((arm) => arm.kind === 'H')
  const vs = hvArms.filter((arm) => arm.kind === 'V')
  if (hs.length === 0 || vs.length === 0) return { changed: false, removed: 0 }

  const longestH = [...hs].sort((a, b) => b.lengthPx - a.lengthPx)[0]!
  const longestV = [...vs].sort((a, b) => b.lengthPx - a.lengthPx)[0]!
  const hit = infiniteLineIntersection(longestH.segment, longestV.segment)
  const target = hit ?? resolveLayer6HvConsensusTarget(hs, vs)
  if (!target) return { changed: false, removed: 0 }
  if (Math.hypot(target.x - params.point.x, target.y - params.point.y) > params.maxShiftPx) {
    return { changed: false, removed: 0 }
  }
  const minArmPx = Math.max(params.armStrictPx, Math.round(params.maxConnectorPx * LAYER6_NEAR_GROUP_AXIS_CHAIN_RATIO))
  for (const arm of hs) {
    replaceLongArmEndpointAtJunction({
      segments: params.segments,
      arm,
      junctionPoint: params.point,
      target,
      minArmPx,
      endpointSnapPx: params.endpointSnapPx,
    })
  }
  for (const arm of vs) {
    replaceLongArmEndpointAtJunction({
      segments: params.segments,
      arm,
      junctionPoint: params.point,
      target,
      minArmPx,
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
