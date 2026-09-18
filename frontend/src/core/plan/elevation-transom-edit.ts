/**
 * Verticale edit van packed bovenlichten in het gevel-aanzicht.
 * Breedte blijft die van de ouder; sleep schrijft `bovenlichtGapCm` / `bovenlichtHeightCm`.
 */
import {
  clampBovenlichtGapCm,
  clampBovenlichtHeightCm,
  MAX_BOVENLICHT_GAP_CM,
  MAX_BOVENLICHT_HEIGHT_CM,
  MIN_BOVENLICHT_HEIGHT_CM,
} from './bovenlicht'
import { openingPatchFromElevationRect } from './elevation-hit'
import type { ElevResizeSide } from './elevation-opening-edit'
import {
  DEFAULT_DOOR_HEIGHT_CM,
  DEFAULT_WINDOW_HEIGHT_CM,
} from './extraction-to-plan-types'
import type { ElevationRect, ElevationWallRect } from './facade-elevation'
import { elevationWallYsAtX } from './facade-elevation'
import type { Opening } from './types'

export type ElevationTransomDragMode = 'move' | Extract<ElevResizeSide, 'n' | 's'>

export type ElevationTransomPatch = {
  bovenlichtHeightCm: number
  bovenlichtGapCm: number
}

function openingTopCm(opening: Pick<Opening, 'z' | 'z_height' | 'type'>): number {
  const z = typeof opening.z === 'number' && Number.isFinite(opening.z) ? opening.z : 0
  const height =
    typeof opening.z_height === 'number' && Number.isFinite(opening.z_height)
      ? opening.z_height
      : opening.type === 'window'
        ? DEFAULT_WINDOW_HEIGHT_CM
        : DEFAULT_DOOR_HEIGHT_CM
  return z + height
}

function normalizedY(rect: ElevationRect): { top: number; bot: number } {
  return {
    top: Math.min(rect.y0, rect.y1),
    bot: Math.max(rect.y0, rect.y1),
  }
}

export function isElevationTransomDragMode(mode: string): mode is ElevationTransomDragMode {
  return mode === 'move' || mode === 'n' || mode === 's'
}

/**
 * Houd X op de start (ouder-breedte). Alleen Y: move = dorpel (hoogte vast),
 * n = latei, s = dorpel met latei vast.
 */
export function clampElevationTransomRect(
  start: ElevationRect,
  parent: ElevationRect,
  wall: ElevationWallRect,
  proposed: ElevationRect,
  mode: ElevationTransomDragMode,
): ElevationRect {
  const x0 = Math.min(start.x0, start.x1)
  const x1 = Math.max(start.x0, start.x1)
  const parentTop = Math.min(parent.y0, parent.y1)
  const midX = (x0 + x1) / 2
  const wallYs = elevationWallYsAtX(wall, midX)
  const wallTop = wallYs?.top ?? Math.min(wall.aTop.y, wall.bTop.y)
  const minH = MIN_BOVENLICHT_HEIGHT_CM
  const maxH = MAX_BOVENLICHT_HEIGHT_CM
  const maxGap = MAX_BOVENLICHT_GAP_CM
  const startY = normalizedY(start)
  const startH = Math.max(minH, Math.min(maxH, startY.bot - startY.top))
  let top = Math.min(proposed.y0, proposed.y1)
  let bot = Math.max(proposed.y0, proposed.y1)

  if (mode === 'move') {
    bot = Math.min(parentTop, Math.max(parentTop - maxGap, bot))
    top = bot - startH
    if (top < wallTop) {
      top = wallTop
      bot = top + startH
      if (bot > parentTop) {
        bot = parentTop
        top = Math.max(wallTop, bot - startH)
      }
    }
  } else if (mode === 'n') {
    bot = startY.bot
    top = Math.max(wallTop, Math.min(top, bot - minH))
    if (bot - top > maxH) top = bot - maxH
  } else {
    top = startY.top
    bot = Math.min(parentTop, Math.max(bot, top + minH))
    if (bot - top > maxH) bot = top + maxH
    if (parentTop - bot > maxGap) bot = parentTop - maxGap
    if (bot < top + minH) bot = top + minH
  }

  return { x0, x1, y0: top, y1: bot }
}

export function transomPatchFromElevationRect(
  parent: Pick<Opening, 'z' | 'z_height' | 'type'>,
  wall: ElevationWallRect,
  rect: ElevationRect,
  floorBaseWorldZ: number,
): ElevationTransomPatch {
  const patch = openingPatchFromElevationRect(wall, rect, floorBaseWorldZ)
  return {
    bovenlichtHeightCm: clampBovenlichtHeightCm(patch.z_height),
    bovenlichtGapCm: clampBovenlichtGapCm(patch.z - openingTopCm(parent)),
  }
}
