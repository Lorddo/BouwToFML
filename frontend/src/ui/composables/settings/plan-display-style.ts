/**
 * Verf voor plattegrond én gevels: Editor (kleur) / Bouw (CAD-lijnen + muurfill) /
 * Architect (CAD-lijnen; plattegrond zonder muurfill; gevels wit papier-fill + zwarte lijnen).
 * Los van `elevationProjection` (H/V-snap vs projectief).
 *
 * Canonieke union: `PlgPlanDisplayStyle` in `core/plg`.
 */
import type { PlgPlanDisplayStyle } from '@/core/plg/plg-document'

export const PLAN_DISPLAY_STYLES = ['editor', 'bouw', 'architect'] as const
export type PlanDisplayStyle = PlgPlanDisplayStyle

/** Kiesbaar in Settings. */
export const PLAN_DISPLAY_STYLE_CHOICES = ['editor', 'bouw', 'architect'] as const
export type PlanDisplayStyleChoice = PlgPlanDisplayStyle

export const DEFAULT_PLAN_DISPLAY_STYLE: PlanDisplayStyleChoice = 'editor'

/** Zwarte lijnen Bouw-stijl (zelfde als muurfill). */
export const BOUW_OPENING_STROKE = '#111827'
/** Architect: puur zwart (B/W CAD). */
export const ARCHITECT_STROKE = '#000000'
/** Wit gat in solid muur (Bouw). */
export const BOUW_GAP_FILL = '#ffffff'
/** Architect: kamer-vlakken wit (alleen preview). */
export const ARCHITECT_AREA_FILL = '#ffffff'

export function normalizePlanDisplayStyle(raw: unknown): PlanDisplayStyleChoice {
  if (raw === 'bouw') return 'bouw'
  if (raw === 'architect') return 'architect'
  return 'editor'
}

/** Bouw: zwarte CAD-openings + gevulde muren. */
export function isBouwPlanStyle(style: PlanDisplayStyle | undefined): boolean {
  return style === 'bouw'
}

/** Architect: muur-outlines, geen fill. */
export function isArchitectPlanStyle(style: PlanDisplayStyle | undefined): boolean {
  return style === 'architect'
}

/** Zwarte CAD-lijnen (Bouw of Architect); openingkleuren gelden niet. */
export function isLinePlanStyle(style: PlanDisplayStyle | undefined): boolean {
  return style === 'bouw' || style === 'architect'
}

/** Stroke-kleur voor line-styles. */
export function planLineStroke(style: PlanDisplayStyle | undefined): string {
  return style === 'architect' ? ARCHITECT_STROKE : BOUW_OPENING_STROKE
}
