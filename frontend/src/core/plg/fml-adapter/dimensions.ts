/**
 * B5 — design.slices + design.autoDimensions ↔ FML design.settings.plgSlices / engineAutoDims.
 *
 * Bake naar dimensions[] in buildFmlV3 leest `design.slices` (typed). Serialize schrijft
 * alleen op het export-settings-object — nooit terug op het live plan.
 */
import type { FloorDesign, FloorPlan, Point2D } from '../../plan/types'
import { FML_PLAN_SLICES_SETTINGS_KEY } from './plg-fml-extras'
import type { FmlConceptAdapter } from './registry'

function isFinitePoint(value: unknown): value is Point2D {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return Number.isFinite(record.x) && Number.isFinite(record.y)
}

function normalizeSlice(raw: unknown): { m: Point2D; p: Point2D } | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  if (!isFinitePoint(record.m) || !isFinitePoint(record.p)) return null
  const m = { x: Number(record.m.x), y: Number(record.m.y) }
  const p = { x: Number(record.p.x), y: Number(record.p.y) }
  if (Math.hypot(p.x - m.x, p.y - m.y) < 1e-6) return null
  return { m, p }
}

function hydrateDesign(design: FloorDesign): void {
  const settings = design.source?.settings
  if (!settings) {
    if (design.autoDimensions == null && design.slices == null) return
  }

  if (design.slices === undefined && Array.isArray(settings?.[FML_PLAN_SLICES_SETTINGS_KEY])) {
    const slices: Array<{ m: Point2D; p: Point2D }> = []
    for (const entry of settings![FML_PLAN_SLICES_SETTINGS_KEY] as unknown[]) {
      const slice = normalizeSlice(entry)
      if (slice) slices.push(slice)
    }
    if (slices.length > 0) design.slices = slices
  }

  if (design.autoDimensions == null && settings && 'engineAutoDims' in settings) {
    design.autoDimensions = settings.engineAutoDims === true
  }

  if (settings) {
    const next = { ...settings }
    delete next[FML_PLAN_SLICES_SETTINGS_KEY]
    delete next.engineAutoDims
    if (design.source) {
      design.source.settings = Object.keys(next).length > 0 ? next : undefined
    }
  }
}

function hydratePlan(plan: FloorPlan): void {
  for (const floor of plan.floors) {
    for (const design of floor.designs ?? []) hydrateDesign(design)
  }
}

function serializeDesignSettings(design: FloorDesign, settings: Record<string, unknown>): void {
  if (design.slices !== undefined) {
    if (design.slices.length > 0) {
      settings[FML_PLAN_SLICES_SETTINGS_KEY] = design.slices.map((s) => ({
        m: { x: s.m.x, y: s.m.y },
        p: { x: s.p.x, y: s.p.y },
      }))
    } else {
      delete settings[FML_PLAN_SLICES_SETTINGS_KEY]
    }
  }

  if (design.autoDimensions != null) {
    settings.engineAutoDims = design.autoDimensions === true
  }
}

export const dimensionsAdapter: FmlConceptAdapter = {
  id: 'dimensions',
  hydrate: hydratePlan,
  serializeDesignSettings,
}
