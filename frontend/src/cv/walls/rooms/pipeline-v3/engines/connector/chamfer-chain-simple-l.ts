/**
 * L6 chamfer-chain — simple-L corner geometry.
 */
import type { Segment } from '@/cv/port/wallGraph'
import { infiniteLineIntersection } from '@/cv/walls/rooms/wall-segment-geometry'
import { incidentAt } from '../segment-ops'
import { classifyLayer6Segment } from './segment-classify'
import { resolveLayer6Scale } from './constants'

/** L-hoek: één eind V, ander eind H — beide poten naar H×V-snijpunt (geen through-T landing). */
export function resolveSimpleLChamferGeometry(params: {
  segments: Segment[]
  diagonal: Segment
  connectorIndex?: number
  minArmPx?: number
  referenceWallThicknessPx?: number
  hvBandPx?: number
}): {
  hit: { x: number; y: number }
  hSegIndex: number
  vSegIndex: number
  hTouchPoint: { x: number; y: number }
  vTouchPoint: { x: number; y: number }
} | null {
  const scale = resolveLayer6Scale(params.referenceWallThicknessPx)
  const hvBandPx = params.hvBandPx ?? scale.hvBandPx
  const endpointSnapPx = scale.endpointSnapPx
  const minArm = params.minArmPx ?? scale.armStrictPx
  const skipIndex = params.connectorIndex

  const armsAt = (point: { x: number; y: number }) => {
    const incidents = incidentAt(params.segments, point, endpointSnapPx).filter(
      (inc) => skipIndex == null || inc.segIndex !== skipIndex,
    )
    const h = incidents
      .filter((inc) => {
        const kind = classifyLayer6Segment(inc.segment, inc.segIndex, hvBandPx).kind
        return kind === 'H' && inc.lengthPx >= minArm
      })
      .sort((a, b) => b.lengthPx - a.lengthPx)
    const v = incidents
      .filter((inc) => {
        const kind = classifyLayer6Segment(inc.segment, inc.segIndex, hvBandPx).kind
        return kind === 'V' && inc.lengthPx >= minArm
      })
      .sort((a, b) => b.lengthPx - a.lengthPx)
    return { h, v }
  }

  const pickSimpleLPair = (
    hArms: { h: Array<{ segIndex: number; segment: Segment }>; v: Array<{ segIndex: number; segment: Segment }> },
    vArms: { h: Array<{ segIndex: number; segment: Segment }>; v: Array<{ segIndex: number; segment: Segment }> },
    hTouch: { x: number; y: number },
    vTouch: { x: number; y: number },
  ) => {
    // Through-T (≥2 H of ≥2 V op één eind): geen simple-L — trekt de through-arm los → T→I
    // (BouwTek11 @1489: through-V T + H-landing diagonaal).
    if (
      hArms.h.length >= 2
      || vArms.h.length >= 2
      || hArms.v.length >= 2
      || vArms.v.length >= 2
    ) {
      return null
    }
    if (hArms.h.length === 0 || vArms.v.length === 0) return null
    const hPick = hArms.h[0]!
    const vPick = vArms.v[0]!
    const hit = infiniteLineIntersection(hPick.segment, vPick.segment)
    if (!hit || !Number.isFinite(hit.x) || !Number.isFinite(hit.y)) return null
    return {
      hit,
      hSegIndex: hPick.segIndex,
      vSegIndex: vPick.segIndex,
      hTouchPoint: { ...hTouch },
      vTouchPoint: { ...vTouch },
    }
  }

  const atA = armsAt(params.diagonal.a)
  const atB = armsAt(params.diagonal.b)

  const fromB = pickSimpleLPair(atB, atA, params.diagonal.b, params.diagonal.a)
  if (fromB) return fromB
  const fromA = pickSimpleLPair(atA, atB, params.diagonal.a, params.diagonal.b)
  if (fromA) return fromA
  return null
}
