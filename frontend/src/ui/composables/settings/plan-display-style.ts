/**
 * Verf voor plattegrond-openings: Editor (kleur) vs Bouw (CAD-lijnen).
 * `'architect'` is gereserveerd (muur-outlines later).
 */

export const PLAN_DISPLAY_STYLES = ['editor', 'bouw', 'architect'] as const
export type PlanDisplayStyle = (typeof PLAN_DISPLAY_STYLES)[number]

/** Alleen kiesbaar in UI deze ronde. */
export const PLAN_DISPLAY_STYLE_CHOICES = ['editor', 'bouw'] as const
export type PlanDisplayStyleChoice = (typeof PLAN_DISPLAY_STYLE_CHOICES)[number]

export const DEFAULT_PLAN_DISPLAY_STYLE: PlanDisplayStyleChoice = 'editor'

/** Zwarte lijnen Bouw-stijl (zelfde als muurfill). */
export const BOUW_OPENING_STROKE = '#111827'
/** Wit gat in solid muur (Bouw). */
export const BOUW_GAP_FILL = '#ffffff'

export function normalizePlanDisplayStyle(raw: unknown): PlanDisplayStyleChoice {
  if (raw === 'bouw') return 'bouw'
  // architect nog niet kiesbaar → editor
  return 'editor'
}

export function isBouwPlanStyle(style: PlanDisplayStyle | undefined): boolean {
  return style === 'bouw'
}
