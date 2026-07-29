export type {
  GapPolicyId,
  GapLayerId,
  SolidWallCutPolicy,
  SolidFaceDemotePolicy,
  GapsLayer1Result,
  RunGapsPipelineParams,
} from './types'
export { resolveSolidWallCutPolicy, resolveSolidFaceDemotePolicy } from './policies/solid'
export { cutWallsFromGrayData } from './engines/wall-cut'
export {
  carveOtsuWhiteIntoGapsBlack,
  carveOtsuWhiteIntoGapsMat,
  type GapsInkMode,
} from './engines/otsu-detail-carve'
export { demoteFacesByWallMaskCoverage } from './engines/face-demote'
export { resolveMaxOpeningRefFaceAreaPx } from './ref-face-size-cap'
export { runGapsPipeline } from './run-gaps-pipeline'
