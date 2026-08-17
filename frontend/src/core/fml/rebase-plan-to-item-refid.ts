import { FML_ALIGN_FIXTURE_REFID } from './fixture-refid-catalog'
import { translateFloorPlan } from './translate-floor-plan'
import type { DrawingMeta, Floor, FloorItem, FloorPlan } from './types'

export { FML_ALIGN_FIXTURE_REFID }

/** Zelfde drempel als nulpunt-bake (`NULPUNT_EPS_CM`). */
export const ALIGN_FIXTURE_ORIGIN_EPS_CM = 0.05

export type RebasePlanToItemRefidResult = {
  plan: FloorPlan
  moved: number[]
  missing: number[]
  alreadyAtOrigin: number[]
}

function findAlignItem(floor: Floor, refid: string): FloorItem | undefined {
  return floor.items?.find((item) => item.refid === refid)
}

function shiftDrawing(
  drawing: DrawingMeta | undefined,
  dx: number,
  dy: number,
): DrawingMeta | undefined {
  if (!drawing) return drawing
  return {
    ...drawing,
    x: drawing.x + dx,
    y: drawing.y + dy,
  }
}

/**
 * Zet per floor het eerste item met `refid` op FML `(0,0)`.
 * Floors zonder match of al op origin blijven. Drawing-midden schuift mee.
 */
export function rebasePlanToItemRefid(
  plan: FloorPlan,
  refid = FML_ALIGN_FIXTURE_REFID,
  epsCm = ALIGN_FIXTURE_ORIGIN_EPS_CM,
): RebasePlanToItemRefidResult {
  const moved: number[] = []
  const missing: number[] = []
  const alreadyAtOrigin: number[] = []

  let next = plan
  for (let i = 0; i < plan.floors.length; i++) {
    const floor = next.floors[i]
    if (!floor) {
      missing.push(i)
      continue
    }
    const item = findAlignItem(floor, refid)
    if (!item) {
      missing.push(i)
      continue
    }
    if (Math.hypot(item.x, item.y) < epsCm) {
      alreadyAtOrigin.push(i)
      continue
    }
    const dx = -item.x
    const dy = -item.y
    next = translateFloorPlan(next, dx, dy, i)
    const translated = next.floors[i]
    if (!translated) continue
    next = {
      ...next,
      floors: next.floors.map((candidate, idx) =>
        idx === i ? { ...candidate, drawing: shiftDrawing(translated.drawing, dx, dy) } : candidate,
      ),
    }
    moved.push(i)
  }

  return { plan: next, moved, missing, alreadyAtOrigin }
}
