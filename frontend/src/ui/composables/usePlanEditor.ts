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
} from '@/core/plan/types'
import { switchFloorDesign } from '@/core/plan/design-sync'
import { applyRidgeWallRemaps, isRidgeDesign, pruneRidgeWalls } from '@/core/plan/ridge-walls'
import { sanitizePlanWallsDetailed, wallsSanitizeChanged } from '@/core/plan/sanitize-plan-walls'
import { isStampOwnedWall } from '@/core/plan/stamp-owned'
import { resolveStampOwnership } from '@/core/plan/resolve-stamp-ownership'
import { DEFAULT_WALL_HEIGHT_CM } from '@/core/plan/extraction-to-plan-types'
import { splitPlanWallAtT } from '@/core/plan/elevation-openings'
import {
  addRoomRect,
  addWallSegment,
  buildJunctions,
  connectJunctionsKeepAxis,
  findMergeTargetFlushAware,
  isFlushOnlyJunctionConnect,
  JUNCTION_POINT_SNAP_CM,
  mergeJunctionsAware,
  moveJunctionWithWallJoins,
  removeWalls,
  setJunctionBottomZ,
  setJunctionHeight,
  setWallBalance,
  setWallThickness,
  setWallsBalance,
  setWallsBottomZ,
  setWallsHeight,
  setWallsThickness,
  slideWallSegmentAlongAxis,
  snapPointToJunctionsFlushAware,
  snapPointToWallCenters,
  snapToNearbyEndpointAxes,
  stableJunctionId,
  splitWallAtT,
  type JunctionNode,
  type WallEndRef,
} from '@/ui/components/plan-canvas-junctions'
import {
  addOpeningToWall,
  buildOpeningId,
  findOpeningById,
  removeOpeningsById,
  updateOpeningById,
  type OpeningLocation,
} from '@/ui/components/plan-canvas-openings'
import {
  applyOpeningDragMove as applyOpeningDragMoveWalls,
  slideOpeningAlongWall as slideOpeningAlongWallGeom,
} from '@/ui/components/plan-canvas-opening-drag-geom'
import { regenerateFloorAreas } from '@/ui/composables/plan-canvas/regenerate-floor-areas'
import { cloneAreasSnapshot } from '@/ui/composables/plan-canvas/plan-canvas-area-live'
import { ensureDefaultFacadeGroups } from '@/core/plan/facade-groups'
import { loadUserSettings } from '@/ui/composables/settings/user-settings'

import {
  createEditorUndo,
  type PlanCanvasUndoSnapshot,
} from '@/ui/composables/plan-canvas/plan-editor-undo'
import { createEditorAnnotations } from '@/ui/composables/plan-canvas/plan-editor-annotations'
import { createEditorFacadeStamp } from '@/ui/composables/plan-canvas/plan-editor-facade-stamp'
import { createEditorRidgeRoof } from '@/ui/composables/plan-canvas/plan-editor-ridge-roof'

export type { PlanCanvasUndoSnapshot }

function clonePlan(plan: FloorPlan): FloorPlan {
  return JSON.parse(JSON.stringify(plan)) as FloorPlan
}

function cloneWallsSnapshot(walls: Wall[]): Wall[] {
  return JSON.parse(JSON.stringify(walls)) as Wall[]
}

const PARENT_GEOM_EPS_CM = 0.05

function pointMoved(a: Point2D | undefined, b: Point2D | undefined): boolean {
  if (!a || !b) return a !== b
  return Math.abs(a.x - b.x) > PARENT_GEOM_EPS_CM || Math.abs(a.y - b.y) > PARENT_GEOM_EPS_CM
}

/** Parent-plan wijkt af van lokaal (rescale/nulpunt), geen echo van onze eigen emit. */
function planGeometryDiffers(local: FloorPlan | null, incoming: FloorPlan | null): boolean {
  if (!local || !incoming) return local !== incoming
  if (local.floors.length !== incoming.floors.length) return true
  for (let i = 0; i < local.floors.length; i += 1) {
    const localWalls = local.floors[i]?.walls ?? []
    const incomingWalls = incoming.floors[i]?.walls ?? []
    if (localWalls.length !== incomingWalls.length) return true
    for (let j = 0; j < localWalls.length; j += 1) {
      const lw = localWalls[j]
      const iw = incomingWalls[j]
      if (lw.id !== iw.id) return true
      if (pointMoved(lw.a, iw.a) || pointMoved(lw.b, iw.b)) return true
    }
    const localAreas = local.floors[i]?.areas ?? []
    const incomingAreas = incoming.floors[i]?.areas ?? []
    if (localAreas.length !== incomingAreas.length) return true
    for (let j = 0; j < localAreas.length; j += 1) {
      const lp = localAreas[j].poly
      const ip = incomingAreas[j].poly
      if (lp.length !== ip.length) return true
      for (let k = 0; k < lp.length; k += 1) {
        if (pointMoved(lp[k], ip[k])) return true
      }
    }
  }
  return false
}

function shortGuid(): string {
  return Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, '0')
}

export function usePlanEditor(
  plan: Ref<FloorPlan | null>,
  floorIndex: Ref<number>,
  options?: {
    ensureStampPreset?: Ref<boolean> | { readonly value: boolean }
    ensureDefaultFacades?: Ref<boolean> | { readonly value: boolean }
  },
) {
  const localPlan = ref<FloorPlan | null>(null)
  let skipNextPlanReset = false
  let areaRegenTimer: ReturnType<typeof setTimeout> | null = null

  // --- Core floor computeds ---

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
      : DEFAULT_WALL_HEIGHT_CM
  })

  const areas = computed(() => {
    const floor = localPlan.value?.floors[floorIndex.value] ?? localPlan.value?.floors[0]
    return floor?.areas ?? []
  })

  const planSurfaces = computed(() => {
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

  // --- patchActiveFloor ---

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

  // --- Undo module ---

  const undoModule = createEditorUndo({
    localPlan,
    floorIndex,
    walls: () => walls.value,
    patchActiveFloor,
  })

  // --- Ridge/Roof module ---

  const ridgeRoof = createEditorRidgeRoof({
    localPlan,
    floorIndex,
    walls: () => walls.value,
    floorHeightCm: () => floorHeightCm.value,
    setWalls: (next) => setWalls(next),
  })

  const selectableWalls = computed(() => [...walls.value, ...ridgeRoof.ridgeWalls.value])

  const surfaces = computed(() => [...planSurfaces.value, ...ridgeRoof.ridgeSurfaces.value])

  const planJunctions = computed(() => buildJunctions(walls.value))
  const ridgeJunctions = computed(() => buildJunctions(ridgeRoof.ridgeWalls.value))
  const junctions = computed(() => [...planJunctions.value, ...ridgeJunctions.value])

  // --- Area regen helpers ---

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

  function flushAreaRegen(): void {
    if (areaRegenTimer != null) {
      clearTimeout(areaRegenTimer)
      areaRegenTimer = null
    }
    regenerateAreasNow()
  }

  // --- Facade/Stamp module ---
  // Moet vóór de immediate plan-watch: die roept ensureStampFacadeGroup aan.

  const facadeStamp = createEditorFacadeStamp({
    localPlan,
    floorIndex,
    walls: () => walls.value,
    pushUndo: undoModule.pushUndo,
    popLastUndo: undoModule.popLastUndo,
    patchActiveFloor,
    flushAreaRegen,
  })

  function previewWallsWithLiveAreas(nextWalls: Wall[], baseAreas?: FloorArea[]): void {
    if (areaRegenTimer != null) {
      clearTimeout(areaRegenTimer)
      areaRegenTimer = null
    }
    patchActiveFloor({ walls: nextWalls })
    const floor = localPlan.value?.floors[floorIndex.value] ?? localPlan.value?.floors[0]
    if (!floor) return
    const next = regenerateFloorAreas(floor)
    if ((next.areas?.length ?? 0) > 0) {
      patchActiveFloor({ areas: next.areas })
      return
    }
    if (baseAreas) patchActiveFloor({ areas: cloneAreasSnapshot(baseAreas) })
  }

  // --- Plan/floor watch ---

  function prepareParentSync(): void {
    skipNextPlanReset = true
  }

  function replaceLocalPlan(
    plan: FloorPlan | null,
    optionsReplace?: { keepUndo?: boolean; keepParentSyncSkip?: boolean },
  ): void {
    if (!optionsReplace?.keepParentSyncSkip) skipNextPlanReset = false
    localPlan.value = plan ? clonePlan(plan) : null
    if (localPlan.value && options?.ensureStampPreset?.value === true) {
      facadeStamp.ensureStampFacadeGroup(localPlan.value)
    }
    if (localPlan.value && options?.ensureDefaultFacades?.value === true) {
      ensureDefaultFacadeGroups(localPlan.value, loadUserSettings().planDisplay.facadeGroups)
    }
    if (!optionsReplace?.keepUndo) {
      undoModule.clearStacks()
    }
  }

  watch(
    plan,
    (value) => {
      if (skipNextPlanReset) {
        skipNextPlanReset = false
        if (value == null) {
          localPlan.value = null
          undoModule.clearStacks()
          return
        }
        // Echo van onze emit: zelfde geometry, undo houden.
        // Rescale/nulpunt terwijl skip open staat: wél overnemen (anders blijven kamermaten).
        if (!planGeometryDiffers(localPlan.value, value)) return
      }
      localPlan.value = value ? clonePlan(value) : null
      if (localPlan.value && options?.ensureStampPreset?.value === true) {
        facadeStamp.ensureStampFacadeGroup(localPlan.value)
      }
      if (localPlan.value && options?.ensureDefaultFacades?.value === true) {
        ensureDefaultFacadeGroups(localPlan.value, loadUserSettings().planDisplay.facadeGroups)
      }
      undoModule.clearStacks()
    },
    { immediate: true },
  )

  watch(floorIndex, () => {
    undoModule.clearStacks()
  })

  // --- Annotations module ---

  function setFloorLabels(nextLabels: FloorLabel[] | undefined): void {
    patchActiveFloor({ labels: nextLabels })
  }

  function setFloorLines(nextLines: FloorLine[] | undefined): void {
    patchActiveFloor({ lines: nextLines })
  }

  function setFloorDimensions(next: FloorDimension[] | undefined): void {
    patchActiveFloor({ dimensions: next })
  }

  const annotations = createEditorAnnotations({
    localPlan,
    floorIndex,
    labels: () => labels.value,
    lines: () => lines.value,
    dimensions: () => dimensions.value,
    planSurfaces: () => planSurfaces.value,
    setFloorLabels,
    setFloorLines,
    setFloorDimensions,
    prepareParentSync,
  })

  // --- Wall setters ---

  function setWalls(nextWalls: Wall[]): void {
    if (!localPlan.value) return
    patchActiveFloor({ walls: nextWalls })
    scheduleAreaRegen()
  }

  function setFloorItems(nextItems: FloorItem[] | undefined): void {
    if (!localPlan.value) return
    patchActiveFloor({ items: nextItems })
  }

  function addItem(item: Omit<FloorItem, 'id'> & { id?: string }): string {
    const id = item.id?.trim() || crypto.randomUUID()
    setFloorItems([...items.value, { ...item, id }])
    return id
  }

  function updateItem(guid: string, patch: Partial<Omit<FloorItem, 'id'>>): void {
    const next = items.value.map((entry) => (entry.id === guid ? { ...entry, ...patch } : entry))
    setFloorItems(next)
  }

  function removeItem(guid: string): void {
    const next = items.value.filter((entry) => entry.id !== guid)
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
        | 'role'
        | 'name'
        | 'customName'
        | 'color'
        | 'showAreaLabel'
        | 'name_x'
        | 'name_y'
        | 'poly'
        | 'liningCm'
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

  function addSurface(surface: Omit<FloorSurface, 'id'> & { id?: string }): string | null {
    const id = surface.id?.trim() || `surface-${shortGuid()}`
    if (surface.isRoof === true) {
      return ridgeRoof.addRidgeSurface({ ...surface, id, isRoof: true })
    }
    const next: FloorSurface = { ...surface, id, isRoof: undefined }
    setFloorSurfaces([...planSurfaces.value, next])
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
        | 'isRoof'
        | 'pattern'
        | 'roofKind'
        | 'roofParentId'
      >
    >,
  ): boolean {
    if (ridgeRoof.isRidgeSurfaceId(surfaceId)) {
      return ridgeRoof.updateRidgeSurface(surfaceId, patch)
    }
    const next = planSurfaces.value.map((s) => (s.id === surfaceId ? { ...s, ...patch } : s))
    setFloorSurfaces(next)
    return true
  }

  function removeSurface(surfaceId: string): void {
    if (ridgeRoof.isRidgeSurfaceId(surfaceId)) {
      ridgeRoof.removeRidgeSurface(surfaceId)
      return
    }
    const next = planSurfaces.value.filter((s) => s.id !== surfaceId)
    setFloorSurfaces(next.length > 0 ? next : undefined)
  }

  function setActiveDesignIndex(designIndex: number): void {
    if (!localPlan.value) return
    const idx = floorIndex.value
    const floor = localPlan.value.floors[idx]
    if (!floor) return
    const target = floor.designs?.[designIndex]
    if (isRidgeDesign(target)) return
    const switched = switchFloorDesign(floor, designIndex)
    localPlan.value = {
      ...localPlan.value,
      floors: localPlan.value.floors.map((f, i) => (i === idx ? switched : f)),
    }
  }

  // --- Junction/Wall operations ---

  function applyJunctionMove(node: JunctionNode, position: { x: number; y: number }): void {
    if (ridgeRoof.refsOnRidge(node.refs)) {
      ridgeRoof.setRidgeWalls(moveJunctionWithWallJoins(ridgeRoof.ridgeWalls.value, node, position))
      return
    }
    setWalls(moveJunctionWithWallJoins(walls.value, node, position))
  }

  function previewJunctionMove(
    baseWalls: Wall[],
    node: JunctionNode,
    position: { x: number; y: number },
    baseAreas?: FloorArea[],
  ): void {
    // Flush-connect alleen bij knoop-sleep (deze preview), nooit bij segment-slide.
    const junctions = buildJunctions(baseWalls)
    const source =
      junctions.find((junction) => junction.id === node.id) ??
      ({
        ...node,
        x: node.x,
        y: node.y,
      } satisfies JunctionNode)
    const flushTarget = findMergeTargetFlushAware(junctions, node.refs, position, baseWalls, 3, {
      x: source.x,
      y: source.y,
    })
    const next =
      flushTarget && isFlushOnlyJunctionConnect(baseWalls, source, flushTarget)
        ? connectJunctionsKeepAxis(baseWalls, source, flushTarget, baseAreas)
        : moveJunctionWithWallJoins(baseWalls, node, position)
    if (ridgeRoof.refsOnRidge(node.refs)) {
      ridgeRoof.setRidgeWalls(next)
      return
    }
    previewWallsWithLiveAreas(next, baseAreas)
  }

  function applyJunctionMerge(source: JunctionNode, target: JunctionNode): void {
    if (ridgeRoof.refsOnRidge(source.refs) || ridgeRoof.refsOnRidge(target.refs)) {
      if (!ridgeRoof.refsOnRidge(source.refs) || !ridgeRoof.refsOnRidge(target.refs)) return
      ridgeRoof.setRidgeWalls(mergeJunctionsAware(ridgeRoof.ridgeWalls.value, source, target))
      return
    }
    setWalls(mergeJunctionsAware(walls.value, source, target, areas.value))
  }

  function applyWallThickness(wallId: string, thicknessCm: number): void {
    if (ridgeRoof.isRidgeWallId(wallId)) return
    setWalls(setWallThickness(walls.value, wallId, thicknessCm))
  }

  function applyWallsThickness(wallIds: string[], thicknessCm: number): void {
    const planIds = wallIds.filter((id) => !ridgeRoof.isRidgeWallId(id))
    if (planIds.length > 0) setWalls(setWallsThickness(walls.value, planIds, thicknessCm))
  }

  function applyWallsHeight(wallIds: string[], heightCm: number): void {
    const planIds = wallIds.filter((id) => !ridgeRoof.isRidgeWallId(id))
    const ridgeIds = wallIds.filter((id) => ridgeRoof.isRidgeWallId(id))
    if (planIds.length > 0) {
      setWalls(setWallsHeight(walls.value, planIds, heightCm, floorHeightCm.value))
    }
    if (ridgeIds.length > 0) {
      ridgeRoof.setRidgeWalls(
        setWallsHeight(ridgeRoof.ridgeWalls.value, ridgeIds, heightCm, floorHeightCm.value),
      )
    }
  }

  function applyWallsBottomZ(wallIds: string[], bottomZCm: number): void {
    const planIds = wallIds.filter((id) => !ridgeRoof.isRidgeWallId(id))
    if (planIds.length === 0) return
    setWalls(setWallsBottomZ(walls.value, planIds, bottomZCm, floorHeightCm.value))
  }

  function applyJunctionHeight(refs: ReadonlyArray<WallEndRef>, heightCm: number): void {
    if (ridgeRoof.refsOnRidge(refs)) {
      ridgeRoof.setRidgeWalls(
        setJunctionHeight(ridgeRoof.ridgeWalls.value, refs, heightCm, floorHeightCm.value),
      )
      return
    }
    setWalls(setJunctionHeight(walls.value, refs, heightCm, floorHeightCm.value))
  }

  function applyJunctionBottomZ(refs: ReadonlyArray<WallEndRef>, bottomZCm: number): void {
    if (ridgeRoof.refsOnRidge(refs)) return
    setWalls(setJunctionBottomZ(walls.value, refs, bottomZCm, floorHeightCm.value))
  }

  function applyWallSplit(wallId: string, t: number) {
    if (ridgeRoof.isRidgeWallId(wallId)) {
      return ridgeRoof.applyRidgeWallSplit(wallId, t)
    }
    if (!localPlan.value) return null
    const result = splitPlanWallAtT(localPlan.value, wallId, t, splitWallAtT)
    if (!result) return null
    localPlan.value = result.plan
    scheduleAreaRegen()
    return {
      walls: walls.value,
      junctionId: '',
      firstWallId: result.firstWallId,
      secondWallId: result.secondWallId,
    }
  }

  function applyWallsDelete(wallIds: string[]): void {
    const planIds = wallIds.filter((id) => !ridgeRoof.isRidgeWallId(id))
    const ridgeIds = wallIds.filter((id) => ridgeRoof.isRidgeWallId(id))
    if (planIds.length > 0) setWalls(removeWalls(walls.value, planIds))
    if (ridgeIds.length > 0) ridgeRoof.applyRidgeWallsDelete(ridgeIds)
    if (localPlan.value && planIds.length > 0) {
      facadeStamp.detachWalls(localPlan.value, planIds)
      facadeStamp.pruneFacadeGroups(localPlan.value)
    }
  }

  function applyWallSlideAlongAxis(wallId: string, deltaT: number, slideDir: Point2D): void {
    if (ridgeRoof.isRidgeWallId(wallId)) {
      ridgeRoof.setRidgeWalls(
        slideWallSegmentAlongAxis(ridgeRoof.ridgeWalls.value, wallId, deltaT, slideDir),
      )
      return
    }
    setWalls(slideWallSegmentAlongAxis(walls.value, wallId, deltaT, slideDir))
  }

  function previewWallSlideAlongAxis(
    baseWalls: Wall[],
    wallId: string,
    deltaT: number,
    slideDir: Point2D,
    baseAreas?: FloorArea[],
  ): void {
    const next =
      deltaT === 0
        ? cloneWallsSnapshot(baseWalls)
        : slideWallSegmentAlongAxis(baseWalls, wallId, deltaT, slideDir)
    if (ridgeRoof.isRidgeWallId(wallId)) {
      ridgeRoof.setRidgeWalls(next)
      return
    }
    previewWallsWithLiveAreas(next, baseAreas)
  }

  function applyWallBalance(wallId: string, balance: number): void {
    if (ridgeRoof.isRidgeWallId(wallId)) return
    setWalls(setWallBalance(walls.value, wallId, balance))
  }

  function applyWallsBalance(wallIds: string[], balance: number): void {
    const planIds = wallIds.filter((id) => !ridgeRoof.isRidgeWallId(id))
    if (planIds.length > 0) setWalls(setWallsBalance(walls.value, planIds, balance))
  }

  function applyWallDelete(wallId: string): void {
    applyWallsDelete([wallId])
  }

  function applyWallsSanitize(): boolean {
    let working = walls.value
    if (working.some(isStampOwnedWall)) {
      working = resolveStampOwnership(working).walls
    }
    const detailed = sanitizePlanWallsDetailed(working)
    const ridgeDetailed = sanitizePlanWallsDetailed(ridgeRoof.ridgeWalls.value)
    const planChanged = wallsSanitizeChanged(walls.value, detailed.walls)
    const ridgeChanged = wallsSanitizeChanged(ridgeRoof.ridgeWalls.value, ridgeDetailed.walls)
    if (!planChanged && !ridgeChanged) return false
    undoModule.pushUndo()
    if (planChanged) setWalls(detailed.walls)
    if (ridgeChanged) ridgeRoof.setRidgeWalls(ridgeDetailed.walls)
    if (localPlan.value) {
      if (planChanged) {
        facadeStamp.applyFacadeGroupRemaps(localPlan.value, detailed.remaps)
        facadeStamp.pruneFacadeGroups(localPlan.value)
      }
      if (ridgeChanged) applyRidgeWallRemaps(localPlan.value, ridgeDetailed.remaps)
      pruneRidgeWalls(localPlan.value)
    }
    flushAreaRegen()
    return true
  }

  function applyWallAdd(
    a: Point2D,
    b: Point2D,
    thicknessCm: number,
    optionsWall?: {
      kind?: 'wall' | 'ridge'
      ridgeZCm?: number
      requireFloorIndex?: number
      heightCm?: number
      bottomZCm?: number
    },
  ): string | null {
    if (optionsWall?.kind === 'ridge') {
      return ridgeRoof.applyRidgeAdd(a, b, optionsWall.ridgeZCm, {
        requireFloorIndex: optionsWall.requireFloorIndex,
      })
    }
    const heightCm =
      optionsWall?.heightCm != null &&
      Number.isFinite(optionsWall.heightCm) &&
      optionsWall.heightCm > 0
        ? optionsWall.heightCm
        : floorHeightCm.value
    const bottomZCm =
      optionsWall?.bottomZCm != null && Number.isFinite(optionsWall.bottomZCm)
        ? optionsWall.bottomZCm
        : 0
    const result = addWallSegment(walls.value, a, b, thicknessCm, heightCm, bottomZCm)
    if (!result) return null
    setWalls(result.walls)
    return result.wallId
  }

  function applyRoomRect(
    corners: readonly Point2D[],
    thicknessCm: number,
    optionsRoom?: { heightCm?: number; bottomZCm?: number },
  ): string[] | null {
    const heightCm =
      optionsRoom?.heightCm != null &&
      Number.isFinite(optionsRoom.heightCm) &&
      optionsRoom.heightCm > 0
        ? optionsRoom.heightCm
        : floorHeightCm.value
    const bottomZCm =
      optionsRoom?.bottomZCm != null && Number.isFinite(optionsRoom.bottomZCm)
        ? optionsRoom.bottomZCm
        : 0
    const result = addRoomRect(walls.value, corners, thicknessCm, heightCm, bottomZCm)
    if (!result) return null
    setWalls(result.walls)
    flushAreaRegen()
    return result.wallIds
  }

  // --- Opening operations ---

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
        | 'kind'
      >
    >,
  ): void {
    setWalls(updateOpeningById(walls.value, openingId, patch))
  }

  function applyOpeningDragMove(openingId: string, pointCm: Point2D): string | null {
    const result = applyOpeningDragMoveWalls(walls.value, openingId, pointCm)
    if (!result) return null
    if (result.walls !== walls.value) setWalls(result.walls)
    return result.openingId
  }

  function previewOpeningSlideAlongWall(
    baseWalls: Wall[],
    openingId: string,
    deltaCm: number,
  ): string | null {
    const result = slideOpeningAlongWallGeom(baseWalls, openingId, deltaCm)
    if (!result) return null
    setWalls(result.walls)
    return result.openingId
  }

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
        | 'kind'
      >
    >,
  ): void {
    updateOpening(openingId, patch)
  }

  function removeOpenings(openingIds: string[]): void {
    setWalls(removeOpeningsById(walls.value, openingIds))
  }

  function removeDoorOpenings(openingIds: string[]): void {
    removeOpenings(openingIds)
  }

  // --- Return ---

  return {
    localPlan,
    floorIndex,
    walls,
    ridgeWalls: ridgeRoof.ridgeWalls,
    ridgeSurfaces: ridgeRoof.ridgeSurfaces,
    selectableWalls,
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
    pushUndo: undoModule.pushUndo,
    prepareParentSync,
    replaceLocalPlan,
    consumePendingUndoLayoutOrigin: undoModule.consumePendingUndoLayoutOrigin,
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
    addLabel: annotations.addLabel,
    updateLabel: annotations.updateLabel,
    removeLabel: annotations.removeLabel,
    addLine: annotations.addLine,
    updateLine: annotations.updateLine,
    removeLine: annotations.removeLine,
    setFloorDimensions,
    addDimension: annotations.addDimension,
    updateDimension: annotations.updateDimension,
    removeDimension: annotations.removeDimension,
    convertOverlayToManual: annotations.convertOverlayToManual,
    planSlices: annotations.planSlices,
    setPlanSlices: annotations.setPlanSlices,
    addPlanSlice: annotations.addPlanSlice,
    updatePlanSlice: annotations.updatePlanSlice,
    clearPlanSlices: annotations.clearPlanSlices,
    setActiveDesignIndex,
    addWallSegment,
    applyJunctionMove,
    previewJunctionMove,
    applyJunctionMerge,
    applyWallThickness,
    applyWallsThickness,
    applyFacadeGroupThickness: facadeStamp.applyFacadeGroupThickness,
    applyWallsHeight,
    applyWallsBottomZ,
    applyRidgeZ: ridgeRoof.applyRidgeZ,
    applyRidgeJunctionZ: ridgeRoof.applyRidgeJunctionZ,
    applyJunctionHeight,
    applyJunctionBottomZ,
    applyWallSplit,
    applyWallSlideAlongAxis,
    previewWallSlideAlongAxis,
    applyWallBalance,
    applyWallsBalance,
    applyWallDelete,
    applyWallsDelete,
    applyWallsSanitize,
    facadeGroups: facadeStamp.facadeGroups,
    applyFacadeAssign: facadeStamp.applyFacadeAssign,
    applyFacadeDetach: facadeStamp.applyFacadeDetach,
    applyFacadeDetachFromGroup: facadeStamp.applyFacadeDetachFromGroup,
    applyStampAssign: facadeStamp.applyStampAssign,
    applyStampDetach: facadeStamp.applyStampDetach,
    applyFacadeCreate: facadeStamp.applyFacadeCreate,
    applyFacadeDelete: facadeStamp.applyFacadeDelete,
    applyFacadeRename: facadeStamp.applyFacadeRename,
    applyStampToActiveFloor: facadeStamp.applyStampToActiveFloor,
    canApplyStampOnActiveFloor: facadeStamp.canApplyStampOnActiveFloor,
    applyWallAdd,
    applyRidgeAdd: ridgeRoof.applyRidgeAdd,
    applyRidgeFloor: ridgeRoof.applyRidgeFloor,
    ridgeFloorIndexForWall: ridgeRoof.ridgeFloorIndexForWall,
    applyWallKind: ridgeRoof.applyWallKind,
    applyRoomRect,
    applyOpeningAdd,
    resolveOpening,
    resolveDoorOpening,
    updateOpening,
    updateDoorOpening,
    applyOpeningDragMove,
    previewOpeningSlideAlongWall,
    removeOpenings,
    removeDoorOpenings,
    findMergeTarget: (sourceRefs: WallEndRef[], position: { x: number; y: number }) => {
      const onRidge = ridgeRoof.refsOnRidge(sourceRefs)
      const graph = onRidge ? ridgeJunctions.value : planJunctions.value
      const sourceWalls = onRidge ? ridgeRoof.ridgeWalls.value : walls.value
      const sourceJunction =
        graph.find(
          (junction) =>
            junction.refs.length === sourceRefs.length &&
            sourceRefs.every((ref) =>
              junction.refs.some(
                (candidate) => candidate.wallId === ref.wallId && candidate.end === ref.end,
              ),
            ),
        ) ?? null
      return findMergeTargetFlushAware(
        graph,
        sourceRefs,
        position,
        sourceWalls,
        3,
        sourceJunction ? { x: sourceJunction.x, y: sourceJunction.y } : undefined,
      )
    },
    snapJunctionPoint: (
      refs: WallEndRef[],
      candidate: { x: number; y: number },
      snapWalls?: Wall[],
    ) => {
      const sourceWalls =
        snapWalls ?? (ridgeRoof.refsOnRidge(refs) ? ridgeRoof.ridgeWalls.value : walls.value)
      const axisSnap = snapToNearbyEndpointAxes(sourceWalls, refs, candidate)
      const sourceId = stableJunctionId(refs)
      const sourceJunctions = snapWalls
        ? buildJunctions(snapWalls)
        : ridgeRoof.refsOnRidge(refs)
          ? ridgeJunctions.value
          : planJunctions.value
      const source =
        sourceJunctions.find((item) => item.id === sourceId) ??
        ({
          id: sourceId,
          refs,
          x: candidate.x,
          y: candidate.y,
        } satisfies JunctionNode)
      const otherJunctions = sourceJunctions.filter((item) => item.id !== sourceId)
      const junctionSnap = snapPointToJunctionsFlushAware(
        otherJunctions,
        axisSnap,
        JUNCTION_POINT_SNAP_CM,
        sourceWalls,
        source,
      )
      const exclude = new Set(refs.map((ref) => ref.wallId))
      return snapPointToWallCenters(sourceWalls, junctionSnap, JUNCTION_POINT_SNAP_CM, exclude)
    },
    undo: undoModule.undo,
    redo: undoModule.redo,
    canUndo: undoModule.canUndo,
    canRedo: undoModule.canRedo,
    canUndoEdit: undoModule.canUndoEdit,
    canRedoEdit: undoModule.canRedoEdit,
  }
}
