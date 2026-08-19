import type { ComputedRef, Ref } from 'vue'
import { isTypingFieldTarget } from './fml-preview-draft-commit'
import type { MeasureLine } from './fml-preview-measure'
import type { FmlPreviewSelectionRefs } from './fml-preview-selection'

/**
 * Editor keyboard: Escape/Enter/Delete/undo. Inspect-modus blokkeert undo/delete.
 * Shift/space blijven bij de View via onKeyDown/onKeyUp.
 */
export function createFmlPreviewEditorKeyHandlers(options: {
  selection: FmlPreviewSelectionRefs
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
  surfaceEdit: { cancelDrag: () => void }
  drawWall: {
    isDragging: () => boolean
    cancelDrawWallDrag: () => void
    commitFromMeasure: () => boolean
  }
  drawRoom: {
    isDragging: () => boolean
    cancelDrawRoomDrag: () => void
    commitFromMeasure: () => boolean
  }
  drawLine: { cancelDrawLine: () => void }
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
    undo,
    redo,
    syncPlanToParentAfterUndo,
    drawSurface,
    areaSelection,
    surfaceEdit,
    drawWall,
    drawRoom,
    drawLine,
    measure,
    nulpunt,
    underlayMove,
  } = options

  const { hoveredOpeningId, activeFmlTool } = selection

  function onEditorKeyDown(event: KeyboardEvent): void {
    onKeyDown(event)
    const typing = isTypingFieldTarget(event.target)
    if (typing) {
      if (event.key === 'Escape') {
        event.preventDefault()
        flushPendingFieldCommits()
        if (event.target instanceof HTMLElement) event.target.blur()
        clearSelection()
        hoveredOpeningId.value = null
        if (inspectMode.value) clearInspectSelect()
      }
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
        drawWall.cancelDrawWallDrag()
        return
      }
      if (drawRoom.isDragging()) {
        drawRoom.cancelDrawRoomDrag()
        return
      }
      if (drawSurface.draftPoints.value?.length) {
        drawSurface.cancelDrawSurface()
        return
      }
      if (selection.drawLinePoints.value?.length) {
        drawLine.cancelDrawLine()
        return
      }
      if (selection.surfaceEditId.value) {
        areaSelection.endSurfacePolygonEdit()
        surfaceEdit.cancelDrag()
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
      if (inspectMode.value) clearInspectSelect()
      return
    }
    if (inspectMode.value) return
    if (event.key === 'Delete' || event.key === 'Backspace') {
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
