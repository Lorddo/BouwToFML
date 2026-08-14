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
  ENDPOINT_SNAP_RADIUS_CM,
  findMergeTarget,
  JUNCTION_POINT_SNAP_CM,
  ROOM_DRAW_SNAP_CM,
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
  snapPointToWallCenters,
  snapToNearbyEndpointAxes,
} from './fml-preview-junction-snap'

export {
  resolveWallSlidePointerDelta,
  slideWallSegmentAlongAxis,
  moveJunctionWithWallJoins,
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

export { addRoomRect, addWallSegment, findWallAtPoint } from './fml-preview-wall-draw-geom'
