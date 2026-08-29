export { SELECTION_COLORS, type SelectionRect } from './types'
export { useExampleSelection } from './useExampleSelection'
export {
  MAX_WALL_REFS,
  bindNextWallRefCm,
  findWallRectForCm,
  catalogCmsFromLimits,
  enforceWallRefLimit,
  isWallThicknessBand,
  measureToMaxEquivalentPx,
  resolveReferenceWallThicknessDetail,
  resolveReferenceWallThicknessPx,
  resolveStyleWallRect,
  resolveWallThicknessCm,
  scaleMeasuredPxToMax,
  type ReferenceWallThicknessResolution,
  type WallRefThicknessMeasure,
  type WallThicknessBand,
} from './wall-thickness-ref'
