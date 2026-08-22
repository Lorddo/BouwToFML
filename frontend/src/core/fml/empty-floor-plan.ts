import { DEFAULT_FML_WALL_HEIGHT_CM } from '@/core/fml/extraction-to-plan-types'
import { ensureRidgeDesign } from '@/core/fml/ridge-walls'
import type { Floor, FloorPlan } from '@/core/fml/types'

/** Floor-namen blijven NL: eindgebruiker (FML), niet UI-locale. */
export const DEFAULT_EMPTY_FLOOR_NAME = 'Begane grond'

export function emptyFloorNameIndexed(n: number): string {
  return `Verdieping ${n}`
}

function resolveWallHeightCm(value: number | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.round(value)
  }
  return DEFAULT_FML_WALL_HEIGHT_CM
}

export function createBlankFloor(opts: {
  name: string
  level: number
  wallHeightCm?: number
}): Floor {
  return ensureRidgeDesign({
    name: opts.name.trim() || DEFAULT_EMPTY_FLOOR_NAME,
    level: opts.level,
    height: resolveWallHeightCm(opts.wallHeightCm),
    walls: [],
  }).floor
}

/** Leeg teken-plan voor de losse FML-viewer (geen detectie). */
export function createEmptyFloorPlan(opts?: {
  name?: string
  floorName?: string
  wallHeightCm?: number
}): FloorPlan {
  return {
    name: opts?.name?.trim() ?? '',
    floors: [
      createBlankFloor({
        name: opts?.floorName?.trim() || DEFAULT_EMPTY_FLOOR_NAME,
        level: 0,
        wallHeightCm: opts?.wallHeightCm,
      }),
    ],
  }
}
