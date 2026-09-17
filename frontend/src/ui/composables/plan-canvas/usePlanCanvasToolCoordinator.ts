import { computed, ref, watch, type Ref, type ComputedRef } from 'vue'
import { resolveDoorAddPreset, resolveWindowAddPreset } from '@/core/plan/opening-add-presets'
import type { Point2D } from '@/core/plan/types'
import { filterManualDimensions, readPlanSlices } from '@/core/plan/plan-slices'
import { isAllowedDakDrawPoint } from '@/ui/composables/plan-canvas/plan-canvas-dak-draw-snap'
import type { usePlanEditor } from '@/ui/composables/usePlanEditor'
import type { HitTestApi } from './plan-canvas-hit-test-api'
import { usePlanCanvasAddOpening } from './usePlanCanvasAddOpening'
import { usePlanCanvasDrawWall } from './usePlanCanvasDrawWall'
import { usePlanCanvasDrawRoom } from './usePlanCanvasDrawRoom'
import { usePlanCanvasDrawDormer } from './usePlanCanvasDrawDormer'
import { usePlanCanvasDrawSurface } from './usePlanCanvasDrawSurface'
import { usePlanCanvasDrawLabel } from './usePlanCanvasDrawLabel'
import { usePlanCanvasDrawLine } from './usePlanCanvasDrawLine'
import { usePlanCanvasMeasure, type MeasureDrawMode } from './usePlanCanvasMeasure'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import { loadUserSettings } from '@/ui/composables/settings/user-settings'
import { usePlanCanvasNulpunt } from './usePlanCanvasNulpunt'
import { usePlanCanvasUnderlayMove } from './usePlanCanvasUnderlayMove'
import { usePlanCanvasAddFixture } from './usePlanCanvasAddFixture'
import type { FixturePlaceOption } from '@/core/plan/fixture-refid-catalog'
import type { PlanCanvasSelectionRefs } from './plan-canvas-selection-types'
import type { PlanViewContext } from './plan-view-context'
import type { PlanSnapResolve } from './plan-canvas-snap-resolve'
import {
  resolveBovenlichtDefaults,
  type PlanSessionDefaults,
} from './plan-canvas-session-defaults'
import type { ContentLayout } from '@/ui/composables/canvas-kernel/usePlanCanvasViewport'
import type { UnderlayOriginLayout } from '@/core/plan/translate-floor-plan'

type EditorApi = ReturnType<typeof usePlanEditor>

interface ToolCoordinatorOptions {
  hitTest: HitTestApi
  selection: PlanCanvasSelectionRefs
  editor: EditorApi
  /** Gedeelde snap-geometrie; ook de SelectionCoordinator leest deze service. */
  snap: PlanSnapResolve
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
  /** Wat een nieuwe opening erft van de instellingen. */
  session: PlanSessionDefaults
  view: PlanViewContext
  roofOverlayOnPlan?: Ref<boolean>
  ensureRoofOverlayOn?: () => void
  measureDrawMode?: Ref<MeasureDrawMode>
  slicerEditMode?: Ref<boolean>
  dimensionVis?: Ref<import('@/core/plan/plan-dimension-vis').DimensionVis>
  selectedSliceIndex?: Ref<number>
  getUnderlayLayout?: () => UnderlayOriginLayout | null
  setPlanNulpuntImageCm?: (point: Point2D | null) => void
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
  /** Kopie-frame tot volgende place; null = Settings-default. */
  takePendingPlaceFrame?: () => import('@/core/plan/opening-display-geom').OpeningFrameCm | null
  /** Refs owned by WallSelection — passed in to avoid circular deps. */
  wallThicknessDraft: Ref<number>
  wallHeightDraft: Ref<number>
  wallBottomZDraft: Ref<number>
  /** Shared refs created by the assembler. */
  ridgeZCm: Ref<number | undefined>
  pendingFixture: Ref<FixturePlaceOption | null>
}

export function usePlanCanvasToolCoordinator(options: ToolCoordinatorOptions) {
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
    activePlanTool,
    drawWallKind,
    drawRoomKind,
  } = selection

  const settingsMod = ref(false)
  const axisLockMod = ref(false)
  const moveMod = ref(false)
  const pendingFixture = options.pendingFixture
  const ridgeZCm = options.ridgeZCm

  const drawingRoof = options.snap.drawingRoof
  const drawWallMode = computed(() => activePlanTool.value === 'draw_wall')
  const drawRoomMode = computed(() => activePlanTool.value === 'draw_room')
  const drawSurfaceMode = computed(
    () =>
      (areaSurfaceEditEnabled.value && activePlanTool.value === 'draw_surface') ||
      activePlanTool.value === 'draw_roof',
  )
  const drawLabelMode = computed(
    () => annotationEditEnabled.value && activePlanTool.value === 'draw_label',
  )
  const drawLineMode = computed(
    () => annotationEditEnabled.value && activePlanTool.value === 'draw_line',
  )
  const addDoorMode = computed(() => activePlanTool.value === 'add_door')
  const addWindowMode = computed(() => activePlanTool.value === 'add_window')
  const addFixtureMode = computed(() => touchEditor.value && activePlanTool.value === 'add_fixture')
  const measureMode = computed(() => activePlanTool.value === 'measure')
  const nulpuntMode = computed(() => activePlanTool.value === 'nulpunt')

  watch(
    areaSurfaceEditEnabled,
    (on) => {
      if (on) return
      if (activePlanTool.value === 'draw_surface') activePlanTool.value = null
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
      if (activePlanTool.value === 'draw_label' || activePlanTool.value === 'draw_line') {
        activePlanTool.value = null
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
    if (on && nulpuntMode.value) activePlanTool.value = null
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

  const {
    resolveDrawPoint,
    resolveDormerFrontPoint,
    resolveRoomStartPoint,
    resolveRoomEndPoint,
    resolveSurfacePoint,
  } =
    options.snap

  const { wallThicknessDraft, wallHeightDraft, wallBottomZDraft } = options

  const drawWall = usePlanCanvasDrawWall({
    hitTest,
    editor,
    hoveredJunctionId,
    wallThicknessDraft,
    wallHeightDraft,
    wallBottomZDraft,
    drawKind: drawWallKind,
    ridgeZCm,
    requireFloorIndex: () =>
      options.view.mode === 'dak' ? editor.floorIndex.value : undefined,
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
      activePlanTool.value = null
    },
  })

  const drawRoom = usePlanCanvasDrawRoom({
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
      activePlanTool.value = null
    },
  })

  const drawDormer = usePlanCanvasDrawDormer({
    hitTest,
    editor,
    hoveredJunctionId,
    wallThicknessDraft,
    wallHeightDraft,
    wallBottomZDraft,
    resolveFrontPoint: resolveDormerFrontPoint,
    placeOnSecondClick: () => !coarsePointer.value && !touchNav.value,
    getInputUnit: () => options.getInputUnit?.() ?? 'm',
    beforeBegin: () => {
      cancelSelectionBoxDrag()
      cancelMoveDragPending()
      cancelOpeningDragPending()
      clearSelection()
      drawRoom.cancelDrawRoomDrag()
    },
    syncPlanToParent,
    onPlaced: () => {
      activePlanTool.value = null
    },
  })

  watch(drawRoomKind, (kind, prev) => {
    if (kind === prev) return
    if (kind === 'dormer') drawRoom.cancelDrawRoomDrag()
    else drawDormer.cancelDrawDormer()
  })

  const drawSurface = usePlanCanvasDrawSurface({
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

  const drawLabel = usePlanCanvasDrawLabel({
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

  const drawLine = usePlanCanvasDrawLine({
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

  const measure = usePlanCanvasMeasure({
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
    getSlicerOffsetSnapCm: () => loadUserSettings().planDisplay.slicerOffsetSnapCm,
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

  const addOpening = usePlanCanvasAddOpening({
    editor,
    addDoorSubtype,
    addDoorWidthCm,
    addDoorHeightCm,
    addDoorSillZCm,
    addWindowSubtype,
    addWindowWidthCm,
    addWindowSillZCm,
    addWindowHeightCm,
    bovenlichtPacked: options.session.bovenlichtPacked,
    bovenlichtDefaults: resolveBovenlichtDefaults(options.session),
    resolvePlaceFrame: (type) => {
      const pending = options.takePendingPlaceFrame?.()
      if (pending) return pending
      const defaults = loadUserSettings().planDisplay.openingFrameDefaults
      return type === 'door' ? { ...defaults.door } : { ...defaults.window }
    },
    beforePlace: () => {
      cancelSelectionBoxDrag()
      cancelMoveDragPending()
      cancelOpeningDragPending()
      clearSelection()
    },
    syncPlanToParent,
  })

  const addFixture = usePlanCanvasAddFixture({
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

  const nulpunt = usePlanCanvasNulpunt({
    hitTest,
    editor,
    nulpuntMode,
    getUnderlayLayout: () => options.getUnderlayLayout?.() ?? null,
    getFloorIndex: () => editor.floorIndex.value,
    setPlanNulpuntImageCm: (point) => options.setPlanNulpuntImageCm?.(point),
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

  const underlayMove = usePlanCanvasUnderlayMove({
    hitTest,
    underlayMoveMode,
    getUnderlayLayout: () => options.getUnderlayLayout?.() ?? null,
    setPlanNulpuntImageCm: (point) => options.setPlanNulpuntImageCm?.(point),
    syncLayoutToParent: (layout) => syncPlanToParent(layout),
    beforeBegin: () => {
      cancelSelectionBoxDrag()
      cancelMoveDragPending()
      clearSelection()
    },
  })
  drawMeasureCancels.cancelUnderlayMoveDrag = underlayMove.cancelUnderlayMoveDrag

  drawMeasureCancels.cancelDrawWallDrag = drawWall.cancelDrawWallDrag
  drawMeasureCancels.cancelDrawRoomDrag = () => {
    drawRoom.cancelDrawRoomDrag()
    drawDormer.cancelDrawDormer()
  }
  drawMeasureCancels.cancelMeasureDrag = measure.cancelMeasureDrag

  watch(drawWallMode, (on) => {
    if (!on) drawWall.cancelDrawWallDrag()
  })
  watch(drawRoomMode, (on) => {
    if (!on) {
      drawRoom.cancelDrawRoomDrag()
      drawDormer.cancelDrawDormer()
    }
  })
  watch(drawLineMode, (on) => {
    if (!on) drawLine.cancelDrawLine()
  })

  function deactivateDrawTool(): void {
    drawWall.cancelDrawWallDrag()
    drawRoom.cancelDrawRoomDrag()
    drawDormer.cancelDrawDormer()
    drawSurface.cancelDrawSurface()
    drawLine.cancelDrawLine()
    measure.cancelMeasureDrag()
    if (options.selectedSliceIndex) options.selectedSliceIndex.value = -1
    activePlanTool.value = null
  }

  function acceptDrawDraft(): boolean {
    if (drawWall.isDrafting()) return drawWall.commitFromMeasure()
    if (drawDormer.isDrafting()) return drawDormer.commitFromMeasure()
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
    () => options.view.mode === 'dak',
    (on) => {
      if (on) {
        drawWallKind.value = 'ridge'
        ensureRidgeZDraft()
        const tool = activePlanTool.value
        if (tool && tool !== 'draw_wall' && tool !== 'draw_surface' && tool !== 'draw_roof') {
          activePlanTool.value = null
        }
        if (tool === 'draw_roof') activePlanTool.value = 'draw_surface'
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
    activePlanTool,
    (tool) => {
      if (tool === 'draw_roof') options.ensureRoofOverlayOn?.()
    },
  )

  watch(editor.floorIndex, () => {
    if (options.view.mode === 'dak') return
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
    drawDormer,
    drawSurface,
    drawLabel,
    drawLine,
    measure,
    addOpening,
    addFixture,
    nulpunt,
    underlayMove,

    // Cancellers / orchestrators
    drawMeasureCancels,
    deactivateDrawTool,
    acceptDrawDraft,
    confirmNulpuntBake,
    ensureRidgeZDraft,
  }
}

export type ToolCoordinatorApi = ReturnType<typeof usePlanCanvasToolCoordinator>
