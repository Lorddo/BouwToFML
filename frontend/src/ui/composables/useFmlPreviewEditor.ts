import { computed, ref, watch, type Ref } from 'vue'
import type {
  FloorArea,
  FloorDesign,
  FloorDimension,
  FloorItem,
  FloorLabel,
  FloorLine,
  FloorPlan,
  FloorSurface,
  Opening,
  Point2D,
  Wall,
} from '@/core/fml/types'
import { switchFloorDesign } from '@/core/fml/design-sync'
import { DEFAULT_FML_WALL_HEIGHT_CM } from '@/core/fml/extraction-to-plan-types'
import { sanitizeFmlWalls, wallsSanitizeChanged } from '@/core/fml/sanitize-fml-walls'
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
  setJunctionHeight,
  setWallBalance,
  setWallThickness,
  setWallsBalance,
  setWallsHeight,
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
import { regenerateFloorAreas } from '@/ui/composables/fml-preview/regenerate-floor-areas'

const MAX_UNDO = 50

export type FmlPreviewUndoSnapshot = {
  walls: Wall[]
  items?: FloorItem[]
  areas?: FloorArea[]
  surfaces?: FloorSurface[]
  labels?: FloorLabel[]
  lines?: FloorLine[]
  dimensions?: FloorDimension[]
  designs?: FloorDesign[]
  activeDesignIndex?: number
  /** Underlay origin bij nulpunt-edits; undefined = layout ongemoeid bij undo. */
  layoutOrigin?: Point2D | null
}

function clonePlan(plan: FloorPlan): FloorPlan {
  return JSON.parse(JSON.stringify(plan)) as FloorPlan
}

function cloneWallsSnapshot(walls: Wall[]): Wall[] {
  return JSON.parse(JSON.stringify(walls)) as Wall[]
}

function shortGuid(): string {
  return Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, '0')
}

export function useFmlPreviewEditor(plan: Ref<FloorPlan | null>, floorIndex: Ref<number>) {
  const localPlan = ref<FloorPlan | null>(null)
  const undoStack = ref<FmlPreviewUndoSnapshot[]>([])
  const redoStack = ref<FmlPreviewUndoSnapshot[]>([])
  /** Layout die bij laatste nulpunt-undo hoort (parent sync). */
  const pendingUndoLayoutOrigin = ref<Point2D | null | undefined>(undefined)
  let skipNextPlanReset = false
  let areaRegenTimer: ReturnType<typeof setTimeout> | null = null

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
          redoStack.value = []
          pendingUndoLayoutOrigin.value = undefined
        }
        return
      }
      localPlan.value = value ? clonePlan(value) : null
      undoStack.value = []
      redoStack.value = []
      pendingUndoLayoutOrigin.value = undefined
    },
    { immediate: true },
  )

  // Undo snapshots zijn walls van de actieve floor — bij switch niet op een andere floor toepassen.
  watch(floorIndex, () => {
    undoStack.value = []
    redoStack.value = []
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
      redoStack.value = []
      pendingUndoLayoutOrigin.value = undefined
    }
  }

  const walls = computed(() => {
    const floor = localPlan.value?.floors[floorIndex.value] ?? localPlan.value?.floors[0]
    return floor?.walls ?? []
  })

  const items = computed(() => {
    const floor = localPlan.value?.floors[floorIndex.value] ?? localPlan.value?.floors[0]
    return floor?.items ?? []
  })

  const floorHeightCm = computed(() => {
    const floor = localPlan.value?.floors[floorIndex.value] ?? localPlan.value?.floors[0]
    const height = floor?.height
    return typeof height === 'number' && Number.isFinite(height) && height > 0
      ? height
      : DEFAULT_FML_WALL_HEIGHT_CM
  })

  const areas = computed(() => {
    const floor = localPlan.value?.floors[floorIndex.value] ?? localPlan.value?.floors[0]
    return floor?.areas ?? []
  })

  const surfaces = computed(() => {
    const floor = localPlan.value?.floors[floorIndex.value] ?? localPlan.value?.floors[0]
    return floor?.surfaces ?? []
  })

  const labels = computed(() => {
    const floor = localPlan.value?.floors[floorIndex.value] ?? localPlan.value?.floors[0]
    return floor?.labels ?? []
  })

  const lines = computed(() => {
    const floor = localPlan.value?.floors[floorIndex.value] ?? localPlan.value?.floors[0]
    return floor?.lines ?? []
  })

  const dimensions = computed(() => {
    const floor = localPlan.value?.floors[floorIndex.value] ?? localPlan.value?.floors[0]
    return floor?.dimensions ?? []
  })

  const designs = computed(() => {
    const floor = localPlan.value?.floors[floorIndex.value] ?? localPlan.value?.floors[0]
    return floor?.designs ?? []
  })

  const activeDesignIndex = computed(() => {
    const floor = localPlan.value?.floors[floorIndex.value] ?? localPlan.value?.floors[0]
    return floor?.activeDesignIndex ?? 0
  })

  const junctions = computed(() => buildJunctions(walls.value))

  function patchActiveFloor(
    patch: Partial<{
      walls: Wall[]
      items: FloorItem[] | undefined
      areas: FloorArea[] | undefined
      surfaces: FloorSurface[] | undefined
      labels: FloorLabel[] | undefined
      lines: FloorLine[] | undefined
      dimensions: FloorDimension[] | undefined
      designs: FloorDesign[] | undefined
      activeDesignIndex: number | undefined
    }>,
  ): void {
    if (!localPlan.value) return
    const idx = floorIndex.value
    localPlan.value = {
      ...localPlan.value,
      floors: localPlan.value.floors.map((floor, floorIdx) =>
        floorIdx === idx ? { ...floor, ...patch } : floor,
      ),
    }
  }

  function regenerateAreasNow(): void {
    if (!localPlan.value) return
    const idx = floorIndex.value
    const floor = localPlan.value.floors[idx] ?? localPlan.value.floors[0]
    if (!floor) return
    const next = regenerateFloorAreas(floor)
    if (next === floor) return
    patchActiveFloor({ areas: next.areas })
  }

  function scheduleAreaRegen(): void {
    if (areaRegenTimer != null) clearTimeout(areaRegenTimer)
    areaRegenTimer = setTimeout(() => {
      areaRegenTimer = null
      regenerateAreasNow()
    }, 80)
  }

  /** Sync vóór download / room-draw: flush pending regen. */
  function flushAreaRegen(): void {
    if (areaRegenTimer != null) {
      clearTimeout(areaRegenTimer)
      areaRegenTimer = null
    }
    regenerateAreasNow()
  }

  function captureSnapshot(options?: { layoutOrigin?: Point2D | null }): FmlPreviewUndoSnapshot {
    const floor = localPlan.value?.floors[floorIndex.value] ?? localPlan.value?.floors[0]
    const snapshot: FmlPreviewUndoSnapshot = {
      walls: JSON.parse(JSON.stringify(walls.value)) as Wall[],
      items: floor?.items ? (JSON.parse(JSON.stringify(floor.items)) as FloorItem[]) : undefined,
      areas: floor?.areas ? (JSON.parse(JSON.stringify(floor.areas)) as FloorArea[]) : undefined,
      surfaces: floor?.surfaces
        ? (JSON.parse(JSON.stringify(floor.surfaces)) as FloorSurface[])
        : undefined,
      labels: floor?.labels
        ? (JSON.parse(JSON.stringify(floor.labels)) as FloorLabel[])
        : undefined,
      lines: floor?.lines ? (JSON.parse(JSON.stringify(floor.lines)) as FloorLine[]) : undefined,
      dimensions: floor?.dimensions
        ? (JSON.parse(JSON.stringify(floor.dimensions)) as FloorDimension[])
        : undefined,
      designs: floor?.designs
        ? (JSON.parse(JSON.stringify(floor.designs)) as FloorDesign[])
        : undefined,
      activeDesignIndex: floor?.activeDesignIndex,
    }
    if (options && 'layoutOrigin' in options) {
      snapshot.layoutOrigin = options.layoutOrigin
        ? { x: options.layoutOrigin.x, y: options.layoutOrigin.y }
        : options.layoutOrigin
    }
    return snapshot
  }

  function applySnapshot(snapshot: FmlPreviewUndoSnapshot): void {
    patchActiveFloor({
      walls: snapshot.walls,
      items: snapshot.items,
      areas: snapshot.areas,
      surfaces: snapshot.surfaces,
      labels: snapshot.labels,
      lines: snapshot.lines,
      dimensions: snapshot.dimensions,
      designs: snapshot.designs,
      activeDesignIndex: snapshot.activeDesignIndex,
    })
    pendingUndoLayoutOrigin.value = 'layoutOrigin' in snapshot ? snapshot.layoutOrigin : undefined
  }

  function pushUndo(options?: { layoutOrigin?: Point2D | null }): void {
    undoStack.value = [...undoStack.value.slice(-(MAX_UNDO - 1)), captureSnapshot(options)]
    redoStack.value = []
  }

  function setWalls(nextWalls: Wall[]): void {
    if (!localPlan.value) return
    patchActiveFloor({ walls: nextWalls })
    scheduleAreaRegen()
  }

  function setFloorItems(nextItems: FloorItem[] | undefined): void {
    if (!localPlan.value) return
    patchActiveFloor({ items: nextItems })
  }

  function addItem(item: Omit<FloorItem, 'guid'> & { guid?: string }): string {
    const guid = item.guid?.trim() || crypto.randomUUID()
    setFloorItems([...items.value, { ...item, guid }])
    return guid
  }

  function updateItem(guid: string, patch: Partial<Omit<FloorItem, 'guid'>>): void {
    const next = items.value.map((entry) => (entry.guid === guid ? { ...entry, ...patch } : entry))
    setFloorItems(next)
  }

  function removeItem(guid: string): void {
    const next = items.value.filter((entry) => entry.guid !== guid)
    setFloorItems(next.length > 0 ? next : undefined)
  }

  function applyItemDrag(guid: string, cm: Point2D): void {
    updateItem(guid, { x: cm.x, y: cm.y })
  }

  function setFloorGeometry(nextWalls: Wall[], nextItems?: FloorItem[]): void {
    if (!localPlan.value) return
    const floor = localPlan.value.floors[floorIndex.value] ?? localPlan.value.floors[0]
    patchActiveFloor({
      walls: nextWalls,
      items: nextItems !== undefined ? nextItems : floor?.items,
    })
    scheduleAreaRegen()
  }

  function setFloorAreas(nextAreas: FloorArea[] | undefined): void {
    patchActiveFloor({ areas: nextAreas })
  }

  function setFloorSurfaces(nextSurfaces: FloorSurface[] | undefined): void {
    patchActiveFloor({ surfaces: nextSurfaces })
  }

  function updateArea(
    areaId: string,
    patch: Partial<
      Pick<
        FloorArea,
        'role' | 'name' | 'customName' | 'color' | 'showAreaLabel' | 'name_x' | 'name_y' | 'poly'
      >
    >,
  ): void {
    const next = areas.value.map((area) => (area.id === areaId ? { ...area, ...patch } : area))
    setFloorAreas(next)
  }

  function removeArea(areaId: string): void {
    const next = areas.value.filter((area) => area.id !== areaId)
    setFloorAreas(next.length > 0 ? next : undefined)
  }

  function addSurface(surface: Omit<FloorSurface, 'id'> & { id?: string }): string {
    const id = surface.id?.trim() || `surface-${shortGuid()}`
    const next: FloorSurface = { ...surface, id }
    setFloorSurfaces([...surfaces.value, next])
    return id
  }

  function updateSurface(
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
        | 'pattern'
      >
    >,
  ): void {
    const next = surfaces.value.map((s) => (s.id === surfaceId ? { ...s, ...patch } : s))
    setFloorSurfaces(next)
  }

  function removeSurface(surfaceId: string): void {
    const next = surfaces.value.filter((s) => s.id !== surfaceId)
    setFloorSurfaces(next.length > 0 ? next : undefined)
  }

  function setFloorLabels(nextLabels: FloorLabel[] | undefined): void {
    patchActiveFloor({ labels: nextLabels })
  }

  function setFloorLines(nextLines: FloorLine[] | undefined): void {
    patchActiveFloor({ lines: nextLines })
  }

  function addLabel(label: Omit<FloorLabel, 'id'> & { id?: string }): string {
    const id = label.id?.trim() || `label-${shortGuid()}`
    const next: FloorLabel = { ...label, id }
    setFloorLabels([...labels.value, next])
    return id
  }

  function updateLabel(
    labelId: string,
    patch: Partial<Pick<FloorLabel, 'text' | 'x' | 'y'>>,
  ): void {
    const next = labels.value.map((l) => (l.id === labelId ? { ...l, ...patch } : l))
    setFloorLabels(next)
  }

  function removeLabel(labelId: string): void {
    const next = labels.value.filter((l) => l.id !== labelId)
    setFloorLabels(next.length > 0 ? next : undefined)
  }

  function addLine(line: Omit<FloorLine, 'id'> & { id?: string }): string {
    const id = line.id?.trim() || `line-${shortGuid()}`
    const next: FloorLine = { ...line, id }
    setFloorLines([...lines.value, next])
    return id
  }

  function removeLine(lineId: string): void {
    const next = lines.value.filter((l) => l.id !== lineId)
    setFloorLines(next.length > 0 ? next : undefined)
  }

  function setActiveDesignIndex(designIndex: number): void {
    if (!localPlan.value) return
    const idx = floorIndex.value
    const floor = localPlan.value.floors[idx]
    if (!floor) return
    const switched = switchFloorDesign(floor, designIndex)
    localPlan.value = {
      ...localPlan.value,
      floors: localPlan.value.floors.map((f, i) => (i === idx ? switched : f)),
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

  function applyWallsHeight(wallIds: string[], heightCm: number): void {
    setWalls(setWallsHeight(walls.value, wallIds, heightCm, floorHeightCm.value))
  }

  function applyJunctionHeight(refs: ReadonlyArray<WallEndRef>, heightCm: number): void {
    setWalls(setJunctionHeight(walls.value, refs, heightCm, floorHeightCm.value))
  }

  function applyWallSplit(wallId: string, t: number): SplitWallResult | null {
    const result = splitWallAtT(walls.value, wallId, t)
    if (!result) return null
    setWalls(result.walls)
    return result
  }

  function applyWallSlideAlongAxis(wallId: string, deltaT: number, slideDir: Point2D): void {
    setWalls(slideWallSegmentAlongAxis(walls.value, wallId, deltaT, slideDir))
  }

  function previewWallSlideAlongAxis(
    baseWalls: Wall[],
    wallId: string,
    deltaT: number,
    slideDir: Point2D,
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

  function applyWallsSanitize(): boolean {
    const next = sanitizeFmlWalls(walls.value)
    if (!wallsSanitizeChanged(walls.value, next)) return false
    pushUndo()
    setWalls(next)
    flushAreaRegen()
    return true
  }

  function applyWallAdd(a: Point2D, b: Point2D, thicknessCm: number): string | null {
    const result = addWallSegment(walls.value, a, b, thicknessCm, floorHeightCm.value)
    if (!result) return null
    setWalls(result.walls)
    return result.wallId
  }

  function applyRoomRect(corners: readonly Point2D[], thicknessCm: number): string[] | null {
    const result = addRoomRect(walls.value, corners, thicknessCm, floorHeightCm.value)
    if (!result) return null
    setWalls(result.walls)
    flushAreaRegen()
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
      Pick<
        Opening,
        | 't'
        | 'width'
        | 'z'
        | 'z_height'
        | 'mirrored'
        | 'bovenlicht'
        | 'bovenlichtHeightCm'
        | 'bovenlichtGapCm'
        | 'refid'
      >
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
      Pick<
        Opening,
        | 't'
        | 'width'
        | 'z'
        | 'z_height'
        | 'mirrored'
        | 'bovenlicht'
        | 'bovenlichtHeightCm'
        | 'bovenlichtGapCm'
        | 'refid'
      >
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
    redoStack.value = [...redoStack.value, captureSnapshot()]
    applySnapshot(previous)
    return true
  }

  function redo(): boolean {
    const next = redoStack.value.pop()
    if (!next) return false
    undoStack.value = [...undoStack.value.slice(-(MAX_UNDO - 1)), captureSnapshot()]
    applySnapshot(next)
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

  function canRedo(): boolean {
    return redoStack.value.length > 0
  }

  const canUndoEdit = computed(() => undoStack.value.length > 0)
  const canRedoEdit = computed(() => redoStack.value.length > 0)

  return {
    localPlan,
    floorIndex,
    walls,
    items,
    floorHeightCm,
    areas,
    surfaces,
    labels,
    lines,
    dimensions,
    designs,
    activeDesignIndex,
    junctions,
    pushUndo,
    prepareParentSync,
    replaceLocalPlan,
    consumePendingUndoLayoutOrigin,
    setFloorGeometry,
    addItem,
    updateItem,
    removeItem,
    applyItemDrag,
    flushAreaRegen,
    updateArea,
    removeArea,
    addSurface,
    updateSurface,
    removeSurface,
    addLabel,
    updateLabel,
    removeLabel,
    addLine,
    removeLine,
    setActiveDesignIndex,
    addWallSegment,
    applyJunctionMove,
    previewJunctionMove,
    applyJunctionMerge,
    applyWallThickness,
    applyWallsThickness,
    applyWallsHeight,
    applyJunctionHeight,
    applyWallSplit,
    applyWallSlideAlongAxis,
    previewWallSlideAlongAxis,
    applyWallBalance,
    applyWallsBalance,
    applyWallDelete,
    applyWallsDelete,
    applyWallsSanitize,
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
    redo,
    canUndo,
    canRedo,
    canUndoEdit,
    canRedoEdit,
  }
}
