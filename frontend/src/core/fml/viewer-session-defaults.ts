import { BOVENLICHT_GAP_CM, BOVENLICHT_HEIGHT_CM } from '@/core/fml/bovenlicht'
import {
  DEFAULT_FML_DOOR_HEIGHT_CM,
  DEFAULT_FML_WALL_HEIGHT_CM,
  DEFAULT_FML_WINDOW_HEIGHT_CM,
  DEFAULT_FML_WINDOW_SILL_Z_CM,
} from '@/core/fml/extraction-to-plan-types'
import type { FloorPlan } from '@/core/fml/types'

export type ViewerSessionDefaults = {
  wallHeightCm: number
  doorHeightCm: number
  windowHeightCm: number
  windowSillZCm: number
  bovenlichtDefault: boolean
  windowBovenlichtDefault: boolean
  bovenlichtHeightCm: number
  bovenlichtGapCm: number
}

export function createFactoryViewerSessionDefaults(): ViewerSessionDefaults {
  return {
    wallHeightCm: DEFAULT_FML_WALL_HEIGHT_CM,
    doorHeightCm: DEFAULT_FML_DOOR_HEIGHT_CM,
    windowHeightCm: DEFAULT_FML_WINDOW_HEIGHT_CM,
    windowSillZCm: DEFAULT_FML_WINDOW_SILL_Z_CM,
    bovenlichtDefault: false,
    windowBovenlichtDefault: false,
    bovenlichtHeightCm: BOVENLICHT_HEIGHT_CM,
    bovenlichtGapCm: BOVENLICHT_GAP_CM,
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

/** Vul sessie-defaults uit het geladen plan (UI only — geometrie blijft). */
export function seedViewerDefaultsFromPlan(plan: FloorPlan, floorIndex = 0): ViewerSessionDefaults {
  const factory = createFactoryViewerSessionDefaults()
  const floor = plan.floors[floorIndex] ?? plan.floors[0]
  const settingsWallHeight =
    typeof plan.source?.settings?.wallHeight === 'number' ? plan.source.settings.wallHeight : null

  const doorHeights: number[] = []
  const windowHeights: number[] = []
  const windowSills: number[] = []
  const doorBovenlicht: boolean[] = []
  const windowBovenlicht: boolean[] = []
  const bovenlichtHeights: number[] = []
  const bovenlichtGaps: number[] = []

  for (const f of plan.floors) {
    for (const wall of f.walls) {
      for (const opening of wall.openings) {
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
          if (
            typeof opening.bovenlichtHeightCm === 'number' &&
            Number.isFinite(opening.bovenlichtHeightCm)
          ) {
            bovenlichtHeights.push(opening.bovenlichtHeightCm)
          }
          if (
            typeof opening.bovenlichtGapCm === 'number' &&
            Number.isFinite(opening.bovenlichtGapCm)
          ) {
            bovenlichtGaps.push(opening.bovenlichtGapCm)
          }
        }
      }
    }
  }

  const wallHeight =
    floor && typeof floor.height === 'number' && Number.isFinite(floor.height) && floor.height > 0
      ? Math.round(floor.height)
      : settingsWallHeight != null && settingsWallHeight > 0
        ? Math.round(settingsWallHeight)
        : factory.wallHeightCm

  return {
    wallHeightCm: wallHeight,
    doorHeightCm: modeNumber(doorHeights, factory.doorHeightCm),
    windowHeightCm: modeNumber(windowHeights, factory.windowHeightCm),
    windowSillZCm: modeNumber(windowSills, factory.windowSillZCm),
    bovenlichtDefault: majorityBool(doorBovenlicht, factory.bovenlichtDefault),
    windowBovenlichtDefault: majorityBool(windowBovenlicht, factory.windowBovenlichtDefault),
    bovenlichtHeightCm: modeNumber(bovenlichtHeights, factory.bovenlichtHeightCm),
    bovenlichtGapCm: modeNumber(bovenlichtGaps, factory.bovenlichtGapCm),
  }
}
