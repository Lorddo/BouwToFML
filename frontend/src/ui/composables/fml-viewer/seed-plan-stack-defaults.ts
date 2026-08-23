import { seedFloorStackIfMissing } from '@/core/fml/floor-stack'
import { seedRidgeDisplayWidthIfMissing } from '@/core/fml/ridge-walls'
import type { FloorPlan } from '@/core/fml/types'
import { loadUserSettings } from '@/ui/composables/settings/user-settings'

/** User-defaults voor dak/vloer/noklijn op een nieuw of nog leeg plan. */
export function seedPlanFromUserSettings(plan: FloorPlan): FloorPlan {
  const settings = loadUserSettings()
  const withStack = seedFloorStackIfMissing(plan, {
    dakThicknessCm: settings.defaults.dakThicknessCm,
    slabThicknessCm: settings.defaults.slabThicknessCm,
  })
  return seedRidgeDisplayWidthIfMissing(withStack, settings.fmlViewer.ridgeDisplayWidthCm)
}
