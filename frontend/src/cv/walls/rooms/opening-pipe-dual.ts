import {
  rebindFaceDualWhite,
  type FaceDualSpace,
} from './face-dual-space'
import { detachEnclosedChildrenForOpeningSeeds } from './opening-seed-detach'
import type { RoomRasterClass } from './room-ink-classify'
import type { RasterRoomComponent } from './room-raster'

export type PrepareOpeningPipeDualParams = {
  /** Default: `dual.white.parentMap`. */
  parentMap?: Map<number, number>
  /** Default: `dual.white.classificationByLabel`. */
  classificationByLabel?: Map<number, RoomRasterClass>
  /** Default: `dual.white.components`. */
  components?: readonly RasterRoomComponent[]
}

export type PrepareOpeningPipeDualResult = {
  /** Dual na seed-detach: white herbonden; ink ongewijzigd. */
  pipeDual: FaceDualSpace
  detachedParentMap: Map<number, number>
  classificationByLabel: Map<number, RoomRasterClass>
}

/**
 * Opening-pipeline bootstrap: enclosed seed-detach → `rebindFaceDualWhite`.
 * Deur merge (`buildDoorMergedForPipe`) blijft vóór deze stap; cluster-adjacency ná (deur).
 */
export function prepareOpeningPipeDual(
  dual: FaceDualSpace,
  params: PrepareOpeningPipeDualParams = {},
): PrepareOpeningPipeDualResult {
  const parentMap = params.parentMap ?? dual.white.parentMap
  const classificationByLabel =
    params.classificationByLabel ?? dual.white.classificationByLabel
  const components = params.components ?? dual.white.components

  const detached = detachEnclosedChildrenForOpeningSeeds({
    parentMap,
    classificationByLabel,
    components,
    imageWidth: dual.white.width,
    imageHeight: dual.white.height,
  })
  const pipeDual = rebindFaceDualWhite(dual, {
    parentMap: detached.parentMap,
    classificationByLabel: detached.classificationByLabel,
  })
  return {
    pipeDual,
    detachedParentMap: pipeDual.white.parentMap,
    classificationByLabel: pipeDual.white.classificationByLabel,
  }
}
