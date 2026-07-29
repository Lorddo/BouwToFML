/**
 * Stage-3 evidence ratios — named constants, zelfde waarden als voorheen inline.
 * Geen detectie-tuning zonder expliciet besluit.
 */
export const WINDOW_EVIDENCE_TUNING = {
  /** Min as-overlap tussen stack-leden / seed (0.45). */
  minStackAxisOverlapRatio: 0.45,
  /** Framing-band: kandidaat-perp ± deze fractie; frame moet volledig erbinnen. */
  framingBandMarginRatio: 0.1,
  /** Strip langer langs muur-as dan loodrecht (voorkomt muur×horizontale strips). */
  minStripAxisToPerpRatio: 1.2,
  /** Geen strip in de stack langer dan dit × mediaan as-span van de seed. */
  maxStripAxisSpanRatio: 1.5,
  /** Relatieve marge op REF strip-hoogte (±20%, geen absolute px-vloer). */
  stackExpectMargin: 0.2,
  /**
   * Fractie van as-span: framing side-center zone én max offset stack-lid t.o.v. seed-midden.
   */
  axisSideCenterRatio: 0.35,
  /** Vloer voor side-center range in px (`Math.max(floor, span * ratio)`). */
  minSideCenterRangePx: 4,
  /** Framing side-distance = max(floor, localAxisBand × scale). */
  framingSideDistanceBandScale: 1.25,
  minSideDistancePx: 2,
  /** `fitsFramingSizeRange` minWidthRatio na band-validatie. */
  framingMinWidthRatio: 0.5,
  /** Wit↔wit stack-gap (px); groter = framing-territorium. */
  maxWhiteGapPx: 2,
  /** Default perp-touch gap (inkt tussen wit-stroken / seed↔ink). */
  defaultPerpTouchGapPx: 1,
} as const
