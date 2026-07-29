import { computed, ref, watch, type Ref } from 'vue'
import type Konva from 'konva'
import {
  resolveDoorAddPreset,
  resolveWindowAddPreset,
} from '@/core/fml/opening-add-presets'
import type { FloorPlan, Point2D } from '@/core/fml/types'
import type { FmlThicknessBand } from '@/core/fml/fml-wall-thickness-tiers'
import {
  snapDrawWallEndpoint,
  snapPointToJunctions,
  snapToNearbyEndpointAxes,
} from '@/ui/components/fml-preview-junctions'
import type { useFmlPreviewEditor } from '@/ui/composables/useFmlPreviewEditor'
import type { RenderJunction } from './fml-preview-render-types'
import { useFmlPreviewAddOpening } from './useFmlPreviewAddOpening'
import { useFmlPreviewDrawWall } from './useFmlPreviewDrawWall'
import { useFmlPreviewDrawRoom } from './useFmlPreviewDrawRoom'
import { useFmlPreviewMeasure } from './useFmlPreviewMeasure'
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

type EditorApi = ReturnType<typeof useFmlPreviewEditor>

interface ViewportApi {
  viewScale: Ref<number>
  viewPosition: Ref<{ x: number; y: number }>
  contentLayout: Ref<ContentLayout | null>
  resetView: () => void
  refitContentLayout: () => void
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
  emit: (event: 'planUpdate' | 'thicknessWallPick' | 'cancelThicknessPick', payload?: FloorPlan | string) => void
  containerRef: Ref<HTMLDivElement | null>
  contentGroupRef: Ref<{ getNode: () => Konva.Group } | null>
  shiftPressed: Ref<boolean>
  spacePressed: Ref<boolean>
  thicknessPickTier: Ref<FmlThicknessBand | null>
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
  const isPanDragging = ref(false)

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
  }

  function syncPlanToParent(): void {
    if (!editor.localPlan.value) return
    // +2: parent kan edited + imported in één tick zetten; extra marge tegen dubbele watch.
    ignoreNextPlanWatch.value = true
    pendingPlanSyncSkips.value = Math.max(pendingPlanSyncSkips.value, 2)
    editor.prepareParentSync()
    emit('planUpdate', JSON.parse(JSON.stringify(editor.localPlan.value)) as FloorPlan)
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
  })

  const {
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
    clearOpeningSelectionState,
    toggleSettingsOpening,
    onOpeningWidthInput,
    commitOpeningWidth,
    onOpeningHeightInput,
    commitOpeningHeight,
    onOpeningSillZInput,
    commitOpeningSillZ,
    toggleOpeningHingeAtStart,
    toggleOpeningSwingRight,
    copySelectedOpening,
    deleteSelectedOpenings,
  } = openingSelection

  const { draggingJunction, draggingWall } = wallDrag
  const { draggingOpening } = openingDrag

  function resolveDrawPoint(cm: Point2D, axisAnchor?: Point2D): Point2D {
    const junction = hitTest.hitTestJunctionAtCm(cm)
    let point = junction ? { x: junction.cmX, y: junction.cmY } : cm
    if (!junction) {
      point = snapToNearbyEndpointAxes(editor.walls.value, [], point)
      point = snapPointToJunctions(editor.junctions.value, point, 4)
    }
    if (axisAnchor) {
      point = snapDrawWallEndpoint(axisAnchor, point, shiftPressed.value)
    }
    return point
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
    resolvePoint: (cm) => resolveDrawPoint(cm),
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
    resolvePoint: resolveDrawPoint,
    beforeBegin: () => {
      cancelSelectionBoxDrag()
      wallDrag.cancelMoveDragPending()
      clearSelection()
    },
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

  function undoEdit(): void {
    if (editor.undo()) {
      syncPlanToParent()
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
      selectionBoxMode,
    },
    drag: {
      draggingWall,
      draggingJunction,
      draggingOpening,
      isDrawWallDragging: () => drawWall.isDragging(),
      isDrawRoomDragging: () => drawRoom.isDragging(),
      isMeasureDragging: () => measure.isDragging(),
      isPanDragging,
    },
    actions: {
      beginPanDrag: panZoom.beginPanDrag,
      beginDrawWall: drawWall.beginDrawWall,
      beginMeasure: measure.beginMeasure,
      beginDrawRoom: drawRoom.beginDrawRoom,
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
      if (measureMode.value && measure.measureLines.value.length > 0) {
        measure.clearMeasureLines()
        return
      }
      clearSelection()
      hoveredOpeningId.value = null
      return
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      if (editor.undo()) {
        syncPlanToParent()
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
    selectionBoxPreview,
    drawWallPreview: drawWall.drawWallPreview,
    drawRoomPreview: drawRoom.drawRoomPreview,
    measurePreview: measure.measurePreview,
    measureLines: measure.measureLines,
    clearMeasureLines: measure.clearMeasureLines,
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
    onOpeningWidthInput,
    commitOpeningWidth,
    onOpeningHeightInput,
    commitOpeningHeight,
    onOpeningSillZInput,
    commitOpeningSillZ,
    toggleOpeningHingeAtStart,
    toggleOpeningSwingRight,
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
