/**
 * L6 chamfer-chain barrel — walk / multi-stub / landing / simple-L.
 */
export {
  walkDiagonalChamferChain,
  resolveChamferBranchTipFromT,
  hasBlockingCompanionDiagonalAtEndpoint,
  buildSyntheticBranchSegmentAtT,
} from './chamfer-chain-walk'
export {
  collectChamferChainSegmentIndices,
  isSegmentInMultiStubChamferChain,
} from './chamfer-chain-multi-stub'
export { isLandingChamferAtJunction, resolveLandingChamferGeometry } from './chamfer-chain-landing'
export { resolveSimpleLChamferGeometry } from './chamfer-chain-simple-l'
