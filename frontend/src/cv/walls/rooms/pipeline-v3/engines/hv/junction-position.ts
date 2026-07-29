import type { RoomWallJunction } from '../../../room-wall-skeleton-types'
import type { HvPolicy } from '../policy-types'
import { resolveMaxAxisShiftFromOwnPx } from './axis-clusters'
import type { HvOrientation } from './qualify'

export type JunctionArmInfo = {
  segmentIndex: number
  orientation: HvOrientation
  targetAxis: number | null
  thicknessPx: number
  lengthPx: number
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((sum, value) => sum + value, 0) / nums.length
}

function clampShift(params: {
  from: { x: number; y: number }
  to: { x: number; y: number }
  maxShiftPx: number
}): { x: number; y: number } {
  const dx = params.to.x - params.from.x
  const dy = params.to.y - params.from.y
  const dist = Math.hypot(dx, dy)
  if (!Number.isFinite(dist) || dist <= params.maxShiftPx || params.maxShiftPx <= 0) {
    return params.to
  }
  const ratio = params.maxShiftPx / dist
  return {
    x: params.from.x + dx * ratio,
    y: params.from.y + dy * ratio,
  }
}

function weightedAxisFromArms(arms: JunctionArmInfo[]): number | null {
  const weighted = arms.reduce(
    (sum, arm) => sum + (arm.targetAxis as number) * Math.max(1, arm.lengthPx),
    0,
  )
  const totalLength = arms.reduce((sum, arm) => sum + Math.max(1, arm.lengthPx), 0)
  return totalLength > 0 ? weighted / totalLength : null
}

function resolveCollinearAxisGroup(params: {
  policy: HvPolicy
  arms: JunctionArmInfo[]
  originalAxis: number
  referenceWallThicknessPx?: number
  localThicknessPx: number
}): number {
  const axes = params.arms
    .filter((arm) => arm.targetAxis != null)
    .map((arm) => arm.targetAxis as number)
  if (axes.length === 0) return params.originalAxis
  if (axes.length === 1) return axes[0]!
  const spread = Math.max(...axes) - Math.min(...axes)
  if (spread <= params.policy.collinearChainMaxSpreadPx) {
    const weighted = weightedAxisFromArms(params.arms.filter((arm) => arm.targetAxis != null))
    return weighted ?? mean(axes)
  }
  const maxSpreadPx = resolveMaxAxisShiftFromOwnPx(
    params.policy,
    params.localThicknessPx,
    params.referenceWallThicknessPx,
  )
  if (spread > maxSpreadPx) return params.originalAxis
  const weighted = weightedAxisFromArms(params.arms.filter((arm) => arm.targetAxis != null))
  return weighted ?? mean(axes)
}

/** Resolve new junction XY from H/V arms — all mapped endpoints later copy this point. */
export function resolveJunctionPosition(params: {
  policy: HvPolicy
  junction: RoomWallJunction
  arms: JunctionArmInfo[]
  referenceWallThicknessPx?: number
}): { x: number; y: number } {
  const hArms = params.arms.filter((arm) => arm.orientation === 'H' && arm.targetAxis != null)
  const vArms = params.arms.filter((arm) => arm.orientation === 'V' && arm.targetAxis != null)

  const localThickness = mean(params.arms.map((arm) => arm.thicknessPx))
  const maxShiftPx =
    Math.max(localThickness, params.referenceWallThicknessPx ?? 0, params.policy.thicknessFallbackPx) *
    params.policy.junctionShiftMaxRatio

  const next = {
    x:
      vArms.length > 0
        ? resolveCollinearAxisGroup({
            policy: params.policy,
            arms: vArms,
            originalAxis: params.junction.x,
            referenceWallThicknessPx: params.referenceWallThicknessPx,
            localThicknessPx: localThickness,
          })
        : params.junction.x,
    y:
      hArms.length > 0
        ? resolveCollinearAxisGroup({
            policy: params.policy,
            arms: hArms,
            originalAxis: params.junction.y,
            referenceWallThicknessPx: params.referenceWallThicknessPx,
            localThicknessPx: localThickness,
          })
        : params.junction.y,
  }
  return clampShift({
    from: { x: params.junction.x, y: params.junction.y },
    to: next,
    maxShiftPx,
  })
}
