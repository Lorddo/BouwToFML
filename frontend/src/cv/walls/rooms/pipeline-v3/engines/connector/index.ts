/**
 * Connector / chamfer engine barrel — CURRENT L6 multi-chamfer (L/T/X) + kind-accept.
 * Anti-soup: no stitchDangling, collapseDense, HV/orthogonal crossing, layer-6-weld.
 * Full-face entry is `runLayer6JunctionRepair` (layer-6-repair.ts); this file only re-exports.
 */
export {
  tryRepairChamferGroup,
  resolveChamferGroupGeometry,
  isAlternatingStairDiagonalChain,
} from './chamfer-group'
export { validateJunctionKindsPreserved, acceptLayer6FaceKinds } from './kind-accept'
export { countLayer6JunctionKinds, buildConnectorJunctionGraph } from './junction-guard'
export type { Layer6JunctionKindCounts, BaselineTxJunctionRef } from './junction-guard'
export type { ChamferGroupGeometry, ChamferGroupKind } from './chamfer-group'
export { resolveLayer6AxisChainPx } from './constants'
