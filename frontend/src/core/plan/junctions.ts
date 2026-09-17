/**
 * Public barrel for junction / wall-edit helpers.
 * Implementation lives in sibling modules.
 */

export type {
  JunctionNode,
  SplitWallResult,
  WallEndRef,
  WallPointMatch,
} from './junction-core'

export {
  buildJunctions,
  findMergeTarget,
  DRAW_START_AXIS_SNAP_CM,
  JUNCTION_POINT_SNAP_CM,
  ROOM_DRAW_END_SNAP_CM,
  ROOM_DRAW_SNAP_CM,
  junctionIdsForWall,
  mergeJunctions,
  moveJunction,
  stableJunctionId,
} from './junction-core'

export {
  connectJunctionsKeepAxis,
  findMergeTargetFlushAware,
  flushConnectLanding,
  isFlushOnlyJunctionConnect,
  mergeJunctionsAware,
  snapPointToJunctionsFlushAware,
} from './junction-flush-connect'

export {
  applyShiftSnapAxisAligned,
  applyShiftSnapFromAllOppositeEnds,
  applyShiftSnapFromOppositeEnd,
  snapDrawWallEndpoint,
  snapSoftAxisFromStart,
  snapPointToJunctions,
  snapPointToWallCenters,
  snapRoomDrawEndPoint,
  snapPolygonVertexAxisLock,
  snapToNearbyEndpointAxes,
  snapToNearbyPointAxes,
  snapToPolygonGeometry,
  closedRingSegments,
  openPolylineSegments,
} from './junction-snap'

export {
  resolveWallSlidePointerDelta,
  snapWallSlideDeltaToJunctions,
  WALL_SLIDE_JUNCTION_SNAP_CM,
  slideWallSegmentAlongAxis,
  moveJunctionWithWallJoins,
  splitWallAtPoint,
} from './wall-slide'

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
} from './wall-edit'

export {
  addRidgeSegment,
  addRoomRect,
  addWallSegment,
  findWallAtPoint,
} from './wall-draw-geom'
