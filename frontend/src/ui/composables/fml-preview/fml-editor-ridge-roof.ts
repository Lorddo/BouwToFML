import { computed, type Ref } from 'vue'
import type { FloorPlan, FloorSurface, Point2D, Wall } from '@/core/fml/types'
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
  listRidgeSurfacesOnFloor,
  listRidgeSurfacesOnPlan,
  mapRidgeSurfaceOnPlan,
  markRoofSurfaceManual,
  resolveRoofSurfaceColor,
  removeRidgeSurfaceOnPlan,
  setRidgeSurfacesOnFloor,
  syncRoofPlaneGuidsFromDesigns,
} from '@/core/fml/roof-planes'
import {
  addRidgeSegment,
  removeWalls,
  splitWallAtT,
  type SplitWallResult,
  type WallEndRef,
} from '@/ui/components/fml-preview-junctions'

export interface FmlEditorRidgeRoofDeps {
  localPlan: Ref<FloorPlan | null>
  floorIndex: Ref<number>
  walls: () => Wall[]
  floorHeightCm: () => number
  setWalls: (next: Wall[]) => void
}

export function createFmlEditorRidgeRoof(deps: FmlEditorRidgeRoofDeps) {
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

  function addRidgeSurface(surface: FloorSurface): string {
    const next = markRoofSurfaceManual({
      ...surface,
      isRoof: true,
      color: resolveRoofSurfaceColor(surface.color),
    })
    const floor = deps.localPlan.value?.floors[deps.floorIndex.value]
    setRidgeSurfaces([...listRidgeSurfacesOnFloor(floor), next])
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
      >
    >,
  ): void {
    if (!deps.localPlan.value) return
    deps.localPlan.value = mapRidgeSurfaceOnPlan(deps.localPlan.value, surfaceId, (surface) =>
      markRoofSurfaceManual({ ...surface, ...patch, isRoof: true }),
    )
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
