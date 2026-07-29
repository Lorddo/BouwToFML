import type { OpenCV } from '@/cv/loadOpenCV'
import {
  isWallMaskClass,
  resolvePixelClassification,
  type RoomClassificationGroupBy,
  type RoomRasterClass,
} from './room-ink-classify'

/**
 * Muurmasker = inkt/gap toegewezen aan wall- of window-vlakken (na ink-resolve).
 * Deur-faces blijven buiten (bogen → L11/L12); outside/surface/unknown ook.
 * Buiten-rand, outside-classificatie en border-faces worden nooit meegenomen.
 */
export function buildInkWallMaskData(params: {
  wallMatData: Uint8Array
  labelsData: Int32Array
  parentMap: Map<number, number>
  classificationByLabel: Map<number, RoomRasterClass>
  width: number
  height: number
  referenceWallThicknessPx?: number
  groupBy?: RoomClassificationGroupBy
  /** Face-labels op canvas-rand — altijd uitgesloten (ook bij manual wall-override). */
  borderLabels?: ReadonlySet<number>
}): Uint8Array {
  const groupBy = params.groupBy ?? 'component'
  const borderLabels = params.borderLabels ?? new Set<number>()
  const out = new Uint8Array(params.width * params.height)

  for (let idx = 0; idx < params.width * params.height; idx += 1) {
    const assignedLabel = params.labelsData[idx] ?? 0
    if (assignedLabel <= 0) continue
    if (borderLabels.has(assignedLabel)) continue

    const assignedClass = resolvePixelClassification(
      assignedLabel,
      params.parentMap,
      params.classificationByLabel,
      groupBy,
    )
    // door/unknown/surface/outside: geen muur; wall + window wel
    if (!isWallMaskClass(assignedClass)) continue

    const isBlackInk = (params.wallMatData[idx] ?? 255) < 128
    if (isBlackInk) {
      out[idx] = 255
      continue
    }

    // Witte gap tussen dubbele muurlijnen — alleen binnen wall/window-vlakken
    out[idx] = 255
  }

  return out
}

export function buildInkWallMaskMat(params: {
  cv: OpenCV
  wallMat: OpenCV['Mat']
  labelsData: Int32Array
  parentMap: Map<number, number>
  classificationByLabel: Map<number, RoomRasterClass>
  width: number
  height: number
  referenceWallThicknessPx?: number
  groupBy?: RoomClassificationGroupBy
  borderLabels?: ReadonlySet<number>
}): OpenCV['Mat'] {
  const mask = buildInkWallMaskData({
    wallMatData: params.wallMat.data as Uint8Array,
    labelsData: params.labelsData,
    parentMap: params.parentMap,
    classificationByLabel: params.classificationByLabel,
    width: params.width,
    height: params.height,
    referenceWallThicknessPx: params.referenceWallThicknessPx,
    groupBy: params.groupBy,
    borderLabels: params.borderLabels,
  })
  return params.cv.matFromArray(params.height, params.width, params.cv.CV_8UC1, mask)
}
