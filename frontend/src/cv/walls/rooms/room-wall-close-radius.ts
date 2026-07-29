const LEGACY_MERGED_WALL_CLOSE_RADIUS_PX = 3
const MERGED_WALL_CLOSE_RADIUS_MIN_PX = 1
const MERGED_WALL_CLOSE_RADIUS_MAX_PX = 5



function clampCloseRadiusPx(value: number): number {

  return Math.max(MERGED_WALL_CLOSE_RADIUS_MIN_PX, Math.round(value))

}



export function resolveMergedWallCloseRadiusPx(params: {

  wallStyle?: 'solid' | 'open'

  referenceWallThicknessPx?: number

  /** Extra inkt-sprong wanneer stap-2 lijnverdikking actief is (legacy; meestal 0 na ink-resolve). */

  preprocessThickenPx?: number

}): number {

  const thickness = params.referenceWallThicknessPx ?? 0

  // resolveInkBetweenFaces vult inkt-gaten vóór mask-build; close is finishing voor resterende pinholes.

  // Conservatiever dan voorheen: voorkom overbruggingen vóór keepLargest.
  const factor = params.wallStyle === 'open' ? 0.04 : 0.03

  const min = MERGED_WALL_CLOSE_RADIUS_MIN_PX
  const max = MERGED_WALL_CLOSE_RADIUS_MAX_PX

  const base =

    thickness <= 0

      ? LEGACY_MERGED_WALL_CLOSE_RADIUS_PX

      : Math.min(max, Math.max(min, clampCloseRadiusPx(Math.round(thickness * factor))))

  return base

}

