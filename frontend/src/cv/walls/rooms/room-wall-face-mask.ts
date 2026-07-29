import { resolveMergedLabel } from './room-raster-merge'
import {
  isWallMaskClass,
  resolvePixelClassification,
  type RoomClassificationGroupBy,
  type RoomRasterClass,
} from './room-ink-classify'

/**
 * Volledig plan-mask (originele afmeting), vooral voor debug/hulpfuncties.
 * 255 = muurvlak, 0 = rest.
 */
export function buildWallFaceMaskData(
  labelsData: Int32Array,
  parentMap: Map<number, number>,
  rootLabel: number,
  width: number,
  height: number,
): Uint8Array {
  const maskData = new Uint8Array(width * height)
  const count = Math.min(labelsData.length, width * height)
  for (let idx = 0; idx < count; idx += 1) {
    const label = labelsData[idx] ?? 0
    if (label <= 0) continue
    if (resolveMergedLabel(label, parentMap) !== rootLabel) continue
    maskData[idx] = 255
  }
  return maskData
}

/** Union van alle muurvlakken (255 = muur, 0 = vloer/achtergrond). */
export function buildMergedWallFaceMaskData(params: {
  labelsData: Int32Array
  parentMap: Map<number, number>
  classificationByLabel: Map<number, RoomRasterClass>
  width: number
  height: number
  groupBy?: RoomClassificationGroupBy
}): Uint8Array {
  const groupBy = params.groupBy ?? 'merged'
  const maskData = new Uint8Array(params.width * params.height)
  const count = Math.min(params.labelsData.length, params.width * params.height)
  for (let idx = 0; idx < count; idx += 1) {
    const label = params.labelsData[idx] ?? 0
    if (label <= 0) continue
    const cls = resolvePixelClassification(
      label,
      params.parentMap,
      params.classificationByLabel,
      groupBy,
    )
    if (!isWallMaskClass(cls)) continue
    maskData[idx] = 255
  }
  return maskData
}
