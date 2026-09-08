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
  JUNCTION_POINT_SNAP_CM,
  ROOM_DRAW_END_SNAP_CM,
  ROOM_DRAW_SNAP_CM,
  junctionIdsForWall,
  mergeJunctions,
  moveJunction,
  stableJunctionId,
} from './fml-preview-junction-core'

export {
  connectJunctionsKeepAxis,
  findMergeTargetFlushAware,
  flushConnectLanding,
  isFlushOnlyJunctionConnect,
  mergeJunctionsAware,
  snapPointToJunctionsFlushAware,
} from './fml-preview-junction-flush-connect'

export {
  applyShiftSnapAxisAligned,
  applyShiftSnapFromAllOppositeEnds,
  applyShiftSnapFromOppositeEnd,
  snapDrawWallEndpoint,
  snapPointToJunctions,
  snapPointToWallCenters,
  snapRoomDrawEndPoint,
  snapPolygonVertexAxisLock,
  snapToNearbyEndpointAxes,
  snapToNearbyPointAxes,
  snapToPolygonGeometry,
  closedRingSegments,
  openPolylineSegments,
} from './fml-preview-junction-snap'

export {
  resolveWallSlidePointerDelta,
  snapWallSlideDeltaToJunctions,
  WALL_SLIDE_JUNCTION_SNAP_CM,
  slideWallSegmentAlongAxis,
  moveJunctionWithWallJoins,
  splitWallAtPoint,
} from './fml-preview-wall-slide'

export {
  balanceToPercent,
  clampBalance,
  percentToBalance,
  sliderPercentFromDraft,
  removeWall,
  removeWalls,
  setJunctionHeight,
  setJunctionBottomZ,
  setWallBalance,
  setWallsBalance,
  setWallsBottomZ,
  setWallsHeight,
  setWallThickness,
  setWallsThickness,
  setWallsThicknessKeepBalance,
  collectPlanWallsByIds,
  setPlanWallsThicknessKeepBalance,
  splitWallAtMidpoint,
  splitWallAtT,
} from './fml-preview-wall-edit'

export {
  addRidgeSegment,
  addRoomRect,
  addWallSegment,
  findWallAtPoint,
} from './fml-preview-wall-draw-geom'
