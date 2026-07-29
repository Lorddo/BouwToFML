import { createCanvas, type CanvasLike } from '@/cv/port/canvasEnv'
import { paintClassifiedFaceMaskRegion, renderClassifiedFaceMask } from './room-ink-classify'
import type { InkDiffBounds } from './room-ink-symmetric'
import type { RoomRasterCache } from './room-raster-cache-types'
import { effectiveClassification, mapFromEntries } from './room-raster-cache-dual'

function ensurePreviewMaskCanvas(cache: RoomRasterCache): CanvasLike {
  const { width, height } = cache.state
  const existing = cache.previewMaskCanvas
  if (existing && existing.width === width && existing.height === height) return existing
  const canvas = createCanvas(width, height)
  cache.previewMaskCanvas = canvas
  return canvas
}

/** Full of dirty-rect paint van de live face-overlay (geen PNG, geen underlay). */
export function updateRoomRasterPreviewMask(
  cache: RoomRasterCache,
  options?: { dirtyBounds?: InkDiffBounds | null },
): CanvasLike {
  const { width, height, labelsData, parentMap } = cache.state
  const classificationByLabel = effectiveClassification(cache)
  const parent = mapFromEntries(parentMap)
  const groupBy = cache.state.classificationGroupBy ?? 'component'
  const paintParams = {
    width,
    height,
    labelsData,
    parentMap: parent,
    classificationByLabel,
    groupBy,
  }

  const dirty = options?.dirtyBounds
  if (dirty && cache.previewMaskCanvas) {
    const canvas = ensurePreviewMaskCanvas(cache)
    paintClassifiedFaceMaskRegion(canvas, { ...paintParams, bounds: dirty })
    cache.previewMaskUrl = null
    return canvas
  }

  const painted = renderClassifiedFaceMask(paintParams)
  cache.previewMaskCanvas = painted
  cache.previewMaskUrl = null
  return painted
}
