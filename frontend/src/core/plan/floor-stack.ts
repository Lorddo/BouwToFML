/**
 * Project-brede vloerplaat + nok voor het gevel-aanzicht.
 * Opslag: `plan.roof.stack` (`.plg`). FML-adapter projecteert naar settings.floorStack
 * (export stript die key weer).
 */
import { DEFAULT_RIDGE_DISPLAY_WIDTH_CM } from '../plg/extension-types'
import type { FloorPlan, PlanExtras } from './types'

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

export type ElevationFloorGroup = {
  floorIndex: number
  name: string
  heightCm: number
  slabCm: number
}

export type FloorStackDefaults = {
  dakThicknessCm: number
  slabThicknessCm: number
}

function clampPositiveCm(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return fallback
  return Math.round(value)
}

function cloneSettings(settings: PlanExtras | undefined): PlanExtras {
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

function stripFloorStackSettings(plan: FloorPlan): FloorPlan['source'] {
  const settings = plan.source?.settings
  if (!settings || !(FLOOR_STACK_SETTINGS_KEY in settings)) return plan.source
  const next = cloneSettings(settings)
  delete next[FLOOR_STACK_SETTINGS_KEY]
  return plan.source ? { ...plan.source, settings: next } : { settings: next }
}

function withRoofStack(plan: FloorPlan, stack: FloorStack): FloorPlan {
  const normalized: FloorStack = {
    nokThicknessCm: clampPositiveCm(stack.nokThicknessCm, DEFAULT_NOK_THICKNESS_CM),
    floors: stack.floors.map((entry) => ({
      level: Math.round(entry.level),
      thicknessCm: clampPositiveCm(entry.thicknessCm, DEFAULT_FLOOR_THICKNESS_CM),
      ...(entry.ridgeZCm != null ? { ridgeZCm: clampPositiveCm(entry.ridgeZCm, 0) } : {}),
    })),
  }
  return {
    ...plan,
    roof: {
      ridge: plan.roof?.ridge ?? {
        wallGuids: [],
        displayWidthCm: DEFAULT_RIDGE_DISPLAY_WIDTH_CM,
      },
      planes: plan.roof?.planes ?? { surfaceGuids: [] },
      stack: normalized,
    },
    source: stripFloorStackSettings(plan),
  }
}

export function readFloorStack(plan: FloorPlan | null | undefined): FloorStack {
  if (plan?.roof?.stack) return normalizeStack(plan.roof.stack)
  return normalizeStack(plan?.source?.settings?.[FLOOR_STACK_SETTINGS_KEY])
}

export function slabThicknessCm(stack: FloorStack, level: number): number {
  const found = stack.floors.find((entry) => entry.level === level)
  return found?.thicknessCm ?? DEFAULT_FLOOR_THICKNESS_CM
}

export function writeFloorStack(plan: FloorPlan, next: FloorStack): FloorPlan {
  return withRoofStack(plan, next)
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

export function elevationDakThicknessCm(plan: FloorPlan): number {
  return readFloorStack(plan).nokThicknessCm
}

/** Hoog → laag: per verdieping hoogte + vloerplaat. */
export function elevationFloorGroups(plan: FloorPlan): ElevationFloorGroup[] {
  const stack = readFloorStack(plan)
  const groups: ElevationFloorGroup[] = []
  for (let i = plan.floors.length - 1; i >= 0; i -= 1) {
    const floor = plan.floors[i]
    if (!floor) continue
    groups.push({
      floorIndex: i,
      name: floor.name,
      heightCm: Math.round(floor.height),
      slabCm: slabThicknessCm(stack, floor.level),
    })
  }
  return groups
}

/** Schrijf defaults alleen als `floorStack` / `plan.roof.stack` nog ontbreekt of een floor geen plaat heeft. */
export function seedFloorStackIfMissing(plan: FloorPlan, defaults: FloorStackDefaults): FloorPlan {
  const typed = plan.roof?.stack
  const raw = plan.source?.settings?.[FLOOR_STACK_SETTINGS_KEY]
  const dak = clampPositiveCm(defaults.dakThicknessCm, DEFAULT_NOK_THICKNESS_CM)
  const slab = clampPositiveCm(defaults.slabThicknessCm, DEFAULT_FLOOR_THICKNESS_CM)
  if (!typed && (!raw || typeof raw !== 'object')) {
    return writeFloorStack(plan, {
      nokThicknessCm: dak,
      floors: plan.floors.map((floor) => ({
        level: Math.round(floor.level),
        thicknessCm: slab,
      })),
    })
  }
  let next = plan
  for (const floor of plan.floors) {
    const stack = readFloorStack(next)
    if (stack.floors.some((entry) => entry.level === floor.level)) continue
    next = setSlabThicknessCm(next, floor.level, slab)
  }
  return next
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
