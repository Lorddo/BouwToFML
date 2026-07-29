/**
 * L0 face-class barrel — stabiel importpad voor callers.
 * Implementatie: mapping / effective / autoclass / render.
 */

export type {
  RoomRasterClass,
  RoomClassificationGroupBy,
  InkTopologyBucket,
} from './room-ink-classify-mapping'
export {
  toWallPipelineClass,
  isWallMaskClass,
  inkTopologyBucket,
  needsInkReresolve,
  mapClassesForWallPipeline,
  pickDoorOverrides,
  pickWindowOverrides,
  pickDoorframeOverrides,
  resolvePixelClassification,
  resolveClassAtLabel,
  remapClassificationForParentMap,
  cycleFaceClassification,
  applyFaceClassificationOverrides,
} from './room-ink-classify-mapping'

export {
  buildEffectiveComponentClassification,
  buildInkEaterLabelClassFromEffective,
  extendInkEaterClassAfterMerge,
  applyMergedWallChildInheritance,
  countClassificationStats,
} from './room-ink-classify-effective'

export type { RoomRootInkStats } from './room-ink-classify-autoclass'
export {
  ROOM_INK_CLASSIFY_TUNING,
  classifyFacesByInkCoverage,
  classifyFaceLabelsSubset,
  resolveExteriorClassForAffectedLabel,
  refineWallClassificationByKeptMask,
} from './room-ink-classify-autoclass'

export {
  renderClassifiedFaceMask,
  paintClassifiedFaceMaskRegion,
} from './room-ink-classify-render'
