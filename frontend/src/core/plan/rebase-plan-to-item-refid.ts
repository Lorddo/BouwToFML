import { FML_ALIGN_FIXTURE_KIND } from './fixture-refid-catalog'
import { translateFloorPlan } from './translate-floor-plan'
import type { Floor, FloorItem, FloorPlan } from './types'
import type { FixtureAssetKind } from './fixture-kind-catalog'

export { FML_ALIGN_FIXTURE_KIND }

/** Zelfde drempel als nulpunt-bake (`NULPUNT_EPS_CM`). */
export const ALIGN_FIXTURE_ORIGIN_EPS_CM = 0.05

export type RebasePlanToItemRefidResult = {
  plan: FloorPlan
  moved: number[]
  missing: number[]
  alreadyAtOrigin: number[]
}

function findAlignItem(floor: Floor, kind: FixtureAssetKind): FloorItem | undefined {
  return floor.items?.find((item) => item.kind === kind)
}

/**
 * Zet per floor het eerste item met `kind` op plan `(0,0)`.
 * Floors zonder match of al op origin blijven. Drawing schuift mee via translate.
 */
export function rebasePlanToItemRefid(
  plan: FloorPlan,
  kind: FixtureAssetKind = FML_ALIGN_FIXTURE_KIND,
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
    const item = findAlignItem(floor, kind)
    if (!item) {
      missing.push(i)
      continue
    }
    if (Math.hypot(item.x, item.y) < epsCm) {
      alreadyAtOrigin.push(i)
      continue
    }
    next = translateFloorPlan(next, -item.x, -item.y, i)
    if (!next.floors[i]) continue
    moved.push(i)
  }

  return { plan: next, moved, missing, alreadyAtOrigin }
}
