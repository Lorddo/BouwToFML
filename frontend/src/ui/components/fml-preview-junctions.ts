/**
 * Public barrel for FML preview junction/wall edit helpers.
 * Implementation lives in sibling modules; import path stays stable.
 */

export type {
  JunctionNode,
  SplitWallResult,
  WallEndRef,
  WallPointMatch,
} from './fml-preview-junction-core'

export {
  buildJunctions,
  findMergeTarget,
  junctionIdsForWall,
  mergeJunctions,
  moveJunction,
  stableJunctionId,
} from './fml-preview-junction-core'

export {
  applyShiftSnapAxisAligned,
  applyShiftSnapFromAllOppositeEnds,
  applyShiftSnapFromOppositeEnd,
  snapDrawWallEndpoint,
  snapPointToJunctions,
  snapToNearbyEndpointAxes,
} from './fml-preview-junction-snap'

export {
  resolveWallSlidePointerDelta,
  slideWallSegmentAlongAxis,
  splitWallAtPoint,
} from './fml-preview-wall-slide'

export {
  clampBalance,
  removeWall,
  removeWalls,
  setWallBalance,
  setWallsBalance,
  setWallThickness,
  setWallsThickness,
  splitWallAtMidpoint,
  splitWallAtT,
} from './fml-preview-wall-edit'

export {
  addRoomRect,
  addWallSegment,
  findWallAtPoint,
} from './fml-preview-wall-draw-geom'
