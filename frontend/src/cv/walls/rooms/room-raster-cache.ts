export type {
  FaceOverridePinTarget,
  SyncPinnedClassOverridesParams,
  SyncPinnedClassResult,
  SyncPinnedTargetClass,
  RoomRasterCache,
  FaceClassChangeResult,
  RasterBBox,
} from './room-raster-cache-types'

export {
  syncPinnedClassOverrides,
  syncDoorSwingFaceOverrides,
  syncDoorBridgeWallOverrides,
  syncWindowFaceOverrides,
  syncDoorframeFaceOverrides,
  createRoomRasterCache,
  classificationStats,
  serializeFaceOverrides,
  serializePinnedRoots,
  applySerializedFaceOverrides,
} from './room-raster-cache-create'

export {
  rebuildFaceBBoxIndex,
  invalidateFaceDualSpace,
  claimFacesInRoomRasterCache,
  ensureFaceDualSpace,
  resolveFloorDual,
  effectiveClassification,
  resolveFaceLabelAtPixel,
  classificationAtLabel,
} from './room-raster-cache-dual'

export {
  reresolveInkInCache,
  toggleFaceAtLabel,
  toggleFaceAtLabelDetailed,
  findFaceLabelsFullyInBBox,
  setFaceClassificationForLabels,
  setFacesFullyInBBox,
  setFacesFullyInBBoxDetailed,
} from './room-raster-cache-mutate'

export { updateRoomRasterPreviewMask } from './room-raster-cache-preview'
