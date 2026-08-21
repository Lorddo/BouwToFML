import { computed, type ComputedRef, type Ref } from 'vue'
import type { Point2D } from '@/core/fml/types'
import type { ItemResizeSide } from './item-resize-handles'
import { FML_PREVIEW_CHROME_SELECTOR } from './fml-preview-gestures'
import { isSettingsMod, wantsRelocate } from './fml-preview-mods'
import {
  allowsFmlStickyHit,
  resolveFmlStickySelectKind,
  type FmlStickySelectKind,
} from './fml-preview-sticky-select'
import type { FmlThicknessBand } from '@/core/fml/fml-wall-thickness-tiers'
import type { HitTestApi } from './fml-preview-hit-test-api'
import type { RenderJunction } from './fml-preview-render-types'
import type { FmlPreviewSelectionRefs } from './fml-preview-selection'

interface PointerToolModes {
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
}

interface PointerDragState {
  draggingWall: ComputedRef<boolean> | Ref<boolean>
  draggingJunction: ComputedRef<boolean> | Ref<boolean>
  draggingOpening: ComputedRef<boolean> | Ref<boolean>
  isMeasureDragging: () => boolean
  isNulpuntDragging: () => boolean
  isUnderlayMoveDragging: () => boolean
  isPanDragging: Ref<boolean>
  draggingItem: ComputedRef<boolean> | Ref<boolean>
  draggingItemResize: ComputedRef<boolean> | Ref<boolean>
}

interface PointerActions {
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
  beginSelectionBoxDrag: (event: MouseEvent) => void
  toggleSettingsOpening: (openingId: string) => void
  toggleSettingsArea: (areaId: string) => void
  toggleSettingsSurface: (surfaceId: string) => void
  toggleSettingsLabel: (labelId: string) => void
  toggleSettingsLine: (lineId: string) => void
  toggleSettingsWall: (wallId: string, cm: Point2D) => void
  toggleSettingsJunction: (junctionId: string) => void
  clearSelection: () => void
  clearOpeningSelectionState: () => void
  beginOpeningDrag: (openingId: string, event: MouseEvent) => void
  startOpeningDragPending: (openingId: string, event: MouseEvent) => void
  beginWallDrag: (wallId: string, event: MouseEvent) => void
  startMoveDragPending: (wallId: string, event: MouseEvent) => void
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
    settingsItemId,
    moveItemId,
    hoveredWallId,
    hoveredItemId,
    hoveredOpeningId,
    hoveredJunctionId,
    activeFmlTool,
    pinnedJunctionId,
  } = selection

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
    return 'default'
  })

  function currentStickyKind(): FmlStickySelectKind | null {
    return resolveFmlStickySelectKind({
      hasWall: settingsWallIds.value.length > 0 || moveWallId.value != null,
      hasJunction: selection.settingsJunctionId.value != null || pinnedJunctionId.value != null,
      hasOpening: settingsOpeningIds.value.length > 0 || moveOpeningId.value != null,
      hasItem: settingsItemId.value != null || moveItemId.value != null,
      hasAnnotation:
        selection.settingsLabelId.value != null || selection.settingsLineId.value != null,
      hasArea: selection.settingsAreaId.value != null || selection.settingsSurfaceId.value != null,
    })
  }

  function onWrapPointerDown(event: MouseEvent): void {
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest(FML_PREVIEW_CHROME_SELECTOR)) {
      return
    }

    // Sidebar-controls (opacity e.d.) verliezen focus zodat Space+pan meteen werkt.
    const active = document.activeElement
    if (
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
      if (openingId) activeFmlTool.value = null
      return
    }

    if (modes.addFixtureMode.value) {
      const guid = actions.placeFixture(cm, {
        snapDisabled: isSettingsMod(event, modes.settingsMod.value),
      })
      if (guid) {
        settingsItemId.value = guid
        moveItemId.value = null
        activeFmlTool.value = null
      }
      return
    }

    const allowHit = (hit: FmlStickySelectKind): boolean =>
      allowsFmlStickyHit(currentStickyKind(), hit)

    if (settingsItemId.value) {
      const side = actions.hitItemResizeHandle(cm)
      if (side) {
        actions.beginItemResize(settingsItemId.value, side, event)
        return
      }
    }

    const junction = hitTest.hitTestJunctionAtCm(cm)
    if (junction && allowHit('wall')) {
      if (isSettingsMod(event, modes.settingsMod.value)) {
        actions.toggleSettingsJunction(junction.id)
        return
      }
      if (!wantsRelocate(modes.touchNav.value, modes.moveMod.value)) {
        pinnedJunctionId.value = junction.id
        return
      }
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
    if (openingId && allowHit('opening')) {
      if (isSettingsMod(event, modes.settingsMod.value)) {
        actions.toggleSettingsOpening(openingId)
        return
      }

      settingsWallIds.value = []
      selection.settingsJunctionId.value = null
      moveWallId.value = null
      pinnedJunctionId.value = null
      settingsOpeningIds.value = []
      settingsItemId.value = null
      moveItemId.value = null
      actions.cancelItemDragPending()
      selection.settingsAreaId.value = null
      selection.settingsSurfaceId.value = null
      selection.settingsLabelId.value = null
      selection.settingsLineId.value = null
      const wasMoveTarget = moveOpeningId.value === openingId
      moveOpeningId.value = openingId
      if (!wantsRelocate(modes.touchNav.value, modes.moveMod.value)) return
      if (wasMoveTarget || modes.moveMod.value) {
        actions.beginOpeningDrag(openingId, event)
        return
      }
      actions.startOpeningDragPending(openingId, event)
      return
    }

    const itemId = hitTest.hitTestItemAtCm(cm)
    if (itemId && allowHit('item')) {
      if (isSettingsMod(event, modes.settingsMod.value)) {
        actions.toggleSettingsItem(itemId)
        return
      }
      settingsWallIds.value = []
      selection.settingsJunctionId.value = null
      moveWallId.value = null
      pinnedJunctionId.value = null
      settingsOpeningIds.value = []
      settingsItemId.value = null
      selection.settingsAreaId.value = null
      selection.settingsSurfaceId.value = null
      selection.settingsLabelId.value = null
      selection.settingsLineId.value = null
      const wasMoveTarget = moveItemId.value === itemId
      moveItemId.value = itemId
      if (!wantsRelocate(modes.touchNav.value, modes.moveMod.value)) return
      if (wasMoveTarget || modes.moveMod.value) {
        actions.beginItemDrag(itemId, event)
        return
      }
      actions.startItemDragPending(itemId, event)
      return
    }

    const labelId = modes.labelsVisible.value ? hitTest.hitTestLabelAtCm(cm) : null
    if (
      modes.annotationEditEnabled.value &&
      labelId &&
      allowHit('annotation') &&
      isSettingsMod(event, modes.settingsMod.value)
    ) {
      actions.toggleSettingsLabel(labelId)
      return
    }

    const lineId = hitTest.hitTestLineAtCm(cm)
    if (
      modes.annotationEditEnabled.value &&
      lineId &&
      allowHit('annotation') &&
      isSettingsMod(event, modes.settingsMod.value)
    ) {
      actions.toggleSettingsLine(lineId)
      return
    }

    const surfaceId = hitTest.hitTestSurfaceAtCm(cm)
    if (
      modes.areaSurfaceEditEnabled.value &&
      surfaceId &&
      allowHit('area') &&
      isSettingsMod(event, modes.settingsMod.value)
    ) {
      actions.toggleSettingsSurface(surfaceId)
      return
    }

    const areaId = hitTest.hitTestAreaAtCm(cm)
    if (
      modes.areaSurfaceEditEnabled.value &&
      areaId &&
      allowHit('area') &&
      isSettingsMod(event, modes.settingsMod.value)
    ) {
      actions.toggleSettingsArea(areaId)
      return
    }

    // Interior click on area/surface without ctrl: clear (don't steal wall hits)
    if (surfaceId || areaId) {
      const wallUnder = hitTest.hitTestWallAtCm(cm)
      if (!wallUnder) {
        actions.clearSelection()
        hoveredOpeningId.value = null
        return
      }
    }

    const wallId = hitTest.hitTestWallAtCm(cm)
    if (!wallId) {
      actions.clearSelection()
      hoveredOpeningId.value = null
      return
    }

    if (!allowHit('wall')) return

    if (isSettingsMod(event, modes.settingsMod.value)) {
      actions.toggleSettingsWall(wallId, cm)
      return
    }

    actions.clearOpeningSelectionState()
    selection.settingsAreaId.value = null
    selection.settingsSurfaceId.value = null
    settingsItemId.value = null
    moveItemId.value = null
    actions.cancelItemDragPending()
    const wasMoveTarget = moveWallId.value === wallId
    moveWallId.value = wallId
    if (!wantsRelocate(modes.touchNav.value, modes.moveMod.value)) return

    if (wasMoveTarget || modes.moveMod.value) {
      actions.beginWallDrag(wallId, event)
      return
    }

    actions.startMoveDragPending(wallId, event)
  }

  function onWrapPointerMove(event: MouseEvent): void {
    const moveTarget = event.target as HTMLElement | null
    if (moveTarget?.closest(FML_PREVIEW_CHROME_SELECTOR)) return
    if (
      drag.draggingWall.value ||
      drag.draggingJunction.value ||
      drag.draggingOpening.value ||
      drag.isMeasureDragging() ||
      drag.isNulpuntDragging() ||
      drag.isUnderlayMoveDragging() ||
      drag.draggingItem.value ||
      drag.draggingItemResize.value ||
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
      const allowHover = (hit: FmlStickySelectKind): boolean =>
        allowsFmlStickyHit(currentStickyKind(), hit)
      const junction = hitTest.hitTestJunctionAtCm(cm)
      hoveredJunctionId.value = junction && allowHover('wall') ? junction.id : null
      const doorId = hitTest.hitTestOpeningAtCm(cm)
      hoveredOpeningId.value = doorId && allowHover('opening') ? doorId : null
      hoveredItemId.value = null
      hoveredWallId.value = hoveredOpeningId.value != null ? null : hitTest.hitTestWallAtCm(cm)
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
