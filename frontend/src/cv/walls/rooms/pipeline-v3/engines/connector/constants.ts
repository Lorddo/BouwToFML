export const LAYER6_HV_ANGLE_TOL_DEG = 12
/** Alleen noodpad zonder scale-object (Keep L6g). */
export const LAYER6_HV_BAND_FALLBACK_PX = 8
/** Fallback endpoint-snap bij ref=30 (0.1×ref); prefer `scale.endpointSnapPx`. */
export const LAYER6_ENDPOINT_SNAP_PX = 3
/** Fallback nearby-weld bij ref=30 (0.2×ref); prefer `scale.nearbyWeldPx`. */
export const LAYER6_NEARBY_WELD_PX = LAYER6_ENDPOINT_SNAP_PX * 2
/** Doorstroomlengte-epsilon om degenerate segmenten uit guards te houden. */
export const LAYER6_MIN_SEGMENT_LEN_PX = 1

const LAYER6_CONNECTOR_MAX_RATIO = 1.2
const LAYER6_CONNECTOR_MAX_CAP_RATIO = 3
const LAYER6_MAX_ATTACHMENT_SHIFT_RATIO = 0.4
const LAYER6_CHAMFER_L_GUARD_RATIO = 0.4
const LAYER6_ENDPOINT_SNAP_RATIO = 0.1
const LAYER6_NEARBY_WELD_RATIO = 0.2
const LAYER6_DIAGONAL_AXIS_FLOOR_RATIO = 0.1
const LAYER6_ARM_DETECT_FLOOR_RATIO = 0.5
const LAYER6_ARM_DETECT_CAP_RATIO = 3
const LAYER6_ARM_DETECT_RATIO = 1

const LAYER6_REF_FALLBACK_PX = 30
const LAYER6_CONNECTOR_MIN_PX = 2

/** Connector/chamfer passes tot geen wijziging meer. */
export const LAYER6_CONNECTOR_MAX_ITERATIONS = 16
/**
 * Max lengte voor diagonaal- én H/V-assen-ketenwalk (chamfer-groep → consensus-as).
 * 3.5× referentie-muurdikte (bv. ref=30 → 105px).
 */
export const LAYER6_AXIS_CHAIN_RATIO = 3.5
export const LAYER6_CHAIN_WALK_MAX_STEPS = 16
export const LAYER6_GROUP_EXPAND_MAX_STEPS = 8

// Dimensieloze ratio's: niet ref-geschaald.
export const LAYER6_ANTIPARALLEL_DOT_MAX = -0.25
export const LAYER6_SHALLOW_JOG_DEG = 28
export const LAYER6_STEEP_JOG_DEG = 75
export const LAYER6_HV_DOMINANCE_RATIO = 1.15
export const LAYER6_THROUGH_OFFSET_RATIO = 0.45
export const LAYER6_DIAGONAL_MAX_RATIO = 1.25
export const LAYER6_BRIDGE_MAX_SHIFT_RATIO = 1.35
export const LAYER6_COLLAPSE_SHIFT_RATIO = 1.5
export const LAYER6_NEAR_GROUP_AXIS_CHAIN_RATIO = 0.35
export const LAYER6_LONG_H_MIN_CONNECTOR_RATIO = 0.5
export const LAYER6_LANDING_DIAGONAL_GUARD_RATIO = 0.55
export const LAYER6_FALLBACK_AXIS_MAX_SHIFT_RATIO = 2

const LAYER6_HV_BAND_RATIO = 8 / 30
const LAYER6_ARM_STRICT_RATIO = 12 / 30
const LAYER6_ARM_LOOSE_RATIO = 8 / 30
const LAYER6_MIN_V_ARM_RATIO = 18 / 30
const LAYER6_SHORT_H_STUB_RATIO = 4 / 30
const LAYER6_JOG_EPSILON_RATIO = 2 / 30
const LAYER6_SHORT_DIAGONAL_RATIO = 36 / 30
const LAYER6_CONSENSUS_REACH_RATIO = 40 / 30
const LAYER6_STUB_CHAIN_TIP_RATIO = 200 / 30

export interface Layer6Scale {
  refPx: number
  connectorMaxPx: number
  axisChainPx: number
  maxAttachmentShiftPx: number
  thicknessMarginPx: number
  armDetectPx: number
  hvBandPx: number
  armStrictPx: number
  armLoosePx: number
  minVArmPx: number
  shortHStubPx: number
  jogEpsilonPx: number
  shortDiagonalPx: number
  consensusReachPx: number
  nearGroupPx: number
  stubCapPx: number
  stubTipChainPx: number
  endpointSnapPx: number
  nearbyWeldPx: number
  chamferLGuardPx: number
  diagonalAxisFloorPx: number
}

export function resolveLayer6ReferencePx(referenceWallThicknessPx?: number): number {
  if (referenceWallThicknessPx && referenceWallThicknessPx > 0) return referenceWallThicknessPx
  return LAYER6_REF_FALLBACK_PX
}

function connectorMaxCapPx(ref: number): number {
  return Math.max(LAYER6_CONNECTOR_MIN_PX, Math.round(ref * LAYER6_CONNECTOR_MAX_CAP_RATIO))
}

/** Ketenlengte om assen/chamfer-groep te bepalen: 3.5 × ref. */
export function resolveLayer6AxisChainPx(referenceWallThicknessPx?: number): number {
  const ref = resolveLayer6ReferencePx(referenceWallThicknessPx)
  return Math.max(1, Math.round(ref * LAYER6_AXIS_CHAIN_RATIO))
}

function resolveLayer6ConnectorMaxPx(referenceWallThicknessPx?: number): number {
  const ref = resolveLayer6ReferencePx(referenceWallThicknessPx)
  const scaled = Math.round(ref * LAYER6_CONNECTOR_MAX_RATIO)
  return Math.max(LAYER6_CONNECTOR_MIN_PX, Math.min(connectorMaxCapPx(ref), scaled))
}

function resolveLayer6MaxAttachmentShiftPx(referenceWallThicknessPx?: number): number {
  const ref = resolveLayer6ReferencePx(referenceWallThicknessPx)
  return Math.max(1, Math.round(ref * LAYER6_MAX_ATTACHMENT_SHIFT_RATIO))
}

/**
 * Marge ≈ referentie-muurdikte: binnen dit budget mag L6 H/V een tikje scheef
 * trekken naar H×V-hit. Latere lagen (L7+) ruimen lichte scheefheid op.
 * Geen micro-jog stubs / parallelle H-rails produceren.
 */
export function resolveLayer6ThicknessMarginPx(referenceWallThicknessPx?: number): number {
  return resolveLayer6ReferencePx(referenceWallThicknessPx)
}

function resolveLayer6ArmDetectPx(referenceWallThicknessPx?: number): number {
  const ref = resolveLayer6ReferencePx(referenceWallThicknessPx)
  const floor = Math.max(1, Math.round(ref * LAYER6_ARM_DETECT_FLOOR_RATIO))
  const cap = Math.max(floor, Math.round(ref * LAYER6_ARM_DETECT_CAP_RATIO))
  return Math.max(floor, Math.min(cap, Math.round(ref * LAYER6_ARM_DETECT_RATIO)))
}

/**
 * Eén ref-geschaalde bron voor alle lengtebudgetten in L6.
 * Ratio's zijn gecalibreerd op ref=30 zodat bestaand fixture-gedrag gelijk blijft.
 */
export function resolveLayer6Scale(referenceWallThicknessPx?: number): Layer6Scale {
  const refPx = resolveLayer6ReferencePx(referenceWallThicknessPx)
  const connectorMaxPx = resolveLayer6ConnectorMaxPx(refPx)
  const endpointSnapPx = Math.max(0.5, refPx * LAYER6_ENDPOINT_SNAP_RATIO)
  return {
    refPx,
    connectorMaxPx,
    axisChainPx: resolveLayer6AxisChainPx(refPx),
    maxAttachmentShiftPx: resolveLayer6MaxAttachmentShiftPx(refPx),
    thicknessMarginPx: resolveLayer6ThicknessMarginPx(refPx),
    armDetectPx: resolveLayer6ArmDetectPx(refPx),
    hvBandPx: Math.max(1, Math.round(refPx * LAYER6_HV_BAND_RATIO)),
    armStrictPx: Math.max(1, Math.round(refPx * LAYER6_ARM_STRICT_RATIO)),
    armLoosePx: Math.max(1, Math.round(refPx * LAYER6_ARM_LOOSE_RATIO)),
    minVArmPx: Math.max(1, Math.round(refPx * LAYER6_MIN_V_ARM_RATIO)),
    shortHStubPx: Math.max(1, Math.round(refPx * LAYER6_SHORT_H_STUB_RATIO)),
    jogEpsilonPx: Math.max(1, Math.round(refPx * LAYER6_JOG_EPSILON_RATIO)),
    shortDiagonalPx: Math.max(1, Math.round(refPx * LAYER6_SHORT_DIAGONAL_RATIO)),
    consensusReachPx: Math.max(1, Math.round(refPx * LAYER6_CONSENSUS_REACH_RATIO)),
    nearGroupPx: connectorMaxPx,
    stubCapPx: Math.max(1, Math.round(refPx * LAYER6_ARM_STRICT_RATIO)),
    stubTipChainPx: Math.max(1, Math.round(refPx * LAYER6_STUB_CHAIN_TIP_RATIO)),
    endpointSnapPx,
    nearbyWeldPx: Math.max(endpointSnapPx, refPx * LAYER6_NEARBY_WELD_RATIO),
    chamferLGuardPx: Math.max(1, Math.round(refPx * LAYER6_CHAMFER_L_GUARD_RATIO)),
    diagonalAxisFloorPx: Math.max(0.5, refPx * LAYER6_DIAGONAL_AXIS_FLOOR_RATIO),
  }
}
