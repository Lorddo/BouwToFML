import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type { Point2D } from '@/core/fml/types'
import type { ItemResizeSide } from './item-resize-handles'
import type { ItemRotateCorner } from './item-rotate-handles'
import type { PlanOpeningHandleKind, PlanOpeningResizeSide } from './plan-canvas-opening-handles'
import { PLAN_CANVAS_CHROME_SELECTOR } from './plan-canvas-gestures'
import { isSettingsMod } from './plan-canvas-mods'
import { allowsFmlStickyHit, type FmlStickySelectKind } from './plan-canvas-sticky-select'
import { planStickySelectKind } from './plan-canvas-selected'
import type { PlanViewContext } from './plan-view-context'
import { runPlanHitCascade } from './plan-canvas-hit-cascade'
import type { FmlThicknessBand } from '@/core/fml/fml-wall-thickness-tiers'
import type { HitTestApi } from './plan-canvas-hit-test-api'
import type { RenderJunction } from './plan-canvas-render-types'
import type { PlanCanvasSelectionRefs } from './plan-canvas-selection'

export interface PointerToolModes {
  drawWallMode: ComputedRef<boolean>
  drawRoomMode: ComputedRef<boolean>
  drawSurfaceMode: ComputedRef<boolean>
  drawLabelMode: ComputedRef<boolean>
  drawLineMode: ComputedRef<boolean>
  addDoorMode: ComputedRef<boolean>
  addWindowMode: ComputedRef<boolean>
  measureMode: ComputedRef<boolean>
  nulpuntMode: ComputedRef<boolean>
  underlayMoveMode: ComputedRef<boolean>
  selectionBoxMode: ComputedRef<boolean>
  areaSurfaceEditEnabled: ComputedRef<boolean>
  annotationEditEnabled: ComputedRef<boolean>
  labelsVisible: ComputedRef<boolean>
  inspectMode: ComputedRef<boolean>
  addFixtureMode: ComputedRef<boolean>
  settingsMod: Ref<boolean> | ComputedRef<boolean>
  moveMod: Ref<boolean> | ComputedRef<boolean>
  touchNav: Ref<boolean> | ComputedRef<boolean>
  manualDimensionsEnabled?: ComputedRef<boolean>
  hitTestDimensionAtCm?: (cm: Point2D) => string | null
  hitTestDimensionEndpointAtCm?: (cm: Point2D) => { id: string; end: 'a' | 'b' } | null
}

export interface PointerDragState {
  draggingWall: ComputedRef<boolean> | Ref<boolean>
  draggingJunction: ComputedRef<boolean> | Ref<boolean>
  draggingOpening: ComputedRef<boolean> | Ref<boolean>
  isMeasureDragging: () => boolean
  isNulpuntDragging: () => boolean
  isUnderlayMoveDragging: () => boolean
  isPanDragging: Ref<boolean>
  draggingItem: ComputedRef<boolean> | Ref<boolean>
  draggingItemResize: ComputedRef<boolean> | Ref<boolean>
  draggingItemRotate: ComputedRef<boolean> | Ref<boolean>
  isWallMoveDrafting?: () => boolean
  isJunctionMoveDrafting?: () => boolean
  isOpeningMoveDrafting?: () => boolean
  draggingDimension?: ComputedRef<boolean> | Ref<boolean>
  draggingAreaLabel?: ComputedRef<boolean> | Ref<boolean>
}

export interface PointerActions {
  beginPanDrag: (event: MouseEvent) => void
  onDrawWallClick: (event: MouseEvent) => void
  updateDrawWallHover: (event: MouseEvent) => void
  clearDrawWallHover: () => void
  beginMeasure: (event: MouseEvent) => void
  updateMeasureHover: (event: MouseEvent) => void
  clearMeasureHover: () => void
  onDrawRoomClick: (event: MouseEvent) => void
  updateDrawRoomHover: (event: MouseEvent) => void
  clearDrawRoomHover: () => void
  onDrawSurfaceClick: (event: MouseEvent) => void
  onDrawSurfaceDblClick: (event: MouseEvent) => void
  updateDrawSurfaceHover: (event: MouseEvent) => void
  clearDrawSurfaceHover: () => void
  onDrawLabelClick: (event: MouseEvent) => void
  onDrawLineClick: (event: MouseEvent) => void
  updateDrawLineHover: (event: MouseEvent) => void
  clearDrawLineHover: () => void
  onSurfaceEditPointerDown: (event: MouseEvent) => boolean
  beginNulpuntDrag: (event: MouseEvent) => boolean
  beginUnderlayMoveDrag: (event: MouseEvent) => boolean
  placeDoor: (wallId: string, cm: Point2D) => string | null
  placeWindow: (wallId: string, cm: Point2D) => string | null
  startJunctionDrag: (junction: RenderJunction, event: MouseEvent) => void
  onJunctionMoveClick: (junction: RenderJunction, event: MouseEvent) => boolean
  updateJunctionMoveHover: (event: MouseEvent) => void
  beginSelectionBoxDrag: (event: MouseEvent) => void
  toggleSettingsOpening: (openingId: string) => void
  toggleSettingsArea: (areaId: string) => void
  selectSettingsArea: (areaId: string) => void
  toggleSettingsSurface: (surfaceId: string) => void
  beginAreaLabelDrag: (kind: 'area' | 'surface', id: string, event: MouseEvent) => void
  startAreaLabelDragPending: (kind: 'area' | 'surface', id: string, event: MouseEvent) => void
  selectRoofSurface?: (surfaceId: string, mutate: boolean) => void
  toggleSettingsLabel: (labelId: string) => void
  toggleSettingsLine: (lineId: string) => void
  toggleSettingsWall: (wallId: string, cm: Point2D) => void
  /** Left-klik: Ã©Ã©n muur selecteren (settings + verplaatsen). */
  selectWall: (wallId: string, cm: Point2D) => void
  toggleSettingsJunction: (junctionId: string) => void
  clearSelection: () => void
  clearOpeningSelectionState: () => void
  beginOpeningDrag: (openingId: string, event: MouseEvent) => void
  startOpeningDragPending: (openingId: string, event: MouseEvent) => void
  hitOpeningHandle: (cm: Point2D) => PlanOpeningHandleKind | null
  beginOpeningResize: (openingId: string, side: PlanOpeningResizeSide, event: MouseEvent) => void
  onOpeningMoveClick: (openingId: string, event: MouseEvent) => boolean
  updateOpeningMoveHover: (event: MouseEvent) => void
  beginWallDrag: (wallId: string, event: MouseEvent) => void
  startMoveDragPending: (wallId: string, event: MouseEvent) => void
  onWallMoveClick: (wallId: string, event: MouseEvent) => boolean
  updateWallMoveHover: (event: MouseEvent) => void
  stopContentGroupDrag: () => void
  applyInspectPick: (cm: Point2D) => void
  updateInspectHover: (event: MouseEvent) => void
  placeFixture: (cm: Point2D, opts?: { snapDisabled?: boolean }) => string | null
  startItemDragPending: (guid: string, event: MouseEvent) => void
  beginItemDrag: (guid: string, event: MouseEvent) => void
  toggleSettingsItem: (guid: string) => void
  cancelItemDragPending: () => void
  hitItemResizeHandle: (cm: Point2D) => ItemResizeSide | null
  beginItemResize: (guid: string, side: ItemResizeSide, event: MouseEvent) => void
  hitItemRotateHandle: (cm: Point2D) => ItemRotateCorner | null
  beginItemRotate: (guid: string, corner: ItemRotateCorner, event: MouseEvent) => void
  startDimensionDragPending: (id: string, event: MouseEvent) => void
  beginDimensionDrag: (id: string, event: MouseEvent) => void
  beginDimensionEndpointDrag: (id: string, end: 'a' | 'b', event: MouseEvent) => void
}

export function usePlanCanvasPointer(options: {
  hitTest: HitTestApi
  selection: PlanCanvasSelectionRefs
  /** Welke tab open staat; bepaalt wat te pakken is. Niet wie het canvas embedt. */
  view: PlanViewContext
  modes: PointerToolModes
  drag: PointerDragState
  actions: PointerActions
  spacePressed: Ref<boolean>
  thicknessPickTier: Ref<FmlThicknessBand | null>
  emit: (event: 'thicknessWallPick', payload: string) => void
}) {
  const { hitTest, selection, view, modes, drag, actions, spacePressed, thicknessPickTier, emit } =
    options

  const {
    moveWallId,
    moveOpeningId,
    settingsItemId,
    moveItemId,
    hoveredWallId,
    hoveredItemId,
    hoveredOpeningId,
    hoveredJunctionId,
    activePlanTool,
    pinnedJunctionId,
  } = selection

  const hoverItemHandle = ref<'rotate' | 'resize' | null>(null)
  const hoverAreaLabel = ref(false)

  const canvasCursor = computed(() => {
    if (modes.measureMode.value && !spacePressed.value && !thicknessPickTier.value)
      return 'crosshair'
    if (modes.nulpuntMode.value && !spacePressed.value && !thicknessPickTier.value) {
      return drag.isNulpuntDragging() ? 'grabbing' : 'grab'
    }
    if (modes.underlayMoveMode.value && !spacePressed.value && !thicknessPickTier.value) {
      return drag.isUnderlayMoveDragging() ? 'grabbing' : 'grab'
    }
    if (modes.drawWallMode.value && !spacePressed.value && !thicknessPickTier.value)
      return 'crosshair'
    if (modes.drawRoomMode.value && !spacePressed.value && !thicknessPickTier.value)
      return 'crosshair'
    if (modes.drawSurfaceMode.value && !spacePressed.value && !thicknessPickTier.value)
      return 'crosshair'
    if (modes.drawLabelMode.value && !spacePressed.value && !thicknessPickTier.value)
      return 'crosshair'
    if (modes.drawLineMode.value && !spacePressed.value && !thicknessPickTier.value)
      return 'crosshair'
    if (selection.surfaceEditId.value && !spacePressed.value) return 'crosshair'
    if (modes.addDoorMode.value && !spacePressed.value && !thicknessPickTier.value)
      return 'crosshair'
    if (modes.addWindowMode.value && !spacePressed.value && !thicknessPickTier.value)
      return 'crosshair'
    if (modes.selectionBoxMode.value && !spacePressed.value && !thicknessPickTier.value)
      return 'crosshair'
    if (thicknessPickTier.value) return 'crosshair'
    if (modes.inspectMode.value && !spacePressed.value) return 'pointer'
    if (drag.draggingItemRotate?.value === true) return 'grabbing'
    if (
      drag.draggingWall.value ||
      drag.draggingJunction.value ||
      drag.draggingOpening.value ||
      drag.draggingItem.value
    ) {
      return 'grabbing'
    }
    if (spacePressed.value) return drag.isPanDragging.value ? 'grabbing' : 'grab'
    if (hoveredJunctionId.value) return 'grab'
    if (moveOpeningId.value && hoveredOpeningId.value === moveOpeningId.value) return 'grab'
    if (moveWallId.value && hoveredWallId.value === moveWallId.value) return 'grab'
    if (moveItemId.value && hoveredItemId.value === moveItemId.value) return 'grab'
    if (
      selection.moveDimensionId.value &&
      (selection.hoveredDimensionId.value === selection.moveDimensionId.value ||
        selection.hoveredDimensionEnd.value != null)
    ) {
      return 'grab'
    }
    if (drag.draggingDimension?.value === true) return 'grabbing'
    if (drag.draggingAreaLabel?.value === true) return 'grabbing'
    if (hoverAreaLabel.value) return 'grab'
    if (hoverItemHandle.value) return 'grab'
    return 'default'
  })

  function currentStickyKind(): FmlStickySelectKind | null {
    return planStickySelectKind(selection)
  }

  function onWrapPointerDown(event: MouseEvent): void {
    if (event.button !== 0) return
    // Touch synthesizes an undispatched MouseEvent â€” target is null, niet chrome.
    const target = event.target instanceof Element ? event.target : null
    if (target?.closest(PLAN_CANVAS_CHROME_SELECTOR)) {
      return
    }

    // Sidebar-controls (opacity e.d.) verliezen focus zodat Space+pan meteen werkt.
    const active = document.activeElement
    if (
      target &&
      active instanceof HTMLElement &&
      active !== target &&
      !target.contains(active) &&
      (active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.tagName === 'SELECT' ||
        active.isContentEditable)
    ) {
      active.blur()
    }

    if (spacePressed.value) {
      actions.beginPanDrag(event)
      return
    }

    event.preventDefault()
    actions.stopContentGroupDrag()

    const cm = hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return

    if (drag.isWallMoveDrafting?.() === true) {
      actions.onWallMoveClick(moveWallId.value ?? '', event)
      return
    }
    if (drag.isJunctionMoveDrafting?.() === true) {
      actions.onJunctionMoveClick(
        {
          id: pinnedJunctionId.value ?? '',
          x: cm.x,
          y: cm.y,
          cmX: cm.x,
          cmY: cm.y,
          refs: [],
          wallCount: 0,
        },
        event,
      )
      return
    }
    if (drag.isOpeningMoveDrafting?.() === true) {
      actions.onOpeningMoveClick(moveOpeningId.value ?? '', event)
      return
    }

    if (modes.inspectMode.value) {
      actions.applyInspectPick(cm)
      return
    }

    if (modes.drawWallMode.value) {
      actions.onDrawWallClick(event)
      return
    }

    if (modes.measureMode.value) {
      actions.beginMeasure(event)
      return
    }

    if (modes.nulpuntMode.value) {
      actions.beginNulpuntDrag(event)
      return
    }

    if (modes.underlayMoveMode.value) {
      actions.beginUnderlayMoveDrag(event)
      return
    }

    if (modes.drawRoomMode.value) {
      actions.onDrawRoomClick(event)
      return
    }

    if (modes.drawSurfaceMode.value) {
      actions.onDrawSurfaceClick(event)
      return
    }

    if (modes.drawLabelMode.value) {
      actions.onDrawLabelClick(event)
      return
    }

    if (modes.drawLineMode.value) {
      actions.onDrawLineClick(event)
      return
    }

    if (selection.surfaceEditId.value && modes.areaSurfaceEditEnabled.value) {
      if (actions.onSurfaceEditPointerDown(event)) return
    }

    if (modes.addDoorMode.value || modes.addWindowMode.value) {
      const wallId = hitTest.hitTestWallAtCm(cm)
      if (!wallId) return
      const openingId = modes.addDoorMode.value
        ? actions.placeDoor(wallId, cm)
        : actions.placeWindow(wallId, cm)
      if (openingId) activePlanTool.value = null
      return
    }

    if (modes.addFixtureMode.value) {
      const guid = actions.placeFixture(cm, {
        snapDisabled: isSettingsMod(event, modes.settingsMod.value),
      })
      if (guid) {
        settingsItemId.value = guid
        moveItemId.value = null
        activePlanTool.value = null
      }
      return
    }

    runPlanHitCascade({
      cm,
      event,
      hitTest,
      selection,
      view,
      modes,
      actions,
      thicknessPickTier,
      emit,
    })
  }

  function onWrapPointerMove(event: MouseEvent): void {
    const moveTarget = event.target instanceof Element ? event.target : null
    if (moveTarget?.closest(PLAN_CANVAS_CHROME_SELECTOR)) return
    if (drag.isWallMoveDrafting?.() === true) {
      actions.updateWallMoveHover(event)
      return
    }
    if (drag.isJunctionMoveDrafting?.() === true) {
      actions.updateJunctionMoveHover(event)
      return
    }
    if (drag.isOpeningMoveDrafting?.() === true) {
      actions.updateOpeningMoveHover(event)
      return
    }
    if (
      drag.draggingWall.value ||
      drag.draggingJunction.value ||
      drag.draggingOpening.value ||
      drag.isMeasureDragging() ||
      drag.isNulpuntDragging() ||
      drag.isUnderlayMoveDragging() ||
      drag.draggingItem.value ||
      drag.draggingItemResize.value ||
      drag.draggingItemRotate?.value === true ||
      drag.draggingDimension?.value === true ||
      drag.draggingAreaLabel?.value === true ||
      spacePressed.value
    ) {
      return
    }
    if (modes.inspectMode.value) {
      actions.updateInspectHover(event)
      return
    }
    if (modes.measureMode.value) {
      actions.updateMeasureHover(event)
      return
    }
    if (modes.drawWallMode.value) {
      actions.updateDrawWallHover(event)
      return
    }
    if (modes.drawRoomMode.value) {
      actions.updateDrawRoomHover(event)
      return
    }
    if (modes.drawSurfaceMode.value) {
      actions.updateDrawSurfaceHover(event)
      return
    }
    if (modes.drawLineMode.value) {
      actions.updateDrawLineHover(event)
      return
    }
    actions.clearMeasureHover()
    actions.clearDrawWallHover()
    actions.clearDrawRoomHover()
    actions.clearDrawSurfaceHover()
    actions.clearDrawLineHover()

    pendingMoveEvent = event
    if (moveRaf != null) return
    moveRaf = requestAnimationFrame(() => {
      moveRaf = null
      const e = pendingMoveEvent
      pendingMoveEvent = null
      if (!e) return
      const cm = hitTest.clientToCm(e.clientX, e.clientY)
      if (!cm) return
      const selectedItem = view.canSelect('item')
        ? (settingsItemId.value ?? moveItemId.value)
        : null
      if (selectedItem && !modes.inspectMode.value) {
        if (actions.hitItemRotateHandle(cm)) hoverItemHandle.value = 'rotate'
        else if (actions.hitItemResizeHandle(cm)) hoverItemHandle.value = 'resize'
        else hoverItemHandle.value = null
      } else {
        hoverItemHandle.value = null
      }
      const nameHover =
        modes.areaSurfaceEditEnabled.value && !modes.inspectMode.value && modes.labelsVisible.value
          ? hitTest.hitTestAreaNameAtCm(cm)
          : null
      hoverAreaLabel.value =
        nameHover != null &&
        ((nameHover.kind === 'area' && nameHover.id === selection.settingsAreaId.value) ||
          (nameHover.kind === 'surface' && nameHover.id === selection.settingsSurfaceId.value))
      const allowHover = (hit: FmlStickySelectKind): boolean =>
        allowsFmlStickyHit(currentStickyKind(), hit)
      const junction = hitTest.hitTestJunctionAtCm(cm)
      hoveredJunctionId.value = junction && allowHover('wall') ? junction.id : null
      const doorId = hitTest.hitTestOpeningAtCm(cm)
      hoveredOpeningId.value = doorId && allowHover('opening') ? doorId : null
      hoveredItemId.value = null
      hoveredWallId.value = hoveredOpeningId.value != null ? null : hitTest.hitTestWallAtCm(cm)
      if (
        modes.manualDimensionsEnabled?.value === true &&
        !modes.inspectMode.value &&
        !modes.measureMode.value
      ) {
        const endpoint = modes.hitTestDimensionEndpointAtCm?.(cm) ?? null
        if (endpoint && allowHover('dimension')) {
          selection.hoveredDimensionId.value = endpoint.id
          selection.hoveredDimensionEnd.value = endpoint.end
        } else {
          const dimId = modes.hitTestDimensionAtCm?.(cm) ?? null
          selection.hoveredDimensionId.value = dimId && allowHover('dimension') ? dimId : null
          selection.hoveredDimensionEnd.value = null
        }
      } else {
        selection.hoveredDimensionId.value = null
        selection.hoveredDimensionEnd.value = null
      }
    })
  }

  function cancelPendingMove(): void {
    if (moveRaf != null) {
      cancelAnimationFrame(moveRaf)
      moveRaf = null
    }
    pendingMoveEvent = null
  }

  let moveRaf: number | null = null
  let pendingMoveEvent: MouseEvent | null = null

  return {
    canvasCursor,
    onWrapPointerDown,
    onWrapPointerMove,
    cancelPendingMove,
    onWrapDblClick(event: MouseEvent): void {
      if (modes.drawSurfaceMode.value) {
        actions.onDrawSurfaceDblClick(event)
      }
    },
  }
}
