/**
 * Per-gevelgroep aanzicht-onderlegger in `plan.source.settings.elevationViews`.
 * Niet `floors[].drawing` (dat is de plattegrond-scan).
 */
import type { DrawingMeta, FloorPlan, FmlExtras } from './types'

export const ELEVATION_VIEWS_SETTINGS_KEY = 'elevationViews'
export const ELEVATION_PROJECTION_SETTINGS_KEY = 'elevationProjection'

/** Vaste H/V-zijde (architect) of mee met de gevel (projectief). */
export type ElevationProjectionMode = 'architect' | 'projective'

export const DEFAULT_ELEVATION_PROJECTION: ElevationProjectionMode = 'architect'

export type ElevationView = {
  facadeGroupId: string
  drawing?: DrawingMeta
}

export function readElevationProjection(
  plan: FloorPlan | null | undefined,
): ElevationProjectionMode {
  const raw = plan?.source?.settings?.[ELEVATION_PROJECTION_SETTINGS_KEY]
  return raw === 'projective' ? 'projective' : DEFAULT_ELEVATION_PROJECTION
}

export function setElevationProjection(plan: FloorPlan, mode: ElevationProjectionMode): FloorPlan {
  const settings = cloneSettings(plan.source?.settings)
  settings[ELEVATION_PROJECTION_SETTINGS_KEY] = mode === 'projective' ? 'projective' : 'architect'
  return {
    ...plan,
    source: plan.source ? { ...plan.source, settings } : { settings },
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function cloneSettings(settings: FmlExtras | undefined): FmlExtras {
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
  const raw = plan?.source?.settings?.[ELEVATION_VIEWS_SETTINGS_KEY]
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
  const settings = cloneSettings(plan.source?.settings)
  settings[ELEVATION_VIEWS_SETTINGS_KEY] = views.map((entry) => ({
    facadeGroupId: entry.facadeGroupId,
    ...(entry.drawing ? { drawing: { ...entry.drawing } } : {}),
  }))
  return {
    ...plan,
    source: plan.source ? { ...plan.source, settings } : { settings },
  }
}

export function setElevationViewDrawing(
  plan: FloorPlan,
  facadeGroupId: string,
  drawing: DrawingMeta | undefined,
): FloorPlan {
  return writeElevationView(plan, { facadeGroupId, drawing })
}
