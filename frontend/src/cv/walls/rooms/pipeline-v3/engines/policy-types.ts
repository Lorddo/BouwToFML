/** Shared policy types for V3 engines — no bare cross-layer constants. */

import type { LayerId } from '../types'

/** L1 raw WASM — junction graph after skeleton trace (no move/prune). */
export interface Layer1RawPolicy {
  layerId: 1
  /** Junction graph snap after WASM polyline (CURRENT = 2). */
  junctionGraphSnapPx: number
}

/** L2 jitter merge — degree-2 knik collapse within thickness tolerance. */
export interface Layer2JitterPolicy {
  layerId: 2
  /** Degree-2 knikken met hoek >= deze waarde én grote offset blijven. */
  preserveMinAngleDeg: number
  /** Hoeken >= deze waarde zijn altijd structureel. */
  structuralAngleDeg: number
  /** Loodrechte tak-lengte die collinear merge blokkeert. */
  tArmMinBranchPx: number
  mergeToleranceRatio: number
  mergeToleranceMinPx: number
  mergeToleranceMaxPx: number
  thicknessSampleInsetPx: number
  thicknessFallbackPx: number
  /** Junction graph snap during merge loop (CURRENT = 0, exact endpoints). */
  junctionGraphSnapPx: number
}

export interface WeldPolicy {
  layerId: LayerId
  nearEndpointGapPx: number
  endpointEpsPx: number
  /** Dangling endpoint close gap (Copy6 L5 = 2.5). 0 = disabled. */
  repairMaxGapPx: number
}

export interface HvPolicy {
  layerId: LayerId
  /** Endpoint→junction map snap before HV move (Copy6/7 L4 = 2). */
  prePositionSnapPx: number
  /** Post-HV endpoint snap — unused when L4 is bare HV (no seal). */
  postPositionSnapPx: number
  flatBandPx: number
  thicknessFallbackPx: number
  thicknessSampleInsetPx: number
  repositionToleranceRatio: number
  repositionToleranceMinPx: number
  repositionToleranceMaxPx: number
  separateWallRatio: number
  junctionShiftMaxRatio: number
  maxAxisShiftFromOwnRatio: number
  thicknessMatchMinRatio: number
  collinearChainMaxSpreadPx: number
}

/**
 * Werkelijk schuine muren (gevel uit lood). Gelezen op L3 waar de keten nog
 * ongesnapt is, toegepast aan het eind van L10. Geen hypothese = niets doen.
 */
export interface ObliquePolicy {
  layerId: LayerId
  /** Binnen deze afwijking van 0/90 blijft een segment H/V — houdt scanscheefheid buiten. */
  deadzoneDeg: number
  /** Hoekspreiding waarbinnen segmenten tot dezelfde as horen. */
  angleToleranceDeg: number
  /** Korter dan dit draagt geen bewijs (micro-connectors uit L1-compressie). */
  minMemberLengthPx: number
  minMemberCount: number
  /** Gewogen bewijslengte die een as moet halen om te bestaan. */
  minEvidencePx: number
  /** Loodrechte spreiding waarbinnen leden op dezelfde lijn liggen. */
  maxMemberOffsetPx: number
  /** Verificatie tegen de hartlijn van de muur. */
  maxRidgeOffsetMedianPx: number
  maxRidgeOffsetP90Px: number
  minInInkRatio: number
  /** Band waarbinnen L10-segmenten bij de as worden getrokken. */
  captureBandPx: number
  /** Hoe ver een knooppunt mag opschuiven; spiegelt `junctionAnchorPx` van de guard. */
  maxAnchorShiftPx: number
  /** Bovengrens voor de loodrechte klim van de rug-sonde. */
  ridgeMaxSearchPx: number
  ridgeSampleStepPx: number
}

export interface JunctionGraphPolicy {
  layerId: LayerId
  snapPx: number
  /** When true, weld near endpoints before building the graph. */
  weldBeforeGraph: boolean
}

export interface ConnectorPolicy {
  layerId: LayerId
  connectorMaxPx: number
  armDetectMinPx: number
  maxIterations: number
  axisChainRatio: number
}

export interface CollapsePolicy {
  layerId: LayerId
  /** H/V classificatieband voor shared classifyLayer6Segment. */
  hvBandPx: number
  /** Max turn angle for passable fake-L (CURRENT = 25). */
  collinearMaxDeg: number
  /** Real L / structural turn (CURRENT = 26). */
  structuralLDeg: number
  /** Below this angle: max-band thickness noise bypass (CURRENT = 3). */
  collinearThicknessBypassDeg: number
  /** Min segments in a chain to collapse (CURRENT = 2). */
  minChainSegments: number
  /** I/T/X endpoint preserve + perp-arm detect (CURRENT = 15). */
  junctionAnchorPx: number
  /** Through-line cross-axis tolerance (CURRENT = 5). */
  crossAxisTolPx: number
  /** Ratio fallback when no reference thickness (CURRENT = 0.65). */
  thicknessMatchMinRatio: number
  thicknessFallbackPx: number
  thicknessSampleInsetPx: number
  /** Absolute meetbandgrenzen (multi muur-ref); anders ratios × ref. */
  bandBoundariesPx?: { midBoundaryPx: number; maxBoundaryPx: number }
  /** L9 only — L7/L10 must be false. */
  enableStubCollapse: boolean
  /** L9 only — axis-cluster coverage absorb. */
  enableParallelCover: boolean
  /** L10 only — absorb hard-L ↔ fake-L micro corner jogs. */
  enableMicroCornerAbsorb: boolean
  /** L10 only — force shared axis on collinear H/V chains (FML polish). */
  enableChainAxisStraighten: boolean
  /** Ortho stair stub max length (CURRENT = 8). */
  orthoStubMaxPx: number
  /** Max offset between parallel H/V tiers in a stair chain (CURRENT = 8). */
  orthoStubTierMaxPx: number
  /** Same-axis cluster + cover slack (px). */
  axisCoverEpsPx: number
  /** Max micro stub length for L10 corner absorb (default 8). */
  microCornerMaxPx: number
  /** Max axis spread to straighten a collinear chain (L10 polish, default 5). */
  chainAxisMaxSpreadPx: number
}

/** L7 align orchestrator — chain collapse + topology guard (no stubs). */
export interface Layer7AlignPolicy {
  layerId: 7
  collapse: CollapsePolicy
  weld: WeldPolicy
  junction: JunctionGraphPolicy
}

export type PruneTerminalKind = 'L' | 'T' | 'X'

export interface PrunePolicy {
  layerId: LayerId
  thicknessFallbackPx: number
  /** H/V classificatieband voor shared classifyLayer6Segment. */
  hvBandPx: number
  /** pathLengthPx < thicknessPx * maxPathLengthRatio → prune (CURRENT = 1). */
  maxPathLengthRatio: number
  /** Endpoint match / graph-prep weld gap (CURRENT = 1). */
  endpointEpsPx: number
  /** Junction-graph snap after prep weld (CURRENT = 0). */
  junctionSnapPx: number
  /**
   * L3: iterative shortest I→T/X.
   * L8: single sweep I→ first terminal in `terminalKinds`.
   */
  mode: 'iterative-tx' | 'once-ltx'
  /** Terminals that stop the I-trace (L3 = T/X; L8 = L/T/X). */
  terminalKinds: readonly PruneTerminalKind[]
  /** L8: protect structural H/V spur into T/X (never protect L). */
  protectStructuralTx: boolean
  /** Collinear remaining-arms angle for T protect (CURRENT L8 = 25). */
  collinearMaxDeg: number
}

export interface TopologyPolicy {
  layerId: LayerId
  enforceINodeCheck: boolean
  endpointEpsPx: number
  junctionSnapPx: number
  weldBeforeGraph: boolean
}

/** L5 cleanup loop — Copy6 golden (no seal / no I-rollback). */
export interface Layer5CleanupPolicy {
  layerId: 5
  maxIterations: number
  sameLineMaxOffsetPx: number
  thicknessFallbackPx: number
  /** T/X stub max length (resolved from thickness). */
  txZoneMaxPx: number
  /** L+L stair micro max length (resolved from thickness). */
  microMaxPx: number
  weld: WeldPolicy
  topology: TopologyPolicy
  junction: JunctionGraphPolicy
}

/** L6 chamfer-group / connector — CURRENT golden + kind-accept (no connectivity gate). */
export interface Layer6RepairPolicy {
  layerId: 6
  maxIterations: number
  /** Kind-accept radius for baseline T/X/L position checks. */
  thicknessMarginPx: number
  connector: ConnectorPolicy
  weld: WeldPolicy
  topology: TopologyPolicy
  junction: JunctionGraphPolicy
}
