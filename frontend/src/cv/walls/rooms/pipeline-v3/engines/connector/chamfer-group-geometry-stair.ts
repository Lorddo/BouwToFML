/**
 * L6 chamfer-group geometry — alternating stair vs same-turn chamfer.
 */
import type { Segment } from '@/cv/port/wallGraph'
import { incidentAt } from '../segment-ops'
import { LAYER6_ENDPOINT_SNAP_PX } from './constants'

/**
 * Trap vs chamfer: bij ≥2 diagonalen kijken naar draaizin op knooppunten.
 * Trap = opeenvolgende knikken wisselen van teken (opheffen) → geen chamfer-groep.
 * Chamfer = zelfde draaizin (versterken) → wel collapsen naar H×V.
 */
export function isAlternatingStairDiagonalChain(params: {
  segments: Segment[]
  diagonalIndices: number[]
  endpointSnapPx?: number
}): boolean {
  const endpointSnapPx = params.endpointSnapPx ?? LAYER6_ENDPOINT_SNAP_PX
  if (params.diagonalIndices.length < 2) return false
  const turns: number[] = []
  const seenJoints = new Set<string>()
  for (const idx of params.diagonalIndices) {
    const seg = params.segments[idx]
    if (!seg) continue
    for (const joint of [seg.a, seg.b]) {
      const key = `${joint.x.toFixed(2)}:${joint.y.toFixed(2)}`
      if (seenJoints.has(key)) continue
      const diags = incidentAt(params.segments, joint, endpointSnapPx).filter((inc) =>
        params.diagonalIndices.includes(inc.segIndex),
      )
      if (diags.length !== 2) continue
      seenJoints.add(key)
      const a = diags[0].segment
      const b = diags[1].segment
      const mid = joint
      const otherA = Math.hypot(a.a.x - mid.x, a.a.y - mid.y) <= endpointSnapPx ? a.b : a.a
      const otherB = Math.hypot(b.a.x - mid.x, b.a.y - mid.y) <= endpointSnapPx ? b.b : b.a
      const ax = otherA.x - mid.x
      const ay = otherA.y - mid.y
      const bx = otherB.x - mid.x
      const by = otherB.y - mid.y
      const cross = ax * by - ay * bx
      if (Math.abs(cross) < 1e-6) continue
      turns.push(Math.sign(cross))
    }
  }
  if (turns.length < 2) return false
  for (let i = 1; i < turns.length; i += 1) {
    if (turns[i] !== turns[0]) return true
  }
  return false
}
