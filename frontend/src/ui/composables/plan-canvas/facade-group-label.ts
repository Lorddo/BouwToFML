import {
  DEFAULT_FACADE_GROUP_NAMES,
  isDefaultFacadeGroupId,
} from '@/core/plan/facade-groups'

/** UI-label: default-ids vertalen zolang de opgeslagen naam de Engelse canonical is. */
export function facadeGroupDisplayName(
  group: { id: string; name?: string },
  t: (key: string) => string,
): string {
  const stored = group.name?.trim() || group.id
  if (isDefaultFacadeGroupId(group.id) && stored === DEFAULT_FACADE_GROUP_NAMES[group.id]) {
    return t(`result.toolbar.facadeGroupNames.${group.id}`)
  }
  return stored
}
