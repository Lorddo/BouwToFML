/**
 * FML-adapter B2: settings.facadeGroups ↔ plan.facadeGroups.
 * Hydrate draait ná hydrateFacadeGroupsFromNativeMarkers (legacy catalogus/markers).
 */
import {
  FACADE_GROUPS_SETTINGS_KEY,
  listFacadeGroups,
  serializeFacadeGroupsForSettings,
} from '../../fml/facade-groups'
import type { FmlConceptAdapter } from './registry'

function clearFacadeGroupsSettingsKey(plan: {
  source?: { settings?: Record<string, unknown> }
}): void {
  const settings = plan.source?.settings
  if (!settings || !(FACADE_GROUPS_SETTINGS_KEY in settings)) return
  delete settings[FACADE_GROUPS_SETTINGS_KEY]
}

export const facadeGroupsAdapter: FmlConceptAdapter = {
  id: 'facade-groups',
  hydrate(plan) {
    const groups = listFacadeGroups(plan)
    if (groups.length > 0) {
      plan.facadeGroups = groups.map((group) => ({
        ...group,
        wallGuids: [...group.wallGuids],
      }))
    } else {
      delete plan.facadeGroups
    }
    clearFacadeGroupsSettingsKey(plan)
  },
  serializePlanSettings(plan, settings) {
    const groups = listFacadeGroups(plan)
    if (groups.length === 0) {
      delete settings[FACADE_GROUPS_SETTINGS_KEY]
      return
    }
    settings[FACADE_GROUPS_SETTINGS_KEY] = serializeFacadeGroupsForSettings(groups)
  },
}
