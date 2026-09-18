import type { ComputedRef, Ref } from 'vue'
import { isPlanOneshotDrawTool } from '@/ui/components/canvas/planToolbeltItems'
import { hasToolbeltHotkey } from '@/ui/composables/canvas/useToolbeltHotkey'
import { isTypingFieldTarget } from '@/ui/composables/canvas-kernel/plan-canvas-draft-commit'
import type { MeasureLine } from '@/ui/composables/canvas-kernel/plan-canvas-measure'
import type { PlanCanvasSelectionRefs } from './plan-canvas-selection-types'

/**
 * Editor keyboard: Escape/Enter/Delete/undo. Inspect-modus blokkeert undo/delete.
 * Shift/space blijven bij de View via onKeyDown/onKeyUp.
 */
export function createPlanCanvasEditorKeyHandlers(options: {
  selection: PlanCanvasSelectionRefs
  inspectMode: ComputedRef<boolean>
  drawSurfaceMode: ComputedRef<boolean>
  measureMode: ComputedRef<boolean>
  nulpuntMode: ComputedRef<boolean>
  underlayMoveMode: { value: boolean }
  thicknessPickTier: Ref<unknown>
  onKeyDown: (event: KeyboardEvent) => void
  onKeyUp: (event: KeyboardEvent) => void
  flushPendingFieldCommits: () => void
  deleteSelected: () => void
  clearSelection: () => void
  clearInspectSelect: () => void
  emitCancelThicknessPick: () => void
  /** Verberg slicer-liniaal (Esc). True als er iets was. */
  clearSelectedSlice?: () => boolean
  undo: () => boolean
  redo: () => boolean
  syncPlanToParentAfterUndo: () => void
  drawSurface: {
    draftPoints: Ref<unknown[] | null> | ComputedRef<unknown[] | null>
    commitDrawSurface: () => boolean
    cancelDrawSurface: () => void
  }
  areaSelection: {
    endSurfacePolygonEdit: () => void
  }
  surfaceEdit: {
    cancelDrag: () => void
    selectedVertexIndex: { value: number | null }
    typeText: { value: string }
    handleTypeKey: (event: KeyboardEvent) => boolean
    commitFromMeasure: () => boolean
    clearTypeDraft: () => void
  }
  drawWall: {
    isDragging: () => boolean
    cancelDrawWallDrag: () => void
    commitFromMeasure: () => boolean
    handleTypeKey: (event: KeyboardEvent) => boolean
  }
  drawRoom: {
    isDragging: () => boolean
    cancelDrawRoomDrag: () => void
    commitFromMeasure: () => boolean
    handleTypeKey: (event: KeyboardEvent) => boolean
  }
  drawDormer?: {
    isDragging: () => boolean
    cancelDrawDormer: () => void
    commitFromMeasure: () => boolean
    handleTypeKey: (event: KeyboardEvent) => boolean
  }
  wallMove: {
    isDrafting: () => boolean
    cancelWallMove: () => void
    commitFromMeasure: () => boolean
    handleTypeKey: (event: KeyboardEvent) => boolean
  }
  junctionMove: {
    isDrafting: () => boolean
    cancelJunctionMove: () => void
    commitFromMeasure: () => boolean
    handleTypeKey: (event: KeyboardEvent) => boolean
  }
  openingMove: {
    isDrafting: () => boolean
    cancelOpeningMove: () => void
    commitFromMeasure: () => boolean
    handleTypeKey: (event: KeyboardEvent) => boolean
  }
  drawLine: { cancelDrawLine: () => void }
  deactivateDrawTool: () => void
  measure: {
    isDragging: () => boolean
    cancelMeasureDrag: () => void
    measureLines: Ref<MeasureLine[]> | ComputedRef<MeasureLine[]>
    clearMeasureLines: () => void
  }
  nulpunt: {
    isDragging: () => boolean
    cancelNulpuntPending: () => void
    nulpuntHasPending: Ref<boolean> | ComputedRef<boolean>
  }
  underlayMove: {
    isDragging: () => boolean
    cancelUnderlayMoveDrag: () => void
  }
}) {
  const {
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
    emitCancelThicknessPick,
    clearSelectedSlice,
    undo,
    redo,
    syncPlanToParentAfterUndo,
    drawSurface,
    areaSelection,
    surfaceEdit,
    drawWall,
    drawRoom,
    drawDormer,
    wallMove,
    junctionMove,
    openingMove,
    drawLine,
    deactivateDrawTool,
    measure,
    nulpunt,
    underlayMove,
  } = options

  const { hoveredOpeningId, activePlanTool } = selection

  function onEditorKeyDown(event: KeyboardEvent): void {
    onKeyDown(event)
    const typing = isTypingFieldTarget(event.target)
    if (typing) {
      if (event.key === 'Escape') {
        flushPendingFieldCommits()
        if (event.target instanceof HTMLElement) event.target.blur()
        if (hasToolbeltHotkey('Escape')) return
        event.preventDefault()
        if (isPlanOneshotDrawTool(activePlanTool.value)) {
          deactivateDrawTool()
          return
        }
        clearSelection()
        hoveredOpeningId.value = null
        if (inspectMode.value) clearInspectSelect()
      }
      return
    }
    if (drawWall.isDragging() && drawWall.handleTypeKey(event)) {
      event.preventDefault()
      return
    }
    if (drawRoom.isDragging() && drawRoom.handleTypeKey(event)) {
      event.preventDefault()
      return
    }
    if (drawDormer?.isDragging() && drawDormer.handleTypeKey(event)) {
      event.preventDefault()
      return
    }
    if (wallMove.isDrafting() && wallMove.handleTypeKey(event)) {
      event.preventDefault()
      return
    }
    if (junctionMove.isDrafting() && junctionMove.handleTypeKey(event)) {
      event.preventDefault()
      return
    }
    if (openingMove.isDrafting() && openingMove.handleTypeKey(event)) {
      event.preventDefault()
      return
    }
    if (
      surfaceEdit.selectedVertexIndex.value != null &&
      surfaceEdit.handleTypeKey(event)
    ) {
      event.preventDefault()
      return
    }
    if (event.key === 'Enter') {
      if (drawWall.isDragging() && drawWall.commitFromMeasure()) {
        event.preventDefault()
        return
      }
      if (drawRoom.isDragging() && drawRoom.commitFromMeasure()) {
        event.preventDefault()
        return
      }
      if (drawDormer?.isDragging()) {
        event.preventDefault()
        drawDormer.commitFromMeasure()
        return
      }
      if (wallMove.isDrafting() && wallMove.commitFromMeasure()) {
        event.preventDefault()
        return
      }
      if (junctionMove.isDrafting() && junctionMove.commitFromMeasure()) {
        event.preventDefault()
        return
      }
      if (openingMove.isDrafting() && openingMove.commitFromMeasure()) {
        event.preventDefault()
        return
      }
      if (
        surfaceEdit.selectedVertexIndex.value != null &&
        surfaceEdit.commitFromMeasure()
      ) {
        event.preventDefault()
        return
      }
      if (drawSurfaceMode.value && drawSurface.commitDrawSurface()) {
        event.preventDefault()
        return
      }
      if (selection.surfaceEditId.value) {
        event.preventDefault()
        areaSelection.endSurfacePolygonEdit()
        surfaceEdit.cancelDrag()
        return
      }
    }
    if (event.key === 'Escape') {
      flushPendingFieldCommits()
      if (thicknessPickTier.value) {
        event.preventDefault()
        emitCancelThicknessPick()
        return
      }
      if (drawWall.isDragging()) {
        event.preventDefault()
        drawWall.cancelDrawWallDrag()
        return
      }
      if (drawRoom.isDragging()) {
        event.preventDefault()
        drawRoom.cancelDrawRoomDrag()
        return
      }
      if (drawDormer?.isDragging()) {
        event.preventDefault()
        drawDormer.cancelDrawDormer()
        return
      }
      if (wallMove.isDrafting()) {
        event.preventDefault()
        wallMove.cancelWallMove()
        return
      }
      if (junctionMove.isDrafting()) {
        event.preventDefault()
        junctionMove.cancelJunctionMove()
        return
      }
      if (openingMove.isDrafting()) {
        event.preventDefault()
        openingMove.cancelOpeningMove()
        return
      }
      if (
        surfaceEdit.selectedVertexIndex.value != null &&
        surfaceEdit.typeText.value
      ) {
        event.preventDefault()
        surfaceEdit.clearTypeDraft()
        return
      }
      if (drawSurface.draftPoints.value?.length) {
        event.preventDefault()
        drawSurface.cancelDrawSurface()
        return
      }
      if (selection.drawLinePoints.value?.length) {
        event.preventDefault()
        drawLine.cancelDrawLine()
        return
      }
      if (selection.surfaceEditId.value) {
        event.preventDefault()
        areaSelection.endSurfacePolygonEdit()
        surfaceEdit.cancelDrag()
        return
      }
      if (measure.isDragging()) {
        event.preventDefault()
        measure.cancelMeasureDrag()
        return
      }
      if (nulpunt.isDragging()) {
        event.preventDefault()
        nulpunt.cancelNulpuntPending()
        return
      }
      if (underlayMove.isDragging()) {
        event.preventDefault()
        underlayMove.cancelUnderlayMoveDrag()
        return
      }
      if (nulpunt.nulpuntHasPending.value) {
        event.preventDefault()
        nulpunt.cancelNulpuntPending()
        return
      }
      if (measureMode.value && measure.measureLines.value.length > 0) {
        event.preventDefault()
        measure.clearMeasureLines()
        return
      }
      if (clearSelectedSlice?.()) {
        event.preventDefault()
        return
      }
      if (hasToolbeltHotkey('Escape')) return
      if (isPlanOneshotDrawTool(activePlanTool.value) || measureMode.value) {
        event.preventDefault()
        deactivateDrawTool()
        return
      }
      if (nulpuntMode.value) {
        event.preventDefault()
        activePlanTool.value = null
        return
      }
      if (underlayMoveMode.value) {
        event.preventDefault()
        underlayMoveMode.value = false
        return
      }
      event.preventDefault()
      clearSelection()
      hoveredOpeningId.value = null
      if (inspectMode.value) clearInspectSelect()
      return
    }
    if (inspectMode.value) {
      if (event.key === 'Delete' || event.key === 'Backspace') event.preventDefault()
      return
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (hasToolbeltHotkey('Delete')) return
      event.preventDefault()
      deleteSelected()
      return
    }
    if (event.ctrlKey || event.metaKey) {
      const key = event.key.toLowerCase()
      if (key === 'z' && event.shiftKey) {
        event.preventDefault()
        if (redo()) syncPlanToParentAfterUndo()
        return
      }
      if (key === 'y') {
        event.preventDefault()
        if (redo()) syncPlanToParentAfterUndo()
        return
      }
      if (key === 'z') {
        event.preventDefault()
        if (undo()) syncPlanToParentAfterUndo()
      }
    }
  }

  function onEditorKeyUp(event: KeyboardEvent): void {
    onKeyUp(event)
  }

  return { onEditorKeyDown, onEditorKeyUp }
}
