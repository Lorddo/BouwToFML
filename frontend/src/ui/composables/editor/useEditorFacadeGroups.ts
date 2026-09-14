import { computed, type Ref } from 'vue'
import {
  assignWallsToGroup,
  createFacadeGroup,
  detachWallsFromGroup,
  facadeMemberIdsOnFloor,
  groupIdsForWall,
  listFacadeGroups,
  renameFacadeGroup,
  STAMP_FACADE_GROUP_ID,
} from '@/core/plan/facade-groups'
import type { FloorPlan } from '@/core/plan/types'
import {
  promptFacadeGroupName,
  promptFacadeGroupsEdit,
} from '@/ui/composables/plan-chrome-dialog'
import { withStackedFacadeWalls } from '@/ui/composables/plan-facade-stacked'
import type { InspectHit } from '@/ui/composables/plan-canvas/plan-inspect'

/**
 * Gevelgroep-lidmaatschap vanuit de inspect-strip. De geselecteerde muur komt
 * uit de inspect-hit; groepen worden in-place gemuteerd, dus elke wijziging
 * vervangt `plan` door een kopie om de weergave te laten volgen.
 * De stempel-groep is geen gevel en blijft uit de lijst.
 */
export function useEditorFacadeGroups(deps: {
  plan: Ref<FloorPlan | null>
  lastInspectHit: Ref<InspectHit | null>
}) {
  const facadeGroups = computed(() =>
    listFacadeGroups(deps.plan.value).filter((group) => group.id !== STAMP_FACADE_GROUP_ID),
  )

  /** De aangeklikte muur, of `null` als de hit geen muur is. */
  function wallHit(): InspectHit | null {
    const hit = deps.lastInspectHit.value
    if (!hit || hit.kind !== 'wall' || !deps.plan.value) return null
    return hit
  }

  function isMember(groupId: string): boolean {
    const hit = wallHit()
    if (!hit || !deps.plan.value) return false
    return groupIdsForWall(deps.plan.value, hit.id).includes(groupId)
  }

  const memberFacadeGroups = computed(() =>
    facadeGroups.value.filter((group) => isMember(group.id)),
  )

  const addableFacadeGroups = computed(() =>
    facadeGroups.value.filter((group) => !isMember(group.id)),
  )

  /** Muur zit in precies één groep → hele groep meeselecteren op deze floor. */
  function refreshHit(): void {
    const hit = wallHit()
    if (!hit || !deps.plan.value) return
    const groupIds = groupIdsForWall(deps.plan.value, hit.id)
    const ids =
      groupIds.length === 1
        ? facadeMemberIdsOnFloor(deps.plan.value, groupIds[0], hit.floorIndex)
        : undefined
    deps.lastInspectHit.value = {
      ...hit,
      ids: ids && ids.length > 0 ? ids : undefined,
    }
    deps.plan.value = { ...deps.plan.value }
  }

  function selectedWallIds(hit: InspectHit): string[] {
    return hit.ids && hit.ids.length > 0 ? hit.ids : [hit.id]
  }

  async function onFacadeToggle(groupId: string, enabled: boolean): Promise<void> {
    const hit = wallHit()
    if (!hit || !deps.plan.value) return
    const selectedIds = selectedWallIds(hit)
    if (enabled) {
      const wallIds = await withStackedFacadeWalls(
        deps.plan.value,
        selectedIds,
        'assign',
        groupId,
      )
      assignWallsToGroup(deps.plan.value, groupId, wallIds)
    } else {
      const wallIds = await withStackedFacadeWalls(
        deps.plan.value,
        selectedIds,
        'detach',
        groupId,
      )
      detachWallsFromGroup(deps.plan.value, groupId, wallIds)
    }
    refreshHit()
  }

  /** Dropdown met twee sentinel-waarden naast de groep-ids. */
  async function onFacadeChange(event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement
    const value = select.value
    select.value = ''
    if (!value) return
    if (value === '__edit__') {
      await onFacadeEditAll()
      return
    }
    if (value === '__new__') {
      await onFacadeNew()
      return
    }
    await onFacadeToggle(value, true)
  }

  async function onFacadeEditAll(): Promise<void> {
    const groups = facadeGroups.value
    if (groups.length === 0 || !deps.plan.value) return
    const edited = await promptFacadeGroupsEdit(groups.map((g) => ({ id: g.id, name: g.name })))
    if (!edited) return
    let changed = false
    for (const row of edited) {
      const current = groups.find((g) => g.id === row.id)
      if (!current || current.name === row.name) continue
      renameFacadeGroup(deps.plan.value, row.id, { name: row.name })
      changed = true
    }
    if (changed) deps.plan.value = { ...deps.plan.value }
  }

  async function onFacadeNew(): Promise<void> {
    const hit = wallHit()
    if (!hit || !deps.plan.value) return
    const selectedIds = selectedWallIds(hit)
    const name = await promptFacadeGroupName()
    if (name == null) return
    const wallIds = await withStackedFacadeWalls(deps.plan.value, selectedIds, 'create')
    const group = createFacadeGroup(deps.plan.value, { name })
    assignWallsToGroup(deps.plan.value, group.id, wallIds)
    refreshHit()
  }

  function onFacadeSelectMembers(groupId: string): void {
    const hit = wallHit()
    if (!hit || !deps.plan.value) return
    const ids = facadeMemberIdsOnFloor(deps.plan.value, groupId, hit.floorIndex)
    if (ids.length === 0) return
    deps.lastInspectHit.value = { ...hit, ids }
  }

  async function onFacadeRemove(groupId: string): Promise<void> {
    await onFacadeToggle(groupId, false)
  }

  return {
    memberFacadeGroups,
    addableFacadeGroups,
    onFacadeChange,
    onFacadeSelectMembers,
    onFacadeRemove,
  }
}
