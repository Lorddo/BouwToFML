import { seedFloorStackIfMissing } from '@/core/plan/floor-stack'
import { seedRidgeDisplayWidthIfMissing } from '@/core/plan/ridge-walls'
import { ensureDefaultFacadeGroups } from '@/core/plan/facade-groups'
import { floorDefaultsFromTemplate, seedMissingFloorDefaults } from '@/core/plan/floor-defaults'
import type { FloorPlan } from '@/core/plan/types'
import { loadUserSettings } from '@/ui/composables/settings/user-settings'

/** User-defaults voor dak/vloer/noklijn/kozijn op een nieuw of nog leeg plan. */
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
  const withDefaults = seedMissingFloorDefaults(withRidge, {
    template: floorDefaultsFromTemplate({
      ...settings.defaults,
      openingFrameDefaults: settings.planDisplay.openingFrameDefaults,
    }),
  })
  if (options?.facadeCatalog === true) {
    ensureDefaultFacadeGroups(withDefaults, settings.planDisplay.facadeGroups)
  }
  return withDefaults
}
