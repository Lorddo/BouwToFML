import type { Ref } from 'vue'
import type { FloorPlan, Point2D, Wall } from '@/core/plan/types'
import { isRidgeWallId, rejectRidgeGuids } from '@/core/plan/ridge-walls'
import { applyStampToFloor, canApplyStampToFloor } from '@/core/plan/apply-stamp-to-floor'
import {
  applyFacadeGroupRemaps,
  assignWallsToGroup,
  assignWallsToStamp,
  createFacadeGroup,
  deleteFacadeGroup,
  detachWalls,
  detachWallsFromFacade,
  detachWallsFromGroup,
  detachWallsFromStamp,
  ensureStampFacadeGroup,
  listFacadeGroups,
  pruneFacadeGroups,
  wallGuidsInGroup,
  renameFacadeGroup,
  type FacadeGroup,
  type FacadeGroupCreateInput,
} from '@/core/plan/facade-groups'
import { setPlanWallsThicknessKeepBalance } from '@/ui/components/plan-canvas-wall-edit'
import { regenerateFloorAreas } from '@/ui/composables/plan-canvas/regenerate-floor-areas'
import { materializeEndpointJoinsAtPoint } from '@/ui/components/plan-canvas-wall-draw-geom'

export interface EditorFacadeStampDeps {
  localPlan: Ref<FloorPlan | null>
  floorIndex: Ref<number>
  walls: () => Wall[]
  pushUndo: (options?: { layoutOrigin?: Point2D | null }) => void
  popLastUndo: () => void
  patchActiveFloor: (patch: Partial<{ walls: Wall[] }>) => void
  flushAreaRegen: () => void
}

export function createEditorFacadeStamp(deps: EditorFacadeStampDeps) {
  function applyFacadeGroupThickness(groupId: string, thicknessCm: number): boolean {
    const plan = deps.localPlan.value
    if (!plan) return false
    const ids = wallGuidsInGroup(plan, groupId).filter((id) => !isRidgeWallId(plan, id))
    if (ids.length === 0) return false
    const next = setPlanWallsThicknessKeepBalance(plan, ids, thicknessCm)
    if (next === plan) return false
    deps.localPlan.value = {
      ...next,
      floors: next.floors.map((floor, idx) =>
        floor === plan.floors[idx] ? floor : regenerateFloorAreas(floor),
      ),
    }
    return true
  }

  function facadeGroups(): FacadeGroup[] {
    return listFacadeGroups(deps.localPlan.value)
  }

  function applyFacadeAssign(groupId: string, wallGuids: readonly string[]): void {
    if (!deps.localPlan.value) return
    assignWallsToGroup(
      deps.localPlan.value,
      groupId,
      rejectRidgeGuids(deps.localPlan.value, wallGuids),
    )
  }

  function applyFacadeDetach(wallGuids: readonly string[]): void {
    if (!deps.localPlan.value) return
    detachWallsFromFacade(deps.localPlan.value, wallGuids)
  }

  function applyFacadeDetachFromGroup(groupId: string, wallGuids: readonly string[]): void {
    if (!deps.localPlan.value) return
    detachWallsFromGroup(
      deps.localPlan.value,
      groupId,
      rejectRidgeGuids(deps.localPlan.value, wallGuids),
    )
  }

  function applyStampAssign(wallGuids: readonly string[]): void {
    if (!deps.localPlan.value) return
    assignWallsToStamp(deps.localPlan.value, rejectRidgeGuids(deps.localPlan.value, wallGuids))
  }

  function applyStampDetach(wallGuids: readonly string[]): void {
    if (!deps.localPlan.value) return
    detachWallsFromStamp(deps.localPlan.value, wallGuids)
  }

  function applyFacadeCreate(
    input: FacadeGroupCreateInput,
    wallGuids?: readonly string[],
  ): FacadeGroup | null {
    if (!deps.localPlan.value) return null
    const group = createFacadeGroup(deps.localPlan.value, input)
    if (wallGuids && wallGuids.length > 0) {
      assignWallsToGroup(
        deps.localPlan.value,
        group.id,
        rejectRidgeGuids(deps.localPlan.value, wallGuids),
      )
    }
    return listFacadeGroups(deps.localPlan.value).find((g) => g.id === group.id) ?? group
  }

  function applyFacadeDelete(groupId: string, options?: { force?: boolean }): boolean {
    if (!deps.localPlan.value) return false
    return deleteFacadeGroup(deps.localPlan.value, groupId, options)
  }

  function applyFacadeRename(
    groupId: string,
    patch: { name?: string; code?: string },
  ): FacadeGroup | null {
    if (!deps.localPlan.value) return null
    return renameFacadeGroup(deps.localPlan.value, groupId, patch)
  }

  function applyStampToActiveFloor(): boolean {
    if (!deps.localPlan.value) return false
    if (!canApplyStampToFloor(deps.localPlan.value, deps.floorIndex.value)) return false
    deps.pushUndo()
    const result = applyStampToFloor(deps.localPlan.value, deps.floorIndex.value)
    if (result.addedWallIds.length === 0) {
      deps.popLastUndo()
      return false
    }
    deps.localPlan.value = result.plan
    const nextWalls = [...(deps.localPlan.value.floors[deps.floorIndex.value]?.walls ?? [])]
    const added = new Set(result.addedWallIds)
    for (const wall of nextWalls) {
      if (!added.has(wall.id)) continue
      materializeEndpointJoinsAtPoint(nextWalls, wall.a, {
        excludeWallIds: added,
        toleranceCm: 1,
      })
      materializeEndpointJoinsAtPoint(nextWalls, wall.b, {
        excludeWallIds: added,
        toleranceCm: 1,
      })
    }
    deps.patchActiveFloor({ walls: nextWalls })
    deps.flushAreaRegen()
    return true
  }

  function canApplyStampOnActiveFloor(): boolean {
    return canApplyStampToFloor(deps.localPlan.value, deps.floorIndex.value)
  }

  return {
    applyFacadeGroupThickness,
    facadeGroups,
    applyFacadeAssign,
    applyFacadeDetach,
    applyFacadeDetachFromGroup,
    applyStampAssign,
    applyStampDetach,
    applyFacadeCreate,
    applyFacadeDelete,
    applyFacadeRename,
    applyStampToActiveFloor,
    canApplyStampOnActiveFloor,
    ensureStampFacadeGroup,
    detachWalls,
    applyFacadeGroupRemaps,
    pruneFacadeGroups,
  }
}
