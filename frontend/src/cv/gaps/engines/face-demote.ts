/**
 * Solid L1 — demote faces met hoge muurmask-dekking (gapsLayer zwart) naar outside.
 * Analoog aan Otsu ink-coverage, maar omgekeerd: hoge dekking = muur → weg/buiten.
 */

import {
  classifyFacesByInkCoverage,
  type RoomClassificationGroupBy,
  type RoomRasterClass,
} from '@/cv/walls/rooms/room-ink-classify'
import type { RasterRoomComponent } from '@/cv/walls/rooms/room-raster'
import type { SolidFaceDemotePolicy } from '../types'

export function demoteFacesByWallMaskCoverage(params: {
  labelsData: Int32Array
  wallMaskData: Uint8Array
  components: RasterRoomComponent[]
  parentMap: Map<number, number>
  priorClassification: Map<number, RoomRasterClass>
  policy: SolidFaceDemotePolicy
  groupBy?: RoomClassificationGroupBy
}): {
  classificationByLabel: Map<number, RoomRasterClass>
  demotedCount: number
  keptCount: number
  threshold: number
} {
  if (params.labelsData.length !== params.wallMaskData.length) {
    throw new Error('demoteFacesByWallMaskCoverage: labels/mask length mismatch')
  }

  const groupBy = params.groupBy ?? 'component'
  const coverage = classifyFacesByInkCoverage({
    labelsData: params.labelsData,
    referenceData: params.wallMaskData,
    components: params.components,
    parentMap: params.parentMap,
    threshold: params.policy.wallCoverageThreshold,
    groupBy,
  })

  const classificationByLabel = new Map<number, RoomRasterClass>()
  let demotedCount = 0
  let keptCount = 0

  for (const [root, stats] of coverage.rootStats.entries()) {
    const prior = params.priorClassification.get(root) ?? 'surface'
    const ratio = stats.inkCoverageRatio
    const demote = stats.touchesBorder || ratio >= params.policy.wallCoverageThreshold
    if (demote) {
      classificationByLabel.set(root, 'outside')
      demotedCount += 1
    } else {
      // Behoud vloer/gat-kleuren; oude 'wall' zonder mask-dekking → surface
      classificationByLabel.set(root, prior === 'wall' ? 'surface' : prior)
      keptCount += 1
    }
  }

  // Labels in prior zonder pixels in coverage (zeldzaam) behouden
  for (const [root, prior] of params.priorClassification.entries()) {
    if (!classificationByLabel.has(root)) {
      classificationByLabel.set(root, prior === 'wall' ? 'surface' : prior)
      keptCount += 1
    }
  }

  return {
    classificationByLabel,
    demotedCount,
    keptCount,
    threshold: params.policy.wallCoverageThreshold,
  }
}
