import { resolveMergedLabel } from '@/cv/walls/rooms/room-raster-merge'
import type { ResolvedDoorCandidate } from './types'

const MASK_INK_THRESHOLD = 128
const SEARCH_RADIUS_MIN_PX = 4

export type DoorKeptWallMaskRejection = {
  door: ResolvedDoorCandidate
  reason: 'no_kept_wall_mask_contact'
}

export function resolveKeptWallMaskSearchRadiusPx(
  referenceWallThicknessPx?: number | null,
): number {
  const thickness = Math.max(0, Math.round(referenceWallThicknessPx ?? 0))
  return Math.max(SEARCH_RADIUS_MIN_PX, Math.round(thickness * 0.2))
}

function isMaskInk(mask: Uint8Array, width: number, x: number, y: number): boolean {
  return (mask[y * width + x] ?? 0) >= MASK_INK_THRESHOLD
}

/** True als Chebyshev-ball om (x,y) een kept-mask ink-pixel raakt. */
function maskInkWithinRadius(params: {
  wallMask: Uint8Array
  width: number
  height: number
  x: number
  y: number
  radius: number
}): boolean {
  const { wallMask, width, height, x, y, radius } = params
  const x0 = Math.max(0, x - radius)
  const y0 = Math.max(0, y - radius)
  const x1 = Math.min(width - 1, x + radius)
  const y1 = Math.min(height - 1, y + radius)
  for (let yy = y0; yy <= y1; yy += 1) {
    for (let xx = x0; xx <= x1; xx += 1) {
      if (isMaskInk(wallMask, width, xx, yy)) return true
    }
  }
  return false
}

/**
 * Post-L0: keep alleen deuren waarvan een face-pixel de kept wall mask
 * raakt (binnen search-radius). Zelfde face-match als L11 snap
 * (raw label óf merged root).
 */
export function doorTouchesKeptWallMask(params: {
  door: ResolvedDoorCandidate
  wallMask: Uint8Array
  labelsData: Int32Array
  parentMap: Map<number, number>
  width: number
  height: number
  searchRadiusPx: number
}): boolean {
  const { door, wallMask, labelsData, parentMap, width, height } = params
  const radius = Math.max(0, Math.round(params.searchRadiusPx))
  if (wallMask.length < width * height) return false
  if (labelsData.length < width * height) return false

  const faceSet = new Set(door.faceIds.filter((id) => id > 0))
  if (faceSet.size <= 0) return false

  const x0 = Math.max(0, Math.floor(door.bbox.x) - radius)
  const y0 = Math.max(0, Math.floor(door.bbox.y) - radius)
  const x1 = Math.min(width, Math.ceil(door.bbox.x + door.bbox.width) + radius)
  const y1 = Math.min(height, Math.ceil(door.bbox.y + door.bbox.height) + radius)
  if (x1 <= x0 || y1 <= y0) return false

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const label = labelsData[y * width + x] ?? 0
      if (label <= 0) continue
      const isDoorFace =
        faceSet.has(label) || faceSet.has(resolveMergedLabel(label, parentMap))
      if (!isDoorFace) continue
      if (
        maskInkWithinRadius({
          wallMask,
          width,
          height,
          x,
          y,
          radius,
        })
      ) {
        return true
      }
    }
  }
  return false
}

export function filterDoorsByKeptWallMaskContact(params: {
  doors: ResolvedDoorCandidate[]
  wallMask: Uint8Array
  labelsData: Int32Array
  parentMap: Map<number, number>
  width: number
  height: number
  referenceWallThicknessPx?: number | null
}): {
  kept: ResolvedDoorCandidate[]
  rejected: DoorKeptWallMaskRejection[]
  searchRadiusPx: number
} {
  const searchRadiusPx = resolveKeptWallMaskSearchRadiusPx(params.referenceWallThicknessPx)
  const kept: ResolvedDoorCandidate[] = []
  const rejected: DoorKeptWallMaskRejection[] = []

  for (const door of params.doors) {
    if (
      doorTouchesKeptWallMask({
        door,
        wallMask: params.wallMask,
        labelsData: params.labelsData,
        parentMap: params.parentMap,
        width: params.width,
        height: params.height,
        searchRadiusPx,
      })
    ) {
      kept.push(door)
      continue
    }
    rejected.push({ door, reason: 'no_kept_wall_mask_contact' })
  }

  return { kept, rejected, searchRadiusPx }
}
