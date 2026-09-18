import type { ComputedRef, Ref } from 'vue'
import type { Point2D } from '@/core/plan/types'
import type { ThicknessBand } from '@/core/plan/wall-thickness-tiers'
import type { HitTestApi } from './plan-canvas-hit-test-api'
import type { PlanCanvasSelectionRefs } from './plan-canvas-selection-types'
import type { PlanViewContext } from './plan-view-context'
import type { ItemResizeSide } from './item-resize-handles'
import type { ItemRotateCorner } from './item-rotate-handles'
import type { PlanOpeningHandleKind, PlanOpeningResizeSide } from './plan-canvas-opening-handles'
import type { RenderJunction } from './plan-canvas-render-types'
import { isSettingsMod, resolveRelocatePointerIntent, wantsRelocate } from '@/ui/composables/canvas-kernel/plan-canvas-mods'
import { pickDakPlanOverlayHit } from './plan-canvas-ridge-hit'
import {
  allowsPlanStickyHit,
  wallPreemptsAreaHit,
  type PlanStickySelectKind,
} from './plan-canvas-sticky-select'
import { planStickySelectKind, setPlanSelected } from './plan-canvas-selected'

/**
 * De hit-cascade: wélk object pakt deze klik, als geen tool hem al opeiste.
 *
 * Kernel, geen plugin — plugins krijgen de klik éérst, deze cascade is de bodem.
 * Zestien takken in een vaste volgorde, gedocumenteerd als stap 13–28 in
 * `.cursor/docs/refactor/lean/editor-kernel.md` §5 en vastgelegd in
 * `tests/ui/plan-canvas-pointer-cascade.spec.ts`.
 *
 * Bewust géén DOM hier: guards (`instanceof Element`, `document.activeElement`)
 * en tool-dispatch blijven in de pointer. Deze functie werkt op `cm` + state,
 * zodat ze te testen valt zonder browser.
 */

/** Alleen wat de cascade nodig heeft — kleiner dan de volle `PointerToolModes`. */
export interface PlanHitCascadeModes {
  areaSurfaceEditEnabled: ComputedRef<boolean>
  annotationEditEnabled: ComputedRef<boolean>
  labelsVisible: ComputedRef<boolean>
  selectionBoxMode: ComputedRef<boolean>
  inspectMode: ComputedRef<boolean>
  measureMode: ComputedRef<boolean>
  settingsMod: Ref<boolean> | ComputedRef<boolean>
  moveMod: Ref<boolean> | ComputedRef<boolean>
  touchNav: Ref<boolean> | ComputedRef<boolean>
  manualDimensionsEnabled?: ComputedRef<boolean>
  hitTestDimensionAtCm?: (cm: Point2D) => string | null
  hitTestDimensionEndpointAtCm?: (cm: Point2D) => { id: string; end: 'a' | 'b' } | null
}

/** Idem voor de acties: 34 van de 66, en geen enkele teken-tool. */
export interface PlanHitCascadeActions {
  hitItemRotateHandle: (cm: Point2D) => ItemRotateCorner | null
  beginItemRotate: (guid: string, corner: ItemRotateCorner, event: MouseEvent) => void
  hitItemResizeHandle: (cm: Point2D) => ItemResizeSide | null
  beginItemResize: (guid: string, side: ItemResizeSide, event: MouseEvent) => void
  hitOpeningHandle: (cm: Point2D) => PlanOpeningHandleKind | null
  beginOpeningResize: (openingId: string, side: PlanOpeningResizeSide, event: MouseEvent) => void
  onOpeningMoveClick: (openingId: string, event: MouseEvent) => boolean
  beginOpeningDrag: (openingId: string, event: MouseEvent) => void
  startOpeningDragPending: (openingId: string, event: MouseEvent) => void
  toggleSettingsOpening: (openingId: string) => void
  clearOpeningSelectionState: () => void
  toggleSettingsJunction: (junctionId: string) => void
  onJunctionMoveClick: (junction: RenderJunction, event: MouseEvent) => boolean
  startJunctionDrag: (junction: RenderJunction, event: MouseEvent) => void
  beginSelectionBoxDrag: (event: MouseEvent) => void
  toggleSettingsItem: (guid: string) => void
  beginItemDrag: (guid: string, event: MouseEvent) => void
  startItemDragPending: (guid: string, event: MouseEvent) => void
  cancelItemDragPending: () => void
  beginDimensionEndpointDrag: (id: string, end: 'a' | 'b', event: MouseEvent) => void
  beginDimensionDrag: (id: string, event: MouseEvent) => void
  startDimensionDragPending: (id: string, event: MouseEvent) => void
  toggleSettingsLabel: (labelId: string) => void
  toggleSettingsLine: (lineId: string) => void
  beginAreaLabelDrag: (kind: 'area' | 'surface', id: string, event: MouseEvent) => void
  startAreaLabelDragPending: (kind: 'area' | 'surface', id: string, event: MouseEvent) => void
  selectRoofSurface?: (surfaceId: string, mutate: boolean) => void
  toggleSettingsSurface: (surfaceId: string) => void
  toggleSettingsArea: (areaId: string) => void
  selectSettingsArea: (areaId: string) => void
  toggleSettingsWall: (wallId: string, cm: Point2D) => void
  selectWall: (wallId: string, cm: Point2D) => void
  onWallMoveClick: (wallId: string, event: MouseEvent) => boolean
  beginWallDrag: (wallId: string, event: MouseEvent) => void
  startMoveDragPending: (wallId: string, event: MouseEvent) => void
  clearSelection: () => void
}

export interface PlanHitCascadeDeps {
  cm: Point2D
  event: MouseEvent
  hitTest: HitTestApi
  selection: PlanCanvasSelectionRefs
  view: PlanViewContext
  modes: PlanHitCascadeModes
  actions: PlanHitCascadeActions
  thicknessPickTier: Ref<ThicknessBand | null>
  emit: (event: 'thicknessWallPick', payload: string) => void
}

export function runPlanHitCascade(deps: PlanHitCascadeDeps): void {
  const { cm, event, hitTest, selection, view, modes, actions, thicknessPickTier, emit } = deps
  const onDak = view.mode === 'dak'

  const allowHit = (hit: PlanStickySelectKind): boolean =>
    allowsPlanStickyHit(planStickySelectKind(selection), hit)
  const ctrlHeld = (): boolean => isSettingsMod(event, modes.settingsMod.value)
  const relocateIntent = () =>
    resolveRelocatePointerIntent({
      touchNav: modes.touchNav.value,
      moveMod: modes.moveMod.value,
      shiftKey: event.shiftKey === true,
    })

  // 13 — grepen van de geselecteerde fixture: rotatie (hoeken) vóór resize (randen).
  const selectedItem = view.canSelect('item')
    ? (selection.settingsItemId.value ?? selection.moveItemId.value)
    : null
  if (selectedItem) {
    const corner = actions.hitItemRotateHandle(cm)
    if (corner) {
      actions.beginItemRotate(selectedItem, corner, event)
      return
    }
    const side = actions.hitItemResizeHandle(cm)
    if (side) {
      actions.beginItemResize(selectedItem, side, event)
      return
    }
  }

  // 14 — grepen van de geselecteerde opening; alleen bij precies één selectie.
  const selectedOpeningForHandle =
    selection.moveOpeningId.value ??
    (selection.settingsOpeningIds.value.length === 1
      ? selection.settingsOpeningIds.value[0]
      : null)
  if (selectedOpeningForHandle) {
    const openingHandle = actions.hitOpeningHandle(cm)
    if (openingHandle === 'move') {
      const moveIntent = relocateIntent()
      if (moveIntent === 'precise') {
        actions.onOpeningMoveClick(selectedOpeningForHandle, event)
        return
      }
      if (moveIntent !== 'select') {
        actions.beginOpeningDrag(selectedOpeningForHandle, event)
        return
      }
    } else if (openingHandle === 'start' || openingHandle === 'end') {
      actions.beginOpeningResize(selectedOpeningForHandle, openingHandle, event)
      return
    }
  }

  // 15 — knoop. Op de Dak-tab alleen als er een nok aan hangt.
  // Box-select pakt alleen segmenten: geen knoop-drag, ook niet op een punt.
  if (!modes.selectionBoxMode.value) {
    const junction = hitTest.hitTestJunctionAtCm(cm)
    const junctionOnRidge =
      junction?.refs.some((ref) => view.isRidgeWallId(ref.wallId)) === true
    if (junction && allowHit('wall') && (!onDak || junctionOnRidge)) {
      if (ctrlHeld()) {
        actions.toggleSettingsJunction(junction.id)
        return
      }
      const junctionIntent = relocateIntent()
      if (junctionIntent === 'precise') {
        actions.onJunctionMoveClick(junction, event)
        return
      }
      if (junctionIntent === 'select') {
        selection.pinnedJunctionId.value = junction.id
        return
      }
      actions.startJunctionDrag(junction, event)
      return
    }
  }

  // 16 — dikte-pick. Staat bewust vóór box-select en opening; zie §5.
  if (thicknessPickTier.value) {
    const wallId = hitTest.hitTestWallAtCm(cm)
    if (wallId) emit('thicknessWallPick', wallId)
    return
  }

  // 17 — box-select. Start ook bovenop een knoop (knoop-tak slaat over).
  if (modes.selectionBoxMode.value) {
    actions.beginSelectionBoxDrag(event)
    return
  }

  // 18 — opening.
  const openingId = hitTest.hitTestOpeningAtCm(
    cm,
    selection.settingsOpeningIds.value[0] ?? selection.moveOpeningId.value,
  )
  if (openingId && allowHit('opening')) {
    if (ctrlHeld()) {
      actions.toggleSettingsOpening(openingId)
      return
    }
    const wasMoveTarget = selection.moveOpeningId.value === openingId
    actions.cancelItemDragPending()
    setPlanSelected(selection, { kind: 'opening', moveId: openingId })
    const openingIntent = relocateIntent()
    if (openingIntent === 'precise') {
      actions.onOpeningMoveClick(openingId, event)
      return
    }
    if (openingIntent === 'select') return
    if (wasMoveTarget || modes.moveMod.value) {
      actions.beginOpeningDrag(openingId, event)
      return
    }
    actions.startOpeningDragPending(openingId, event)
    return
  }

  // 19 — fixture.
  const itemId = view.canSelect('item') ? hitTest.hitTestItemAtCm(cm) : null
  if (itemId && allowHit('item')) {
    if (ctrlHeld()) {
      actions.toggleSettingsItem(itemId)
      return
    }
    const wasMoveTarget = selection.moveItemId.value === itemId
    setPlanSelected(selection, { kind: 'item', moveId: itemId })
    if (!wantsRelocate(modes.touchNav.value, modes.moveMod.value)) return
    if (wasMoveTarget || modes.moveMod.value) {
      actions.beginItemDrag(itemId, event)
      return
    }
    actions.startItemDragPending(itemId, event)
    return
  }

  // 20 — maatlijn: eindpunt vóór de lijn zelf.
  if (
    modes.manualDimensionsEnabled?.value === true &&
    !modes.inspectMode.value &&
    !modes.measureMode.value
  ) {
    const endpoint = modes.hitTestDimensionEndpointAtCm?.(cm) ?? null
    if (endpoint && allowHit('dimension')) {
      actions.clearSelection()
      selection.moveDimensionId.value = endpoint.id
      selection.hoveredDimensionEnd.value = endpoint.end
      actions.beginDimensionEndpointDrag(endpoint.id, endpoint.end, event)
      return
    }
    const dimensionId = modes.hitTestDimensionAtCm?.(cm) ?? null
    if (dimensionId && allowHit('dimension')) {
      const wasMoveTarget = selection.moveDimensionId.value === dimensionId
      actions.clearSelection()
      selection.moveDimensionId.value = dimensionId
      selection.hoveredDimensionEnd.value = null
      const dimIntent = relocateIntent()
      if (dimIntent === 'select') return
      if (wasMoveTarget || modes.moveMod.value) {
        actions.beginDimensionDrag(dimensionId, event)
        return
      }
      actions.startDimensionDragPending(dimensionId, event)
      return
    }
  }

  // 21 / 22 — label en lijn reageren alleen op Ctrl.
  const labelId = modes.labelsVisible.value ? hitTest.hitTestLabelAtCm(cm) : null
  if (modes.annotationEditEnabled.value && labelId && allowHit('annotation') && ctrlHeld()) {
    actions.toggleSettingsLabel(labelId)
    return
  }

  const lineId = hitTest.hitTestLineAtCm(cm)
  if (modes.annotationEditEnabled.value && lineId && allowHit('annotation') && ctrlHeld()) {
    actions.toggleSettingsLine(lineId)
    return
  }

  // 23–28 — ruimte, dakvlak en muur. `wallWins` keert 24–27 om t.o.v. 28.
  const dakRidgeId = onDak ? hitTest.hitTestWallAtCm(cm) : null
  const surfaceId = dakRidgeId ? null : hitTest.hitTestSurfaceAtCm(cm)
  const dakOverlay = onDak ? pickDakPlanOverlayHit({ ridgeId: dakRidgeId, surfaceId }) : null
  const nameHit =
    modes.areaSurfaceEditEnabled.value && allowHit('area') && modes.labelsVisible.value
      ? hitTest.hitTestAreaNameAtCm(cm)
      : null
  const selectedName =
    nameHit &&
    ((nameHit.kind === 'area' && nameHit.id === selection.settingsAreaId.value) ||
      (nameHit.kind === 'surface' && nameHit.id === selection.settingsSurfaceId.value))
  if (selectedName && nameHit) {
    actions.beginAreaLabelDrag(nameHit.kind, nameHit.id, event)
    return
  }
  const areaId = hitTest.hitTestAreaAtCm(cm)
  const pickAreaId = nameHit?.kind === 'area' ? nameHit.id : areaId
  const pickSurfaceId = nameHit?.kind === 'surface' ? nameHit.id : surfaceId
  const wallUnder = dakRidgeId ?? hitTest.hitTestWallAtCm(cm)
  const wallWins = wallPreemptsAreaHit(wallUnder, nameHit != null)

  if (!wallWins && modes.areaSurfaceEditEnabled.value && surfaceId && allowHit('area')) {
    const ctrl = ctrlHeld()
    if (dakOverlay?.kind === 'surface') {
      actions.selectRoofSurface?.(surfaceId, ctrl)
      return
    }
    if (ctrl) {
      actions.toggleSettingsSurface(surfaceId)
      return
    }
  }

  if (
    !wallWins &&
    modes.areaSurfaceEditEnabled.value &&
    pickAreaId &&
    allowHit('area') &&
    ctrlHeld()
  ) {
    actions.toggleSettingsArea(pickAreaId)
    return
  }

  if (
    !wallWins &&
    modes.areaSurfaceEditEnabled.value &&
    allowHit('area') &&
    (pickAreaId || pickSurfaceId)
  ) {
    if (pickSurfaceId && dakOverlay?.kind !== 'surface') {
      actions.toggleSettingsSurface(pickSurfaceId)
    } else if (pickAreaId) {
      actions.selectSettingsArea(pickAreaId)
    }
    if (nameHit) actions.startAreaLabelDragPending(nameHit.kind, nameHit.id, event)
    return
  }

  // Lege klik in ruimte/dakvlak: deselecteren, niet de muur stelen.
  if (!wallWins && (surfaceId || areaId)) {
    actions.clearSelection()
    selection.hoveredOpeningId.value = null
    return
  }

  const wallId = wallUnder
  if (wallId && onDak && !view.isRidgeWallId(wallId)) {
    actions.clearSelection()
    selection.hoveredOpeningId.value = null
    return
  }
  if (!wallId) {
    actions.clearSelection()
    selection.hoveredOpeningId.value = null
    return
  }

  if (!dakRidgeId && !allowHit('wall')) return

  if (ctrlHeld()) {
    actions.toggleSettingsWall(wallId, cm)
    return
  }

  actions.clearOpeningSelectionState()
  selection.settingsItemId.value = null
  selection.moveItemId.value = null
  actions.cancelItemDragPending()
  const wasMoveTarget = selection.moveWallId.value === wallId
  actions.selectWall(wallId, cm)
  const wallIntent = relocateIntent()
  if (wallIntent === 'precise') {
    selection.settingsFacadeGroupId.value = null
    selection.settingsJunctionId.value = null
    actions.onWallMoveClick(wallId, event)
    return
  }
  if (wallIntent === 'select') return
  if (wasMoveTarget || modes.moveMod.value) {
    actions.beginWallDrag(wallId, event)
    return
  }
  actions.startMoveDragPending(wallId, event)
}
