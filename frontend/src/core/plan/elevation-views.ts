/**
 * Per-gevelgroep aanzicht-onderlegger op `plan.elevations`.
 * Niet `floors[].drawing` (dat is de plattegrond-scan).
 * FML-settings keys blijven via de fml-adapter (hydrate/serialize; export stript ze).
 */
import {
  DEFAULT_ELEVATION_PROJECTION as PLG_DEFAULT_ELEVATION_PROJECTION,
  type ElevationProjection,
  type ElevationView as PlgElevationView,
} from '../plg/extension-types'
import type { DrawingMeta, FloorPlan, PlanExtras } from './types'

export const ELEVATION_VIEWS_SETTINGS_KEY = 'elevationViews'
export const ELEVATION_PROJECTION_SETTINGS_KEY = 'elevationProjection'

/** Vaste H/V-zijde (architect) of mee met de gevel (projectief). */
export type ElevationProjectionMode = ElevationProjection

export const DEFAULT_ELEVATION_PROJECTION: ElevationProjectionMode = PLG_DEFAULT_ELEVATION_PROJECTION

export type ElevationView = PlgElevationView

export function readElevationProjection(
  plan: FloorPlan | null | undefined,
): ElevationProjectionMode {
  const typed = plan?.elevations?.projection
  if (typed === 'projective') return 'projective'
  if (typed === 'architect') return 'architect'
  return DEFAULT_ELEVATION_PROJECTION
}

function clearElevationSettingsKeys(settings: PlanExtras): PlanExtras {
  const next = { ...settings }
  delete next[ELEVATION_VIEWS_SETTINGS_KEY]
  delete next[ELEVATION_PROJECTION_SETTINGS_KEY]
  return next
}

function withElevations(
  plan: FloorPlan,
  projection: ElevationProjectionMode,
  views: ElevationView[],
): FloorPlan {
  const settings = clearElevationSettingsKeys(cloneSettings(plan.source?.settings))
  return {
    ...plan,
    elevations: {
      projection: projection === 'projective' ? 'projective' : 'architect',
      views,
    },
    source: plan.source ? { ...plan.source, settings } : { settings },
  }
}

export function setElevationProjection(plan: FloorPlan, mode: ElevationProjectionMode): FloorPlan {
  return withElevations(
    plan,
    mode === 'projective' ? 'projective' : 'architect',
    listElevationViews(plan),
  )
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function cloneSettings(settings: PlanExtras | undefined): PlanExtras {
  return { ...(settings ?? {}) }
}

function normalizeDrawing(raw: unknown): DrawingMeta | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const record = raw as Record<string, unknown>
  const width = typeof record.width === 'number' && record.width > 0 ? record.width : 0
  const height = typeof record.height === 'number' && record.height > 0 ? record.height : 0
  if (!(width > 0) || !(height > 0)) return undefined
  const drawing: DrawingMeta = {
    x: typeof record.x === 'number' && Number.isFinite(record.x) ? record.x : width / 2,
    y: typeof record.y === 'number' && Number.isFinite(record.y) ? record.y : height / 2,
    width,
    height,
    rotation:
      typeof record.rotation === 'number' && Number.isFinite(record.rotation) ? record.rotation : 0,
  }
  if (isNonEmptyString(record.url)) drawing.url = record.url.trim()
  if (typeof record.alpha === 'number' && Number.isFinite(record.alpha))
    drawing.alpha = record.alpha
  if (typeof record.visible === 'boolean') drawing.visible = record.visible
  if (record.extras && typeof record.extras === 'object') {
    drawing.extras = { ...(record.extras as PlanExtras) }
  }
  return drawing
}

function normalizeView(raw: unknown): ElevationView | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  if (!isNonEmptyString(record.facadeGroupId)) return null
  const view: ElevationView = { facadeGroupId: record.facadeGroupId.trim() }
  const drawing = normalizeDrawing(record.drawing)
  if (drawing) view.drawing = drawing
  return view
}

export function listElevationViews(plan: FloorPlan | null | undefined): ElevationView[] {
  const raw = plan?.elevations?.views
  if (!Array.isArray(raw)) return []
  const out: ElevationView[] = []
  const seen = new Set<string>()
  for (const entry of raw) {
    const view = normalizeView(entry)
    if (!view || seen.has(view.facadeGroupId)) continue
    seen.add(view.facadeGroupId)
    out.push(view)
  }
  return out
}

export function elevationViewForGroup(
  plan: FloorPlan | null | undefined,
  facadeGroupId: string,
): ElevationView | null {
  const id = facadeGroupId.trim()
  if (!id) return null
  return listElevationViews(plan).find((view) => view.facadeGroupId === id) ?? null
}

export function writeElevationView(plan: FloorPlan, view: ElevationView): FloorPlan {
  const id = view.facadeGroupId.trim()
  if (!id) return plan
  const nextView: ElevationView = { facadeGroupId: id }
  if (view.drawing) nextView.drawing = { ...view.drawing }
  const views = listElevationViews(plan).filter((entry) => entry.facadeGroupId !== id)
  views.push(nextView)
  return withElevations(
    plan,
    readElevationProjection(plan),
    views.map((entry) => ({
      facadeGroupId: entry.facadeGroupId,
      ...(entry.drawing ? { drawing: { ...entry.drawing } } : {}),
    })),
  )
}

export function setElevationViewDrawing(
  plan: FloorPlan,
  facadeGroupId: string,
  drawing: DrawingMeta | undefined,
): FloorPlan {
  return writeElevationView(plan, { facadeGroupId, drawing })
}
