/**
 * Project-brede vloerplaat + nok voor het gevel-aanzicht.
 * Alleen extras — geen walls[]. Floorplanner negeert de key.
 */
import type { FloorPlan, FmlExtras } from './types'

export const FLOOR_STACK_SETTINGS_KEY = 'floorStack'

export const DEFAULT_FLOOR_THICKNESS_CM = 20
export const DEFAULT_NOK_THICKNESS_CM = 30

export type FloorStackEntry = {
  level: number
  thicknessCm: number
  /** Default nok-onderkant t.o.v. deze vloer; ontbreekt → floor.height. */
  ridgeZCm?: number
}

export type FloorStack = {
  nokThicknessCm: number
  floors: FloorStackEntry[]
}

export type ElevationStackRow =
  | { kind: 'nok'; thicknessCm: number }
  | { kind: 'story'; floorIndex: number; name: string; heightCm: number }
  | { kind: 'ridge'; floorIndex: number; name: string; zCm: number }
  | { kind: 'slab'; floorIndex: number; name: string; thicknessCm: number }

function clampPositiveCm(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return fallback
  return Math.round(value)
}

function cloneSettings(settings: FmlExtras | undefined): FmlExtras {
  return { ...(settings ?? {}) }
}

function normalizeStack(raw: unknown): FloorStack {
  if (!raw || typeof raw !== 'object') {
    return { nokThicknessCm: DEFAULT_NOK_THICKNESS_CM, floors: [] }
  }
  const record = raw as Record<string, unknown>
  const floors: FloorStackEntry[] = []
  const seen = new Set<number>()
  if (Array.isArray(record.floors)) {
    for (const entry of record.floors) {
      if (!entry || typeof entry !== 'object') continue
      const row = entry as Record<string, unknown>
      if (typeof row.level !== 'number' || !Number.isFinite(row.level)) continue
      const level = Math.round(row.level)
      if (seen.has(level)) continue
      seen.add(level)
      const ridgeZCm =
        typeof row.ridgeZCm === 'number' && Number.isFinite(row.ridgeZCm) && row.ridgeZCm >= 0
          ? Math.round(row.ridgeZCm)
          : undefined
      floors.push({
        level,
        thicknessCm: clampPositiveCm(row.thicknessCm, DEFAULT_FLOOR_THICKNESS_CM),
        ...(ridgeZCm != null ? { ridgeZCm } : {}),
      })
    }
  }
  return {
    nokThicknessCm: clampPositiveCm(record.nokThicknessCm, DEFAULT_NOK_THICKNESS_CM),
    floors,
  }
}

export function readFloorStack(plan: FloorPlan | null | undefined): FloorStack {
  return normalizeStack(plan?.source?.settings?.[FLOOR_STACK_SETTINGS_KEY])
}

export function slabThicknessCm(stack: FloorStack, level: number): number {
  const found = stack.floors.find((entry) => entry.level === level)
  return found?.thicknessCm ?? DEFAULT_FLOOR_THICKNESS_CM
}

export function writeFloorStack(plan: FloorPlan, next: FloorStack): FloorPlan {
  const settings = cloneSettings(plan.source?.settings)
  settings[FLOOR_STACK_SETTINGS_KEY] = {
    nokThicknessCm: clampPositiveCm(next.nokThicknessCm, DEFAULT_NOK_THICKNESS_CM),
    floors: next.floors.map((entry) => ({
      level: Math.round(entry.level),
      thicknessCm: clampPositiveCm(entry.thicknessCm, DEFAULT_FLOOR_THICKNESS_CM),
      ...(entry.ridgeZCm != null ? { ridgeZCm: clampPositiveCm(entry.ridgeZCm, 0) } : {}),
    })),
  }
  return {
    ...plan,
    source: plan.source ? { ...plan.source, settings } : { settings },
  }
}

export function setNokThicknessCm(plan: FloorPlan, thicknessCm: number): FloorPlan {
  const stack = readFloorStack(plan)
  return writeFloorStack(plan, {
    ...stack,
    nokThicknessCm: clampPositiveCm(thicknessCm, DEFAULT_NOK_THICKNESS_CM),
  })
}

export function setSlabThicknessCm(plan: FloorPlan, level: number, thicknessCm: number): FloorPlan {
  const stack = readFloorStack(plan)
  const prev = stack.floors.find((entry) => entry.level === level)
  const floors = stack.floors.filter((entry) => entry.level !== level)
  floors.push({
    level: Math.round(level),
    thicknessCm: clampPositiveCm(thicknessCm, DEFAULT_FLOOR_THICKNESS_CM),
    ...(prev?.ridgeZCm != null ? { ridgeZCm: prev.ridgeZCm } : {}),
  })
  floors.sort((a, b) => a.level - b.level)
  return writeFloorStack(plan, { ...stack, floors })
}

export function storedRidgeZCm(stack: FloorStack, level: number): number | undefined {
  return stack.floors.find((entry) => entry.level === level)?.ridgeZCm
}

export function setFloorRidgeZCm(plan: FloorPlan, level: number, ridgeZCm: number): FloorPlan {
  const stack = readFloorStack(plan)
  const prev = stack.floors.find((entry) => entry.level === level)
  const floors = stack.floors.filter((entry) => entry.level !== level)
  floors.push({
    level: Math.round(level),
    thicknessCm: prev?.thicknessCm ?? DEFAULT_FLOOR_THICKNESS_CM,
    ridgeZCm: clampPositiveCm(ridgeZCm, 0),
  })
  floors.sort((a, b) => a.level - b.level)
  return writeFloorStack(plan, { ...stack, floors })
}

/** Hoog → laag: nok, bovenste verdieping, haar plaat, …, BG, BG-plaat. */
export function elevationStackRows(plan: FloorPlan): ElevationStackRow[] {
  const stack = readFloorStack(plan)
  const rows: ElevationStackRow[] = [{ kind: 'nok', thicknessCm: stack.nokThicknessCm }]
  for (let i = plan.floors.length - 1; i >= 0; i -= 1) {
    const floor = plan.floors[i]
    if (!floor) continue
    rows.push({
      kind: 'story',
      floorIndex: i,
      name: floor.name,
      heightCm: Math.round(floor.height),
    })
    rows.push({
      kind: 'ridge',
      floorIndex: i,
      name: floor.name,
      zCm: storedRidgeZCm(stack, floor.level) ?? Math.round(floor.height),
    })
    rows.push({
      kind: 'slab',
      floorIndex: i,
      name: floor.name,
      thicknessCm: slabThicknessCm(stack, floor.level),
    })
  }
  return rows
}

/**
 * World-Z van de onderkant van de muur (az.z=0) per floor-index.
 * Stapeling: plaat_i + height_i, van laag naar hoog.
 */
export function floorWallBaseWorldZ(plan: FloorPlan, floorIndex: number): number {
  const stack = readFloorStack(plan)
  let cum = 0
  for (let i = 0; i < plan.floors.length; i += 1) {
    const floor = plan.floors[i]
    if (!floor) continue
    const slab = slabThicknessCm(stack, floor.level)
    if (i === floorIndex) return cum + slab
    cum += slab + Math.max(0, floor.height)
  }
  return cum
}

export function floorSlabWorldRange(
  plan: FloorPlan,
  floorIndex: number,
): { z0: number; z1: number } | null {
  const floor = plan.floors[floorIndex]
  if (!floor) return null
  const stack = readFloorStack(plan)
  let cum = 0
  for (let i = 0; i < plan.floors.length; i += 1) {
    const entry = plan.floors[i]
    if (!entry) continue
    const slab = slabThicknessCm(stack, entry.level)
    if (i === floorIndex) return { z0: cum, z1: cum + slab }
    cum += slab + Math.max(0, entry.height)
  }
  return null
}

export function nokWorldRange(plan: FloorPlan): { z0: number; z1: number } {
  const stack = readFloorStack(plan)
  let top = 0
  for (let i = 0; i < plan.floors.length; i += 1) {
    const floor = plan.floors[i]
    if (!floor) continue
    const base = floorWallBaseWorldZ(plan, i)
    top = Math.max(top, base + Math.max(0, floor.height))
  }
  return { z0: top, z1: top + stack.nokThicknessCm }
}
