export {
  carveOtsuWhiteIntoGapsBlack,
  carveOtsuWhiteIntoGapsMat,
  type GapsInkMode,
} from './engines/otsu-detail-carve'
export { cutWallsFromGrayData } from './engines/wall-cut'
export { demoteFacesByWallMaskCoverage } from './engines/face-demote'
export { resolveSolidWallCutPolicy, resolveSolidFaceDemotePolicy } from './policies/solid'
export { resolveMaxOpeningRefFaceAreaPx } from './ref-face-size-cap'
export { runGapsPipeline } from './run-gaps-pipeline'
