import { computed, type ComputedRef, type Ref } from 'vue'
import type { Point2D } from '@/core/fml/types'
import type { FmlThicknessBand } from '@/core/fml/fml-wall-thickness-tiers'
import type { RenderJunction } from './fml-preview-render-types'
import type { FmlPreviewSelectionRefs } from './fml-preview-selection'

interface HitTestApi {
  hitTestWallAtCm: (cm: Point2D) => string | null
  hitTestOpeningAtCm: (cm: Point2D) => string | null
  hitTestJunctionAtCm: (cm: Point2D) => RenderJunction | null
  clientToCm: (clientX: number, clientY: number) => Point2D | null
}

interface PointerToolModes {
  drawWallMode: ComputedRef<boolean>
  drawRoomMode: ComputedRef<boolean>
  addDoorMode: ComputedRef<boolean>
  addWindowMode: ComputedRef<boolean>
  measureMode: ComputedRef<boolean>
  selectionBoxMode: ComputedRef<boolean>
}

interface PointerDragState {
  draggingWall: ComputedRef<boolean> | Ref<boolean>
  draggingJunction: ComputedRef<boolean> | Ref<boolean>
  draggingOpening: ComputedRef<boolean> | Ref<boolean>
  isDrawWallDragging: () => boolean
  isDrawRoomDragging: () => boolean
  isMeasureDragging: () => boolean
  isPanDragging: Ref<boolean>
}

interface PointerActions {
  beginPanDrag: (event: MouseEvent) => void
  beginDrawWall: (event: MouseEvent) => void
  beginMeasure: (event: MouseEvent) => void
  beginDrawRoom: (event: MouseEvent) => void
  placeDoor: (wallId: string, cm: Point2D) => string | null
  placeWindow: (wallId: string, cm: Point2D) => string | null
  startJunctionDrag: (junction: RenderJunction, event: MouseEvent) => void
  beginSelectionBoxDrag: (event: MouseEvent) => void
  toggleSettingsOpening: (openingId: string) => void
  toggleSettingsWall: (wallId: string, cm: Point2D) => void
  clearSelection: () => void
  clearOpeningSelectionState: () => void
  beginOpeningDrag: (openingId: string, event: MouseEvent) => void
  startOpeningDragPending: (openingId: string, event: MouseEvent) => void
  beginWallDrag: (wallId: string, event: MouseEvent) => void
  startMoveDragPending: (wallId: string, event: MouseEvent) => void
  stopContentGroupDrag: () => void
}

export function useFmlPreviewPointer(options: {
  hitTest: HitTestApi
  selection: FmlPreviewSelectionRefs
  modes: PointerToolModes
  drag: PointerDragState
  actions: PointerActions
  spacePressed: Ref<boolean>
  thicknessPickTier: Ref<FmlThicknessBand | null>
  emit: (event: 'thicknessWallPick', payload: string) => void
}) {
  const { hitTest, selection, modes, drag, actions, spacePressed, thicknessPickTier, emit } =
    options

  const {
    settingsWallIds,
    moveWallId,
    settingsOpeningIds,
    moveOpeningId,
    hoveredWallId,
    hoveredOpeningId,
    hoveredJunctionId,
    activeFmlTool,
    pinnedJunctionId,
  } = selection

  const canvasCursor = computed(() => {
    if (modes.measureMode.value && !spacePressed.value && !thicknessPickTier.value)
      return 'crosshair'
    if (modes.drawWallMode.value && !spacePressed.value && !thicknessPickTier.value)
      return 'crosshair'
    if (modes.drawRoomMode.value && !spacePressed.value && !thicknessPickTier.value)
      return 'crosshair'
    if (modes.addDoorMode.value && !spacePressed.value && !thicknessPickTier.value)
      return 'crosshair'
    if (modes.addWindowMode.value && !spacePressed.value && !thicknessPickTier.value)
      return 'crosshair'
    if (modes.selectionBoxMode.value && !spacePressed.value && !thicknessPickTier.value)
      return 'crosshair'
    if (thicknessPickTier.value) return 'crosshair'
    if (drag.draggingWall.value || drag.draggingJunction.value || drag.draggingOpening.value) {
      return 'grabbing'
    }
    if (spacePressed.value) return drag.isPanDragging.value ? 'grabbing' : 'grab'
    if (hoveredJunctionId.value) return 'grab'
    if (moveOpeningId.value && hoveredOpeningId.value === moveOpeningId.value) return 'grab'
    if (moveWallId.value && hoveredWallId.value === moveWallId.value) return 'grab'
    return 'default'
  })

  function onWrapPointerDown(event: MouseEvent): void {
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    if (
      target.closest(
        '.fml-preview-hint, .canvas-toolbelt-dock, .canvas-toolbelt, button, input, label',
      )
    ) {
      return
    }

    if (spacePressed.value) {
      actions.beginPanDrag(event)
      return
    }

    event.preventDefault()
    actions.stopContentGroupDrag()

    const cm = hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return

    if (modes.drawWallMode.value) {
      actions.beginDrawWall(event)
      return
    }

    if (modes.measureMode.value) {
      actions.beginMeasure(event)
      return
    }

    if (modes.drawRoomMode.value) {
      actions.beginDrawRoom(event)
      return
    }

    if (modes.addDoorMode.value || modes.addWindowMode.value) {
      const wallId = hitTest.hitTestWallAtCm(cm)
      if (!wallId) return
      const openingId = modes.addDoorMode.value
        ? actions.placeDoor(wallId, cm)
        : actions.placeWindow(wallId, cm)
      if (openingId) activeFmlTool.value = null
      return
    }

    const junction = hitTest.hitTestJunctionAtCm(cm)
    if (junction) {
      actions.startJunctionDrag(junction, event)
      return
    }

    if (thicknessPickTier.value) {
      const wallId = hitTest.hitTestWallAtCm(cm)
      if (wallId) emit('thicknessWallPick', wallId)
      return
    }

    if (modes.selectionBoxMode.value) {
      actions.beginSelectionBoxDrag(event)
      return
    }

    const openingId = hitTest.hitTestOpeningAtCm(cm)
    if (openingId) {
      if (event.ctrlKey || event.metaKey) {
        actions.toggleSettingsOpening(openingId)
        return
      }

      settingsWallIds.value = []
      moveWallId.value = null
      pinnedJunctionId.value = null
      settingsOpeningIds.value = []
      const wasMoveTarget = moveOpeningId.value === openingId
      moveOpeningId.value = openingId
      if (wasMoveTarget) {
        actions.beginOpeningDrag(openingId, event)
        return
      }
      actions.startOpeningDragPending(openingId, event)
      return
    }

    const wallId = hitTest.hitTestWallAtCm(cm)
    if (!wallId) {
      actions.clearSelection()
      hoveredOpeningId.value = null
      return
    }

    if (event.ctrlKey || event.metaKey) {
      actions.toggleSettingsWall(wallId, cm)
      return
    }

    actions.clearOpeningSelectionState()
    const wasMoveTarget = moveWallId.value === wallId
    moveWallId.value = wallId

    if (wasMoveTarget) {
      actions.beginWallDrag(wallId, event)
      return
    }

    actions.startMoveDragPending(wallId, event)
  }

  function onWrapPointerMove(event: MouseEvent): void {
    if (
      drag.draggingWall.value ||
      drag.draggingJunction.value ||
      drag.draggingOpening.value ||
      drag.isDrawWallDragging() ||
      drag.isDrawRoomDragging() ||
      drag.isMeasureDragging() ||
      spacePressed.value
    ) {
      return
    }
    const cm = hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return
    const junction = hitTest.hitTestJunctionAtCm(cm)
    hoveredJunctionId.value = junction?.id ?? null
    const doorId = hitTest.hitTestOpeningAtCm(cm)
    hoveredOpeningId.value = doorId
    hoveredWallId.value = doorId ? null : hitTest.hitTestWallAtCm(cm)
  }

  return {
    canvasCursor,
    onWrapPointerDown,
    onWrapPointerMove,
  }
}
