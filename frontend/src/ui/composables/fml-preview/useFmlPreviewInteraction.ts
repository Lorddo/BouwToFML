import { computed, ref, watch, type Ref } from 'vue'
import type Konva from 'konva'
import { resolveDoorAddPreset, resolveWindowAddPreset } from '@/core/fml/opening-add-presets'
import type { FloorPlan, Point2D } from '@/core/fml/types'
import type { FmlThicknessBand } from '@/core/fml/fml-wall-thickness-tiers'
import {
  JUNCTION_POINT_SNAP_CM,
  ROOM_DRAW_SNAP_CM,
  snapDrawWallEndpoint,
  snapPointToJunctions,
  snapPointToWallCenters,
  snapToNearbyEndpointAxes,
} from '@/ui/components/fml-preview-junctions'
import type { useFmlPreviewEditor } from '@/ui/composables/useFmlPreviewEditor'
import type { RenderJunction } from './fml-preview-render-types'
import { useFmlPreviewAddOpening } from './useFmlPreviewAddOpening'
import { useFmlPreviewDrawWall } from './useFmlPreviewDrawWall'
import { useFmlPreviewDrawRoom } from './useFmlPreviewDrawRoom'
import { useFmlPreviewMeasure } from './useFmlPreviewMeasure'
import { useFmlPreviewNulpunt } from './useFmlPreviewNulpunt'
import { useFmlPreviewUnderlayMove } from './useFmlPreviewUnderlayMove'
import { useFmlPreviewOpeningDrag } from './useFmlPreviewOpeningDrag'
import { useFmlPreviewOpeningSelection } from './useFmlPreviewOpeningSelection'
import { useFmlPreviewPanZoom } from './useFmlPreviewPanZoom'
import { useFmlPreviewPointer } from './useFmlPreviewPointer'
import { useFmlPreviewWallDrag } from './useFmlPreviewWallDrag'
import { useFmlPreviewWallSelection } from './useFmlPreviewWallSelection'

export type { FmlPreviewSelectionRefs } from './fml-preview-selection'
export { createFmlPreviewSelection } from './fml-preview-selection'
import type { FmlPreviewSelectionRefs } from './fml-preview-selection'

import type { ContentLayout } from './useFmlPreviewViewport'
import type { PreviewUnderlayLayout } from '@/ui/composables/project/types'

type EditorApi = ReturnType<typeof useFmlPreviewEditor>

interface ViewportApi {
  viewScale: Ref<number>
  viewPosition: Ref<{ x: number; y: number }>
  contentLayout: Ref<ContentLayout | null>
  resetView: () => void
  refitContentLayout: () => void
  nudgeContentLayout: (dxCm: number, dyCm: number) => void
}

interface HitTestApi {
  hitTestWallAtCm: (cm: Point2D) => string | null
  hitTestDoorAtCm: (cm: Point2D) => string | null
  hitTestOpeningAtCm: (cm: Point2D) => string | null
  hitTestJunctionAtCm: (cm: Point2D) => RenderJunction | null
  clientToCm: (clientX: number, clientY: number) => Point2D | null
  containerRectToCmBBox: (rect: { x: number; y: number; width: number; height: number }) => {
    x: number
    y: number
    width: number
    height: number
  } | null
}

export function useFmlPreviewInteraction(options: {
  viewport: ViewportApi
  hitTest: HitTestApi
  selection: FmlPreviewSelectionRefs
  editor: EditorApi
  emit: (
    event: 'planUpdate' | 'thicknessWallPick' | 'cancelThicknessPick',
    payload?: FloorPlan | string,
    layout?: PreviewUnderlayLayout | null,
  ) => void
  containerRef: Ref<HTMLDivElement | null>
  contentGroupRef: Ref<{ getNode: () => Konva.Group } | null>
  shiftPressed: Ref<boolean>
  spacePressed: Ref<boolean>
  thicknessPickTier: Ref<FmlThicknessBand | null>
  bovenlichtDefault?: Ref<boolean>
  windowBovenlichtDefault?: Ref<boolean>
  /** Huidige underlay-layout (voor nulpunt + undo). */
  getUnderlayLayout?: () => PreviewUnderlayLayout | null
  setFmlNulpuntImageCm?: (point: Point2D | null) => void
  /** Extern: onderlegger-verplaats-modus (sidebar toggle). */
  underlayMoveMode?: Ref<boolean>
  onKeyDown: (event: KeyboardEvent) => void
  onKeyUp: (event: KeyboardEvent) => void
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
    getUnderlayLayout,
    setFmlNulpuntImageCm,
    underlayMoveMode: underlayMoveModeProp,
    onKeyDown,
    onKeyUp,
  } = options

  const {
    settingsWallIds,
    moveWallId,
    settingsOpeningIds,
    moveOpeningId,
    hoveredWallId,
    hoveredOpeningId,
    hoveredJunctionId,
    addDoorSubtype,
    addDoorWidthCm,
    addWindowSubtype,
    addWindowWidthCm,
    addWindowSillZCm,
    addWindowHeightCm,
    activeFmlTool,
  } = selection

  const drawWallMode = computed(() => activeFmlTool.value === 'draw_wall')
  const drawRoomMode = computed(() => activeFmlTool.value === 'draw_room')
  const addDoorMode = computed(() => activeFmlTool.value === 'add_door')
  const addWindowMode = computed(() => activeFmlTool.value === 'add_window')
  const measureMode = computed(() => activeFmlTool.value === 'measure')
  const nulpuntMode = computed(() => activeFmlTool.value === 'nulpunt')
  const underlayMoveModeInternal = ref(false)
  const underlayMoveMode = computed({
    get: () => underlayMoveModeProp?.value ?? underlayMoveModeInternal.value,
    set: (on: boolean) => {
      if (underlayMoveModeProp) underlayMoveModeProp.value = on
      else underlayMoveModeInternal.value = on
    },
  })
  const isPanDragging = ref(false)

  // Exclusive: nulpunt-tool ↔ underlay-move
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

  const ignoreNextPlanWatch = ref(false)
  const pendingPlanSyncSkips = ref(0)

  let wallHoverClearTimer: ReturnType<typeof setTimeout> | null = null

  const drawMeasureCancels = {
    cancelDrawWallDrag: () => {},
    cancelDrawRoomDrag: () => {},
    cancelMeasureDrag: () => {},
    cancelNulpuntDrag: () => {},
    cancelUnderlayMoveDrag: () => {},
  }

  function syncPlanToParent(layout?: PreviewUnderlayLayout | null): void {
    if (!editor.localPlan.value) return
    // +2: parent kan edited + imported in één tick zetten; extra marge tegen dubbele watch.
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
    const nextLayout: PreviewUnderlayLayout = {
      ...current,
      origin: layoutOrigin ? { ...layoutOrigin } : current.origin,
    }
    // FML (0,0) ↔ imageCm = layout.origin
    setFmlNulpuntImageCm?.(nextLayout.origin)
    // Zelfde contentLayout-refit als bij nulpunt-apply.
    viewport.refitContentLayout()
    syncPlanToParent(nextLayout)
  }

  const wallDrag = useFmlPreviewWallDrag({
    hitTest,
    editor,
    selection,
    spacePressed,
    syncPlanToParent,
  })

  const openingDrag = useFmlPreviewOpeningDrag({
    hitTest,
    editor,
    selection,
    spacePressed,
    syncPlanToParent,
  })

  const wallSelection = useFmlPreviewWallSelection({
    editor,
    hitTest,
    selection,
    syncPlanToParent,
    containerRef: options.containerRef,
    cancelMoveDragPending: wallDrag.cancelMoveDragPending,
    cancelDrawWallDrag: () => drawMeasureCancels.cancelDrawWallDrag(),
    cancelMeasureDrag: () => drawMeasureCancels.cancelMeasureDrag(),
  })

  const {
    wallThicknessDraft,
    wallThicknessMixed,
    wallBalanceDraft,
    wallBalanceMixed,
    selectionBoxMode,
    selectionBoxPreview,
    syncWallThicknessDraftFromSelection,
    toggleSettingsWall,
    onWallThicknessInput,
    commitWallThickness,
    applyWallsThicknessCm,
    onWallBalanceInput,
    commitWallBalance,
    splitSelectedWall,
    deleteSelectedWalls,
    clearSelection,
    toggleSelectionBoxMode,
    cancelSelectionBoxDrag,
    beginSelectionBoxDrag,
  } = wallSelection

  const openingSelection = useFmlPreviewOpeningSelection({
    editor,
    selection,
    syncPlanToParent,
    cancelMoveDragPending: wallDrag.cancelMoveDragPending,
    cancelOpeningDragPending: openingDrag.cancelOpeningDragPending,
    bovenlichtDefault,
    windowBovenlichtDefault,
  })

  const {
    openingSubtypeDraft,
    openingSubtypeMixed,
    openingWidthDraft,
    openingWidthMixed,
    openingHeightDraft,
    openingHeightMixed,
    openingSillZDraft,
    openingSillZMixed,
    openingHingeAtStartDraft,
    openingHingeMixed,
    openingSwingRightDraft,
    openingSwingMixed,
    openingBovenlichtDraft,
    openingBovenlichtMixed,
    clearOpeningSelectionState,
    toggleSettingsOpening,
    syncOpeningDraftFromSelection,
    commitOpeningSubtype,
    onOpeningWidthInput,
    commitOpeningWidth,
    onOpeningHeightInput,
    commitOpeningHeight,
    onOpeningSillZInput,
    commitOpeningSillZ,
    toggleOpeningHingeAtStart,
    toggleOpeningSwingRight,
    onOpeningBovenlichtChange,
    copySelectedOpening,
    deleteSelectedOpenings,
  } = openingSelection

  if (bovenlichtDefault) {
    watch(bovenlichtDefault, () => {
      syncOpeningDraftFromSelection()
    })
  }
  if (windowBovenlichtDefault) {
    watch(windowBovenlichtDefault, () => {
      syncOpeningDraftFromSelection()
    })
  }

  const { draggingJunction, draggingWall } = wallDrag
  const { draggingOpening } = openingDrag

  function resolveDrawPoint(cm: Point2D, axisAnchor?: Point2D): Point2D {
    const junction = hitTest.hitTestJunctionAtCm(cm)
    let point = junction ? { x: junction.cmX, y: junction.cmY } : cm
    if (!junction) {
      point = snapToNearbyEndpointAxes(editor.walls.value, [], point)
      point = snapPointToJunctions(editor.junctions.value, point, JUNCTION_POINT_SNAP_CM)
    }
    if (axisAnchor) {
      point = snapDrawWallEndpoint(axisAnchor, point, shiftPressed.value)
    }
    return point
  }

  /**
   * Kamer-start: junction-hit zodat je makkelijk op een knoop bindt.
   * Daarna krappe hartlijn — de 15 cm as-magnet trekt kleine schachten dicht.
   */
  function resolveRoomStartPoint(cm: Point2D): Point2D {
    const junction = hitTest.hitTestJunctionAtCm(cm)
    if (junction) return { x: junction.cmX, y: junction.cmY }
    return snapPointToJunctions(editor.junctions.value, cm, ROOM_DRAW_SNAP_CM)
  }

  function resolveRoomEndPoint(cm: Point2D): Point2D {
    const junctionSnap = snapPointToJunctions(editor.junctions.value, cm, ROOM_DRAW_SNAP_CM)
    return snapPointToWallCenters(editor.walls.value, junctionSnap, ROOM_DRAW_SNAP_CM)
  }

  const drawWall = useFmlPreviewDrawWall({
    hitTest,
    editor,
    hoveredJunctionId,
    wallThicknessDraft,
    resolvePoint: resolveDrawPoint,
    beforeBegin: () => {
      cancelSelectionBoxDrag()
      wallDrag.cancelMoveDragPending()
      clearSelection()
    },
    syncPlanToParent,
  })

  const drawRoom = useFmlPreviewDrawRoom({
    hitTest,
    editor,
    hoveredJunctionId,
    wallThicknessDraft,
    shiftPressed,
    resolveStartPoint: resolveRoomStartPoint,
    resolveEndPoint: resolveRoomEndPoint,
    beforeBegin: () => {
      cancelSelectionBoxDrag()
      wallDrag.cancelMoveDragPending()
      openingDrag.cancelOpeningDragPending()
      clearSelection()
    },
    syncPlanToParent,
  })

  const measure = useFmlPreviewMeasure({
    hitTest,
    hoveredJunctionId,
    getWalls: () => editor.walls.value,
    shiftPressed,
    beforeBegin: () => {
      cancelSelectionBoxDrag()
      wallDrag.cancelMoveDragPending()
      clearSelection()
    },
  })

  watch(measureMode, (on) => {
    if (!on) measure.clearMeasureHover()
  })

  const addOpening = useFmlPreviewAddOpening({
    editor,
    addDoorSubtype,
    addDoorWidthCm,
    addWindowSubtype,
    addWindowWidthCm,
    addWindowSillZCm,
    addWindowHeightCm,
    beforePlace: () => {
      cancelSelectionBoxDrag()
      wallDrag.cancelMoveDragPending()
      openingDrag.cancelOpeningDragPending()
      clearSelection()
    },
    syncPlanToParent,
  })

  drawMeasureCancels.cancelDrawWallDrag = drawWall.cancelDrawWallDrag
  drawMeasureCancels.cancelDrawRoomDrag = drawRoom.cancelDrawRoomDrag
  drawMeasureCancels.cancelMeasureDrag = measure.cancelMeasureDrag

  const nulpunt = useFmlPreviewNulpunt({
    hitTest,
    editor,
    nulpuntMode,
    getUnderlayLayout: () => getUnderlayLayout?.() ?? null,
    getFloorIndex: () => editor.floorIndex.value,
    setFmlNulpuntImageCm: (point) => setFmlNulpuntImageCm?.(point),
    markParentPlanSync: () => {
      ignoreNextPlanWatch.value = true
      pendingPlanSyncSkips.value = Math.max(pendingPlanSyncSkips.value, 2)
    },
    nudgeContentLayout: (dx, dy) => viewport.nudgeContentLayout(dx, dy),
    beforeBegin: () => {
      cancelSelectionBoxDrag()
      wallDrag.cancelMoveDragPending()
      clearSelection()
    },
  })
  drawMeasureCancels.cancelNulpuntDrag = nulpunt.cancelNulpuntPending

  const underlayMove = useFmlPreviewUnderlayMove({
    hitTest,
    underlayMoveMode,
    getUnderlayLayout: () => getUnderlayLayout?.() ?? null,
    setFmlNulpuntImageCm: (point) => setFmlNulpuntImageCm?.(point),
    syncLayoutToParent: (layout) => syncPlanToParent(layout),
    beforeBegin: () => {
      cancelSelectionBoxDrag()
      wallDrag.cancelMoveDragPending()
      clearSelection()
    },
  })
  drawMeasureCancels.cancelUnderlayMoveDrag = underlayMove.cancelUnderlayMoveDrag

  function confirmNulpuntBake(): boolean {
    const applied = nulpunt.confirmNulpuntBake()
    if (!applied) return false
    // Alleen actieve preview → parent; andere project-floors zitten in eigen blobs.
    syncPlanToParent(applied.layout)
    return true
  }

  function undoEdit(): void {
    if (editor.undo()) {
      syncPlanToParentAfterUndo()
      syncWallThicknessDraftFromSelection()
    }
  }

  const panZoom = useFmlPreviewPanZoom({
    viewport,
    containerRef: options.containerRef,
    isPanDragging,
    onBeforePan: wallDrag.cancelMoveDragPending,
  })

  const { canvasCursor, onWrapPointerDown, onWrapPointerMove } = useFmlPreviewPointer({
    hitTest,
    selection,
    modes: {
      drawWallMode,
      drawRoomMode,
      addDoorMode,
      addWindowMode,
      measureMode,
      nulpuntMode,
      underlayMoveMode,
      selectionBoxMode,
    },
    drag: {
      draggingWall,
      draggingJunction,
      draggingOpening,
      isDrawWallDragging: () => drawWall.isDragging(),
      isDrawRoomDragging: () => drawRoom.isDragging(),
      isMeasureDragging: () => measure.isDragging(),
      isNulpuntDragging: () => nulpunt.isDragging(),
      isUnderlayMoveDragging: () => underlayMove.isDragging(),
      isPanDragging,
    },
    actions: {
      beginPanDrag: panZoom.beginPanDrag,
      beginDrawWall: drawWall.beginDrawWall,
      beginMeasure: measure.beginMeasure,
      updateMeasureHover: measure.updateMeasureHover,
      clearMeasureHover: measure.clearMeasureHover,
      beginDrawRoom: drawRoom.beginDrawRoom,
      beginNulpuntDrag: nulpunt.beginNulpuntDrag,
      beginUnderlayMoveDrag: underlayMove.beginUnderlayMoveDrag,
      placeDoor: addOpening.placeDoor,
      placeWindow: addOpening.placeWindow,
      startJunctionDrag: wallDrag.startJunctionDrag,
      beginSelectionBoxDrag,
      toggleSettingsOpening,
      toggleSettingsWall,
      clearSelection,
      clearOpeningSelectionState,
      beginOpeningDrag: openingDrag.beginOpeningDrag,
      startOpeningDragPending: openingDrag.startOpeningDragPending,
      beginWallDrag: wallDrag.beginWallDrag,
      startMoveDragPending: wallDrag.startMoveDragPending,
      stopContentGroupDrag: () => {
        contentGroupRef.value?.getNode()?.stopDrag()
      },
    },
    spacePressed,
    thicknessPickTier,
    emit: (event, payload) => emit(event, payload),
  })

  function onJunctionHover(junctionId: string): void {
    if (wallHoverClearTimer) {
      clearTimeout(wallHoverClearTimer)
      wallHoverClearTimer = null
    }
    hoveredJunctionId.value = junctionId
    const junction = editor.junctions.value.find((item) => item.id === junctionId)
    const wallId = junction?.refs[0]?.wallId
    if (wallId) hoveredWallId.value = wallId
  }

  function onJunctionHoverEnd(): void {
    hoveredJunctionId.value = null
  }

  function onEditorKeyDown(event: KeyboardEvent): void {
    onKeyDown(event)
    if (event.key === 'Escape') {
      if (thicknessPickTier.value) {
        event.preventDefault()
        emit('cancelThicknessPick')
        return
      }
      if (drawWall.isDragging()) {
        drawWall.cancelDrawWallDrag()
        return
      }
      if (drawRoom.isDragging()) {
        drawRoom.cancelDrawRoomDrag()
        return
      }
      if (measure.isDragging()) {
        measure.cancelMeasureDrag()
        return
      }
      if (nulpunt.isDragging()) {
        nulpunt.cancelNulpuntPending()
        return
      }
      if (underlayMove.isDragging()) {
        underlayMove.cancelUnderlayMoveDrag()
        return
      }
      if (nulpunt.nulpuntHasPending.value) {
        nulpunt.cancelNulpuntPending()
        return
      }
      if (measureMode.value && measure.measureLines.value.length > 0) {
        measure.clearMeasureLines()
        return
      }
      if (nulpuntMode.value) {
        activeFmlTool.value = null
        return
      }
      if (underlayMoveMode.value) {
        underlayMoveMode.value = false
        return
      }
      clearSelection()
      hoveredOpeningId.value = null
      return
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      if (editor.undo()) {
        syncPlanToParentAfterUndo()
      }
    }
  }

  function onEditorKeyUp(event: KeyboardEvent): void {
    onKeyUp(event)
  }

  function handleExternalPlanChange(): void {
    // Round-trip na lokale edit (delete/move/draw): viewport + selectie behouden.
    if (pendingPlanSyncSkips.value > 0) {
      pendingPlanSyncSkips.value -= 1
      ignoreNextPlanWatch.value = pendingPlanSyncSkips.value > 0
      return
    }
    if (ignoreNextPlanWatch.value) {
      ignoreNextPlanWatch.value = false
      return
    }
    // Echte externe plan-vervanging: selectie wissen. Zoom alleen fitten als er
    // nog geen layout is — anders voelt elke plan-sync als uitzoomen.
    clearSelection()
    hoveredOpeningId.value = null
    measure.clearMeasureLines()
    if (!viewport.contentLayout.value) {
      viewport.resetView()
    }
  }

  function mountKeyboardListeners(): void {
    window.addEventListener('keydown', onEditorKeyDown)
    window.addEventListener('keyup', onEditorKeyUp)
  }

  function unmountInteraction(): void {
    if (wallHoverClearTimer) clearTimeout(wallHoverClearTimer)
    wallDrag.cleanupWallDrag()
    openingDrag.cleanupOpeningDrag()
    cancelSelectionBoxDrag()
    drawWall.cancelDrawWallDrag()
    drawRoom.cancelDrawRoomDrag()
    measure.cancelMeasureDrag()
    measure.clearMeasureHover()
    nulpunt.cancelNulpuntPending()
    underlayMove.cancelUnderlayMoveDrag()
    panZoom.endPanDrag()
    window.removeEventListener('keydown', onEditorKeyDown)
    window.removeEventListener('keyup', onEditorKeyUp)
  }

  return {
    activeFmlTool,
    selectionBoxMode,
    drawWallMode,
    drawRoomMode,
    addDoorMode,
    addWindowMode,
    measureMode,
    nulpuntMode,
    underlayMoveMode,
    selectionBoxPreview,
    drawWallPreview: drawWall.drawWallPreview,
    drawRoomPreview: drawRoom.drawRoomPreview,
    measurePreview: measure.measurePreview,
    measureLines: measure.measureLines,
    measureHoverCm: measure.measureHoverCm,
    clearMeasureLines: measure.clearMeasureLines,
    nulpuntDisplayCm: nulpunt.nulpuntDisplayCm,
    nulpuntHasPending: nulpunt.nulpuntHasPending,
    nulpuntShowBakeActions: nulpunt.nulpuntShowBakeActions,
    confirmNulpuntBake,
    cancelNulpuntPending: nulpunt.cancelNulpuntPending,
    toggleSelectionBoxMode,
    canUndoEdit: editor.canUndoEdit,
    undoEdit,
    settingsWallIds,
    moveWallId,
    settingsOpeningIds,
    moveOpeningId,
    wallThicknessDraft,
    wallThicknessMixed,
    wallBalanceDraft,
    wallBalanceMixed,
    openingSubtypeDraft,
    openingSubtypeMixed,
    openingWidthDraft,
    openingWidthMixed,
    openingHeightDraft,
    openingHeightMixed,
    openingSillZDraft,
    openingSillZMixed,
    openingHingeAtStartDraft,
    openingHingeMixed,
    openingSwingRightDraft,
    openingSwingMixed,
    openingBovenlichtDraft,
    openingBovenlichtMixed,
    addDoorSubtype,
    addDoorWidthCm,
    addWindowSubtype,
    addWindowWidthCm,
    addWindowSillZCm,
    addWindowHeightCm,
    canvasCursor,
    syncPlanToParent,
    onWallThicknessInput,
    commitWallThickness,
    applyWallsThicknessCm,
    onWallBalanceInput,
    commitWallBalance,
    commitOpeningSubtype,
    onOpeningWidthInput,
    commitOpeningWidth,
    onOpeningHeightInput,
    commitOpeningHeight,
    onOpeningSillZInput,
    commitOpeningSillZ,
    toggleOpeningHingeAtStart,
    toggleOpeningSwingRight,
    onOpeningBovenlichtChange,
    copySelectedOpening,
    deleteSelectedOpenings,
    splitSelectedWall,
    deleteSelectedWalls,
    clearSelection,
    onWrapPointerDown,
    onWrapPointerMove,
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
