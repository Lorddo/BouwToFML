/**
 * Session-only weergave van maatlijnen (exclusief). Niet in FML.
 */
import { readBtfSlices } from './btf-slices'
import { readDimensionSettings } from './fml-dimension-settings'
import type { FloorPlan } from './types'

export type DimensionVis = 'none' | 'autogen' | 'slicer' | 'manual'

export const DIMENSION_VIS_OPTIONS: readonly DimensionVis[] = [
  'none',
  'autogen',
  'slicer',
  'manual',
] as const

/** Default: autogen als flag, anders slicer als extras, anders manual als dims, anders none. */
export function defaultDimensionVis(
  plan: FloorPlan | null | undefined,
  floorIndex = 0,
): DimensionVis {
  if (!plan) return 'none'
  const settings = readDimensionSettings(plan, floorIndex)
  if (settings.engineAutoDims) return 'autogen'
  const floor = plan.floors[floorIndex] ?? plan.floors[0]
  if (readBtfSlices(floor).length > 0) return 'slicer'
  if ((floor?.dimensions?.length ?? 0) > 0) return 'manual'
  return 'none'
}
