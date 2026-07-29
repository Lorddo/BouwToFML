/**
 * Gaten L1 — demote vlakken groter dan N× grootste opening-ref face.
 * Ref-face px zijn op source-crop (= zelfde schaal als plattegrond).
 */

import { cropRectToLocalBw, buildWallLayerBwMat, grayMatFromBwBytes } from '@/cv/refs/ref-crop-bw'
import { detectKopeindeZones } from '@/cv/refs/ref-blob'
import { findInkBounds } from '@/cv/refs/ref-deskew'
import { buildFaceProfile } from '@/cv/refs/ref-face-profile'
import type { RefFace, RefRect } from '@/cv/refs/types'
import type { OpenCV } from '@/cv/loadOpenCV'
import type { PreprocessConfig } from '@/core/extraction/types'
import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import type { RasterRoomComponent } from '@/cv/walls/rooms/room-raster'

export const OPENING_REF_FACE_SIZE_MULTIPLIER = 3

/** Buitenvlakken (crop-rand) tellen niet; head/interior/unknown wel. */
export function isOpeningRefFaceForCap(
  face: RefFace,
  heads: ReturnType<typeof detectKopeindeZones>,
  orientation: 'horizontal' | 'vertical',
): boolean {
  if (face.role !== 'outside') return true
  if (!heads) return false
  const pos = orientation === 'horizontal' ? face.centroid.x : face.centroid.y
  return (
    (pos >= heads.startHead.start && pos <= heads.startHead.end) ||
    (pos >= heads.endHead.start && pos <= heads.endHead.end)
  )
}

function resolveOpeningOrientation(
  bwData: Uint8Array,
  width: number,
  height: number,
): 'horizontal' | 'vertical' {
  const bounds = findInkBounds(bwData, width, height, 0)
  if (!bounds) return width >= height ? 'horizontal' : 'vertical'
  return bounds.width >= bounds.height ? 'horizontal' : 'vertical'
}

export async function resolveMaxOpeningRefFaceAreaPx(params: {
  cv: OpenCV
  image: HTMLImageElement | HTMLCanvasElement
  rects: RefRect[]
  preprocess: PreprocessConfig
  eraserMask?: Uint8Array
  baseBw?: { data: Uint8Array; width: number; height: number } | null
}): Promise<number | null> {
  if (params.rects.length === 0) return null

  const sharedWallBwMat = params.baseBw
    ? grayMatFromBwBytes(params.cv, params.baseBw.data, params.baseBw.width, params.baseBw.height)
    : buildWallLayerBwMat({
        cv: params.cv,
        image: params.image,
        preprocess: params.preprocess,
        eraserMask: params.eraserMask,
      })
  try {
    let maxArea = 0
    for (const rect of params.rects) {
      const crop = cropRectToLocalBw({
        cv: params.cv,
        image: params.image,
        rect,
        preprocess: params.preprocess,
        eraserMask: params.eraserMask,
        sharedWallBwMat,
        axisAlign: false,
      })
      try {
        const profile = buildFaceProfile(crop.bwData, crop.width, crop.height, undefined, {
          minAreaPx: 1,
        })
        const inkBounds = findInkBounds(crop.bwData, crop.width, crop.height, 0) ?? {
          x: 0,
          y: 0,
          width: crop.width,
          height: crop.height,
        }
        const orientation = resolveOpeningOrientation(crop.bwData, crop.width, crop.height)
        const heads = detectKopeindeZones(
          crop.bwData,
          crop.width,
          crop.height,
          inkBounds,
          orientation,
        )
        for (const face of profile.faces) {
          if (!isOpeningRefFaceForCap(face, heads, orientation)) continue
          if (face.areaPx > maxArea) maxArea = face.areaPx
        }
      } finally {
        crop.bwMat.delete()
      }
    }

    return maxArea > 0 ? maxArea : null
  } finally {
    sharedWallBwMat.delete()
  }
}

function aggregateRootAreas(
  components: RasterRoomComponent[],
  parentMap: Map<number, number>,
): Map<number, number> {
  const rootAreas = new Map<number, number>()
  for (const component of components) {
    const root = parentMap.get(component.label) ?? component.label
    rootAreas.set(root, (rootAreas.get(root) ?? 0) + component.areaPx)
  }
  return rootAreas
}

export function demoteOversizedFacesByRefCap(params: {
  classificationByLabel: Map<number, RoomRasterClass>
  components: RasterRoomComponent[]
  parentMap: Map<number, number>
  maxRefFaceAreaPx: number
  multiplier?: number
}): { oversizedDemotedCount: number; areaCapPx: number } {
  const multiplier = params.multiplier ?? OPENING_REF_FACE_SIZE_MULTIPLIER
  const areaCapPx = params.maxRefFaceAreaPx * multiplier
  const rootAreas = aggregateRootAreas(params.components, params.parentMap)
  let oversizedDemotedCount = 0

  for (const [root, areaPx] of rootAreas.entries()) {
    if (areaPx <= areaCapPx) continue
    const current = params.classificationByLabel.get(root)
    if (current === 'outside') continue
    params.classificationByLabel.set(root, 'outside')
    oversizedDemotedCount += 1
  }

  return { oversizedDemotedCount, areaCapPx }
}
