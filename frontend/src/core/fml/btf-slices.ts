/**
 * Persistente maatlijn-slicers: alleen `{ m, p }` per liniaal in design-settings.
 * H/V/hoek en meetas volgen uit P−M; maten worden live herberekend.
 */
import { flushActiveDesign } from './design-sync'
import type { Floor, FloorDimension, FloorPlan, Point2D } from './types'

export const BTF_SLICES_SETTINGS_KEY = 'btfSlices'

/** Afstand tot P-lijn om een custom_dimension als slicer-bake te zien (cm). */
export const BTF_SLICE_DIM_ON_LINE_CM = 1

export type BtfSlice = { m: Point2D; p: Point2D }

function isFinitePoint(value: unknown): value is Point2D {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return Number.isFinite(record.x) && Number.isFinite(record.y)
}

function normalizeSlice(raw: unknown): BtfSlice | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  if (!isFinitePoint(record.m) || !isFinitePoint(record.p)) return null
  const m = { x: Number(record.m.x), y: Number(record.m.y) }
  const p = { x: Number(record.p.x), y: Number(record.p.y) }
  if (Math.hypot(p.x - m.x, p.y - m.y) < 1e-6) return null
  return { m, p }
}

function cloneSettings(settings: Record<string, unknown> | undefined): Record<string, unknown> {
  return { ...(settings ?? {}) }
}

function activeDesignSettings(
  floor: Floor | null | undefined,
): Record<string, unknown> | undefined {
  if (!floor) return undefined
  const idx = Math.max(0, floor.activeDesignIndex ?? 0)
  return floor.designs?.[idx]?.source?.settings ?? floor.designs?.[0]?.source?.settings
}

/** Lees slicers van de actieve design-settings van een floor. */
export function readBtfSlices(floor: Floor | null | undefined): BtfSlice[] {
  const raw = activeDesignSettings(floor)?.[BTF_SLICES_SETTINGS_KEY]
  if (!Array.isArray(raw)) return []
  const out: BtfSlice[] = []
  for (const entry of raw) {
    const slice = normalizeSlice(entry)
    if (slice) out.push(slice)
  }
  return out
}

export function readBtfSlicesFromPlan(
  plan: FloorPlan | null | undefined,
  floorIndex = 0,
): BtfSlice[] {
  const floor = plan?.floors[floorIndex] ?? plan?.floors[0]
  return readBtfSlices(floor ?? undefined)
}

/**
 * Schrijf slicers op de actieve design van `floorIndex`.
 * Immutable plan-update (flush + design.settings).
 */
export function writeBtfSlices(plan: FloorPlan, slices: BtfSlice[], floorIndex = 0): FloorPlan {
  const idx = Math.max(0, Math.min(floorIndex, plan.floors.length - 1))
  const floors = plan.floors.map((floor, i) => {
    if (i !== idx) return floor
    const flushed = flushActiveDesign(floor)
    const designIdx = Math.max(0, flushed.activeDesignIndex ?? 0)
    const designs = (flushed.designs ?? []).map((design, di) => {
      if (di !== designIdx) return design
      const settings = cloneSettings(design.source?.settings)
      if (slices.length === 0) delete settings[BTF_SLICES_SETTINGS_KEY]
      else settings[BTF_SLICES_SETTINGS_KEY] = slices.map((s) => ({ m: { ...s.m }, p: { ...s.p } }))
      return {
        ...design,
        source: { ...design.source, settings },
      }
    })
    return { ...flushed, designs }
  })
  return { ...plan, floors }
}

/** Eenheid-richting van de meetas (loodrecht op P−M). Null bij degeneraat. */
export function sliceMeasureAxis(slice: BtfSlice): Point2D | null {
  const dx = slice.p.x - slice.m.x
  const dy = slice.p.y - slice.m.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return null
  return { x: -dy / len, y: dx / len }
}

/** Afstand van punt tot oneindige lijn door `origin` met richting `axis` (cm). */
export function distanceToAxisLine(point: Point2D, origin: Point2D, axis: Point2D): number {
  const ax = axis.x
  const ay = axis.y
  const px = point.x - origin.x
  const py = point.y - origin.y
  return Math.abs(px * ay - py * ax)
}

/** Projectie-parameter van punt op as door origin (cm langs axis). */
export function projectOnAxis(point: Point2D, origin: Point2D, axis: Point2D): number {
  return (point.x - origin.x) * axis.x + (point.y - origin.y) * axis.y
}

export function pointOnAxis(origin: Point2D, axis: Point2D, t: number): Point2D {
  return { x: origin.x + axis.x * t, y: origin.y + axis.y * t }
}

/** Dim ligt op de P-lijn van deze slice (beide einden). */
export function dimensionLiesOnSlice(
  dim: Pick<FloorDimension, 'a' | 'b'>,
  slice: BtfSlice,
  tolCm = BTF_SLICE_DIM_ON_LINE_CM,
): boolean {
  const axis = sliceMeasureAxis(slice)
  if (!axis) return false
  return (
    distanceToAxisLine(dim.a, slice.p, axis) <= tolCm &&
    distanceToAxisLine(dim.b, slice.p, axis) <= tolCm
  )
}

export function dimensionLiesOnAnySlice(
  dim: Pick<FloorDimension, 'a' | 'b'>,
  slices: BtfSlice[],
  tolCm = BTF_SLICE_DIM_ON_LINE_CM,
): boolean {
  return slices.some((slice) => dimensionLiesOnSlice(dim, slice, tolCm))
}

/** Manual = dimensions die niet op een bekende P-lijn liggen. */
export function filterManualDimensions(
  dimensions: FloorDimension[] | undefined,
  slices: BtfSlice[],
): FloorDimension[] {
  if (!dimensions || dimensions.length === 0) return []
  if (slices.length === 0) return dimensions.map((d) => ({ ...d }))
  return dimensions.filter((dim) => !dimensionLiesOnAnySlice(dim, slices))
}

/**
 * Strip bake-dims die bij btfSlices horen (na import), zodat live regenerate
 * geen dubbele lijnen in `floor.dimensions` houdt.
 */
export function stripBakedSliceDimensions(floor: Floor): Floor {
  const slices = readBtfSlices(floor)
  if (slices.length === 0 || !floor.dimensions?.length) return floor
  const manual = filterManualDimensions(floor.dimensions, slices)
  if (manual.length === floor.dimensions.length) return floor
  return {
    ...floor,
    dimensions: manual.length > 0 ? manual : undefined,
  }
}

export function stripBakedSliceDimensionsFromPlan(plan: FloorPlan): FloorPlan {
  return {
    ...plan,
    floors: plan.floors.map((floor) => stripBakedSliceDimensions(floor)),
  }
}
