import { computed, ref, watch } from 'vue'
import type { FloorPlan } from '@/core/plan/types'
import {
  DEFAULT_DOOR_HEIGHT_CM,
  DEFAULT_WINDOW_HEIGHT_CM,
  DEFAULT_WINDOW_SILL_Z_CM,
} from '@/core/plan/extraction-to-plan-types'
import {
  hitElevationBand,
  hitElevationJunction,
  hitElevationOpeningTarget,
  hitElevationRoofPlane,
  hitElevationRoofVertex,
  hitElevationSkylight,
  hitElevationWall,
} from '@/core/plan/elevation-hit'
import type { ElevationSnapGuide } from '@/core/plan/elevation-opening-edit'
import {
  resolveDoorAddPreset,
  resolveWindowAddPreset,
  type DoorAddSubtype,
  type WindowAddSubtype,
} from '@/core/plan/opening-add-presets'
import { applyLengthTypeKey } from '@/ui/composables/canvas-kernel/plan-canvas-draw-measure'
import { isTypingFieldTarget } from '@/ui/composables/canvas-kernel/plan-canvas-draft-commit'
import { hasToolbeltHotkey } from '@/ui/composables/canvas/useToolbeltHotkey'
import { elevationOpeningRestLineId } from './elevation-precise-move'
import { PLAN_HANDLE_HIT_PX } from '@/ui/composables/canvas-kernel/plan-canvas-vertex-hit'
import type { ElevTool } from './elevation-tool'
import type { ElevationInteractionDeps } from './elevation-interaction-types'
import { useElevationDrawTools } from './useElevationDrawTools'
import { useElevationSelectEdit } from './useElevationSelectEdit'
import { useElevationPrecise } from './useElevationPrecise'

export type { ElevTool } from './elevation-tool'
export type {
  ElevSettings,
  ElevationInteractionProps,
  ElevationInteractionDeps,
} from './elevation-interaction-types'

export function useElevationInteraction(deps: ElevationInteractionDeps) {
  const {
    props,
    emit,
    elevation,
    clientToCm,
    pointerCm,
    viewScale,
    contentLayout,
    canvasLocked,
    underlayMoveMode,
    useTouchNav,
    floorBovenlichtDefaults,
    sessionUndo,
  } = deps

  const activeTool = ref<ElevTool>('select')
  const addDoorSubtype = ref<DoorAddSubtype>('standard')
  const addDoorWidthCm = ref(resolveDoorAddPreset('standard').defaultWidthCm)
  const addDoorHeightCm = ref(DEFAULT_DOOR_HEIGHT_CM)
  const addDoorSillZCm = ref(0)
  const addWindowSubtype = ref<WindowAddSubtype>('single')
  const addWindowWidthCm = ref(resolveWindowAddPreset('single').defaultWidthCm)
  const addWindowSillZCm = ref(DEFAULT_WINDOW_SILL_Z_CM)
  const addWindowHeightCm = ref(DEFAULT_WINDOW_HEIGHT_CM)
  const pendingPlaceFrame = ref<import('@/core/plan/opening-display-geom').OpeningFrameCm | null>(
    null,
  )

  watch(addDoorSubtype, (subtype) => {
    addDoorWidthCm.value = resolveDoorAddPreset(subtype).defaultWidthCm
  })
  watch(addWindowSubtype, (subtype) => {
    addWindowWidthCm.value = resolveWindowAddPreset(subtype).defaultWidthCm
  })

  const snapGuide = ref<ElevationSnapGuide | null>(null)
  const elevMoveMod = ref(false)
  const elevSettingsMod = ref(false)
  const elevAxisLockMod = ref(false)

  function pushUndo(): void {
    sessionUndo.pushUndo()
  }

  function commitPlan(next: FloorPlan): void {
    emit.planUpdate(next)
  }

  function undoEdit(): void {
    sessionUndo.undo()
  }

  function redoEdit(): void {
    sessionUndo.redo()
  }

  const preciseBox: {
    current: ReturnType<typeof useElevationPrecise> | null
  } = { current: null }

  const select = useElevationSelectEdit({
    props,
    elevation,
    clientToCm,
    pointerCm,
    canvasLocked,
    activeTool,
    elevSettingsMod,
    snapGuide,
    floorBovenlichtDefaults,
    pushUndo,
    commitPlan,
    addDoorSubtype,
    addDoorWidthCm,
    addDoorHeightCm,
    addDoorSillZCm,
    addWindowSubtype,
    addWindowWidthCm,
    addWindowSillZCm,
    addWindowHeightCm,
    pendingPlaceFrame,
    preciseIntent: (event) => preciseBox.current!.preciseIntent(event),
    beginPreciseOpening: (...args) => preciseBox.current!.beginPreciseOpening(...args),
    beginPreciseRidge: (...args) => preciseBox.current!.beginPreciseRidge(...args),
    beginPreciseJunction: (...args) => preciseBox.current!.beginPreciseJunction(...args),
    hasPreciseDraft: () => preciseBox.current?.hasPreciseDraft() ?? false,
    commitPreciseDraft: () => preciseBox.current?.commitPreciseDraft() ?? false,
  })

  const precise = useElevationPrecise({
    props,
    elevation,
    clientToCm,
    useTouchNav,
    elevMoveMod,
    elevAxisLockMod,
    snapGuide,
    pushUndo,
    undoEdit,
    commitPlan,
    applyOpeningRect: select.applyOpeningRect,
    cancelOpeningMovePending: select.cancelOpeningMovePending,
    selectRidge: select.selectRidge,
    selectJunction: select.selectJunction,
  })
  preciseBox.current = precise

  const draw = useElevationDrawTools({
    props,
    elevation,
    clientToCm,
    activeTool,
    snapGuide,
    floorBovenlichtDefaults,
    pushUndo,
    commitPlan,
    selectOpening: select.selectOpening,
    selectRidge: select.selectRidge,
    selectRoof: select.selectRoof,
    selectJunction: select.selectJunction,
    addDoorSubtype,
    addDoorWidthCm,
    addDoorHeightCm,
    addDoorSillZCm,
    addWindowSubtype,
    addWindowWidthCm,
    addWindowSillZCm,
    addWindowHeightCm,
    pendingPlaceFrame,
  })

  function toggleOpeningTool(
    tool: 'add_door' | 'add_window' | 'add_ridge' | 'add_roof' | 'split',
  ): void {
    if (precise.hasPreciseDraft()) precise.cancelPreciseDraft()
    draw.clearDrawPreviews()
    if (activeTool.value === tool) {
      activeTool.value = 'select'
      return
    }
    select.selectOpening(null)
    activeTool.value = tool
  }

  function onElevToolChange(id: string | null): void {
    if (
      id === 'add_door' ||
      id === 'add_window' ||
      id === 'add_ridge' ||
      id === 'add_roof' ||
      id === 'split'
    ) {
      toggleOpeningTool(id)
      return
    }
    draw.clearDrawPreviews()
    activeTool.value = 'select'
  }

  function closeElevToolbelt(): void {
    if (precise.hasPreciseDraft()) precise.cancelPreciseDraft()
    activeTool.value = 'select'
    draw.clearDrawPreviews()
    select.selectOpening(null)
    select.clearSettings()
  }

  function onContentClick(event: {
    evt: MouseEvent
    target?: {
      getStage?: () => { getPointerPosition?: () => { x: number; y: number } | null } | null
    }
  }): void {
    if (select.isContentClickIgnored()) return
    if (canvasLocked.value) return
    if (precise.hasPreciseDraft()) {
      if (!precise.isPreciseIgnoreClick()) precise.commitPreciseDraft()
      return
    }
    const elev = elevation.value
    if (!elev) return
    const cm =
      pointerCm(event) ?? (event.evt ? clientToCm(event.evt.clientX, event.evt.clientY) : null)
    if (!cm) return
    if (activeTool.value === 'add_door') {
      draw.placeOpening(elev, cm, 'door')
      return
    }
    if (activeTool.value === 'add_window') {
      draw.placeOpening(elev, cm, 'window')
      return
    }
    if (activeTool.value === 'add_ridge') {
      draw.placeRidge(elev, cm, event.evt.ctrlKey || event.evt.metaKey)
      return
    }
    if (activeTool.value === 'add_roof') {
      draw.onRoofPlaceClick(
        elev,
        cm,
        event.evt.ctrlKey || event.evt.metaKey,
        event.evt.ctrlKey || event.evt.metaKey,
      )
      return
    }
    if (activeTool.value === 'split') {
      draw.onSplitClick(elev, cm)
      return
    }
    const selectedRoof =
      select.settingsTarget.value?.kind === 'roof' ? select.selectedRoofPlane.value : null
    if (selectedRoof) {
      const roofVHitTol =
        PLAN_HANDLE_HIT_PX /
        Math.max(1e-6, (contentLayout.value?.scale ?? 1) * Math.max(0.01, viewScale.value))
      const vertexIndex = hitElevationRoofVertex(
        selectedRoof,
        cm,
        roofVHitTol,
        select.settingsTarget.value?.kind === 'roof'
          ? select.settingsTarget.value.vertexIndex
          : null,
      )
      if (vertexIndex != null) {
        select.selectRoof(selectedRoof.id, vertexIndex)
        return
      }
      if (hitElevationRoofPlane(elev, cm)?.id === selectedRoof.id) return
    }
    const hit = hitElevationOpeningTarget(elev, cm, select.selectedOpeningId.value)
    if (hit) {
      const wantEdit = event.evt.ctrlKey || event.evt.metaKey
      const samePart =
        select.selectedOpeningId.value === hit.openingId &&
        select.settingsTarget.value?.kind === 'opening' &&
        select.settingsTarget.value.mode === 'edit' &&
        (select.settingsTarget.value.part === 'transom') === hit.transom
      if (!wantEdit && samePart) {
        return
      }
      select.selectOpening(hit.openingId, 'edit', hit.transom ? 'transom' : undefined)
      return
    }
    const skylight = hitElevationSkylight(elev, cm, select.selectedSkylightId.value)
    if (skylight) {
      select.selectSkylight(skylight.itemId)
      return
    }
    const junction = hitElevationJunction(elev, cm)
    if (junction) {
      select.selectJunction(junction.id)
      return
    }
    const ridgeWall = hitElevationWall(elev, cm)
    if (ridgeWall?.ridge) {
      select.selectRidge(ridgeWall.wallId, ridgeWall.floorIndex)
      return
    }
    const roof = hitElevationRoofPlane(elev, cm)
    if (roof?.dormer) {
      select.selectRoof(roof.id, null)
      return
    }
    if (ridgeWall?.axisEdit) {
      select.selectWallSettings(ridgeWall.wallId, ridgeWall.floorIndex)
      return
    }
    if (roof) {
      select.selectRoof(roof.id, null)
      return
    }
    const placeholder = hitElevationBand(elev, cm, 'nok')
    if (placeholder && placeholder.floorIndex != null) {
      select.selectPlaceholderRoof(placeholder.floorIndex)
      return
    }
    if (event.evt.ctrlKey || event.evt.metaKey) {
      const wall = hitElevationWall(elev, cm)
      if (wall) {
        select.selectWallSettings(wall.wallId, wall.floorIndex)
        return
      }
      const slab = hitElevationBand(elev, cm, 'slab')
      if (slab && slab.floorIndex != null) {
        select.selectSlabSettings(slab.floorIndex)
        return
      }
    }
    select.selectOpening(null)
    select.clearSettings()
  }

  function onContentMove(event: { evt: MouseEvent }): void {
    if (canvasLocked.value) {
      if (draw.ridgePlacePreview.value) {
        draw.ridgePlacePreview.value = null
        snapGuide.value = null
      }
      if (draw.roofPlaceDraft.value || draw.roofPlacePreview.value) draw.clearRoofPlaceDraft()
      return
    }
    const elev = elevation.value
    if (!elev) return
    const cm = clientToCm(event.evt.clientX, event.evt.clientY)
    if (!cm) {
      if (activeTool.value === 'add_ridge') {
        draw.ridgePlacePreview.value = null
        snapGuide.value = null
      }
      return
    }
    const snapOff = event.evt.ctrlKey || event.evt.metaKey
    if (activeTool.value === 'add_ridge') {
      draw.updateRidgePlacePreview(elev, cm, snapOff)
      return
    }
    if (activeTool.value === 'add_roof') {
      draw.updateRoofPlacePreview(elev, cm, snapOff, snapOff)
      return
    }
    if (draw.ridgePlacePreview.value) {
      draw.ridgePlacePreview.value = null
      snapGuide.value = null
    }
    if (draw.roofPlaceHover.value || draw.roofPlacePreview.value) {
      draw.roofPlaceHover.value = null
      draw.roofPlacePreview.value = null
    }
  }

  function onKeydown(event: KeyboardEvent): void {
    if (isTypingFieldTarget(event.target)) return
    if (precise.hasPreciseDraft()) {
      if (event.key === 'Escape') {
        event.preventDefault()
        precise.cancelPreciseDraft()
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        precise.commitPreciseDraft()
        return
      }
      const applied = applyLengthTypeKey(
        event,
        precise.preciseTypeText.value,
        props.unit ?? 'm',
      )
      if (applied) {
        event.preventDefault()
        precise.preciseTypeText.value = applied.text
        precise.setPreciseOverrideCm(applied.cm)
        precise.applyPreciseDraft()
        return
      }
    }
    if (event.key === 'Escape') {
      if (props.rescaleMode) {
        event.preventDefault()
        emit.cancelRescale()
        return
      }
      if (underlayMoveMode.value) {
        event.preventDefault()
        underlayMoveMode.value = false
        return
      }
      if (draw.splitDraft.value) {
        event.preventDefault()
        draw.clearSplitDraft()
        return
      }
      if (draw.ridgePlacePreview.value) {
        event.preventDefault()
        draw.ridgePlacePreview.value = null
        snapGuide.value = null
        return
      }
      if (draw.roofPlaceDraft.value) {
        event.preventDefault()
        draw.clearRoofPlaceDraft()
        return
      }
      if (hasToolbeltHotkey('Escape')) return
      event.preventDefault()
      closeElevToolbelt()
      return
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (hasToolbeltHotkey('Delete')) return
      if (select.selectedOpeningId.value) {
        event.preventDefault()
        select.deleteSelectedOpening()
        return
      }
      if (select.settingsTarget.value?.kind === 'skylight') {
        event.preventDefault()
        select.deleteSelectedSkylight()
        return
      }
      if (select.settingsTarget.value?.kind === 'roof') {
        event.preventDefault()
        select.deleteSelectedRoof()
        return
      }
      if (select.settingsTarget.value?.kind === 'ridge' || select.settingsJunction.value?.ridge) {
        event.preventDefault()
        select.deleteSelectedRidge()
      }
      return
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      if (event.shiftKey) redoEdit()
      else undoEdit()
    }
  }

  function cleanupListeners(): void {
    select.cleanupSelectListeners()
    precise.clearPreciseDraftUi()
    draw.clearSplitDraft()
  }

  function onGroupChange(): void {
    if (precise.hasPreciseDraft()) precise.clearPreciseDraftUi()
    select.clearSelectionOnGroupChange()
    draw.clearSplitDraft()
  }

  function onTouchEditPointerDown(event: MouseEvent): void {
    onContentClick({ evt: event, target: {} })
  }

  function onTouchEditPointerMove(event: MouseEvent): void {
    if (activeTool.value === 'add_ridge') {
      const elev = elevation.value
      const cm = clientToCm(event.clientX, event.clientY)
      if (elev && cm) draw.updateRidgePlacePreview(elev, cm, event.ctrlKey || event.metaKey)
      return
    }
    if (activeTool.value === 'add_roof') {
      const elev = elevation.value
      const cm = clientToCm(event.clientX, event.clientY)
      const snapOff = event.ctrlKey || event.metaKey
      if (elev && cm) draw.updateRoofPlacePreview(elev, cm, snapOff, snapOff)
      return
    }
    if (activeTool.value !== 'split') return
    const elev = elevation.value
    const cm = clientToCm(event.clientX, event.clientY)
    if (elev && cm) draw.updateSplitDraft(elev, cm.x)
  }

  return {
    activeTool,
    addDoorSubtype,
    addDoorWidthCm,
    addDoorHeightCm,
    addDoorSillZCm,
    addWindowSubtype,
    addWindowWidthCm,
    addWindowSillZCm,
    addWindowHeightCm,
    selectedOpeningId: select.selectedOpeningId,
    selectedSkylightId: select.selectedSkylightId,
    settingsTarget: select.settingsTarget,
    elevSettingsOpen: select.elevSettingsOpen,
    selectedOpening: select.selectedOpening,
    selectedOpeningRect: select.selectedOpeningRect,
    selectedSkylight: select.selectedSkylight,
    selectedSkylightElev: select.selectedSkylightElev,
    skylightHandles: select.skylightHandles,
    skylightMoveHandle: select.skylightMoveHandle,
    openingHandles: select.openingHandles,
    openingMoveHandle: select.openingMoveHandle,
    selectedRidgeWall: select.selectedRidgeWall,
    settingsRidge: select.settingsRidge,
    ridgeHandles: select.ridgeHandles,
    ridgeCenter: select.ridgeCenter,
    ridgeEndHandles: select.ridgeEndHandles,
    wallAxisEndHandles: select.wallAxisEndHandles,
    openingSubtype: select.openingSubtype,
    selectedOpeningBovenlicht: select.selectedOpeningBovenlicht,
    selectedOpeningBovenlichtHeightCm: select.selectedOpeningBovenlichtHeightCm,
    selectedOpeningBovenlichtGapCm: select.selectedOpeningBovenlichtGapCm,
    selectedOpeningHingeAtStart: select.selectedOpeningHingeAtStart,
    selectedOpeningSwingRight: select.selectedOpeningSwingRight,
    settingsWall: select.settingsWall,
    selectedPlanWall: select.selectedPlanWall,
    wallElevationHandles: select.wallElevationHandles,
    junctionElevationHandles: select.junctionElevationHandles,
    settingsSlab: select.settingsSlab,
    settingsJunction: select.settingsJunction,
    selectedRoofPlane: select.selectedRoofPlane,
    settingsRoof: select.settingsRoof,
    settingsPlaceholderRoof: select.settingsPlaceholderRoof,
    snapGuide,
    splitDraft: draw.splitDraft,
    ridgePlacePreview: draw.ridgePlacePreview,
    roofPlaceDraft: draw.roofPlaceDraft,
    roofPlacePreview: draw.roofPlacePreview,
    roofPlaceHover: draw.roofPlaceHover,
    canUndoEdit: sessionUndo.canUndoEdit,
    canRedoEdit: sessionUndo.canRedoEdit,
    undoEdit,
    redoEdit,
    pushUndo,
    elevationMeasureLines: computed(() => {
      const lines = select.elevationMeasureLines.value
      const side = precise.preciseRestSide.value
      if (!precise.hasPreciseDraft() || !side) return lines
      const activeId = elevationOpeningRestLineId(side)
      const typing = precise.preciseTypeText.value.length > 0
      return lines.map((line) =>
        line.id === activeId
          ? {
              ...line,
              emphasis: typing ? ('typing' as const) : ('active' as const),
              suppressLabel: true,
            }
          : line,
      )
    }),
    elevMoveMod,
    elevSettingsMod,
    elevAxisLockMod,
    preciseTypeText: precise.preciseTypeText,
    precisePreview: precise.precisePreview,
    preciseLabelCm: precise.preciseLabelCm,
    preciseMeasureLengthCm: precise.preciseMeasureLengthCm,
    preciseRestSide: precise.preciseRestSide,
    commitPreciseDraft: () => precise.commitPreciseDraft(),
    onContentClick,
    onContentMove,
    onOpeningDown: select.onOpeningDown,
    onSkylightDown: select.onSkylightDown,
    onSkylightMoveHandleDown: select.onSkylightMoveHandleDown,
    onSkylightHandleDown: select.onSkylightHandleDown,
    onMoveHandleDown: select.onMoveHandleDown,
    onHandleDown: select.onHandleDown,
    onJunctionDown: select.onJunctionDown,
    onJunctionElevHandleDown: select.onJunctionElevHandleDown,
    onRidgeWallDown: select.onRidgeWallDown,
    onRoofDown: select.onRoofDown,
    onRidgeMoveHandleDown: select.onRidgeMoveHandleDown,
    onRidgeHandleDown: select.onRidgeHandleDown,
    onRidgeEndHandleDown: select.onRidgeEndHandleDown,
    onWallAxisEndHandleDown: select.onWallAxisEndHandleDown,
    onWallElevHandleDown: select.onWallElevHandleDown,
    onRoofVertexDown: select.onRoofVertexDown,
    onElevToolChange,
    closeElevToolbelt,
    stopKonvaBubble: select.stopKonvaBubble,
    markOpeningPointerHandled: select.markOpeningPointerHandled,
    commitOpeningSubtype: select.commitOpeningSubtype,
    copySelectedOpening: select.copySelectedOpening,
    deleteSelectedOpening: select.deleteSelectedOpening,
    deleteSelectedSkylight: select.deleteSelectedSkylight,
    deleteSelectedRidge: select.deleteSelectedRidge,
    deleteSelectedRoof: select.deleteSelectedRoof,
    commitSelectedField: select.commitSelectedField,
    commitSelectedFrame: select.commitSelectedFrame,
    commitSelectedSkylightFrame: select.commitSelectedSkylightFrame,
    commitSelectedSkylightZ: select.commitSelectedSkylightZ,
    commitSelectedSkylightPitch: select.commitSelectedSkylightPitch,
    commitSelectedBovenlicht: select.commitSelectedBovenlicht,
    commitSelectedBovenlichtHeight: select.commitSelectedBovenlichtHeight,
    commitSelectedBovenlichtGap: select.commitSelectedBovenlichtGap,
    toggleSelectedOpeningHinge: select.toggleSelectedOpeningHinge,
    toggleSelectedOpeningSwing: select.toggleSelectedOpeningSwing,
    commitWallHeight: select.commitWallHeight,
    commitWallBottomZ: select.commitWallBottomZ,
    commitJunctionHeight: select.commitJunctionHeight,
    commitJunctionBottomZ: select.commitJunctionBottomZ,
    commitRidgeHeight: select.commitRidgeHeight,
    commitRoofVertexHeight: select.commitRoofVertexHeight,
    commitSlabHeight: select.commitSlabHeight,
    commitRoofThickness: select.commitRoofThickness,
    cleanupListeners,
    onGroupChange,
    onKeydown,
    onTouchEditPointerDown,
    onTouchEditPointerMove,
    updateRidgePlacePreview: draw.updateRidgePlacePreview,
    updateRoofPlacePreview: draw.updateRoofPlacePreview,
    updateSplitDraft: draw.updateSplitDraft,
  }
}

export type ElevationInteraction = ReturnType<typeof useElevationInteraction>
