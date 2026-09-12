import { computed, ref, watch, type Ref, type ComputedRef } from 'vue'
import { BOVENLICHT_GAP_CM, BOVENLICHT_HEIGHT_CM } from '@/core/fml/bovenlicht'
import { resolveDoorAddPreset, resolveWindowAddPreset } from '@/core/fml/opening-add-presets'
import type { Point2D, Wall } from '@/core/fml/types'
import { isRidgeWallId } from '@/core/fml/ridge-walls'
import { listDakSnapWalls } from '@/core/fml/ridge-floor'
import { ROOF_TOUCH_SLACK_CM } from '@/core/fml/roof-planes'
import { filterManualDimensions, readPlanSlices } from '@/core/fml/plan-slices'
import {
  JUNCTION_POINT_SNAP_CM,
  ROOM_DRAW_SNAP_CM,
  snapDrawWallEndpoint,
  snapPointToJunctions,
  snapPointToWallCenters,
  snapRoomDrawEndPoint,
  snapToNearbyEndpointAxes,
  snapToNearbyPointAxes,
  snapToPolygonGeometry,
  closedRingSegments,
  openPolylineSegments,
} from '@/ui/components/fml-preview-junctions'
import {
  isAllowedDakDrawPoint,
  dakRoofRingsFromFloor,
  resolveDakSurfacePoint,
  resolveRidgeDrawPoint,
} from '@/ui/components/fml-preview-dak-draw-snap'
import type { useFmlPreviewEditor } from '@/ui/composables/useFmlPreviewEditor'
import type { HitTestApi } from './fml-preview-hit-test-api'
import { useFmlPreviewAddOpening } from './useFmlPreviewAddOpening'
import { useFmlPreviewDrawWall } from './useFmlPreviewDrawWall'
import { useFmlPreviewDrawRoom } from './useFmlPreviewDrawRoom'
import { useFmlPreviewDrawSurface } from './useFmlPreviewDrawSurface'
import { useFmlPreviewDrawLabel } from './useFmlPreviewDrawLabel'
import { useFmlPreviewDrawLine } from './useFmlPreviewDrawLine'
import { useFmlPreviewMeasure, type MeasureDrawMode } from './useFmlPreviewMeasure'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import { loadUserSettings } from '@/ui/composables/settings/user-settings'
import { useFmlPreviewNulpunt } from './useFmlPreviewNulpunt'
import { useFmlPreviewUnderlayMove } from './useFmlPreviewUnderlayMove'
import { useFmlPreviewAddFixture } from './useFmlPreviewAddFixture'
import type { FixturePlaceOption } from '@/core/fml/fixture-refid-catalog'
import type { FmlPreviewSelectionRefs } from './fml-preview-selection'
import type { ContentLayout } from './useFmlPreviewViewport'
import type { UnderlayOriginLayout } from '@/core/fml/translate-floor-plan'

type EditorApi = ReturnType<typeof useFmlPreviewEditor>

interface ToolCoordinatorOptions {
  hitTest: HitTestApi
  selection: FmlPreviewSelectionRefs
  editor: EditorApi
  viewport: {
    viewScale: Ref<number>
    contentLayout: Ref<ContentLayout | null>
    nudgeContentLayout: (dxCm: number, dyCm: number) => void
  }
  shiftPressed: Ref<boolean>
  axisLocked: ComputedRef<boolean>
  coarsePointer: ComputedRef<boolean>
  touchNav: ComputedRef<boolean>
  touchEditor: ComputedRef<boolean>
  inspectMode: ComputedRef<boolean>
  areaSurfaceEditEnabled: ComputedRef<boolean>
  annotationEditEnabled: ComputedRef<boolean>
  labelsVisible: ComputedRef<boolean>
  bovenlichtDefault?: Ref<boolean>
  windowBovenlichtDefault?: Ref<boolean>
  bovenlichtHeightCm?: Ref<number>
  bovenlichtGapCm?: Ref<number>
  bovenlichtPacked?: Ref<boolean>
  dakMode?: Ref<boolean>
  roofOverlayOnPlan?: Ref<boolean>
  ensureRoofOverlayOn?: () => void
  measureDrawMode?: Ref<MeasureDrawMode>
  slicerEditMode?: Ref<boolean>
  dimensionVis?: Ref<import('@/core/fml/fml-dimension-vis').DimensionVis>
  selectedSliceIndex?: Ref<number>
  getUnderlayLayout?: () => UnderlayOriginLayout | null
  setFmlNulpuntImageCm?: (point: Point2D | null) => void
  underlayMoveMode: Ref<boolean> & { value: boolean }
  getInputUnit?: () => ScaleInputUnit
  syncPlanToParent: (layout?: UnderlayOriginLayout | null) => void
  ignoreNextPlanWatch: Ref<boolean>
  pendingPlanSyncSkips: Ref<number>
  clearSelection: (opts?: { flush?: boolean }) => void
  cancelSelectionBoxDrag: () => void
  cancelMoveDragPending: () => void
  cancelOpeningDragPending: () => void
  cancelItemDragPending: () => void
  flushPendingFieldCommits: () => void
  /** Refs owned by WallSelection — passed in to avoid circular deps. */
  wallThicknessDraft: Ref<number>
  wallHeightDraft: Ref<number>
  wallBottomZDraft: Ref<number>
  /** Shared refs created by the assembler. */
  ridgeZCm: Ref<number | undefined>
  pendingFixture: Ref<FixturePlaceOption | null>
}

export function useFmlPreviewToolCoordinator(options: ToolCoordinatorOptions) {
  const {
    hitTest,
    selection,
    editor,
    viewport,
    axisLocked,
    coarsePointer,
    touchNav,
    touchEditor,
    inspectMode,
    areaSurfaceEditEnabled,
    annotationEditEnabled,
    labelsVisible,
    bovenlichtDefault,
    windowBovenlichtDefault,
    bovenlichtHeightCm,
    bovenlichtGapCm,
    bovenlichtPacked,
    underlayMoveMode,
    syncPlanToParent,
    ignoreNextPlanWatch,
    pendingPlanSyncSkips,
    clearSelection,
    cancelSelectionBoxDrag,
    cancelMoveDragPending,
    cancelOpeningDragPending,
    cancelItemDragPending,
  } = options

  const {
    hoveredJunctionId,
    addDoorSubtype,
    addDoorWidthCm,
    addDoorHeightCm,
    addDoorSillZCm,
    addWindowSubtype,
    addWindowWidthCm,
    addWindowSillZCm,
    addWindowHeightCm,
    activeFmlTool,
    drawWallKind,
  } = selection

  const settingsMod = ref(false)
  const axisLockMod = ref(false)
  const moveMod = ref(false)
  const pendingFixture = options.pendingFixture
  const ridgeZCm = options.ridgeZCm

  const drawingRoof = computed(
    () => options.dakMode?.value === true || activeFmlTool.value === 'draw_roof',
  )
  const drawWallMode = computed(() => activeFmlTool.value === 'draw_wall')
  const drawRoomMode = computed(() => activeFmlTool.value === 'draw_room')
  const drawSurfaceMode = computed(
    () =>
      (areaSurfaceEditEnabled.value && activeFmlTool.value === 'draw_surface') ||
      activeFmlTool.value === 'draw_roof',
  )
  const drawLabelMode = computed(
    () => annotationEditEnabled.value && activeFmlTool.value === 'draw_label',
  )
  const drawLineMode = computed(
    () => annotationEditEnabled.value && activeFmlTool.value === 'draw_line',
  )
  const addDoorMode = computed(() => activeFmlTool.value === 'add_door')
  const addWindowMode = computed(() => activeFmlTool.value === 'add_window')
  const addFixtureMode = computed(() => touchEditor.value && activeFmlTool.value === 'add_fixture')
  const measureMode = computed(() => activeFmlTool.value === 'measure')
  const nulpuntMode = computed(() => activeFmlTool.value === 'nulpunt')

  watch(
    areaSurfaceEditEnabled,
    (on) => {
      if (on) return
      if (activeFmlTool.value === 'draw_surface') activeFmlTool.value = null
      selection.settingsAreaId.value = null
      selection.settingsSurfaceId.value = null
      selection.surfaceEditId.value = null
      selection.roofPolyMutate.value = false
      selection.drawSurfacePoints.value = null
    },
    { immediate: true },
  )

  watch(
    annotationEditEnabled,
    (on) => {
      if (on) return
      if (activeFmlTool.value === 'draw_label' || activeFmlTool.value === 'draw_line') {
        activeFmlTool.value = null
      }
      selection.settingsLabelId.value = null
      selection.settingsLineId.value = null
      selection.drawLinePoints.value = null
    },
    { immediate: true },
  )

  watch(labelsVisible, (on) => {
    if (on) return
    selection.settingsLabelId.value = null
    selection.hoveredLabelId.value = null
  })

  watch(nulpuntMode, (on) => {
    if (on && underlayMoveMode.value) underlayMoveMode.value = false
  })
  watch(underlayMoveMode, (on) => {
    if (on && nulpuntMode.value) activeFmlTool.value = null
  })

  watch(addDoorSubtype, (subtype) => {
    addDoorWidthCm.value = resolveDoorAddPreset(subtype).defaultWidthCm
  })
  watch(addWindowSubtype, (subtype) => {
    addWindowWidthCm.value = resolveWindowAddPreset(subtype).defaultWidthCm
  })

  const drawMeasureCancels = {
    cancelDrawWallDrag: () => {},
    cancelDrawRoomDrag: () => {},
    cancelMeasureDrag: () => {},
    cancelNulpuntDrag: () => {},
    cancelUnderlayMoveDrag: () => {},
  }

  function ridgeDrawSnapWalls(): ReadonlyArray<Pick<Wall, 'a' | 'b' | 'thickness' | 'balance'>> {
    const plan = editor.localPlan.value
    if (options.dakMode?.value === true && plan) {
      return listDakSnapWalls(plan, editor.floorIndex.value)
    }
    return editor.walls.value
  }

  function roofOverlaySnapEnabled(): boolean {
    if (options.dakMode?.value === true) return false
    if (options.roofOverlayOnPlan?.value === false) return false
    const viewer = loadUserSettings().fmlViewer
    if (options.roofOverlayOnPlan == null && viewer.showRoofOverlayOnPlan === false) return false
    return viewer.showRoofPlanesOnPlan !== false
  }

  function snapToRoofPlaneRings(cm: Point2D): Point2D | null {
    const plan = editor.localPlan.value
    if (!plan || !roofOverlaySnapEnabled()) return null
    const rings = dakRoofRingsFromFloor(plan.floors[editor.floorIndex.value])
    if (rings.length === 0) return null
    const verts = rings.flat()
    const segments = rings.flatMap((ring) => closedRingSegments(ring))
    return snapToPolygonGeometry(cm, verts, segments, ROOF_TOUCH_SLACK_CM)
  }

  function resolveDrawPoint(cm: Point2D, axisAnchor?: Point2D, snapDisabled?: boolean): Point2D {
    if (drawWallKind.value === 'ridge') {
      return resolveRidgeDrawPoint(cm, {
        plan: editor.localPlan.value,
        floorIndex: editor.floorIndex.value,
        walls: ridgeDrawSnapWalls(),
        axisAnchor,
        lockAxis: axisLocked.value,
        snapDisabled,
      })
    }
    const junction = hitTest.hitTestJunctionAtCm(cm)
    let point = junction ? { x: junction.cmX, y: junction.cmY } : cm
    if (!junction) {
      point = snapToNearbyEndpointAxes(editor.walls.value, [], point)
      point = snapPointToJunctions(editor.junctions.value, point, JUNCTION_POINT_SNAP_CM)
      point = snapPointToWallCenters(editor.walls.value, point, JUNCTION_POINT_SNAP_CM)
      if (!snapDisabled) {
        const roofSnap = snapToRoofPlaneRings(point)
        if (roofSnap) point = roofSnap
      }
    }
    if (axisAnchor) {
      point = snapDrawWallEndpoint(axisAnchor, point, axisLocked.value)
    }
    return point
  }

  function resolveRoomStartPoint(cm: Point2D): Point2D {
    const junction = hitTest.hitTestJunctionAtCm(cm)
    if (junction) return { x: junction.cmX, y: junction.cmY }
    return snapPointToJunctions(editor.junctions.value, cm, ROOM_DRAW_SNAP_CM)
  }

  function resolveRoomEndPoint(cm: Point2D, start: Point2D): Point2D {
    return snapRoomDrawEndPoint(editor.junctions.value, editor.walls.value, cm, start)
  }

  function resolveSurfacePoint(
    cm: Point2D,
    snapDisabled: boolean,
    extraAxisPoints?: Point2D[],
    excludeSurfaceId?: string | null,
  ): Point2D {
    if (snapDisabled) return cm
    if (drawingRoof.value && editor.localPlan.value) {
      const extra = extraAxisPoints ?? []
      if (extra.length === 0) {
        const junction = hitTest.hitTestJunctionAtCm(cm)
        const onRidge =
          junction?.refs.some((ref) => isRidgeWallId(editor.localPlan.value, ref.wallId)) === true
        if (junction && onRidge) {
          return resolveDakSurfacePoint(
            { x: junction.cmX, y: junction.cmY },
            {
              plan: editor.localPlan.value,
              floorIndex: editor.floorIndex.value,
              extraAxisPoints: extra,
              lockAxis: axisLocked.value,
              excludeSurfaceId,
            },
          )
        }
      }
      return resolveDakSurfacePoint(cm, {
        plan: editor.localPlan.value,
        floorIndex: editor.floorIndex.value,
        extraAxisPoints: extra,
        axisAnchor: extra.length > 0 ? extra[extra.length - 1] : undefined,
        lockAxis: axisLocked.value,
        excludeSurfaceId,
      })
    }
    const junction = hitTest.hitTestJunctionAtCm(cm)
    if (junction) return { x: junction.cmX, y: junction.cmY }

    const extra = extraAxisPoints ?? []
    const rings: Point2D[][] = []
    for (const surface of editor.surfaces.value) {
      if (excludeSurfaceId && surface.id === excludeSurfaceId) continue
      if (surface.poly && surface.poly.length >= 2) {
        rings.push(surface.poly.map((p) => ({ x: p.x, y: p.y })))
      }
    }
    for (const area of editor.areas.value) {
      if (area.poly && area.poly.length >= 2) rings.push(area.poly)
    }
    const ringVerts = rings.flat()
    const segments = [
      ...rings.flatMap((ring) => closedRingSegments(ring)),
      ...openPolylineSegments(extra),
    ]
    const polySnap = snapToPolygonGeometry(
      cm,
      [...ringVerts, ...extra],
      segments,
      JUNCTION_POINT_SNAP_CM,
    )
    if (polySnap) return polySnap

    const wallPoints = editor.walls.value.flatMap((wall) => [wall.a, wall.b])
    const axis = snapToNearbyPointAxes([...wallPoints, ...ringVerts, ...extra], cm)
    const junctionSnap = snapPointToJunctions(editor.junctions.value, axis, JUNCTION_POINT_SNAP_CM)
    return snapPointToWallCenters(editor.walls.value, junctionSnap, JUNCTION_POINT_SNAP_CM)
  }

  const { wallThicknessDraft, wallHeightDraft, wallBottomZDraft } = options

  const drawWall = useFmlPreviewDrawWall({
    hitTest,
    editor,
    hoveredJunctionId,
    wallThicknessDraft,
    wallHeightDraft,
    wallBottomZDraft,
    drawKind: drawWallKind,
    ridgeZCm,
    requireFloorIndex: () =>
      options.dakMode?.value === true ? editor.floorIndex.value : undefined,
    resolvePoint: resolveDrawPoint,
    handleTolCm: () => {
      const layout = viewport.contentLayout.value
      if (!layout) return 16
      const px = coarsePointer.value || touchNav.value ? 28 : 18
      return px / layout.scale / viewport.viewScale.value
    },
    placeOnSecondClick: () => !coarsePointer.value && !touchNav.value,
    getWalls: () => editor.walls.value,
    getInputUnit: () => options.getInputUnit?.() ?? 'm',
    beforeBegin: () => {
      cancelSelectionBoxDrag()
      cancelMoveDragPending()
      clearSelection()
    },
    syncPlanToParent,
    onPlaced: () => {
      activeFmlTool.value = null
    },
  })

  const drawRoom = useFmlPreviewDrawRoom({
    hitTest,
    editor,
    hoveredJunctionId,
    wallThicknessDraft,
    wallHeightDraft,
    wallBottomZDraft,
    shiftPressed: axisLocked,
    resolveStartPoint: resolveRoomStartPoint,
    resolveEndPoint: resolveRoomEndPoint,
    handleTolCm: () => {
      const layout = viewport.contentLayout.value
      if (!layout) return 16
      const px = coarsePointer.value || touchNav.value ? 28 : 18
      return px / layout.scale / viewport.viewScale.value
    },
    placeOnSecondClick: () => !coarsePointer.value && !touchNav.value,
    getWalls: () => editor.walls.value,
    getInputUnit: () => options.getInputUnit?.() ?? 'm',
    beforeBegin: () => {
      cancelSelectionBoxDrag()
      cancelMoveDragPending()
      cancelOpeningDragPending()
      clearSelection()
    },
    syncPlanToParent,
    onPlaced: () => {
      activeFmlTool.value = null
    },
  })

  const drawSurface = useFmlPreviewDrawSurface({
    selection,
    editor,
    hitTest,
    hoveredJunctionId,
    shiftPressed: axisLocked,
    resolvePoint: resolveSurfacePoint,
    acceptPoint: (point) => {
      if (!drawingRoof.value || !editor.localPlan.value) return true
      return isAllowedDakDrawPoint(editor.localPlan.value, editor.floorIndex.value, point)
    },
    isDak: () => drawingRoof.value,
    onRoofPlaced: () => options.ensureRoofOverlayOn?.(),
    beforeBegin: () => {
      cancelSelectionBoxDrag()
      cancelMoveDragPending()
      cancelOpeningDragPending()
      clearSelection()
    },
    syncPlanToParent,
  })

  const drawLabel = useFmlPreviewDrawLabel({
    selection,
    editor,
    hitTest,
    beforeBegin: () => {
      cancelSelectionBoxDrag()
      cancelMoveDragPending()
      cancelOpeningDragPending()
      clearSelection()
    },
    syncPlanToParent,
  })

  const drawLine = useFmlPreviewDrawLine({
    selection,
    editor,
    hitTest,
    shiftPressed: axisLocked,
    resolvePoint: resolveSurfacePoint,
    beforeBegin: () => {
      cancelSelectionBoxDrag()
      cancelMoveDragPending()
      cancelOpeningDragPending()
      clearSelection()
    },
    syncPlanToParent,
  })

  const measure = useFmlPreviewMeasure({
    hitTest,
    hoveredJunctionId,
    getWalls: () => editor.walls.value,
    shiftPressed: axisLocked,
    beforeBegin: () => {
      cancelSelectionBoxDrag()
      cancelMoveDragPending()
      clearSelection()
      if (options.measureDrawMode?.value !== 'slicer' && options.selectedSliceIndex) {
        options.selectedSliceIndex.value = -1
      }
    },
    getMode: () => options.measureDrawMode?.value ?? 'tape',
    canPersist: () => !inspectMode.value,
    getSlicerSlices: () => editor.planSlices.value,
    getSlicerOffsetSnapCm: () => loadUserSettings().fmlViewer.slicerOffsetSnapCm,
    getManualDimensions: () => {
      const floor = editor.localPlan.value?.floors[editor.floorIndex.value]
      return filterManualDimensions(editor.dimensions.value, readPlanSlices(floor))
    },
    onCommitManual: (a, b) => {
      editor.pushUndo()
      editor.addDimension({ type: 'custom_dimension', a, b })
      syncPlanToParent()
      if (options.dimensionVis) options.dimensionVis.value = 'manual'
    },
    onCommitSlicer: (p, m) => {
      editor.pushUndo()
      const idx = editor.addPlanSlice({ m, p })
      syncPlanToParent()
      if (options.dimensionVis) options.dimensionVis.value = 'slicer'
      if (options.selectedSliceIndex) {
        options.selectedSliceIndex.value = options.slicerEditMode?.value ? idx : -1
      }
    },
  })

  watch(measureMode, (on) => {
    if (!on) measure.clearMeasureHover()
  })

  const addOpening = useFmlPreviewAddOpening({
    editor,
    addDoorSubtype,
    addDoorWidthCm,
    addDoorHeightCm,
    addDoorSillZCm,
    addWindowSubtype,
    addWindowWidthCm,
    addWindowSillZCm,
    addWindowHeightCm,
    bovenlichtPacked,
    bovenlichtDefaults: computed(() => ({
      doorDefault: bovenlichtDefault?.value === true,
      windowDefault: windowBovenlichtDefault?.value === true,
      heightCm: bovenlichtHeightCm?.value ?? BOVENLICHT_HEIGHT_CM,
      gapCm: bovenlichtGapCm?.value ?? BOVENLICHT_GAP_CM,
    })),
    beforePlace: () => {
      cancelSelectionBoxDrag()
      cancelMoveDragPending()
      cancelOpeningDragPending()
      clearSelection()
    },
    syncPlanToParent,
  })

  const addFixture = useFmlPreviewAddFixture({
    editor,
    pendingFixture,
    beforePlace: () => {
      cancelSelectionBoxDrag()
      cancelMoveDragPending()
      cancelOpeningDragPending()
      cancelItemDragPending()
      clearSelection()
    },
    syncPlanToParent,
  })

  const nulpunt = useFmlPreviewNulpunt({
    hitTest,
    editor,
    nulpuntMode,
    getUnderlayLayout: () => options.getUnderlayLayout?.() ?? null,
    getFloorIndex: () => editor.floorIndex.value,
    setFmlNulpuntImageCm: (point) => options.setFmlNulpuntImageCm?.(point),
    markParentPlanSync: () => {
      ignoreNextPlanWatch.value = true
      pendingPlanSyncSkips.value = Math.max(pendingPlanSyncSkips.value, 2)
    },
    nudgeContentLayout: (dx, dy) => viewport.nudgeContentLayout(dx, dy),
    beforeBegin: () => {
      cancelSelectionBoxDrag()
      cancelMoveDragPending()
      clearSelection()
    },
  })
  drawMeasureCancels.cancelNulpuntDrag = nulpunt.cancelNulpuntPending

  const underlayMove = useFmlPreviewUnderlayMove({
    hitTest,
    underlayMoveMode,
    getUnderlayLayout: () => options.getUnderlayLayout?.() ?? null,
    setFmlNulpuntImageCm: (point) => options.setFmlNulpuntImageCm?.(point),
    syncLayoutToParent: (layout) => syncPlanToParent(layout),
    beforeBegin: () => {
      cancelSelectionBoxDrag()
      cancelMoveDragPending()
      clearSelection()
    },
  })
  drawMeasureCancels.cancelUnderlayMoveDrag = underlayMove.cancelUnderlayMoveDrag

  drawMeasureCancels.cancelDrawWallDrag = drawWall.cancelDrawWallDrag
  drawMeasureCancels.cancelDrawRoomDrag = drawRoom.cancelDrawRoomDrag
  drawMeasureCancels.cancelMeasureDrag = measure.cancelMeasureDrag

  watch(drawWallMode, (on) => {
    if (!on) drawWall.cancelDrawWallDrag()
  })
  watch(drawRoomMode, (on) => {
    if (!on) drawRoom.cancelDrawRoomDrag()
  })
  watch(drawLineMode, (on) => {
    if (!on) drawLine.cancelDrawLine()
  })

  function deactivateDrawTool(): void {
    drawWall.cancelDrawWallDrag()
    drawRoom.cancelDrawRoomDrag()
    drawSurface.cancelDrawSurface()
    drawLine.cancelDrawLine()
    measure.cancelMeasureDrag()
    if (options.selectedSliceIndex) options.selectedSliceIndex.value = -1
    activeFmlTool.value = null
  }

  function acceptDrawDraft(): boolean {
    if (drawWall.isDrafting()) return drawWall.commitFromMeasure()
    if (drawRoom.isDrafting()) return drawRoom.commitFromMeasure()
    if (drawSurface.commitDrawSurface()) return true
    return drawLine.commitFromHover()
  }

  function ensureRidgeZDraft(): number {
    if (ridgeZCm.value == null) {
      ridgeZCm.value = Math.round(editor.floorHeightCm.value)
    }
    return ridgeZCm.value
  }

  watch(drawWallMode, (on) => {
    if (on && drawWallKind.value === 'ridge') ensureRidgeZDraft()
  })

  watch(
    () => options.dakMode?.value === true,
    (on) => {
      if (on) {
        drawWallKind.value = 'ridge'
        ensureRidgeZDraft()
        const tool = activeFmlTool.value
        if (tool && tool !== 'draw_wall' && tool !== 'draw_surface' && tool !== 'draw_roof') {
          activeFmlTool.value = null
        }
        if (tool === 'draw_roof') activeFmlTool.value = 'draw_surface'
        selection.settingsItemId.value = null
        selection.moveItemId.value = null
        selection.hoveredItemId.value = null
        cancelItemDragPending()
        return
      }
      drawWallKind.value = 'wall'
      deactivateDrawTool()
    },
    { immediate: true },
  )

  watch(
    activeFmlTool,
    (tool) => {
      if (tool === 'draw_roof') options.ensureRoofOverlayOn?.()
    },
  )

  watch(editor.floorIndex, () => {
    if (options.dakMode?.value === true) return
    deactivateDrawTool()
  })

  function confirmNulpuntBake(): boolean {
    const applied = nulpunt.confirmNulpuntBake()
    if (!applied) return false
    syncPlanToParent(applied.layout)
    return true
  }

  return {
    // Modifier refs
    settingsMod,
    axisLockMod,
    moveMod,
    pendingFixture,
    ridgeZCm,

    // Mode computeds
    drawWallMode,
    drawRoomMode,
    drawSurfaceMode,
    drawLabelMode,
    drawLineMode,
    addDoorMode,
    addWindowMode,
    addFixtureMode,
    measureMode,
    nulpuntMode,

    // Draw composables
    drawWall,
    drawRoom,
    drawSurface,
    drawLabel,
    drawLine,
    measure,
    addOpening,
    addFixture,
    nulpunt,
    underlayMove,

    // Snap resolvers
    resolveDrawPoint,
    resolveRoomStartPoint,
    resolveRoomEndPoint,
    resolveSurfacePoint,

    // Cancellers / orchestrators
    drawMeasureCancels,
    deactivateDrawTool,
    acceptDrawDraft,
    confirmNulpuntBake,
    ensureRidgeZDraft,
  }
}

export type ToolCoordinatorApi = ReturnType<typeof useFmlPreviewToolCoordinator>
