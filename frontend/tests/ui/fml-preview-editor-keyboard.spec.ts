/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { createFmlPreviewEditorKeyHandlers } from '@/ui/composables/fml-preview/fml-preview-editor-keyboard'
import { createFmlPreviewSelection } from '@/ui/composables/fml-preview/fml-preview-selection'

function makeHandlers(overrides?: { typingTarget?: EventTarget | null }) {
  const selection = createFmlPreviewSelection()
  const deactivateDrawTool = vi.fn(() => {
    selection.activeFmlTool.value = null
  })
  const clearSelection = vi.fn()
  const handlers = createFmlPreviewEditorKeyHandlers({
    selection,
    inspectMode: computed(() => false),
    drawSurfaceMode: computed(() => false),
    measureMode: computed(() => false),
    nulpuntMode: computed(() => false),
    underlayMoveMode: { value: false },
    thicknessPickTier: ref(null),
    onKeyDown: () => {},
    onKeyUp: () => {},
    flushPendingFieldCommits: () => {},
    deleteSelected: () => {},
    clearSelection,
    clearInspectSelect: () => {},
    emitCancelThicknessPick: () => {},
    undo: () => false,
    redo: () => false,
    syncPlanToParentAfterUndo: () => {},
    drawSurface: {
      draftPoints: ref(null),
      commitDrawSurface: () => false,
      cancelDrawSurface: () => {},
    },
    areaSelection: { endSurfacePolygonEdit: () => {} },
    surfaceEdit: { cancelDrag: () => {} },
    drawWall: {
      isDragging: () => false,
      cancelDrawWallDrag: () => {},
      commitFromMeasure: () => false,
      handleTypeKey: () => false,
    },
    drawRoom: {
      isDragging: () => false,
      cancelDrawRoomDrag: () => {},
      commitFromMeasure: () => false,
      handleTypeKey: () => false,
    },
    wallMove: {
      isDrafting: () => false,
      cancelWallMove: () => {},
      commitFromMeasure: () => false,
      handleTypeKey: () => false,
    },
    junctionMove: {
      isDrafting: () => false,
      cancelJunctionMove: () => {},
      commitFromMeasure: () => false,
      handleTypeKey: () => false,
    },
    openingMove: {
      isDrafting: () => false,
      cancelOpeningMove: () => {},
      commitFromMeasure: () => false,
      handleTypeKey: () => false,
    },
    drawLine: { cancelDrawLine: () => {} },
    deactivateDrawTool,
    measure: {
      isDragging: () => false,
      cancelMeasureDrag: () => {},
      measureLines: ref([]),
      clearMeasureLines: () => {},
    },
    nulpunt: {
      isDragging: () => false,
      cancelNulpuntPending: () => {},
      nulpuntHasPending: ref(false),
    },
    underlayMove: {
      isDragging: () => false,
      cancelUnderlayMoveDrag: () => {},
    },
  })

  function pressEscape(target?: EventTarget | null): void {
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    Object.defineProperty(event, 'target', {
      value: target ?? overrides?.typingTarget ?? document.body,
    })
    handlers.onEditorKeyDown(event)
  }

  return { selection, deactivateDrawTool, clearSelection, pressEscape }
}

describe('FML editor types wall measure without a toolbar field', () => {
  it('stuurt cijfers naar de draft i.p.v. Delete/selectie', () => {
    const handleTypeKey = vi.fn(() => true)
    const deleteSelected = vi.fn()
    const selection = createFmlPreviewSelection()
    const handlers = createFmlPreviewEditorKeyHandlers({
      selection,
      inspectMode: computed(() => false),
      drawSurfaceMode: computed(() => false),
      measureMode: computed(() => false),
      nulpuntMode: computed(() => false),
      underlayMoveMode: { value: false },
      thicknessPickTier: ref(null),
      onKeyDown: () => {},
      onKeyUp: () => {},
      flushPendingFieldCommits: () => {},
      deleteSelected,
      clearSelection: () => {},
      clearInspectSelect: () => {},
      emitCancelThicknessPick: () => {},
      undo: () => false,
      redo: () => false,
      syncPlanToParentAfterUndo: () => {},
      drawSurface: {
        draftPoints: ref(null),
        commitDrawSurface: () => false,
        cancelDrawSurface: () => {},
      },
      areaSelection: { endSurfacePolygonEdit: () => {} },
      surfaceEdit: { cancelDrag: () => {} },
      drawWall: {
        isDragging: () => true,
        cancelDrawWallDrag: () => {},
        commitFromMeasure: () => false,
        handleTypeKey,
      },
      drawRoom: {
        isDragging: () => false,
        cancelDrawRoomDrag: () => {},
        commitFromMeasure: () => false,
        handleTypeKey: () => false,
      },
      wallMove: {
        isDrafting: () => false,
        cancelWallMove: () => {},
        commitFromMeasure: () => false,
        handleTypeKey: () => false,
      },
      junctionMove: {
        isDrafting: () => false,
        cancelJunctionMove: () => {},
        commitFromMeasure: () => false,
        handleTypeKey: () => false,
      },
      openingMove: {
        isDrafting: () => false,
        cancelOpeningMove: () => {},
        commitFromMeasure: () => false,
        handleTypeKey: () => false,
      },
      drawLine: { cancelDrawLine: () => {} },
      deactivateDrawTool: () => {},
      measure: {
        isDragging: () => false,
        cancelMeasureDrag: () => {},
        measureLines: ref([]),
        clearMeasureLines: () => {},
      },
      nulpunt: {
        isDragging: () => false,
        cancelNulpuntPending: () => {},
        nulpuntHasPending: ref(false),
      },
      underlayMove: {
        isDragging: () => false,
        cancelUnderlayMoveDrag: () => {},
      },
    })

    const event = new KeyboardEvent('keydown', { key: '3', bubbles: true, cancelable: true })
    Object.defineProperty(event, 'target', { value: document.body })
    handlers.onEditorKeyDown(event)
    expect(handleTypeKey).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
    expect(deleteSelected).not.toHaveBeenCalled()
  })
})

describe('FML editor Escape deactivates draw tool', () => {
  it('zet teken-tool uit zonder startpunt', () => {
    const { selection, deactivateDrawTool, clearSelection, pressEscape } = makeHandlers()
    selection.activeFmlTool.value = 'draw_room'
    pressEscape()
    expect(deactivateDrawTool).toHaveBeenCalledTimes(1)
    expect(clearSelection).not.toHaveBeenCalled()
  })

  it('zet teken-tool uit ook vanuit een invoerveld', () => {
    const input = document.createElement('input')
    input.type = 'number'
    const { selection, deactivateDrawTool, pressEscape } = makeHandlers()
    selection.activeFmlTool.value = 'draw_wall'
    pressEscape(input)
    expect(deactivateDrawTool).toHaveBeenCalledTimes(1)
  })
})
