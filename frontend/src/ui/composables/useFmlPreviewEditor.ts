import { computed, ref, watch, type Ref } from 'vue'
import type { FloorItem, FloorPlan, Opening, Point2D, Wall } from '@/core/fml/types'
import {
  addRoomRect,
  addWallSegment,
  buildJunctions,
  findMergeTarget,
  JUNCTION_POINT_SNAP_CM,
  mergeJunctions,
  moveJunctionWithWallJoins,
  removeWall,
  removeWalls,
  setWallBalance,
  setWallThickness,
  setWallsBalance,
  setWallsThickness,
  slideWallSegmentAlongAxis,
  snapPointToJunctions,
  snapPointToWallCenters,
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
import { applyOpeningDragMove as applyOpeningDragMoveWalls } from '@/ui/components/fml-preview-opening-drag-geom'

const MAX_UNDO = 50

export type FmlPreviewUndoSnapshot = {
  walls: Wall[]
  items?: FloorItem[]
  /** Underlay origin bij nulpunt-edits; undefined = layout ongemoeid bij undo. */
  layoutOrigin?: Point2D | null
}

function clonePlan(plan: FloorPlan): FloorPlan {
  return JSON.parse(JSON.stringify(plan)) as FloorPlan
}

function cloneWallsSnapshot(walls: Wall[]): Wall[] {
  return JSON.parse(JSON.stringify(walls)) as Wall[]
}

export function useFmlPreviewEditor(plan: Ref<FloorPlan | null>, floorIndex: Ref<number>) {
  const localPlan = ref<FloorPlan | null>(null)
  const undoStack = ref<FmlPreviewUndoSnapshot[]>([])
  /** Layout die bij laatste nulpunt-undo hoort (parent sync). */
  const pendingUndoLayoutOrigin = ref<Point2D | null | undefined>(undefined)
  let skipNextPlanReset = false

  watch(
    plan,
    (value) => {
      if (skipNextPlanReset) {
        skipNextPlanReset = false
        // Floor-switch / clearWorkspace zet plan op null terwijl een parent-echo-skip
        // van de vorige verdieping nog open kan staan — nooit oude muren bewaren.
        if (value == null) {
          localPlan.value = null
          undoStack.value = []
          pendingUndoLayoutOrigin.value = undefined
        }
        return
      }
      localPlan.value = value ? clonePlan(value) : null
      undoStack.value = []
      pendingUndoLayoutOrigin.value = undefined
    },
    { immediate: true },
  )

  // Undo snapshots zijn walls van de actieve floor — bij switch niet op een andere floor toepassen.
  watch(floorIndex, () => {
    undoStack.value = []
    pendingUndoLayoutOrigin.value = undefined
  })

  function prepareParentSync(): void {
    skipNextPlanReset = true
  }

  /** Forceer localPlan (nulpunt-apply vanaf parent). */
  function replaceLocalPlan(
    plan: FloorPlan | null,
    options?: { keepUndo?: boolean; keepParentSyncSkip?: boolean },
  ): void {
    if (!options?.keepParentSyncSkip) skipNextPlanReset = false
    localPlan.value = plan ? clonePlan(plan) : null
    if (!options?.keepUndo) {
      undoStack.value = []
      pendingUndoLayoutOrigin.value = undefined
    }
  }

  const walls = computed(() => {
    const floor = localPlan.value?.floors[floorIndex.value] ?? localPlan.value?.floors[0]
    return floor?.walls ?? []
  })

  const junctions = computed(() => buildJunctions(walls.value))

  function pushUndo(options?: { layoutOrigin?: Point2D | null }): void {
    const floor = localPlan.value?.floors[floorIndex.value] ?? localPlan.value?.floors[0]
    const snapshot: FmlPreviewUndoSnapshot = {
      walls: JSON.parse(JSON.stringify(walls.value)) as Wall[],
      items: floor?.items ? (JSON.parse(JSON.stringify(floor.items)) as FloorItem[]) : undefined,
    }
    if (options && 'layoutOrigin' in options) {
      snapshot.layoutOrigin = options.layoutOrigin
        ? { x: options.layoutOrigin.x, y: options.layoutOrigin.y }
        : options.layoutOrigin
    }
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

  function setFloorGeometry(nextWalls: Wall[], nextItems?: FloorItem[]): void {
    if (!localPlan.value) return
    const idx = floorIndex.value
    localPlan.value = {
      ...localPlan.value,
      floors: localPlan.value.floors.map((floor, floorIdx) =>
        floorIdx === idx
          ? {
              ...floor,
              walls: nextWalls,
              items: nextItems !== undefined ? nextItems : floor.items,
            }
          : floor,
      ),
    }
  }

  function applyJunctionMove(node: JunctionNode, position: { x: number; y: number }): void {
    setWalls(moveJunctionWithWallJoins(walls.value, node, position))
  }

  function previewJunctionMove(
    baseWalls: Wall[],
    node: JunctionNode,
    position: { x: number; y: number },
  ): void {
    setWalls(moveJunctionWithWallJoins(baseWalls, node, position))
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
    patch: Partial<
      Pick<Opening, 't' | 'width' | 'z' | 'z_height' | 'mirrored' | 'bovenlicht' | 'refid'>
    >,
  ): void {
    setWalls(updateOpeningById(walls.value, openingId, patch))
  }

  /** Soft-t / segment-hop / sticky transfer tijdens openings-drag. */
  function applyOpeningDragMove(openingId: string, pointCm: Point2D): string | null {
    const result = applyOpeningDragMoveWalls(walls.value, openingId, pointCm)
    if (!result) return null
    if (result.walls !== walls.value) setWalls(result.walls)
    return result.openingId
  }

  /** @deprecated Prefer updateOpening */
  function updateDoorOpening(
    openingId: string,
    patch: Partial<
      Pick<Opening, 't' | 'width' | 'z' | 'z_height' | 'mirrored' | 'bovenlicht' | 'refid'>
    >,
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
    if (previous.items !== undefined) {
      setFloorGeometry(previous.walls, previous.items)
    } else {
      setWalls(previous.walls)
    }
    pendingUndoLayoutOrigin.value = 'layoutOrigin' in previous ? previous.layoutOrigin : undefined
    return true
  }

  function consumePendingUndoLayoutOrigin(): Point2D | null | undefined {
    const value = pendingUndoLayoutOrigin.value
    pendingUndoLayoutOrigin.value = undefined
    return value
  }

  function canUndo(): boolean {
    return undoStack.value.length > 0
  }

  const canUndoEdit = computed(() => undoStack.value.length > 0)

  return {
    localPlan,
    floorIndex,
    walls,
    junctions,
    pushUndo,
    prepareParentSync,
    replaceLocalPlan,
    consumePendingUndoLayoutOrigin,
    setFloorGeometry,
    addWallSegment,
    applyJunctionMove,
    previewJunctionMove,
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
    applyOpeningDragMove,
    removeOpenings,
    removeDoorOpenings,
    findMergeTarget: (sourceRefs: WallEndRef[], position: { x: number; y: number }) =>
      findMergeTarget(junctions.value, sourceRefs, position),
    snapJunctionPoint: (
      refs: WallEndRef[],
      candidate: { x: number; y: number },
      snapWalls?: Wall[],
    ) => {
      const sourceWalls = snapWalls ?? walls.value
      const axisSnap = snapToNearbyEndpointAxes(sourceWalls, refs, candidate)
      const sourceId = stableJunctionId(refs)
      const sourceJunctions = snapWalls ? buildJunctions(snapWalls) : junctions.value
      const otherJunctions = sourceJunctions.filter((item) => item.id !== sourceId)
      const junctionSnap = snapPointToJunctions(otherJunctions, axisSnap, JUNCTION_POINT_SNAP_CM)
      const exclude = new Set(refs.map((ref) => ref.wallId))
      return snapPointToWallCenters(sourceWalls, junctionSnap, JUNCTION_POINT_SNAP_CM, exclude)
    },
    undo,
    canUndo,
    canUndoEdit,
  }
}
