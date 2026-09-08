import { computed, ref, watch, type Ref } from 'vue'
import type Konva from 'konva'
import type { FloorPlan, Point2D } from '@/core/fml/types'
import { isRidgeWallId } from '@/core/fml/ridge-walls'
import type { FmlThicknessBand } from '@/core/fml/fml-wall-thickness-tiers'
import type { useFmlPreviewEditor } from '@/ui/composables/useFmlPreviewEditor'
import type { FmlInspectHit } from './fml-inspect'
import { createFmlPreviewEditorKeyHandlers } from './fml-preview-editor-keyboard'
import type { HitTestApi } from './fml-preview-hit-test-api'
import { useFmlPreviewInspect } from './useFmlPreviewInspect'
import { useFmlPreviewAreaLabelDrag } from './useFmlPreviewAreaLabelDrag'
import type { MeasureDrawMode } from './useFmlPreviewMeasure'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import { useFmlPreviewOpeningDrag } from './useFmlPreviewOpeningDrag'
import { useFmlPreviewOpeningResize } from './useFmlPreviewOpeningResize'
import { buildOpeningMoveMeasureLines } from './fml-preview-opening-move-measure'
import {
  buildWallsInternalMeasureLines,
  wallIdsForJunctionMove,
  wallIdsForSegmentMove,
} from './fml-preview-wall-internal-measure'
import { useFmlPreviewPanZoom } from './useFmlPreviewPanZoom'
import { useFmlPreviewPointer } from './useFmlPreviewPointer'
import { filterManualDimensions, readBtfSlices } from '@/core/fml/btf-slices'
import { hitTestDimensionAtCm } from '@/core/fml/offset-dimension-line'
import { useFmlPreviewWallDrag } from './useFmlPreviewWallDrag'
import { useFmlPreviewDimensionDrag } from './useFmlPreviewDimensionDrag'
import { useFmlPreviewWallMove } from './useFmlPreviewWallMove'
import { useFmlPreviewJunctionMove } from './useFmlPreviewJunctionMove'
import { useFmlPreviewOpeningMove } from './useFmlPreviewOpeningMove'
import { useFmlPreviewItemDrag } from './useFmlPreviewItemDrag'
import { useFmlPreviewItemResize } from './useFmlPreviewItemResize'
import { useFmlPreviewItemRotate } from './useFmlPreviewItemRotate'
import { createFmlPreviewDraftCommitScheduler } from './fml-preview-draft-commit'

export type { FmlPreviewSelectionRefs } from './fml-preview-selection'
export { createFmlPreviewSelection } from './fml-preview-selection'
import type { FmlPreviewSelectionRefs } from './fml-preview-selection'

import type { ContentLayout } from './useFmlPreviewViewport'
import type { UnderlayOriginLayout } from '@/core/fml/translate-floor-plan'
import { useFmlPreviewToolCoordinator } from './useFmlPreviewToolCoordinator'
import { useFmlPreviewSelectionCoordinator } from './useFmlPreviewSelectionCoordinator'

type EditorApi = ReturnType<typeof useFmlPreviewEditor>

interface ViewportApi {
  viewScale: Ref<number>
  viewPosition: Ref<{ x: number; y: number }>
  contentLayout: Ref<ContentLayout | null>
  resetView: () => void
  refitContentLayout: () => void
  nudgeContentLayout: (dxCm: number, dyCm: number) => void
  worldOverflowsCurrentLayout: () => boolean
}

export function useFmlPreviewInteraction(options: {
  viewport: ViewportApi
  hitTest: HitTestApi
  selection: FmlPreviewSelectionRefs
  editor: EditorApi
  emit: (
    event: 'planUpdate' | 'thicknessWallPick' | 'cancelThicknessPick',
    payload?: FloorPlan | string,
    layout?: UnderlayOriginLayout | null,
  ) => void
  containerRef: Ref<HTMLDivElement | null>
  contentGroupRef: Ref<{ getNode: () => Konva.Group } | null>
  shiftPressed: Ref<boolean>
  spacePressed: Ref<boolean>
  thicknessPickTier: Ref<FmlThicknessBand | null>
  bovenlichtDefault?: Ref<boolean>
  windowBovenlichtDefault?: Ref<boolean>
  bovenlichtHeightCm?: Ref<number>
  bovenlichtGapCm?: Ref<number>
  bovenlichtPacked?: Ref<boolean>
  getUnderlayLayout?: () => UnderlayOriginLayout | null
  setFmlNulpuntImageCm?: (point: Point2D | null) => void
  underlayMoveMode?: Ref<boolean>
  areaSurfaceEditEnabled?: Ref<boolean>
  annotationEditEnabled?: Ref<boolean>
  labelsVisible?: Ref<boolean>
  inspectMode?: Ref<boolean>
  touchEditor?: Ref<boolean>
  touchNav?: Ref<boolean>
  coarsePointer?: Ref<boolean>
  dakMode?: Ref<boolean>
  measureDrawMode?: Ref<MeasureDrawMode>
  slicerEditMode?: Ref<boolean>
  dimensionVis?: Ref<import('@/core/fml/fml-dimension-vis').DimensionVis>
  selectedSliceIndex?: Ref<number>
  onInspectSelect?: (hit: FmlInspectHit | null) => void
  getInputUnit?: () => ScaleInputUnit
  onKeyDown: (event: KeyboardEvent) => void
  onKeyUp: (event: KeyboardEvent) => void
  thicknessPresetCms?: Ref<number[] | undefined>
}) {
  const {
    viewport,
    hitTest,
    selection,
    editor,
    emit,
    contentGroupRef,
    shiftPressed,
    spacePressed,
    thicknessPickTier,
    bovenlichtDefault,
    windowBovenlichtDefault,
    bovenlichtHeightCm,
    bovenlichtGapCm,
    bovenlichtPacked,
    getUnderlayLayout,
    setFmlNulpuntImageCm,
    underlayMoveMode: underlayMoveModeProp,
    areaSurfaceEditEnabled: areaSurfaceEditEnabledProp,
    annotationEditEnabled: annotationEditEnabledProp,
    labelsVisible: labelsVisibleProp,
    inspectMode: inspectModeProp,
    touchEditor: touchEditorProp,
    touchNav: touchNavProp,
    coarsePointer: coarsePointerProp,
    onInspectSelect,
    onKeyDown,
    onKeyUp,
  } = options

  const areaSurfaceEditEnabled = computed(() => areaSurfaceEditEnabledProp?.value === true)
  const annotationEditEnabled = computed(() => annotationEditEnabledProp?.value === true)
  const labelsVisible = computed(() => labelsVisibleProp?.value !== false)
  const inspectMode = computed(() => inspectModeProp?.value === true)
  const touchEditor = computed(() => touchEditorProp?.value === true)
  const touchNav = computed(() => touchNavProp?.value === true)
  const coarsePointer = computed(() => coarsePointerProp?.value === true)

  const underlayMoveModeInternal = ref(false)
  const underlayMoveMode = computed({
    get: () => underlayMoveModeProp?.value ?? underlayMoveModeInternal.value,
    set: (on: boolean) => {
      if (underlayMoveModeProp) underlayMoveModeProp.value = on
      else underlayMoveModeInternal.value = on
    },
  })
  const isPanDragging = ref(false)

  const draftCommit = createFmlPreviewDraftCommitScheduler()
  function flushPendingFieldCommits(): void {
    draftCommit.flushAll()
  }
  function cancelPendingFieldCommits(): void {
    draftCommit.cancelAll()
  }

  const ignoreNextPlanWatch = ref(false)
  const pendingPlanSyncSkips = ref(0)

  function syncPlanToParent(layout?: UnderlayOriginLayout | null): void {
    if (!editor.localPlan.value) return
    ignoreNextPlanWatch.value = true
    pendingPlanSyncSkips.value = Math.max(pendingPlanSyncSkips.value, 2)
    editor.prepareParentSync()
    emit('planUpdate', JSON.parse(JSON.stringify(editor.localPlan.value)) as FloorPlan, layout)
  }

  function syncPlanToParentAfterUndo(): void {
    const layoutOrigin = editor.consumePendingUndoLayoutOrigin()
    if (layoutOrigin === undefined) {
      syncPlanToParent()
      return
    }
    const current = getUnderlayLayout?.() ?? null
    if (!current) {
      syncPlanToParent()
      return
    }
    const nextLayout: UnderlayOriginLayout = {
      ...current,
      origin: layoutOrigin ? { ...layoutOrigin } : current.origin,
    }
    setFmlNulpuntImageCm?.(nextLayout.origin)
    viewport.refitContentLayout()
    syncPlanToParent(nextLayout)
  }

  const axisLockMod = ref(false)
  const axisLocked = computed(() => shiftPressed.value || axisLockMod.value)

  // Shared refs owned here (needed by both coordinators)
  const ridgeZCm = ref<number | undefined>(undefined)
  const pendingFixture = ref<import('@/core/fml/fixture-refid-catalog').FixturePlaceOption | null>(
    null,
  )

  // --- Drag/Move stack (stays in Interaction) ---

  const wallDrag = useFmlPreviewWallDrag({
    hitTest,
    editor,
    selection,
    spacePressed,
    syncPlanToParent,
  })

  const wallMove = useFmlPreviewWallMove({
    hitTest,
    editor,
    moveWallId: selection.moveWallId,
    spacePressed,
    getInputUnit: () => options.getInputUnit?.() ?? 'm',
    syncPlanToParent,
  })

  const junctionMove = useFmlPreviewJunctionMove({
    hitTest,
    editor,
    pinnedJunctionId: selection.pinnedJunctionId,
    draggingJunctionId: selection.draggingJunctionId,
    spacePressed,
    getInputUnit: () => options.getInputUnit?.() ?? 'm',
    syncPlanToParent,
  })

  const openingMove = useFmlPreviewOpeningMove({
    hitTest,
    editor,
    moveOpeningId: selection.moveOpeningId,
    spacePressed,
    getInputUnit: () => options.getInputUnit?.() ?? 'm',
    syncPlanToParent,
  })

  function isPreciseMoveDrafting(): boolean {
    return wallMove.isDrafting() || junctionMove.isDrafting() || openingMove.isDrafting()
  }

  function cancelPreciseMoves(): void {
    wallMove.cancelWallMove()
    junctionMove.cancelJunctionMove()
    openingMove.cancelOpeningMove()
  }

  const openingDrag = useFmlPreviewOpeningDrag({
    hitTest,
    editor,
    selection,
    spacePressed,
    syncPlanToParent,
  })

  const itemDrag = useFmlPreviewItemDrag({
    hitTest,
    editor,
    selection,
    spacePressed,
    settingsMod: ref(false), // placeholder, overwritten below
    syncPlanToParent,
  })

  const areaLabelDrag = useFmlPreviewAreaLabelDrag({
    hitTest,
    editor,
    selection,
    spacePressed,
    syncPlanToParent,
  })

  const dimensionDrag = useFmlPreviewDimensionDrag({
    clientToCm: (x, y) => hitTest.clientToCm(x, y),
    editor,
    selection,
    spacePressed,
    syncPlanToParent,
  })

  // --- Selection Coordinator (created first — owns wallThicknessDraft etc.) ---

  let toolCoordEnsureRidgeZDraft: () => number = () => 0

  const drawCancelsDeferred = {
    cancelDrawWallDrag: () => {},
    cancelMeasureDrag: () => {},
  }

  const selCoord = useFmlPreviewSelectionCoordinator({
    hitTest,
    selection,
    editor,
    draftCommit,
    syncPlanToParent,
    flushPendingFieldCommits,
    cancelMoveDragPending: () => wallDrag.cancelMoveDragPending(),
    cancelOpeningDragPending: () => openingDrag.cancelOpeningDragPending(),
    cancelItemDragPending: () => itemDrag.cancelItemDragPending(),
    cancelDrawWallDrag: () => drawCancelsDeferred.cancelDrawWallDrag(),
    cancelMeasureDrag: () => drawCancelsDeferred.cancelMeasureDrag(),
    containerRef: options.containerRef,
    axisLocked,
    areaSurfaceEditEnabled,
    bovenlichtDefault,
    windowBovenlichtDefault,
    bovenlichtHeightCm,
    bovenlichtGapCm,
    dakMode: options.dakMode,
    ridgeZCm,
    pendingFixture,
    ensureRidgeZDraft: () => toolCoordEnsureRidgeZDraft(),
    thicknessPresetCms: options.thicknessPresetCms,
  })

  // --- Tool Coordinator ---

  const toolCoord = useFmlPreviewToolCoordinator({
    hitTest,
    selection,
    editor,
    viewport: {
      viewScale: viewport.viewScale,
      contentLayout: viewport.contentLayout,
      nudgeContentLayout: viewport.nudgeContentLayout,
    },
    shiftPressed,
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
    dakMode: options.dakMode,
    measureDrawMode: options.measureDrawMode,
    slicerEditMode: options.slicerEditMode,
    dimensionVis: options.dimensionVis,
    selectedSliceIndex: options.selectedSliceIndex,
    getUnderlayLayout,
    setFmlNulpuntImageCm,
    underlayMoveMode: underlayMoveMode,
    getInputUnit: options.getInputUnit,
    syncPlanToParent,
    ignoreNextPlanWatch,
    pendingPlanSyncSkips,
    clearSelection: (opts?) => selCoord.clearSelection(opts),
    cancelSelectionBoxDrag: () => selCoord.cancelSelectionBoxDrag(),
    cancelMoveDragPending: () => wallDrag.cancelMoveDragPending(),
    cancelOpeningDragPending: () => openingDrag.cancelOpeningDragPending(),
    cancelItemDragPending: () => itemDrag.cancelItemDragPending(),
    flushPendingFieldCommits,
    wallThicknessDraft: selCoord.wallThicknessDraft,
    wallHeightDraft: selCoord.wallHeightDraft,
    wallBottomZDraft: selCoord.wallBottomZDraft,
    ridgeZCm,
    pendingFixture,
  })

  // Wire deferred bindings now that toolCoord exists
  drawCancelsDeferred.cancelDrawWallDrag = toolCoord.drawMeasureCancels.cancelDrawWallDrag
  drawCancelsDeferred.cancelMeasureDrag = toolCoord.drawMeasureCancels.cancelMeasureDrag
  toolCoordEnsureRidgeZDraft = toolCoord.ensureRidgeZDraft

  // Wire itemDrag.settingsMod to ToolCoordinator's settingsMod
  ;(itemDrag as unknown as { settingsMod: Ref<boolean> }).settingsMod = toolCoord.settingsMod

  const {
    settingsMod,
    moveMod,
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
    deactivateDrawTool,
    acceptDrawDraft,
    confirmNulpuntBake,
    resolveSurfacePoint,
  } = toolCoord

  // Bind the resolveSurfacePoint into surfaceEdit (deferred circular dep)
  selCoord.bindResolveSurfacePoint(resolveSurfacePoint)

  const {
    selectedFacadeGroupPanel,
    wallThicknessDraft,
    wallThicknessMixed,
    wallBalanceDraft,
    wallBalanceMixed,
    wallHeightDraft,
    wallHeightMixed,
    wallBottomZDraft,
    wallBottomZMixed,
    junctionHeightDraft,
    junctionHeightMixed,
    junctionBottomZDraft,
    junctionBottomZMixed,
    selectionBoxMode,
    selectionBoxPreview,
    boxSelectKind,
    selectAllOfBoxKind,
    syncWallThicknessDraftFromSelection,
    toggleSettingsWall,
    toggleSettingsJunction,
    onWallThicknessCm,
    commitWallThickness,
    applyWallsThicknessCm,
    onWallBalanceInput,
    commitWallBalance,
    onWallHeightCm,
    commitWallHeight,
    onWallBottomZCm,
    commitWallBottomZ,
    onJunctionHeightCm,
    commitJunctionHeight,
    onJunctionBottomZCm,
    commitJunctionBottomZ,
    splitSelectedWall,
    deleteSelectedWalls,
    facadeGroupOptions,
    facadeGroupChecks,
    facadeMemberIdsOnActiveFloor,
    stampGroupDraft,
    stampGroupMixed,
    stampMemberIdsOnActiveFloor,
    applyFacadeGroupSelection,
    removeFacadeGroupFromSelection,
    editAllFacadeGroups,
    createFacadeGroupFromSelection,
    toggleFacadeGroup,
    applyStampGroupSelection,
    renameSelectedFacadeGroup,
    renameFacadeGroupById,
    selectFacadeGroupMembers,
    selectFacadeGroupMembersById,
    selectStampGroupMembers,
    canSelectFacadeMembers,
    canSelectMembersOfGroup,
    canSelectStampMembers,
    clearSelection,
    toggleSelectionBoxMode,
    cancelSelectionBoxDrag,
    beginSelectionBoxDrag,
    toggleSettingsOpening,
    clearOpeningSelectionState,
    areaSelection,
    surfaceEdit,
    toggleSettingsLabel,
    toggleSettingsLine,
    labelTextDraft,
    toggleSettingsItem,
    deleteSelectedItem,
    deleteSelected,
    onJunctionHover,
    onJunctionHoverEnd,
    applyRidgeZInput,
    applySelectedWallKind,
    ridgeFloorDraft,
    ridgeFloorMixed,
    applyRidgeFloorInput,
    sanitizeWalls,
    bindWallsToRoof,
    applyStampToActiveFloor,
    canApplyStampOnActiveFloor,
  } = selCoord

  // --- moveMod watch (depends on both coordinators) ---

  watch(moveMod, (on) => {
    if (!on && isPreciseMoveDrafting() && touchNav.value) cancelPreciseMoves()
  })
  watch(selection.activeFmlTool, (tool) => {
    if (tool != null && isPreciseMoveDrafting()) cancelPreciseMoves()
  })

  // --- Inspect ---

  const inspect = useFmlPreviewInspect({
    hitTest,
    selection,
    walls: editor.walls,
    surfaces: editor.surfaces,
    floorIndex: editor.floorIndex,
    plan: editor.localPlan,
    onInspectSelect,
  })
  const { applyInspectPick, updateInspectHover, clearInspectSelect } = inspect

  // --- Computed measure lines ---

  const { draggingJunction, draggingWall } = wallDrag
  const { draggingDimension } = dimensionDrag
  const { draggingOpening } = openingDrag

  const openingMoveMeasureLines = computed(() => {
    const openingId =
      selection.moveOpeningId.value ??
      (selection.settingsOpeningIds.value.length === 1
        ? selection.settingsOpeningIds.value[0]
        : null)
    if (!openingId) return []
    const located = editor.resolveOpening(openingId)
    if (!located) return []
    return buildOpeningMoveMeasureLines(located.wall, located.opening, editor.walls.value)
  })

  const wallInternalMeasureLines = computed(() => {
    if (selection.moveOpeningId.value || draggingOpening.value) return []
    const walls = editor.selectableWalls.value
    const junctions = editor.junctions.value
    const ids = new Set<string>()

    if (draggingJunction.value || junctionMove.isDrafting()) {
      const junctionId = selection.draggingJunctionId.value ?? selection.pinnedJunctionId.value
      if (junctionId) {
        for (const id of wallIdsForJunctionMove(junctionId, junctions)) ids.add(id)
      }
    }

    if (draggingWall.value || wallMove.isDrafting()) {
      const wallId = selection.moveWallId.value
      if (wallId) {
        for (const id of wallIdsForSegmentMove(wallId, junctions)) ids.add(id)
      }
    }

    if (ids.size === 0) return []
    return buildWallsInternalMeasureLines([...ids], walls)
  })

  // --- Item resize/rotate ---

  const selectedHandleItemId = computed(
    () => selection.settingsItemId.value ?? selection.moveItemId.value,
  )
  const screenPxToCm = (px: number): number => {
    const layout = viewport.contentLayout.value
    if (!layout) return 10
    return px / layout.scale / viewport.viewScale.value
  }

  const itemResize = useFmlPreviewItemResize({
    editor,
    selectedItemId: selectedHandleItemId,
    settingsItemId: selection.settingsItemId,
    clientToCm: (x, y) => hitTest.clientToCm(x, y),
    screenPxToCm,
    syncPlanToParent,
  })

  const itemRotate = useFmlPreviewItemRotate({
    editor,
    selectedItemId: selectedHandleItemId,
    settingsItemId: selection.settingsItemId,
    clientToCm: (x, y) => hitTest.clientToCm(x, y),
    screenPxToCm,
    settingsMod,
    syncPlanToParent,
  })

  const openingResize = useFmlPreviewOpeningResize({
    editor,
    selection,
    clientToCm: (x, y) => hitTest.clientToCm(x, y),
    screenPxToCm,
    coarseHits: touchNav,
    inspectMode,
    spacePressed,
    syncPlanToParent,
    syncOpeningDraftFromSelection: () => selCoord.syncOpeningDraftFromSelection(),
  })

  // --- PanZoom ---

  const panZoom = useFmlPreviewPanZoom({
    viewport,
    containerRef: options.containerRef,
    isPanDragging,
    onBeforePan: wallDrag.cancelMoveDragPending,
  })

  // --- undoEdit ---

  function undoEdit(): void {
    if (editor.undo()) {
      syncPlanToParentAfterUndo()
      syncWallThicknessDraftFromSelection()
    }
  }

  // --- Inspect-mode watch ---

  watch(inspectMode, (on) => {
    if (!on) return
    selection.activeFmlTool.value = null
    underlayMoveMode.value = false
    selection.moveWallId.value = null
    selection.moveOpeningId.value = null
    selection.moveDimensionId.value = null
    selection.hoveredDimensionId.value = null
    selection.pinnedJunctionId.value = null
    selection.surfaceEditId.value = null
    selection.roofPolyMutate.value = false
    selection.drawSurfacePoints.value = null
    selection.drawLinePoints.value = null
    wallDrag.cancelMoveDragPending()
    dimensionDrag.cleanup()
    openingDrag.cancelOpeningDragPending()
    cancelSelectionBoxDrag()
    cancelPreciseMoves()
    drawWall.cancelDrawWallDrag()
    drawRoom.cancelDrawRoomDrag()
    drawSurface.cancelDrawSurface()
    drawLine.cancelDrawLine()
    measure.cancelMeasureDrag()
    nulpunt.cancelNulpuntPending()
    underlayMove.cancelUnderlayMoveDrag()
  })

  // --- Pointer ---

  const { canvasCursor, onWrapPointerDown, onWrapPointerMove, onWrapDblClick, cancelPendingMove } =
    useFmlPreviewPointer({
      hitTest,
      selection,
      modes: {
        drawWallMode,
        drawRoomMode,
        drawSurfaceMode,
        drawLabelMode,
        drawLineMode,
        addDoorMode,
        addWindowMode,
        measureMode,
        nulpuntMode,
        underlayMoveMode,
        selectionBoxMode,
        areaSurfaceEditEnabled,
        annotationEditEnabled,
        labelsVisible,
        inspectMode,
        addFixtureMode,
        settingsMod,
        moveMod,
        touchNav,
        dakMode: computed(() => options.dakMode?.value === true),
        isRidgeWallId: (wallId: string) => isRidgeWallId(editor.localPlan.value, wallId),
        manualDimensionsEnabled: computed(
          () => !inspectMode.value && options.dimensionVis?.value === 'manual',
        ),
        hitTestDimensionAtCm: (cm) => {
          const floor = editor.localPlan.value?.floors[editor.floorIndex.value]
          const manuals = filterManualDimensions(editor.dimensions.value, readBtfSlices(floor))
          const layout = viewport.contentLayout.value
          const scale = layout ? layout.scale * viewport.viewScale.value : 1
          const tol = Math.max(8, 12 / Math.max(1e-6, scale))
          return hitTestDimensionAtCm(cm, manuals, tol)
        },
      },
      drag: {
        draggingWall,
        draggingJunction,
        draggingOpening,
        draggingItem: itemDrag.draggingItem,
        draggingItemResize: itemResize.draggingItemResize,
        draggingItemRotate: itemRotate.draggingItemRotate,
        isWallMoveDrafting: () => wallMove.isDrafting(),
        isJunctionMoveDrafting: () => junctionMove.isDrafting(),
        isOpeningMoveDrafting: () => openingMove.isDrafting(),
        isMeasureDragging: () => measure.isDragging(),
        isNulpuntDragging: () => nulpunt.isDragging(),
        isUnderlayMoveDragging: () => underlayMove.isDragging(),
        isPanDragging,
        draggingDimension,
        draggingAreaLabel: areaLabelDrag.draggingAreaLabel,
      },
      actions: {
        beginPanDrag: panZoom.beginPanDrag,
        onDrawWallClick: drawWall.onDrawWallClick,
        updateDrawWallHover: drawWall.updateDrawWallHover,
        clearDrawWallHover: drawWall.clearDrawWallHover,
        beginMeasure: (event) => {
          if (
            options.measureDrawMode?.value === 'slicer' &&
            options.slicerEditMode?.value === true
          ) {
            return
          }
          measure.beginMeasure(event)
        },
        updateMeasureHover: (event) => {
          if (
            options.measureDrawMode?.value === 'slicer' &&
            options.slicerEditMode?.value === true
          ) {
            measure.clearMeasureHover()
            return
          }
          measure.updateMeasureHover(event)
        },
        clearMeasureHover: measure.clearMeasureHover,
        onDrawRoomClick: drawRoom.onDrawRoomClick,
        updateDrawRoomHover: drawRoom.updateDrawRoomHover,
        clearDrawRoomHover: drawRoom.clearDrawRoomHover,
        onDrawSurfaceClick: drawSurface.onDrawSurfaceClick,
        onDrawSurfaceDblClick: drawSurface.onDrawSurfaceDblClick,
        updateDrawSurfaceHover: drawSurface.updateDrawSurfaceHover,
        clearDrawSurfaceHover: drawSurface.clearDrawSurfaceHover,
        onDrawLabelClick: drawLabel.onDrawLabelClick,
        onDrawLineClick: drawLine.onDrawLineClick,
        updateDrawLineHover: drawLine.updateDrawLineHover,
        clearDrawLineHover: drawLine.clearDrawLineHover,
        onSurfaceEditPointerDown: surfaceEdit.onPointerDown,
        beginNulpuntDrag: nulpunt.beginNulpuntDrag,
        beginUnderlayMoveDrag: underlayMove.beginUnderlayMoveDrag,
        placeDoor: addOpening.placeDoor,
        placeWindow: addOpening.placeWindow,
        startJunctionDrag: wallDrag.startJunctionDrag,
        onJunctionMoveClick: (junction, event) => {
          wallDrag.cancelMoveDragPending()
          openingDrag.cancelOpeningDragPending()
          return junctionMove.onJunctionMoveClick(junction, event)
        },
        updateJunctionMoveHover: junctionMove.updateJunctionMoveHover,
        beginSelectionBoxDrag,
        toggleSettingsOpening,
        toggleSettingsArea: areaSelection.toggleSettingsArea,
        selectSettingsArea: areaSelection.selectSettingsArea,
        toggleSettingsSurface: areaSelection.toggleSettingsSurface,
        beginAreaLabelDrag: areaLabelDrag.beginAreaLabelDrag,
        startAreaLabelDragPending: areaLabelDrag.startAreaLabelDragPending,
        selectRoofSurface: areaSelection.selectRoofSurface,
        toggleSettingsLabel,
        toggleSettingsLine,
        toggleSettingsWall,
        toggleSettingsJunction,
        clearSelection,
        clearOpeningSelectionState,
        beginOpeningDrag: openingDrag.beginOpeningDrag,
        startOpeningDragPending: openingDrag.startOpeningDragPending,
        hitOpeningHandle: (cm) => openingResize.hitOpeningHandleAtCm(cm),
        beginOpeningResize: openingResize.beginOpeningResize,
        onOpeningMoveClick: (openingId, event) => {
          wallDrag.cancelMoveDragPending()
          openingDrag.cancelOpeningDragPending()
          return openingMove.onOpeningMoveClick(openingId, event)
        },
        updateOpeningMoveHover: openingMove.updateOpeningMoveHover,
        beginWallDrag: wallDrag.beginWallDrag,
        startMoveDragPending: wallDrag.startMoveDragPending,
        onWallMoveClick: (wallId, event) => {
          wallDrag.cancelMoveDragPending()
          return wallMove.onWallMoveClick(wallId, event)
        },
        updateWallMoveHover: wallMove.updateWallMoveHover,
        stopContentGroupDrag: () => {
          contentGroupRef.value?.getNode()?.stopDrag()
        },
        applyInspectPick,
        updateInspectHover,
        placeFixture: addFixture.placeFixture,
        startItemDragPending: itemDrag.startItemDragPending,
        beginItemDrag: itemDrag.beginItemDrag,
        toggleSettingsItem,
        cancelItemDragPending: itemDrag.cancelItemDragPending,
        hitItemResizeHandle: (cm) => itemResize.hitHandleAtCm(cm),
        beginItemResize: itemResize.beginItemResize,
        hitItemRotateHandle: (cm) => itemRotate.hitRotateHandleAtCm(cm),
        beginItemRotate: itemRotate.beginItemRotate,
        startDimensionDragPending: dimensionDrag.startPending,
        beginDimensionDrag: dimensionDrag.beginDrag,
      },
      spacePressed,
      thicknessPickTier,
      emit: (event, payload) => emit(event, payload),
    })

  // --- Keyboard ---

  const { onEditorKeyDown, onEditorKeyUp } = createFmlPreviewEditorKeyHandlers({
    selection,
    inspectMode,
    drawSurfaceMode,
    measureMode,
    nulpuntMode,
    underlayMoveMode,
    thicknessPickTier,
    onKeyDown,
    onKeyUp,
    flushPendingFieldCommits,
    deleteSelected,
    clearSelection,
    clearInspectSelect,
    emitCancelThicknessPick: () => emit('cancelThicknessPick'),
    clearSelectedSlice: () => {
      if (!options.selectedSliceIndex || options.selectedSliceIndex.value < 0) return false
      options.selectedSliceIndex.value = -1
      return true
    },
    undo: () => editor.undo(),
    redo: () => editor.redo(),
    syncPlanToParentAfterUndo,
    drawSurface,
    areaSelection,
    surfaceEdit,
    drawWall,
    drawRoom,
    wallMove,
    junctionMove,
    openingMove,
    drawLine,
    deactivateDrawTool,
    measure,
    nulpunt,
    underlayMove,
  })

  // --- External plan change ---

  function handleExternalPlanChange(): void {
    if (pendingPlanSyncSkips.value > 0) {
      pendingPlanSyncSkips.value -= 1
      ignoreNextPlanWatch.value = pendingPlanSyncSkips.value > 0
      return
    }
    if (ignoreNextPlanWatch.value) {
      ignoreNextPlanWatch.value = false
      return
    }
    cancelPendingFieldCommits()
    clearSelection({ flush: false })
    selection.hoveredOpeningId.value = null
    measure.clearMeasureLines()
    if (!viewport.contentLayout.value || viewport.worldOverflowsCurrentLayout()) {
      viewport.resetView()
    }
  }

  // --- Mount / unmount ---

  function mountKeyboardListeners(): void {
    window.addEventListener('keydown', onEditorKeyDown)
    window.addEventListener('keyup', onEditorKeyUp)
  }

  function unmountInteraction(): void {
    selCoord.cleanupHoverTimer()
    draftCommit.dispose()
    cancelPendingMove()
    cancelPreciseMoves()
    wallDrag.cleanupWallDrag()
    dimensionDrag.cleanup()
    openingDrag.cleanupOpeningDrag()
    openingResize.cleanupOpeningResize()
    itemDrag.cleanupItemDrag()
    areaLabelDrag.cleanupAreaLabelDrag()
    itemResize.cleanupItemResize()
    itemRotate.cleanupItemRotate()
    cancelSelectionBoxDrag()
    drawWall.cancelDrawWallDrag()
    drawRoom.cancelDrawRoomDrag()
    drawSurface.cancelDrawSurface()
    drawLine.cancelDrawLine()
    surfaceEdit.cancelDrag()
    measure.cancelMeasureDrag()
    measure.clearMeasureHover()
    nulpunt.cancelNulpuntPending()
    underlayMove.cancelUnderlayMoveDrag()
    panZoom.endPanDrag()
    window.removeEventListener('keydown', onEditorKeyDown)
    window.removeEventListener('keyup', onEditorKeyUp)
  }

  // --- Flat return ---

  return {
    activeFmlTool: selection.activeFmlTool,
    selectionBoxMode,
    boxSelectKind,
    selectAllOfBoxKind,
    drawWallMode,
    drawRoomMode,
    drawSurfaceMode,
    drawLabelMode,
    drawLineMode,
    addDoorMode,
    addWindowMode,
    measureMode,
    nulpuntMode,
    underlayMoveMode,
    selectionBoxPreview,
    drawWallPreview: drawWall.drawWallPreview,
    drawRoomPreview: drawRoom.drawRoomPreview,
    drawWallDrafting: computed(() => drawWall.isDrafting()),
    drawRoomDrafting: computed(() => drawRoom.isDrafting()),
    wallMoveDrafting: computed(() => isPreciseMoveDrafting()),
    wallMoveMeasureLengthCm: computed(() => {
      if (wallMove.isDrafting()) return wallMove.measureLengthCm.value
      if (junctionMove.isDrafting()) return junctionMove.measureLengthCm.value
      if (openingMove.isDrafting()) return openingMove.measureLengthCm.value
      return 0
    }),
    wallMoveTypeText: computed(() => {
      if (wallMove.isDrafting()) return wallMove.typeText.value
      if (junctionMove.isDrafting()) return junctionMove.typeText.value
      if (openingMove.isDrafting()) return openingMove.typeText.value
      return ''
    }),
    wallMoveLabelCm: computed(() => {
      if (wallMove.isDrafting()) return wallMove.wallMoveLabelCm.value
      if (junctionMove.isDrafting()) return junctionMove.junctionMoveLabelCm.value
      if (openingMove.isDrafting()) return openingMove.openingMoveLabelCm.value
      return null
    }),
    drawLineDrafting: computed(() => (selection.drawLinePoints.value?.length ?? 0) > 0),
    drawSurfaceDrafting: computed(() => (drawSurface.draftPoints.value?.length ?? 0) >= 3),
    drawSurfacePendingRole: drawSurface.pendingRole,
    drawSurfacePendingCutout: drawSurface.pendingCutout,
    drawLineThickness: drawLine.thickness,
    drawLineType: drawLine.lineType,
    drawLineColor: drawLine.color,
    drawLabelText: drawLabel.pendingText,
    drawLabelFontSize: drawLabel.fontSize,
    drawLabelFontColor: drawLabel.fontColor,
    drawLabelOutline: drawLabel.outline,
    drawLabelBold: drawLabel.bold,
    drawLabelItalic: drawLabel.italic,
    drawWallMeasureLengthCm: drawWall.measureLengthCm,
    drawRoomMeasureHCm: drawRoom.measureHCm,
    drawRoomMeasureVCm: drawRoom.measureVCm,
    drawWallTypeText: drawWall.typeText,
    drawRoomTypeHText: drawRoom.typeHText,
    drawRoomTypeVText: drawRoom.typeVText,
    drawRoomTypeField: drawRoom.typeField,
    setDrawWallLengthOverrideCm: drawWall.setLengthOverrideCm,
    setDrawRoomHOverrideCm: drawRoom.setHOverrideCm,
    setDrawRoomVOverrideCm: drawRoom.setVOverrideCm,
    commitDrawWallFromMeasure: drawWall.commitFromMeasure,
    commitDrawRoomFromMeasure: drawRoom.commitFromMeasure,
    cancelDrawWallDraft: drawWall.cancelDrawWallDrag,
    cancelDrawRoomDraft: drawRoom.cancelDrawRoomDrag,
    acceptDrawDraft,
    deactivateDrawTool,
    isDrawDrafting: () => drawWall.isDrafting() || drawRoom.isDrafting(),
    isWallMoveDrafting: () => isPreciseMoveDrafting(),
    isPreciseMoveDrafting,
    hitClickMoveAtClient: (clientX: number, clientY: number) => {
      if (!moveMod.value) return false
      if (isPreciseMoveDrafting()) return false
      const cm = hitTest.clientToCm(clientX, clientY)
      if (!cm) return false
      return (
        hitTest.hitTestJunctionAtCm(cm) != null ||
        hitTest.hitTestOpeningAtCm(cm) != null ||
        hitTest.hitTestWallAtCm(cm) != null
      )
    },
    hitDrawDraftHandleAtClient: (clientX: number, clientY: number) => {
      const cm = hitTest.clientToCm(clientX, clientY)
      if (!cm) return false
      return drawWall.hitHandleAtCm(cm) != null || drawRoom.hitHandleAtCm(cm) != null
    },
    drawSurfacePoints: drawSurface.draftPoints,
    drawSurfaceHoverCm: drawSurface.hoverCm,
    drawLinePoints: selection.drawLinePoints,
    drawLineHoverCm: drawLine.hoverCm,
    measurePreview: measure.measurePreview,
    measureLines: measure.measureLines,
    openingMoveMeasureLines,
    wallInternalMeasureLines,
    measureHoverCm: measure.measureHoverCm,
    clearMeasureLines: measure.clearMeasureLines,
    nulpuntDisplayCm: nulpunt.nulpuntDisplayCm,
    nulpuntHasPending: nulpunt.nulpuntHasPending,
    nulpuntShowBakeActions: nulpunt.nulpuntShowBakeActions,
    confirmNulpuntBake,
    cancelNulpuntPending: nulpunt.cancelNulpuntPending,
    toggleSelectionBoxMode,
    canUndoEdit: editor.canUndoEdit,
    canRedoEdit: editor.canRedoEdit,
    undoEdit,
    redoEdit: () => {
      if (editor.redo()) {
        syncPlanToParentAfterUndo()
        syncWallThicknessDraftFromSelection()
      }
    },
    zoomBy: panZoom.zoomBy,
    applyView: panZoom.applyView,
    settingsMod,
    axisLockMod: toolCoord.axisLockMod,
    moveMod,
    pendingFixture,
    settingsItemId: selection.settingsItemId,
    moveItemId: selection.moveItemId,
    itemDragPreview: itemDrag.itemDragPreview,
    touchEditor,
    updateSelectedItem: selCoord.updateSelectedItem,
    deleteSelectedItem,
    copySelectedItem: selCoord.copySelectedItem,
    rotateSelectedItem: selCoord.rotateSelectedItem,
    toggleSelectedItemMirror: selCoord.toggleSelectedItemMirror,
    drawWallKind: selection.drawWallKind,
    ridgeZCm,
    selectedFacadeGroupPanel,
    settingsWallIds: selection.settingsWallIds,
    moveWallId: selection.moveWallId,
    moveDimensionId: selection.moveDimensionId,
    hoveredDimensionId: selection.hoveredDimensionId,
    settingsOpeningIds: selection.settingsOpeningIds,
    moveOpeningId: selection.moveOpeningId,
    openingHandlesCm: openingResize.openingHandlesCm,
    wallThicknessDraft,
    wallThicknessMixed,
    wallBalanceDraft,
    wallBalanceMixed,
    wallHeightDraft,
    wallHeightMixed,
    wallBottomZDraft,
    wallBottomZMixed,
    junctionHeightDraft,
    junctionHeightMixed,
    junctionBottomZDraft,
    junctionBottomZMixed,
    openingSubtypeDraft: selCoord.openingSubtypeDraft,
    openingSubtypeMixed: selCoord.openingSubtypeMixed,
    openingWidthDraft: selCoord.openingWidthDraft,
    openingWidthMixed: selCoord.openingWidthMixed,
    openingHeightDraft: selCoord.openingHeightDraft,
    openingHeightMixed: selCoord.openingHeightMixed,
    openingSillZDraft: selCoord.openingSillZDraft,
    openingSillZMixed: selCoord.openingSillZMixed,
    openingHingeAtStartDraft: selCoord.openingHingeAtStartDraft,
    openingHingeMixed: selCoord.openingHingeMixed,
    openingSwingRightDraft: selCoord.openingSwingRightDraft,
    openingSwingMixed: selCoord.openingSwingMixed,
    openingBovenlichtDraft: selCoord.openingBovenlichtDraft,
    openingBovenlichtMixed: selCoord.openingBovenlichtMixed,
    openingBovenlichtHeightDraft: selCoord.openingBovenlichtHeightDraft,
    openingBovenlichtHeightMixed: selCoord.openingBovenlichtHeightMixed,
    openingBovenlichtGapDraft: selCoord.openingBovenlichtGapDraft,
    openingBovenlichtGapMixed: selCoord.openingBovenlichtGapMixed,
    addDoorSubtype: selection.addDoorSubtype,
    addDoorWidthCm: selection.addDoorWidthCm,
    addDoorHeightCm: selection.addDoorHeightCm,
    addDoorSillZCm: selection.addDoorSillZCm,
    addWindowSubtype: selection.addWindowSubtype,
    addWindowWidthCm: selection.addWindowWidthCm,
    addWindowSillZCm: selection.addWindowSillZCm,
    addWindowHeightCm: selection.addWindowHeightCm,
    canvasCursor,
    syncPlanToParent,
    onWallThicknessCm,
    commitWallThickness,
    applyWallsThicknessCm,
    onWallBalanceInput,
    commitWallBalance,
    onWallHeightCm,
    commitWallHeight,
    onWallBottomZCm,
    commitWallBottomZ,
    onJunctionHeightCm,
    commitJunctionHeight,
    onJunctionBottomZCm,
    commitJunctionBottomZ,
    commitOpeningSubtype: selCoord.commitOpeningSubtype,
    onOpeningWidthCm: selCoord.onOpeningWidthCm,
    commitOpeningWidth: selCoord.commitOpeningWidth,
    onOpeningHeightCm: selCoord.onOpeningHeightCm,
    commitOpeningHeight: selCoord.commitOpeningHeight,
    onOpeningSillZCm: selCoord.onOpeningSillZCm,
    commitOpeningSillZ: selCoord.commitOpeningSillZ,
    toggleOpeningHingeAtStart: selCoord.toggleOpeningHingeAtStart,
    toggleOpeningSwingRight: selCoord.toggleOpeningSwingRight,
    onOpeningBovenlichtChange: selCoord.onOpeningBovenlichtChange,
    onOpeningBovenlichtHeightCm: selCoord.onOpeningBovenlichtHeightCm,
    commitOpeningBovenlichtHeight: selCoord.commitOpeningBovenlichtHeight,
    onOpeningBovenlichtGapCm: selCoord.onOpeningBovenlichtGapCm,
    commitOpeningBovenlichtGap: selCoord.commitOpeningBovenlichtGap,
    copySelectedOpening: selCoord.copySelectedOpening,
    deleteSelectedOpenings: selCoord.deleteSelectedOpenings,
    splitSelectedWall,
    deleteSelectedWalls,
    facadeGroupOptions,
    facadeGroupChecks,
    facadeMemberIdsOnActiveFloor,
    stampGroupDraft,
    stampGroupMixed,
    stampMemberIdsOnActiveFloor,
    applyFacadeGroupSelection,
    removeFacadeGroupFromSelection,
    editAllFacadeGroups,
    createFacadeGroupFromSelection,
    toggleFacadeGroup,
    applyStampGroupSelection,
    renameSelectedFacadeGroup,
    renameFacadeGroupById,
    selectFacadeGroupMembers,
    selectFacadeGroupMembersById,
    selectStampGroupMembers,
    canSelectFacadeMembers,
    canSelectMembersOfGroup,
    canSelectStampMembers,
    clearSelection,
    flushPendingFieldCommits,
    applySelectedWallKind,
    applyRidgeZInput,
    ridgeFloorDraft,
    ridgeFloorMixed,
    applyRidgeFloorInput,
    sanitizeWalls,
    bindWallsToRoof,
    applyStampToActiveFloor,
    canApplyStampOnActiveFloor,
    applyRoomTypeToSelection: areaSelection.applyRoomTypeToSelection,
    applyAreaCustomName: areaSelection.applyCustomName,
    onAreaCustomNameInput: areaSelection.onCustomNameInput,
    commitAreaCustomName: areaSelection.commitCustomName,
    customNameDraft: areaSelection.customNameDraft,
    applyAreaColor: areaSelection.applyColor,
    applyShowAreaLabel: areaSelection.applyShowAreaLabel,
    applySurfaceCutout: areaSelection.applyCutout,
    deleteSelectedTagged: areaSelection.deleteSelectedTagged,
    beginSurfacePolygonEdit: areaSelection.beginSurfacePolygonEdit,
    endSurfacePolygonEdit: () => {
      areaSelection.endSurfacePolygonEdit()
      surfaceEdit.cancelDrag()
      surfaceEdit.selectedVertexIndex.value = null
    },
    roofVertexIndex: surfaceEdit.selectedVertexIndex,
    setRoofVertexZ: surfaceEdit.setSelectedVertexZ,
    roomTypes: areaSelection.roomTypes,
    commitDrawSurface: drawSurface.commitDrawSurface,
    cancelDrawSurface: drawSurface.cancelDrawSurface,
    updateSelectedLabelText: selCoord.updateSelectedLabelText,
    onLabelTextInput: selCoord.onLabelTextInput,
    commitLabelText: selCoord.commitLabelText,
    labelTextDraft,
    deleteSelectedAnnotation: selCoord.deleteSelectedAnnotation,
    updateSelectedLabelFontSize: selCoord.updateSelectedLabelFontSize,
    updateSelectedLabelFontColor: selCoord.updateSelectedLabelFontColor,
    updateSelectedLabelOutline: selCoord.updateSelectedLabelOutline,
    updateSelectedLabelBold: selCoord.updateSelectedLabelBold,
    updateSelectedLabelItalic: selCoord.updateSelectedLabelItalic,
    updateSelectedLineType: selCoord.updateSelectedLineType,
    updateSelectedLineColor: selCoord.updateSelectedLineColor,
    updateSelectedLineThickness: selCoord.updateSelectedLineThickness,
    settingsLabelId: selection.settingsLabelId,
    settingsLineId: selection.settingsLineId,
    onWrapPointerDown,
    onWrapPointerMove,
    onWrapDblClick,
    onWheel: panZoom.onWheel,
    onGroupDragStart: panZoom.onGroupDragStart,
    onGroupDragMove: panZoom.onGroupDragMove,
    onGroupDragEnd: panZoom.onGroupDragEnd,
    onJunctionHover,
    onJunctionHoverEnd,
    handleExternalPlanChange,
    mountKeyboardListeners,
    unmountInteraction,
    resetView: viewport.resetView,
  }
}
