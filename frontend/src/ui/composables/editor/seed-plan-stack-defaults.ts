import { seedFloorStackIfMissing } from '@/core/fml/floor-stack'
import { seedRidgeDisplayWidthIfMissing } from '@/core/fml/ridge-walls'
import { ensureDefaultFacadeGroups } from '@/core/fml/facade-groups'
import type { FloorPlan } from '@/core/fml/types'
import { loadUserSettings } from '@/ui/composables/settings/user-settings'

/** User-defaults voor dak/vloer/noklijn op een nieuw of nog leeg plan. */
export function seedPlanFromUserSettings(
  plan: FloorPlan,
  options?: { facadeCatalog?: boolean },
): FloorPlan {
  const settings = loadUserSettings()
  const withStack = seedFloorStackIfMissing(plan, {
    dakThicknessCm: settings.defaults.dakThicknessCm,
    slabThicknessCm: settings.defaults.slabThicknessCm,
  })
  const withRidge = seedRidgeDisplayWidthIfMissing(withStack, settings.planDisplay.ridgeDisplayWidthCm)
  if (options?.facadeCatalog === true) {
    ensureDefaultFacadeGroups(withRidge, settings.planDisplay.facadeGroups)
  }
  return withRidge
}
