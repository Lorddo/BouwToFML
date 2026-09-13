import { computed, type Ref } from 'vue'
import type { FloorPlan, FloorSurface, Point2D, Wall } from '@/core/fml/types'
import { alertFmlChrome } from '@/ui/composables/plan-chrome-dialog'
import { tGlobal } from '@/ui/i18n'
import { roofOverlapMessage, validateRoofOverlap } from '@/core/fml/roof-overlap'
import {
  applyRidgeWallRemaps,
  assignRidgeWallGuids,
  dakThicknessCmForPlan,
  detachRidgeFromPlanGroups,
  detachRidgeWallGuids,
  isRidgeWallId,
  listRidgeWallsOnFloor,
  listRidgeWallsOnPlan,
  markWallAsRidge,
  pruneRidgeWalls,
  ridgeDefaultZCm,
  ridgeEndpointExtras,
  setRidgeJunctionZ,
  setRidgeWallsOnFloor,
  setRidgeWallsZ,
  unmarkWallAsRidge,
} from '@/core/fml/ridge-walls'
import {
  findFloorIndexForRidgeWall,
  isPointSkyExposedOnFloor,
  moveRidgeWallsToFloor,
  resolveFloorIndexForRidgeSegment,
  writeRidgeWallsOnPlan,
} from '@/core/fml/ridge-floor'
import {
  isRidgeSurfaceId,
  listParentRoofs,
  listRidgeSurfacesOnFloor,
  listRidgeSurfacesOnPlan,
  mapRidgeSurfaceOnPlan,
  markRoofSurfaceManual,
  resolveDormerParent,
  resolveRoofSurfaceColor,
  removeRidgeSurfaceOnPlan,
  setRidgeSurfacesOnFloor,
  syncRoofPlaneGuidsFromDesigns,
  withRoofKind,
} from '@/core/fml/roof-planes'
import {
  addRidgeSegment,
  removeWalls,
  splitWallAtT,
  type SplitWallResult,
  type WallEndRef,
} from '@/ui/components/plan-canvas-junctions'

export interface EditorRidgeRoofDeps {
  localPlan: Ref<FloorPlan | null>
  floorIndex: Ref<number>
  walls: () => Wall[]
  floorHeightCm: () => number
  setWalls: (next: Wall[]) => void
}

export function createEditorRidgeRoof(deps: EditorRidgeRoofDeps) {
  const ridgeWalls = computed(() => listRidgeWallsOnPlan(deps.localPlan.value))
  const ridgeSurfaces = computed(() => listRidgeSurfacesOnPlan(deps.localPlan.value))

  function refsOnRidge(refs: ReadonlyArray<WallEndRef>): boolean {
    return refs.some((ref) => isRidgeWallId(deps.localPlan.value, ref.wallId))
  }

  function setRidgeWalls(nextWalls: Wall[], newWallFloorIndex?: number): void {
    if (!deps.localPlan.value) return
    deps.localPlan.value = writeRidgeWallsOnPlan(
      deps.localPlan.value,
      nextWalls,
      newWallFloorIndex ?? deps.floorIndex.value,
    )
  }

  function setRidgeSurfaces(nextSurfaces: FloorSurface[]): void {
    if (!deps.localPlan.value) return
    const idx = deps.floorIndex.value
    const floor = deps.localPlan.value.floors[idx]
    if (!floor) return
    const nextFloor = setRidgeSurfacesOnFloor(floor, nextSurfaces)
    deps.localPlan.value = {
      ...deps.localPlan.value,
      floors: deps.localPlan.value.floors.map((entry, floorIdx) =>
        floorIdx === idx ? nextFloor : entry,
      ),
    }
    syncRoofPlaneGuidsFromDesigns(deps.localPlan.value)
  }

  function addRidgeSurface(surface: FloorSurface): string | null {
    const floor = deps.localPlan.value?.floors[deps.floorIndex.value]
    const existing = listRidgeSurfacesOnFloor(floor)
    let next = markRoofSurfaceManual({
      ...surface,
      isRoof: true,
      color: resolveRoofSurfaceColor(surface.color, surface.roofKind === 'dormer'),
    })
    // Auto-tag alleen als soort niet expliciet is gezet.
    if (next.roofKind !== 'dormer' && next.roofKind !== 'plane') {
      const parent = resolveDormerParent(next, existing, next.id)
      if (parent) {
        next = withRoofKind(next, 'dormer', parent.id)
      } else {
        next = withRoofKind(next, 'plane')
      }
    } else if (next.roofKind === 'dormer') {
      const parentId = next.roofParentId?.trim()
      if (!parentId) {
        const parent = resolveDormerParent(next, existing, next.id)
        // Enige hoofddak op deze floor: ook zonder vertex-hit als ouder gebruiken.
        const planes = listParentRoofs(existing)
        const fallback = parent ?? (planes.length === 1 ? planes[0] : null)
        next = withRoofKind(next, 'dormer', fallback?.id)
      } else {
        next = withRoofKind(next, 'dormer', parentId)
      }
    } else {
      next = withRoofKind(next, 'plane')
    }
    const violation = validateRoofOverlap(next, existing)
    if (violation) {
      void alertFmlChrome({
        title: tGlobal('result.toolbar.roofOverlapTitle'),
        message: roofOverlapMessage(violation),
      })
      return null
    }
    setRidgeSurfaces([...existing, next])
    return surface.id
  }

  function updateRidgeSurface(
    surfaceId: string,
    patch: Partial<
      Pick<
        FloorSurface,
        | 'role'
        | 'name'
        | 'customName'
        | 'color'
        | 'showAreaLabel'
        | 'name_x'
        | 'name_y'
        | 'poly'
        | 'isCutout'
        | 'isRoof'
        | 'pattern'
        | 'roofKind'
        | 'roofParentId'
      >
    >,
  ): boolean {
    if (!deps.localPlan.value) return false
    const floor = deps.localPlan.value.floors[deps.floorIndex.value]
    const existing = listRidgeSurfacesOnFloor(floor)
    const current = existing.find((s) => s.id === surfaceId)
    if (!current) {
      // Andere floor — mapRidgeSurfaceOnPlan zoekt plan-breed.
      let accepted = true
      deps.localPlan.value = mapRidgeSurfaceOnPlan(deps.localPlan.value, surfaceId, (surface) => {
        let merged = markRoofSurfaceManual({ ...surface, ...patch, isRoof: true })
        if (patch.roofKind != null || patch.roofParentId !== undefined) {
          const kind =
            patch.roofKind === 'dormer' ||
            (patch.roofKind == null && merged.roofKind === 'dormer')
              ? 'dormer'
              : 'plane'
          let parentId =
            patch.roofParentId !== undefined ? patch.roofParentId : merged.roofParentId
          if (kind === 'dormer' && !(parentId?.trim())) {
            const siblings = listRidgeSurfacesOnFloor(
              deps.localPlan.value!.floors.find((f) =>
                listRidgeSurfacesOnFloor(f).some((s) => s.id === surfaceId),
              ),
            )
            parentId = resolveDormerParent(merged, siblings, merged.id)?.id
          }
          merged = withRoofKind(merged, kind, parentId)
        }
        const others = listRidgeSurfacesOnPlan(deps.localPlan.value).filter(
          (s) => s.id !== surfaceId,
        )
        const violation = validateRoofOverlap(merged, others)
        if (violation) {
          accepted = false
          void alertFmlChrome({
            title: tGlobal('result.toolbar.roofOverlapTitle'),
            message: roofOverlapMessage(violation),
          })
          return surface
        }
        return merged
      })
      return accepted
    }
    let merged = markRoofSurfaceManual({ ...current, ...patch, isRoof: true })
    if (patch.roofKind != null || patch.roofParentId !== undefined) {
      const kind =
        patch.roofKind === 'dormer' ||
        (patch.roofKind == null && merged.roofKind === 'dormer')
          ? 'dormer'
          : 'plane'
      let parentId =
        patch.roofParentId !== undefined ? patch.roofParentId : merged.roofParentId
      if (kind === 'dormer' && !(parentId?.trim())) {
        parentId = resolveDormerParent(merged, existing, merged.id)?.id
      }
      merged = withRoofKind(merged, kind, parentId)
    }
    const violation = validateRoofOverlap(merged, existing)
    if (violation) {
      void alertFmlChrome({
        title: tGlobal('result.toolbar.roofOverlapTitle'),
        message: roofOverlapMessage(violation),
      })
      return false
    }
    deps.localPlan.value = mapRidgeSurfaceOnPlan(deps.localPlan.value, surfaceId, () => merged)
    return true
  }

  function removeRidgeSurface(surfaceId: string): void {
    if (!deps.localPlan.value) return
    deps.localPlan.value = removeRidgeSurfaceOnPlan(deps.localPlan.value, surfaceId)
  }

  function applyRidgeZ(wallIds: string[], zCm: number): void {
    if (!deps.localPlan.value) return
    const ridgeIds = wallIds.filter((id) => isRidgeWallId(deps.localPlan.value, id))
    if (ridgeIds.length === 0) return
    const owners = ridgeIds
      .map((id) => findFloorIndexForRidgeWall(deps.localPlan.value, id))
      .filter((index) => index >= 0)
    const uniqueFloors = [...new Set(owners)]
    if (uniqueFloors.length <= 1) {
      const owner = uniqueFloors[0]
      const floorH =
        owner != null
          ? (deps.localPlan.value.floors[owner]?.height ?? deps.floorHeightCm())
          : deps.floorHeightCm()
      setRidgeWalls(setRidgeWallsZ(ridgeWalls.value, ridgeIds, zCm, floorH))
      return
    }
    let next = deps.localPlan.value
    for (const owner of uniqueFloors) {
      const floor = next.floors[owner]
      if (!floor) continue
      const ids = ridgeIds.filter((id) => findFloorIndexForRidgeWall(next, id) === owner)
      const updated = setRidgeWallsZ(listRidgeWallsOnFloor(floor), ids, zCm, floor.height)
      next = {
        ...next,
        floors: next.floors.map((entry, index) =>
          index === owner ? setRidgeWallsOnFloor(entry, updated) : entry,
        ),
      }
    }
    deps.localPlan.value = next
  }

  function applyRidgeJunctionZ(refs: ReadonlyArray<WallEndRef>, zCm: number): void {
    if (!refsOnRidge(refs)) return
    setRidgeWalls(setRidgeJunctionZ(ridgeWalls.value, refs, zCm, deps.floorHeightCm()))
  }

  function applyRidgeAdd(
    a: Point2D,
    b: Point2D,
    zCm?: number,
    optionsAdd?: { requireFloorIndex?: number },
  ): string | null {
    if (!deps.localPlan.value) return null
    const resolved = resolveFloorIndexForRidgeSegment(deps.localPlan.value, a, b)
    const required = optionsAdd?.requireFloorIndex
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const targetIndex = required ?? resolved
    if (!isPointSkyExposedOnFloor(deps.localPlan.value, targetIndex, mid)) return null
    const targetFloor = deps.localPlan.value.floors[targetIndex]
    if (!targetFloor) return null
    const extras = ridgeEndpointExtras(
      targetFloor.height,
      dakThicknessCmForPlan(deps.localPlan.value),
      zCm ?? ridgeDefaultZCm(deps.localPlan.value, targetIndex),
    )
    const existing = listRidgeWallsOnFloor(targetFloor)
    const result = addRidgeSegment(existing, a, b, extras)
    if (!result) return null
    const others = ridgeWalls.value.filter((wall) => !existing.some((item) => item.id === wall.id))
    setRidgeWalls([...others, ...result.walls], targetIndex)
    assignRidgeWallGuids(deps.localPlan.value, result.wallIds)
    return result.wallId
  }

  function applyRidgeFloor(wallIds: string[], floorIndexTarget: number): void {
    if (!deps.localPlan.value || wallIds.length === 0) return
    deps.localPlan.value = moveRidgeWallsToFloor(deps.localPlan.value, wallIds, floorIndexTarget)
  }

  function ridgeFloorIndexForWall(wallId: string): number {
    return findFloorIndexForRidgeWall(deps.localPlan.value, wallId)
  }

  function applyWallKind(
    wallIds: string[],
    kind: 'wall' | 'ridge',
    wallThicknessCm = 20,
    ridgeZCm?: number,
  ): void {
    if (!deps.localPlan.value || wallIds.length === 0) return
    if (kind === 'ridge') {
      const moving = deps.walls().filter((wall) => wallIds.includes(wall.id))
      if (moving.length === 0) return
      const extras = ridgeEndpointExtras(
        deps.floorHeightCm(),
        dakThicknessCmForPlan(deps.localPlan.value),
        ridgeZCm,
      )
      const converted = moving.map((wall) => markWallAsRidge(wall, extras))
      deps.setWalls(
        removeWalls(
          deps.walls(),
          moving.map((wall) => wall.id),
        ),
      )
      setRidgeWalls([...ridgeWalls.value, ...converted])
      detachRidgeFromPlanGroups(
        deps.localPlan.value,
        moving.map((wall) => wall.id),
      )
      assignRidgeWallGuids(
        deps.localPlan.value,
        converted.map((wall) => wall.id),
      )
      return
    }
    const moving = ridgeWalls.value.filter((wall) => wallIds.includes(wall.id))
    if (moving.length === 0) return
    const converted = moving.map((wall) =>
      unmarkWallAsRidge(wall, wallThicknessCm, deps.floorHeightCm()),
    )
    setRidgeWalls(
      removeWalls(
        ridgeWalls.value,
        moving.map((wall) => wall.id),
      ),
    )
    deps.setWalls([...deps.walls(), ...converted])
    detachRidgeWallGuids(
      deps.localPlan.value,
      moving.map((wall) => wall.id),
    )
  }

  function applyRidgeWallSplit(wallId: string, t: number): SplitWallResult | null {
    const result = splitWallAtT(ridgeWalls.value, wallId, t)
    if (!result) return null
    setRidgeWalls(result.walls)
    if (deps.localPlan.value) {
      applyRidgeWallRemaps(deps.localPlan.value, [
        { fromId: wallId, intoIds: [result.firstWallId, result.secondWallId] },
      ])
    }
    return result
  }

  function applyRidgeWallsDelete(wallIds: string[]): void {
    const ridgeIds = wallIds.filter((id) => isRidgeWallId(deps.localPlan.value, id))
    if (ridgeIds.length === 0) return
    setRidgeWalls(removeWalls(ridgeWalls.value, ridgeIds))
    if (deps.localPlan.value) {
      detachRidgeWallGuids(deps.localPlan.value, ridgeIds)
      pruneRidgeWalls(deps.localPlan.value)
    }
  }

  return {
    ridgeWalls,
    ridgeSurfaces,
    refsOnRidge,
    setRidgeWalls,
    setRidgeSurfaces,
    addRidgeSurface,
    updateRidgeSurface,
    removeRidgeSurface,
    applyRidgeZ,
    applyRidgeJunctionZ,
    applyRidgeAdd,
    applyRidgeFloor,
    ridgeFloorIndexForWall,
    applyWallKind,
    applyRidgeWallSplit,
    applyRidgeWallsDelete,
    isRidgeSurfaceId: (surfaceId: string) => isRidgeSurfaceId(deps.localPlan.value, surfaceId),
    isRidgeWallId: (wallId: string) => isRidgeWallId(deps.localPlan.value, wallId),
  }
}
