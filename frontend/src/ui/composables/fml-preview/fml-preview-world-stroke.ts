/**
 * Preview stroke-gewichten in FML-cm (wereldmaat).
 * Stage-px = cm × layout.scale; daarna schaalt viewScale mee zoals muurfill.
 */

/** Deurblad / zwaaiboog / pijl. */
export const OPENING_STROKE_CM = 1.2

/** Raam-sill / basislijn iets zwaarder. */
export const OPENING_STROKE_HEAVY_CM = 2

/** Raam-mullion / ornament. */
export const OPENING_STROKE_MID_CM = 1.6

/** Deur-zwaai dash in cm. */
export const OPENING_ARC_DASH_CM: readonly [number, number] = [5, 4]

/** Extra gloed rond selectie, in schermpixels (niet meezoomen). */
export const SELECTION_HIGHLIGHT_PAD_PX = 5

/** Onzichtbare hit-stroke in schermpixels (niet meezoomen). */
export const OPENING_HIT_STROKE_PX = 14

/**
 * Referentie-maat (cm) voor symbol-LOD: typische deurbreedte.
 * Onder DETAIL_LOD_MIN_SCREEN_PX op scherm → geen opening/fixture nodes.
 */
export const DETAIL_LOD_REF_CM = 80
export const DETAIL_LOD_MIN_SCREEN_PX = 5

export function detailSymbolsVisibleOnScreen(layoutScale: number, viewScale: number): boolean {
  return DETAIL_LOD_REF_CM * Math.max(0, layoutScale) * viewScale >= DETAIL_LOD_MIN_SCREEN_PX
}

export function worldStrokeStage(cm: number, layoutScale: number): number {
  return Math.max(0.05, cm * Math.max(0, layoutScale))
}

export function worldDashStage(dashCm: readonly number[], layoutScale: number): number[] {
  const s = Math.max(1e-6, layoutScale)
  return dashCm.map((d) => Math.max(0.05, d * s))
}

/** Maatlijn-getal: minimale lijnlengte op scherm (px) om tekst te tonen. */
export const DIM_LABEL_MIN_LINE_SCREEN_PX = 56

export function dimensionLabelVisibleOnScreen(lengthStage: number, viewScale: number): boolean {
  return lengthStage * viewScale >= DIM_LABEL_MIN_LINE_SCREEN_PX
}
