import { computed, ref, watch, type Ref } from 'vue'
import type { FloorPlan, Opening, Point2D, Wall } from '@/core/fml/types'
import {
  addRoomRect,
  addWallSegment,
  buildJunctions,
  findMergeTarget,
  mergeJunctions,
  moveJunction,
  removeWall,
  removeWalls,
  setWallBalance,
  setWallThickness,
  setWallsBalance,
  setWallsThickness,
  slideWallSegmentAlongAxis,
  snapPointToJunctions,
  snapToNearbyEndpointAxes,
  stableJunctionId,
  splitWallAtT,
  type JunctionNode,
  type SplitWallResult,
  type WallEndRef,
} from '@/ui/components/fml-preview-junctions'
import {
  addOpeningToWall,
  buildOpeningId,
  findOpeningById,
  removeOpeningsById,
  updateOpeningById,
  type OpeningLocation,
} from '@/ui/components/fml-preview-openings'

const MAX_UNDO = 50

function clonePlan(plan: FloorPlan): FloorPlan {
  return JSON.parse(JSON.stringify(plan)) as FloorPlan
}

function cloneWallsSnapshot(walls: Wall[]): Wall[] {
  return JSON.parse(JSON.stringify(walls)) as Wall[]
}

export function useFmlPreviewEditor(plan: Ref<FloorPlan | null>, floorIndex: Ref<number>) {
  const localPlan = ref<FloorPlan | null>(null)
  const undoStack = ref<Wall[][]>([])
  let skipNextPlanReset = false

  watch(
    plan,
    (value) => {
      if (skipNextPlanReset) {
        skipNextPlanReset = false
        return
      }
      localPlan.value = value ? clonePlan(value) : null
      undoStack.value = []
    },
    { immediate: true },
  )

  function prepareParentSync(): void {
    skipNextPlanReset = true
  }

  const walls = computed(() => {
    const floor = localPlan.value?.floors[floorIndex.value] ?? localPlan.value?.floors[0]
    return floor?.walls ?? []
  })

  const junctions = computed(() => buildJunctions(walls.value))

  function pushUndo(): void {
    const snapshot = JSON.parse(JSON.stringify(walls.value)) as Wall[]
    undoStack.value = [...undoStack.value.slice(-(MAX_UNDO - 1)), snapshot]
  }

  function setWalls(nextWalls: Wall[]): void {
    if (!localPlan.value) return
    const idx = floorIndex.value
    localPlan.value = {
      ...localPlan.value,
      floors: localPlan.value.floors.map((floor, floorIdx) =>
        floorIdx === idx ? { ...floor, walls: nextWalls } : floor,
      ),
    }
  }

  function applyJunctionMove(node: JunctionNode, position: { x: number; y: number }): void {
    setWalls(moveJunction(walls.value, node, position))
  }

  function applyJunctionMerge(source: JunctionNode, target: JunctionNode): void {
    setWalls(mergeJunctions(walls.value, source, target))
  }

  function applyWallThickness(wallId: string, thicknessCm: number): void {
    setWalls(setWallThickness(walls.value, wallId, thicknessCm))
  }

  function applyWallsThickness(wallIds: string[], thicknessCm: number): void {
    setWalls(setWallsThickness(walls.value, wallIds, thicknessCm))
  }

  function applyWallSplit(wallId: string, tSplit = 0.5): SplitWallResult | null {
    const result = splitWallAtT(walls.value, wallId, tSplit)
    if (!result) return null
    setWalls(result.walls)
    return result
  }

  function applyWallSlideAlongAxis(wallId: string, deltaT: number, slideDir?: Point2D): void {
    if (deltaT === 0) return
    setWalls(slideWallSegmentAlongAxis(walls.value, wallId, deltaT, slideDir))
  }

  function previewWallSlideAlongAxis(
    baseWalls: Wall[],
    wallId: string,
    deltaT: number,
    slideDir?: Point2D,
  ): void {
    if (deltaT === 0) {
      setWalls(cloneWallsSnapshot(baseWalls))
      return
    }
    setWalls(slideWallSegmentAlongAxis(baseWalls, wallId, deltaT, slideDir))
  }

  function applyWallBalance(wallId: string, balance: number): void {
    setWalls(setWallBalance(walls.value, wallId, balance))
  }

  function applyWallsBalance(wallIds: string[], balance: number): void {
    setWalls(setWallsBalance(walls.value, wallIds, balance))
  }

  function applyWallDelete(wallId: string): void {
    setWalls(removeWall(walls.value, wallId))
  }

  function applyWallsDelete(wallIds: string[]): void {
    setWalls(removeWalls(walls.value, wallIds))
  }

  function applyWallAdd(a: Point2D, b: Point2D, thicknessCm: number): string | null {
    const result = addWallSegment(walls.value, a, b, thicknessCm)
    if (!result) return null
    setWalls(result.walls)
    return result.wallId
  }

  function applyRoomRect(corners: readonly Point2D[], thicknessCm: number): string[] | null {
    const result = addRoomRect(walls.value, corners, thicknessCm)
    if (!result) return null
    setWalls(result.walls)
    return result.wallIds
  }

  function applyOpeningAdd(wallId: string, opening: Opening): string | null {
    const nextWalls = addOpeningToWall(walls.value, wallId, opening)
    if (nextWalls === walls.value) return null
    const updatedWall = nextWalls.find((wall) => wall.id === wallId)
    const added = updatedWall?.openings[updatedWall.openings.length - 1]
    if (!updatedWall || !added) return null
    setWalls(nextWalls)
    return buildOpeningId(wallId, added, updatedWall.openings.length - 1)
  }

  function resolveOpening(openingId: string): OpeningLocation | null {
    return findOpeningById(walls.value, openingId)
  }

  /** @deprecated Prefer resolveOpening */
  function resolveDoorOpening(openingId: string): OpeningLocation | null {
    return resolveOpening(openingId)
  }

  function updateOpening(
    openingId: string,
    patch: Partial<Pick<Opening, 't' | 'width' | 'z' | 'z_height' | 'mirrored'>>,
  ): void {
    setWalls(updateOpeningById(walls.value, openingId, patch))
  }

  /** @deprecated Prefer updateOpening */
  function updateDoorOpening(
    openingId: string,
    patch: Partial<Pick<Opening, 't' | 'width' | 'z' | 'z_height' | 'mirrored'>>,
  ): void {
    updateOpening(openingId, patch)
  }

  function removeOpenings(openingIds: string[]): void {
    setWalls(removeOpeningsById(walls.value, openingIds))
  }

  /** @deprecated Prefer removeOpenings */
  function removeDoorOpenings(openingIds: string[]): void {
    removeOpenings(openingIds)
  }

  function undo(): boolean {
    const previous = undoStack.value.pop()
    if (!previous) return false
    setWalls(previous)
    return true
  }

  function canUndo(): boolean {
    return undoStack.value.length > 0
  }

  const canUndoEdit = computed(() => undoStack.value.length > 0)

  return {
    localPlan,
    walls,
    junctions,
    pushUndo,
    prepareParentSync,
    addWallSegment,
    applyJunctionMove,
    applyJunctionMerge,
    applyWallThickness,
    applyWallsThickness,
    applyWallSplit,
    applyWallSlideAlongAxis,
    previewWallSlideAlongAxis,
    applyWallBalance,
    applyWallsBalance,
    applyWallDelete,
    applyWallsDelete,
    applyWallAdd,
    applyRoomRect,
    applyOpeningAdd,
    resolveOpening,
    resolveDoorOpening,
    updateOpening,
    updateDoorOpening,
    removeOpenings,
    removeDoorOpenings,
    findMergeTarget: (sourceRefs: WallEndRef[], position: { x: number; y: number }) =>
      findMergeTarget(junctions.value, sourceRefs, position),
    snapJunctionPoint: (refs: WallEndRef[], candidate: { x: number; y: number }) => {
      const axisSnap = snapToNearbyEndpointAxes(walls.value, refs, candidate)
      const sourceId = stableJunctionId(refs)
      const otherJunctions = junctions.value.filter((item) => item.id !== sourceId)
      return snapPointToJunctions(otherJunctions, axisSnap, 4)
    },
    undo,
    canUndo,
    canUndoEdit,
  }
}
