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
import { readBtfSlices, writeBtfSlices, type BtfSlice } from '@/core/fml/btf-slices'
import { DEFAULT_FML_WALL_HEIGHT_CM } from '@/core/fml/extraction-to-plan-types'
import { sanitizeFmlWallsDetailed, wallsSanitizeChanged } from '@/core/fml/sanitize-fml-walls'
import { isStampOwnedWall } from '@/core/fml/stamp-owned'
import { resolveStampOwnership } from '@/core/fml/resolve-stamp-ownership'
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
import { applyStampToFloor, canApplyStampToFloor } from '@/core/fml/apply-stamp-to-floor'
import {
  applyFacadeGroupRemaps,
  assignWallsToGroup,
  assignWallsToStamp,
  createFacadeGroup,
  detachWalls,
  detachWallsFromFacade,
  detachWallsFromStamp,
  ensureStampFacadeGroup,
  listFacadeGroups,
  pruneFacadeGroups,
  remapFacadeGroupWallIds,
  renameFacadeGroup,
  type FacadeGroup,
  type FacadeGroupCreateInput,
} from '@/core/fml/facade-groups'
import { materializeEndpointJoinsAtPoint } from '@/ui/components/fml-preview-wall-draw-geom'

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
  /** Project-source (facadeGroups e.d.); null = expliciet wissen. */
  planSource?: FloorPlan['source'] | null
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

export function useFmlPreviewEditor(
  plan: Ref<FloorPlan | null>,
  floorIndex: Ref<number>,
  options?: {
    /** Editor + workspace-detectie: vaste Stempel-groep in settings.facadeGroups. */
    ensureStampPreset?: Ref<boolean> | { readonly value: boolean }
  },
) {
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
      if (localPlan.value && options?.ensureStampPreset?.value === true) {
        ensureStampFacadeGroup(localPlan.value)
      }
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
    optionsReplace?: { keepUndo?: boolean; keepParentSyncSkip?: boolean },
  ): void {
    if (!optionsReplace?.keepParentSyncSkip) skipNextPlanReset = false
    localPlan.value = plan ? clonePlan(plan) : null
    if (localPlan.value && options?.ensureStampPreset?.value === true) {
      ensureStampFacadeGroup(localPlan.value)
    }
    if (!optionsReplace?.keepUndo) {
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
      planSource: localPlan.value?.source
        ? (JSON.parse(JSON.stringify(localPlan.value.source)) as FloorPlan['source'])
        : null,
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
    if (localPlan.value && 'planSource' in snapshot) {
      localPlan.value = {
        ...localPlan.value,
        source: snapshot.planSource ?? undefined,
      }
    }
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
    patch: Partial<
      Pick<
        FloorLabel,
        'text' | 'x' | 'y' | 'fontSize' | 'fontColor' | 'outline' | 'bold' | 'italic'
      >
    >,
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

  function updateLine(
    lineId: string,
    patch: Partial<Pick<FloorLine, 'type' | 'color' | 'thickness'>>,
  ): void {
    const next = lines.value.map((l) => (l.id === lineId ? { ...l, ...patch } : l))
    setFloorLines(next)
  }

  function removeLine(lineId: string): void {
    const next = lines.value.filter((l) => l.id !== lineId)
    setFloorLines(next.length > 0 ? next : undefined)
  }

  function setFloorDimensions(next: FloorDimension[] | undefined): void {
    patchActiveFloor({ dimensions: next })
  }

  function addDimension(dim: Omit<FloorDimension, 'id'> & { id?: string }): string {
    const id = dim.id?.trim() || `dim-${shortGuid()}`
    const next: FloorDimension = { ...dim, id, type: 'custom_dimension' }
    setFloorDimensions([...(dimensions.value ?? []), next])
    return id
  }

  function removeDimension(dimensionId: string): void {
    const next = (dimensions.value ?? []).filter((d) => d.id !== dimensionId)
    setFloorDimensions(next.length > 0 ? next : undefined)
  }

  const btfSlices = computed(() => readBtfSlices(localPlan.value?.floors[floorIndex.value]))

  function setBtfSlices(slices: BtfSlice[]): void {
    if (!localPlan.value) return
    localPlan.value = writeBtfSlices(localPlan.value, slices, floorIndex.value)
  }

  function addBtfSlice(slice: BtfSlice): number {
    const next = [...btfSlices.value, { m: { ...slice.m }, p: { ...slice.p } }]
    setBtfSlices(next)
    return next.length - 1
  }

  function updateBtfSlice(index: number, slice: BtfSlice): void {
    if (index < 0 || index >= btfSlices.value.length) return
    const next = btfSlices.value.map((s, i) =>
      i === index ? { m: { ...slice.m }, p: { ...slice.p } } : s,
    )
    setBtfSlices(next)
  }

  function clearBtfSlices(): void {
    setBtfSlices([])
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
    if (localPlan.value) {
      remapFacadeGroupWallIds(localPlan.value, wallId, [result.firstWallId, result.secondWallId])
    }
    return result
  }

  function applyWallsDelete(wallIds: string[]): void {
    setWalls(removeWalls(walls.value, wallIds))
    if (localPlan.value) detachWalls(localPlan.value, wallIds)
  }

  function facadeGroups(): FacadeGroup[] {
    return listFacadeGroups(localPlan.value)
  }

  function applyFacadeAssign(groupId: string, wallGuids: readonly string[]): void {
    if (!localPlan.value) return
    assignWallsToGroup(localPlan.value, groupId, wallGuids)
  }

  function applyFacadeDetach(wallGuids: readonly string[]): void {
    if (!localPlan.value) return
    detachWallsFromFacade(localPlan.value, wallGuids)
  }

  function applyStampAssign(wallGuids: readonly string[]): void {
    if (!localPlan.value) return
    assignWallsToStamp(localPlan.value, wallGuids)
  }

  function applyStampDetach(wallGuids: readonly string[]): void {
    if (!localPlan.value) return
    detachWallsFromStamp(localPlan.value, wallGuids)
  }

  function applyFacadeCreate(
    input: FacadeGroupCreateInput,
    wallGuids?: readonly string[],
  ): FacadeGroup | null {
    if (!localPlan.value) return null
    const group = createFacadeGroup(localPlan.value, input)
    if (wallGuids && wallGuids.length > 0) {
      assignWallsToGroup(localPlan.value, group.id, wallGuids)
    }
    return listFacadeGroups(localPlan.value).find((g) => g.id === group.id) ?? group
  }

  function applyFacadeRename(
    groupId: string,
    patch: { name?: string; code?: string },
  ): FacadeGroup | null {
    if (!localPlan.value) return null
    return renameFacadeGroup(localPlan.value, groupId, patch)
  }

  /** Stempelmuren van andere floors → actieve floor (zelfde a/b t.o.v. nulpunt). */
  function applyStampToActiveFloor(): boolean {
    if (!localPlan.value) return false
    if (!canApplyStampToFloor(localPlan.value, floorIndex.value)) return false
    pushUndo()
    const result = applyStampToFloor(localPlan.value, floorIndex.value)
    if (result.addedWallIds.length === 0) {
      undoStack.value.pop()
      return false
    }
    localPlan.value = result.plan
    const nextWalls = [...(localPlan.value.floors[floorIndex.value]?.walls ?? [])]
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
    patchActiveFloor({ walls: nextWalls })
    flushAreaRegen()
    return true
  }

  function canApplyStampOnActiveFloor(): boolean {
    return canApplyStampToFloor(localPlan.value, floorIndex.value)
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
    if (localPlan.value) detachWalls(localPlan.value, [wallId])
  }

  function applyWallsSanitize(): boolean {
    let working = walls.value
    if (working.some(isStampOwnedWall)) {
      working = resolveStampOwnership(working).walls
    }
    const detailed = sanitizeFmlWallsDetailed(working)
    if (!wallsSanitizeChanged(walls.value, detailed.walls)) return false
    pushUndo()
    setWalls(detailed.walls)
    if (localPlan.value) {
      applyFacadeGroupRemaps(localPlan.value, detailed.remaps)
      pruneFacadeGroups(localPlan.value)
    }
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
    updateLine,
    removeLine,
    setFloorDimensions,
    addDimension,
    removeDimension,
    btfSlices,
    setBtfSlices,
    addBtfSlice,
    updateBtfSlice,
    clearBtfSlices,
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
    facadeGroups,
    applyFacadeAssign,
    applyFacadeDetach,
    applyStampAssign,
    applyStampDetach,
    applyFacadeCreate,
    applyFacadeRename,
    applyStampToActiveFloor,
    canApplyStampOnActiveFloor,
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
