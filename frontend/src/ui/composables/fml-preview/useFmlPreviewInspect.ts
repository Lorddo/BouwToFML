import type { ComputedRef, Ref } from 'vue'
import type { FloorPlan, Point2D, Wall } from '@/core/fml/types'
import { facadeMemberIdsOnFloor, groupIdForWall } from '@/core/fml/facade-groups'
import { findOpeningById } from '@/ui/components/fml-preview-openings'
import type { FmlInspectHit } from './fml-inspect'
import { pickInspectTarget } from './fml-inspect'
import type { HitTestApi } from './fml-preview-hit-test-api'
import type { FmlPreviewSelectionRefs } from './fml-preview-selection'

type SurfaceRec = { id: string; isCutout?: boolean }

/**
 * Inspect pick/hover — prioriteit opening → surface¬cutout → muur → kamer
 * (zie `pickInspectTarget`). Edit-pick blijft in `useFmlPreviewPointer`.
 */
export function useFmlPreviewInspect(options: {
  hitTest: HitTestApi
  selection: FmlPreviewSelectionRefs
  walls: Ref<Wall[]> | ComputedRef<Wall[]>
  surfaces: Ref<SurfaceRec[]> | ComputedRef<SurfaceRec[]>
  floorIndex: Ref<number> | ComputedRef<number>
  plan?: Ref<FloorPlan | null> | ComputedRef<FloorPlan | null>
  onInspectSelect?: (hit: FmlInspectHit | null) => void
}) {
  const { hitTest, selection, walls, surfaces, floorIndex, plan, onInspectSelect } = options
  const {
    settingsWallIds,
    settingsOpeningIds,
    moveWallId,
    moveOpeningId,
    hoveredWallId,
    hoveredOpeningId,
    hoveredJunctionId,
  } = selection

  function applyInspectPick(cm: Point2D): void {
    const openingId = hitTest.hitTestOpeningAtCm(cm)
    let opening: Parameters<typeof pickInspectTarget>[0]['opening'] = null
    if (openingId) {
      const loc = findOpeningById(walls.value, openingId)
      if (loc) {
        opening = {
          compositeId: openingId,
          guid: loc.opening.guid?.trim() || openingId,
          type: loc.opening.type,
          wallId: loc.wallId,
        }
      }
    }
    const surfaceId = hitTest.hitTestSurfaceAtCm(cm)
    const surfaceRec = surfaceId ? surfaces.value.find((item) => item.id === surfaceId) : undefined
    const itemId = hitTest.hitTestItemAtCm(cm)
    const picked = pickInspectTarget({
      opening,
      item: itemId ? { id: itemId } : null,
      surface: surfaceId ? { id: surfaceId, isCutout: surfaceRec?.isCutout === true } : null,
      area: (() => {
        const areaId = hitTest.hitTestAreaAtCm(cm)
        return areaId ? { id: areaId } : null
      })(),
      wall: (() => {
        const wallId = hitTest.hitTestWallAtCm(cm)
        return wallId ? { id: wallId } : null
      })(),
    })

    moveWallId.value = null
    moveOpeningId.value = null
    selection.moveItemId.value = null
    selection.pinnedJunctionId.value = null
    selection.surfaceEditId.value = null

    if (!picked) {
      settingsWallIds.value = []
      settingsOpeningIds.value = []
      selection.settingsAreaId.value = null
      selection.settingsSurfaceId.value = null
      selection.settingsItemId.value = null
      onInspectSelect?.(null)
      return
    }

    let wallIds: string[] = picked.kind === 'wall' ? [picked.id] : []
    let facadeIds: string[] | undefined
    if (picked.kind === 'wall' && plan?.value) {
      const groupId = groupIdForWall(plan.value, picked.id)
      if (groupId) {
        facadeIds = facadeMemberIdsOnFloor(plan.value, groupId, floorIndex.value)
        if (facadeIds.length > 0) wallIds = facadeIds
      }
    }

    settingsWallIds.value = wallIds
    settingsOpeningIds.value = picked.compositeOpeningId ? [picked.compositeOpeningId] : []
    selection.settingsAreaId.value = picked.kind === 'area' ? picked.id : null
    selection.settingsSurfaceId.value = picked.kind === 'surface' ? picked.id : null
    selection.settingsItemId.value = picked.kind === 'item' ? picked.id : null
    onInspectSelect?.({
      kind: picked.kind,
      id: picked.id,
      floorIndex: floorIndex.value,
      ...(picked.wallId ? { wallId: picked.wallId } : {}),
      ...(facadeIds && facadeIds.length > 0 ? { ids: facadeIds } : {}),
    })
  }

  function updateInspectHover(event: MouseEvent): void {
    const cm = hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return
    hoveredJunctionId.value = null
    const openingId = hitTest.hitTestOpeningAtCm(cm)
    if (openingId) {
      hoveredOpeningId.value = openingId
      hoveredWallId.value = null
      selection.hoveredAreaId.value = null
      selection.hoveredSurfaceId.value = null
      selection.hoveredItemId.value = null
      return
    }
    hoveredOpeningId.value = null
    const itemId = hitTest.hitTestItemAtCm(cm)
    if (itemId) {
      selection.hoveredItemId.value = itemId
      hoveredWallId.value = null
      selection.hoveredAreaId.value = null
      selection.hoveredSurfaceId.value = null
      return
    }
    selection.hoveredItemId.value = null
    const surfaceId = hitTest.hitTestSurfaceAtCm(cm)
    const surfaceRec = surfaceId ? surfaces.value.find((item) => item.id === surfaceId) : undefined
    if (surfaceId && surfaceRec?.isCutout !== true) {
      selection.hoveredSurfaceId.value = surfaceId
      selection.hoveredAreaId.value = null
      hoveredWallId.value = null
      return
    }
    const wallId = hitTest.hitTestWallAtCm(cm)
    if (wallId) {
      hoveredWallId.value = wallId
      selection.hoveredAreaId.value = null
      selection.hoveredSurfaceId.value = null
      return
    }
    hoveredWallId.value = null
    selection.hoveredSurfaceId.value = null
    selection.hoveredAreaId.value = hitTest.hitTestAreaAtCm(cm)
  }

  function clearInspectSelect(): void {
    onInspectSelect?.(null)
  }

  return {
    applyInspectPick,
    updateInspectHover,
    clearInspectSelect,
  }
}
