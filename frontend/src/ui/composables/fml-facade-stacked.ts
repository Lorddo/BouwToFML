import { findStackedWallIds, groupIdForWall } from '@/core/fml/facade-groups'
import type { FloorPlan } from '@/core/fml/types'
import { confirmFacadeStackedFloors } from '@/ui/composables/fml-chrome-dialog'

/**
 * Vraag of gestapelde muren (zelfde a/b op andere floors) mee moeten.
 * Annuleren = alleen de selectie (toekenning zelf gaat door).
 */
export async function withStackedFacadeWalls(
  plan: FloorPlan,
  selectedIds: readonly string[],
  action: 'assign' | 'create' | 'detach',
  targetGroupId?: string,
): Promise<string[]> {
  const selected = [...new Set(selectedIds.map((id) => id.trim()).filter((id) => id.length > 0))]
  if (selected.length === 0) return selected

  let extra = findStackedWallIds(plan, selected)
  if (action === 'detach') {
    extra = extra.filter((id) => groupIdForWall(plan, id) != null)
  } else if (action === 'assign' && targetGroupId) {
    extra = extra.filter((id) => groupIdForWall(plan, id) !== targetGroupId)
  }
  if (extra.length === 0) return selected

  const include = await confirmFacadeStackedFloors({
    count: extra.length,
    mode: action === 'detach' ? 'detach' : 'assign',
  })
  return include ? [...selected, ...extra] : selected
}
