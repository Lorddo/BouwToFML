/**
 * Per-verdieping defaults voor nieuwe deuren/ramen/kozijnen.
 * Verdiepingshoogte = `floor.height`. Muurdiktes + packed = project.
 */
import { BOVENLICHT_GAP_CM, BOVENLICHT_HEIGHT_CM } from './bovenlicht'
import {
  DEFAULT_DOOR_HEIGHT_CM,
  DEFAULT_WINDOW_HEIGHT_CM,
  DEFAULT_WINDOW_SILL_Z_CM,
} from './extraction-to-plan-types'
import {
  cloneOpeningFrameDefaults,
  createFactoryOpeningFrameDefaults,
  normalizeOpeningFrameDefaults,
  overwritePlanOpeningFrameSide,
  type OpeningFrameDefaults,
} from './opening-frame-defaults'
import type { Floor, FloorPlan, Opening } from './types'
import {
  overwritePlanBovenlichtGap,
  overwritePlanBovenlichtHeight,
  overwritePlanDoorBovenlicht,
  overwritePlanDoorHeights,
  overwritePlanWallHeights,
  overwritePlanWindowBovenlicht,
  overwritePlanWindowHeights,
  overwritePlanWindowSills,
} from './wall-endpoint-height'

export type FloorDefaults = {
  doorHeightCm: number
  windowHeightCm: number
  windowSillZCm: number
  bovenlichtDefault: boolean
  windowBovenlichtDefault: boolean
  bovenlichtHeightCm: number
  bovenlichtGapCm: number
  openingFrameDefaults: OpeningFrameDefaults
}

export type DefaultsApplyScope = 'defaultsOnly' | 'floor' | 'project'

export type FloorDefaultNumberField =
  | 'doorHeightCm'
  | 'windowHeightCm'
  | 'windowSillZCm'
  | 'bovenlichtHeightCm'
  | 'bovenlichtGapCm'

export type FloorDefaultBoolField = 'bovenlichtDefault' | 'windowBovenlichtDefault'

export type FloorDefaultsTemplate = {
  doorHeightCm?: number
  windowHeightCm?: number
  windowSillZCm?: number
  bovenlichtDefault?: boolean
  windowBovenlichtDefault?: boolean
  bovenlichtHeightCm?: number
  bovenlichtGapCm?: number
  openingFrameDefaults?: OpeningFrameDefaults
}

export function createFactoryFloorDefaults(): FloorDefaults {
  return {
    doorHeightCm: DEFAULT_DOOR_HEIGHT_CM,
    windowHeightCm: DEFAULT_WINDOW_HEIGHT_CM,
    windowSillZCm: DEFAULT_WINDOW_SILL_Z_CM,
    bovenlichtDefault: false,
    windowBovenlichtDefault: false,
    bovenlichtHeightCm: BOVENLICHT_HEIGHT_CM,
    bovenlichtGapCm: BOVENLICHT_GAP_CM,
    openingFrameDefaults: createFactoryOpeningFrameDefaults(),
  }
}

function positiveCm(raw: unknown, fallback: number): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback
}

function nonNegativeCm(raw: unknown, fallback: number): number {
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback
}

export function normalizeFloorDefaults(
  raw: unknown,
  fallback: FloorDefaults = createFactoryFloorDefaults(),
): FloorDefaults {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    doorHeightCm: positiveCm(src.doorHeightCm, fallback.doorHeightCm),
    windowHeightCm: positiveCm(src.windowHeightCm, fallback.windowHeightCm),
    windowSillZCm: nonNegativeCm(src.windowSillZCm, fallback.windowSillZCm),
    bovenlichtDefault: typeof src.bovenlichtDefault === 'boolean' ? src.bovenlichtDefault : fallback.bovenlichtDefault,
    windowBovenlichtDefault:
      typeof src.windowBovenlichtDefault === 'boolean'
        ? src.windowBovenlichtDefault
        : fallback.windowBovenlichtDefault,
    bovenlichtHeightCm: positiveCm(src.bovenlichtHeightCm, fallback.bovenlichtHeightCm),
    bovenlichtGapCm: nonNegativeCm(src.bovenlichtGapCm, fallback.bovenlichtGapCm),
    openingFrameDefaults: normalizeOpeningFrameDefaults(
      src.openingFrameDefaults ?? fallback.openingFrameDefaults,
      fallback.openingFrameDefaults,
    ),
  }
}

export function cloneFloorDefaults(defaults: FloorDefaults): FloorDefaults {
  return {
    ...defaults,
    openingFrameDefaults: cloneOpeningFrameDefaults(defaults.openingFrameDefaults),
  }
}

export function floorDefaultsFromTemplate(
  template: FloorDefaultsTemplate,
  fallback: FloorDefaults = createFactoryFloorDefaults(),
): FloorDefaults {
  return normalizeFloorDefaults(
    {
      ...fallback,
      ...template,
      openingFrameDefaults: template.openingFrameDefaults ?? fallback.openingFrameDefaults,
    },
    fallback,
  )
}

export function readFloorDefaults(
  plan: FloorPlan | null | undefined,
  floorIndex = 0,
  fallback: FloorDefaults = createFactoryFloorDefaults(),
): FloorDefaults {
  const floor = plan?.floors[floorIndex] ?? plan?.floors[0]
  return normalizeFloorDefaults(floor?.defaults, fallback)
}

export function writeFloorDefaults(
  plan: FloorPlan,
  floorIndex: number,
  defaults: FloorDefaults,
): FloorPlan {
  return {
    ...plan,
    floors: plan.floors.map((floor, i) =>
      i === floorIndex ? { ...floor, defaults: cloneFloorDefaults(normalizeFloorDefaults(defaults)) } : floor,
    ),
  }
}

function modeNumber(values: number[], fallback: number): number {
  if (values.length === 0) return fallback
  const counts = new Map<number, number>()
  for (const value of values) {
    const rounded = Math.round(value)
    counts.set(rounded, (counts.get(rounded) ?? 0) + 1)
  }
  let best = fallback
  let bestCount = -1
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value
      bestCount = count
    }
  }
  return best
}

function majorityBool(values: boolean[], fallback: boolean): boolean {
  if (values.length === 0) return fallback
  let trues = 0
  for (const value of values) if (value) trues += 1
  if (trues === values.length - trues) return fallback
  return trues > values.length - trues
}

function inferFloorDefaultsFromGeometry(floor: Floor, fallback: FloorDefaults): FloorDefaults {
  const doorHeights: number[] = []
  const windowHeights: number[] = []
  const windowSills: number[] = []
  const doorBovenlicht: boolean[] = []
  const windowBovenlicht: boolean[] = []
  const bovenlichtHeights: number[] = []
  const bovenlichtGaps: number[] = []

  for (const wall of floor.walls) {
    for (const opening of wall.openings) {
      collectOpeningSample(
        opening,
        doorHeights,
        windowHeights,
        windowSills,
        doorBovenlicht,
        windowBovenlicht,
        bovenlichtHeights,
        bovenlichtGaps,
      )
    }
  }

  return {
    doorHeightCm: modeNumber(doorHeights, fallback.doorHeightCm),
    windowHeightCm: modeNumber(windowHeights, fallback.windowHeightCm),
    windowSillZCm: modeNumber(windowSills, fallback.windowSillZCm),
    bovenlichtDefault: majorityBool(doorBovenlicht, fallback.bovenlichtDefault),
    windowBovenlichtDefault: majorityBool(windowBovenlicht, fallback.windowBovenlichtDefault),
    bovenlichtHeightCm: modeNumber(bovenlichtHeights, fallback.bovenlichtHeightCm),
    bovenlichtGapCm: modeNumber(bovenlichtGaps, fallback.bovenlichtGapCm),
    openingFrameDefaults: fallback.openingFrameDefaults,
  }
}

function collectOpeningSample(
  opening: Opening,
  doorHeights: number[],
  windowHeights: number[],
  windowSills: number[],
  doorBovenlicht: boolean[],
  windowBovenlicht: boolean[],
  bovenlichtHeights: number[],
  bovenlichtGaps: number[],
): void {
  if (opening.type === 'door') {
    if (typeof opening.z_height === 'number' && Number.isFinite(opening.z_height)) {
      doorHeights.push(opening.z_height)
    }
    if (opening.bovenlicht === true || opening.bovenlicht === false) {
      doorBovenlicht.push(opening.bovenlicht)
    }
  } else if (opening.type === 'window') {
    if (typeof opening.z_height === 'number' && Number.isFinite(opening.z_height)) {
      windowHeights.push(opening.z_height)
    }
    if (typeof opening.z === 'number' && Number.isFinite(opening.z)) {
      windowSills.push(opening.z)
    }
    if (opening.bovenlicht === true || opening.bovenlicht === false) {
      windowBovenlicht.push(opening.bovenlicht)
    }
  }
  if (opening.bovenlicht === true) {
    if (typeof opening.bovenlichtHeightCm === 'number' && Number.isFinite(opening.bovenlichtHeightCm)) {
      bovenlichtHeights.push(opening.bovenlichtHeightCm)
    }
    if (typeof opening.bovenlichtGapCm === 'number' && Number.isFinite(opening.bovenlichtGapCm)) {
      bovenlichtGaps.push(opening.bovenlichtGapCm)
    }
  }
}

function legacyPlanFrameDefaults(plan: FloorPlan): OpeningFrameDefaults | undefined {
  const raw = plan.settings?.openingFrameDefaults
  if (!raw) return undefined
  return normalizeOpeningFrameDefaults(raw)
}

function stripLegacyPlanFrameDefaults(plan: FloorPlan): FloorPlan {
  if (!plan.settings || !('openingFrameDefaults' in plan.settings)) return plan
  const { openingFrameDefaults: _removed, ...rest } = plan.settings
  return {
    ...plan,
    settings: rest,
  }
}

export function seedMissingFloorDefaults(
  plan: FloorPlan,
  options?: { template?: FloorDefaultsTemplate },
): FloorPlan {
  const legacyFrames = legacyPlanFrameDefaults(plan)
  const template = floorDefaultsFromTemplate({
    ...options?.template,
    openingFrameDefaults:
      legacyFrames ??
      options?.template?.openingFrameDefaults ??
      createFactoryOpeningFrameDefaults(),
  })
  const floors = plan.floors.map((floor) => {
    if (floor.defaults) {
      return { ...floor, defaults: normalizeFloorDefaults(floor.defaults, template) }
    }
    return { ...floor, defaults: inferFloorDefaultsFromGeometry(floor, template) }
  })
  return stripLegacyPlanFrameDefaults({ ...plan, floors })
}

export function copyFloorDefaultsToAllFloors(plan: FloorPlan, sourceIndex: number): FloorPlan {
  const source = readFloorDefaults(plan, sourceIndex)
  return {
    ...plan,
    floors: plan.floors.map((floor) => ({ ...floor, defaults: cloneFloorDefaults(source) })),
  }
}

function patchFloorDefaults(
  plan: FloorPlan,
  floorIndex: number,
  patch: Partial<FloorDefaults>,
  allFloors: boolean,
): FloorPlan {
  const source = { ...readFloorDefaults(plan, floorIndex), ...patch }
  if (patch.openingFrameDefaults) {
    source.openingFrameDefaults = cloneOpeningFrameDefaults(patch.openingFrameDefaults)
  }
  return {
    ...plan,
    floors: plan.floors.map((floor, i) => {
      if (!allFloors && i !== floorIndex) return floor
      return { ...floor, defaults: cloneFloorDefaults(source) }
    }),
  }
}

export function applyFloorDefaultNumber(
  plan: FloorPlan,
  floorIndex: number,
  field: FloorDefaultNumberField,
  cm: number,
  scope: DefaultsApplyScope,
): FloorPlan {
  const value =
    field === 'windowSillZCm' || field === 'bovenlichtGapCm'
      ? Math.max(0, Math.round(cm))
      : Math.max(1, Math.round(cm))
  const next = patchFloorDefaults(plan, floorIndex, { [field]: value }, scope === 'project')
  if (scope === 'defaultsOnly') return next
  const target = scope === 'floor' ? floorIndex : undefined
  if (field === 'doorHeightCm') return overwritePlanDoorHeights(next, value, target)
  if (field === 'windowHeightCm') return overwritePlanWindowHeights(next, value, target)
  if (field === 'windowSillZCm') return overwritePlanWindowSills(next, value, target)
  if (field === 'bovenlichtHeightCm') return overwritePlanBovenlichtHeight(next, value, target)
  return overwritePlanBovenlichtGap(next, value, target)
}

export function applyFloorDefaultBool(
  plan: FloorPlan,
  floorIndex: number,
  field: FloorDefaultBoolField,
  enabled: boolean,
  scope: DefaultsApplyScope,
): FloorPlan {
  const next = patchFloorDefaults(plan, floorIndex, { [field]: enabled }, scope === 'project')
  if (scope === 'defaultsOnly') return next
  const target = scope === 'floor' ? floorIndex : undefined
  if (field === 'bovenlichtDefault') return overwritePlanDoorBovenlicht(next, enabled, target)
  return overwritePlanWindowBovenlicht(next, enabled, target)
}

export function applyOpeningFrameDefault(
  plan: FloorPlan,
  floorIndex: number,
  kind: 'door' | 'window',
  side: keyof OpeningFrameDefaults['door'],
  cm: number,
  scope: DefaultsApplyScope,
): FloorPlan {
  const value = Math.max(0, Math.round(cm))
  const current = readFloorDefaults(plan, floorIndex)
  const nextFrames = cloneOpeningFrameDefaults(current.openingFrameDefaults)
  nextFrames[kind] = { ...nextFrames[kind], [side]: value }
  const next = patchFloorDefaults(
    plan,
    floorIndex,
    { openingFrameDefaults: nextFrames },
    scope === 'project',
  )
  if (scope === 'defaultsOnly') return next
  return overwritePlanOpeningFrameSide(next, kind, side, value, scope === 'floor' ? floorIndex : undefined)
}

export function applyStoryHeight(
  plan: FloorPlan,
  floorIndex: number,
  cm: number,
  scope: 'floor' | 'project',
): FloorPlan {
  return overwritePlanWallHeights(plan, cm, scope === 'floor' ? floorIndex : undefined)
}

export function expandBovenlichtDefaultsFromFloor(floor: Floor | undefined): {
  doorDefault: boolean
  windowDefault: boolean
  heightCm: number
  gapCm: number
} {
  const d = normalizeFloorDefaults(floor?.defaults)
  return {
    doorDefault: d.bovenlichtDefault,
    windowDefault: d.windowBovenlichtDefault,
    heightCm: d.bovenlichtHeightCm,
    gapCm: d.bovenlichtGapCm,
  }
}
