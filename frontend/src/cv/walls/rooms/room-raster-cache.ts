export type { RoomRasterCache, RasterBBox } from './room-raster-cache-types'

export {
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
} from './room-raster-cache-mutate'

export { updateRoomRasterPreviewMask } from './room-raster-cache-preview'
