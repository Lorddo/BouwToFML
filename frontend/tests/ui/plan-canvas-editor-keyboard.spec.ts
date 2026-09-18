/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { createPlanCanvasEditorKeyHandlers } from '@/ui/composables/plan-canvas/plan-canvas-editor-keyboard'
import { createPlanCanvasSelection } from '@/ui/composables/plan-canvas/plan-canvas-selection'

function makeHandlers(overrides?: { typingTarget?: EventTarget | null }) {
  const selection = createPlanCanvasSelection()
  const deactivateDrawTool = vi.fn(() => {
    selection.activePlanTool.value = null
  })
  const clearSelection = vi.fn()
  const handlers = createPlanCanvasEditorKeyHandlers({
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
    surfaceEdit: {
      cancelDrag: () => {},
      selectedVertexIndex: ref(null),
      typeText: ref(''),
      handleTypeKey: () => false,
      commitFromMeasure: () => false,
      clearTypeDraft: () => {},
    },
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
    const selection = createPlanCanvasSelection()
    const handlers = createPlanCanvasEditorKeyHandlers({
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
      surfaceEdit: {
      cancelDrag: () => {},
      selectedVertexIndex: ref(null),
      typeText: ref(''),
      handleTypeKey: () => false,
      commitFromMeasure: () => false,
      clearTypeDraft: () => {},
    },
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
    selection.activePlanTool.value = 'draw_room'
    pressEscape()
    expect(deactivateDrawTool).toHaveBeenCalledTimes(1)
    expect(clearSelection).not.toHaveBeenCalled()
  })

  it('zet teken-tool uit ook vanuit een invoerveld', () => {
    const input = document.createElement('input')
    input.type = 'number'
    const { selection, deactivateDrawTool, pressEscape } = makeHandlers()
    selection.activePlanTool.value = 'draw_wall'
    pressEscape(input)
    expect(deactivateDrawTool).toHaveBeenCalledTimes(1)
  })
})

describe('FML editor types roof vertex Z without toolbar focus', () => {
  it('stuurt cijfers naar surfaceEdit als een dakhoek geselecteerd is', () => {
    const handleTypeKey = vi.fn(() => true)
    const deleteSelected = vi.fn()
    const selection = createPlanCanvasSelection()
    const handlers = createPlanCanvasEditorKeyHandlers({
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
      surfaceEdit: {
        cancelDrag: () => {},
        selectedVertexIndex: ref(0),
        typeText: ref(''),
        handleTypeKey,
        commitFromMeasure: () => false,
        clearTypeDraft: () => {},
      },
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

    const event = new KeyboardEvent('keydown', { key: '3', bubbles: true })
    handlers.onEditorKeyDown(event)
    expect(handleTypeKey).toHaveBeenCalledTimes(1)
    expect(deleteSelected).not.toHaveBeenCalled()
  })
})
