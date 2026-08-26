/**
 * Stamp-last face prior: na Otsu, overlap met solid stampMask → forceer wall.
 * Stempel weet exact welke faces muur zijn; Otsu mag eerst vrij classificeren.
 */
import {
  resolveClassificationKey,
  type RoomClassificationGroupBy,
  type RoomRasterClass,
} from './room-ink-classify-mapping'

/** Minimale overlap face ∩ stamp-inkt om als stamp-muur te pin'en. */
export const STAMP_WALL_FACE_OVERLAP_RATIO = 0.5

export function applyStampWallFacePrior(params: {
  labelsData: Int32Array
  parentMap: Map<number, number>
  classificationByLabel: Map<number, RoomRasterClass>
  stampMask: Uint8Array
  groupBy?: RoomClassificationGroupBy
  /** Optioneel: pin als override zodat latere ink/pocket-stappen niet demoten. */
  faceOverrides?: Map<number, RoomRasterClass>
  pinnedRoots?: Set<number>
  overlapRatio?: number
}): {
  classificationByLabel: Map<number, RoomRasterClass>
  stampedLabels: number[]
} {
  const { labelsData, parentMap, stampMask, faceOverrides, pinnedRoots } = params
  if (stampMask.length !== labelsData.length) {
    return {
      classificationByLabel: new Map(params.classificationByLabel),
      stampedLabels: [],
    }
  }

  const groupBy = params.groupBy ?? 'merged'
  const threshold = Math.min(1, Math.max(0, params.overlapRatio ?? STAMP_WALL_FACE_OVERLAP_RATIO))
  const facePx = new Map<number, number>()
  const stampPx = new Map<number, number>()

  for (let idx = 0; idx < labelsData.length; idx += 1) {
    const label = labelsData[idx] ?? 0
    if (label <= 0) continue
    const root = resolveClassificationKey(label, parentMap, groupBy)
    facePx.set(root, (facePx.get(root) ?? 0) + 1)
    if ((stampMask[idx] ?? 255) <= 127) {
      stampPx.set(root, (stampPx.get(root) ?? 0) + 1)
    }
  }

  const classificationByLabel = new Map(params.classificationByLabel)
  const stampedLabels: number[] = []

  for (const [root, total] of facePx.entries()) {
    if (total <= 0) continue
    const ink = stampPx.get(root) ?? 0
    if (ink / total < threshold) continue
    classificationByLabel.set(root, 'wall')
    stampedLabels.push(root)
    faceOverrides?.set(root, 'wall')
    pinnedRoots?.add(root)
  }

  return { classificationByLabel, stampedLabels }
}
