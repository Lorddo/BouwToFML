export { collapseInterJunctionChains, type ChainCollapseStats } from './chain-collapse'
export { buildThicknessBySegment, thicknessCompatible, capOffsetTolerancePx } from './thickness'
export {
  countJunctionKindsFromSegments,
  withTopologyGuard,
  buildCollapseJunctionGraph,
  type CollapseJunctionKindCounts,
} from './validate'
export { collapseOrthoStairStubs, type StubCollapseStats } from './stub-collapse'
export { parallelCoverAbsorb, type ParallelCoverStats } from './parallel-cover'
export { absorbMicroCornerJogs, type MicroCornerStats } from './micro-corner'
export {
  straightenCollinearAxisChains,
  type ChainAxisStraightenStats,
} from './chain-axis-straighten'
