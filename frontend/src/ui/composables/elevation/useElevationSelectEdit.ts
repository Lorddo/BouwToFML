import type { ElevationWallRect } from '@/core/plan/facade-elevation'
import { hitElevationOpening } from '@/core/plan/elevation-hit'
import { type ElevResizeSide } from '@/core/plan/elevation-opening-edit'
import { type WallElevationEditMode } from '@/core/plan/wall-endpoint-height'
import { isSettingsMod } from '@/ui/composables/canvas-kernel/plan-canvas-mods'
import type { ElevationSelectEditOptions } from './elevation-interaction-types'
import { createElevationSelectState } from './elevation-select-state'
import { useElevationOpeningDrag } from './useElevationOpeningDrag'
import { useElevationStructureDrag } from './useElevationStructureDrag'
import { useElevationSelectCommits } from './useElevationSelectCommits'

export function useElevationSelectEdit(options: ElevationSelectEditOptions) {
  const {
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
    preciseIntent,
    beginPreciseOpening,
    beginPreciseRidge,
    beginPreciseJunction,
    hasPreciseDraft,
    commitPreciseDraft,
  } = options

  const state = createElevationSelectState({
    props,
    elevation,
    activeTool,
    floorBovenlichtDefaults,
  })
  const {
    selectedOpeningId,
    settingsTarget,
    selectedOpeningRect,
    selectedAxisEditWall,
    selectedRidgeWall,
    selectedRoofPlane,
    settingsJunction,
    selectOpening,
    selectWallSettings,
    selectJunction,
    selectRidge,
    selectRoof,
    retargetOpeningId,
  } = state

  const openingDrag = useElevationOpeningDrag({
    props,
    elevation,
    clientToCm,
    snapGuide,
    pushUndo,
    commitPlan,
    retargetOpeningId,
  })
  const {
    applyOpeningRect,
    cancelOpeningMovePending,
    startOpeningMovePending,
    beginOpeningDrag,
    cleanupOpeningDrag,
  } = openingDrag

  const structureDrag = useElevationStructureDrag({
    props,
    elevation,
    clientToCm,
    snapGuide,
    pushUndo,
    commitPlan,
    selectRidge,
    selectJunction,
  })
  const {
    beginRidgeRectDrag,
    beginRidgeEndDrag,
    ridgeRefsForEnd,
    beginWallAxisEndDrag,
    beginWallElevDrag,
    beginJunctionDrag,
    beginRoofVertexDrag,
    cleanupStructureDrag,
  } = structureDrag

  const commits = useElevationSelectCommits({
    props,
    state,
    pushUndo,
    commitPlan,
    activeTool,
    addDoorSubtype,
    addDoorWidthCm,
    addDoorHeightCm,
    addDoorSillZCm,
    addWindowSubtype,
    addWindowWidthCm,
    addWindowSillZCm,
    addWindowHeightCm,
  })

  function stopKonvaBubble(event: { cancelBubble?: boolean; evt?: Event | null }): void {
    event.cancelBubble = true
    const native = event.evt
    if (native && typeof native.stopPropagation === 'function') native.stopPropagation()
  }

  let ignoreContentClickUntil = 0

  function markOpeningPointerHandled(): void {
    ignoreContentClickUntil = Date.now() + 400
  }

  function isContentClickIgnored(): boolean {
    return Date.now() < ignoreContentClickUntil
  }

  function onWallAxisEndHandleDown(end: 'a' | 'b', event: { evt: MouseEvent }): void {
    event.evt.stopPropagation()
    markOpeningPointerHandled()
    if (activeTool.value !== 'select' || canvasLocked.value) return
    const wall = selectedAxisEditWall.value
    if (!wall) return
    selectWallSettings(wall.wallId, wall.floorIndex)
    beginWallAxisEndDrag(wall.wallId, wall.floorIndex, end)
  }

  function onWallElevHandleDown(mode: WallElevationEditMode, event: { evt: MouseEvent }): void {
    event.evt.stopPropagation()
    if (activeTool.value !== 'select' || canvasLocked.value) return
    const target = settingsTarget.value
    if (target?.kind !== 'wall') return
    beginWallElevDrag(target.wallId, target.floorIndex, mode)
  }

  function onRoofVertexDown(vertexIndex: number, event: { evt: MouseEvent }): void {
    stopKonvaBubble(event)
    markOpeningPointerHandled()
    if (activeTool.value !== 'select' || canvasLocked.value) return
    const plane = selectedRoofPlane.value
    const cm = pointerCm(event)
    if (!plane || !cm || !plane.points[vertexIndex]) return
    selectRoof(plane.id, vertexIndex)
    beginRoofVertexDrag(plane.id, vertexIndex, plane.floorIndex)
  }

  function onOpeningDown(openingId: string, event: { evt: MouseEvent }): void {
    stopKonvaBubble(event)
    markOpeningPointerHandled()
    if (activeTool.value !== 'select' || canvasLocked.value) return
    const elev = elevation.value
    const cm = pointerCm(event)
    const wantEdit = isSettingsMod(event.evt, elevSettingsMod.value)
    let id = openingId
    if (elev && cm && selectedOpeningId.value) {
      const preferred = hitElevationOpening(elev, cm, selectedOpeningId.value)
      if (preferred && (wantEdit || preferred.openingId === selectedOpeningId.value)) {
        id = preferred.openingId
      }
    }
    const rect = elev?.openings.find((item) => item.openingId === id)
    if (!elev || !rect || !cm) return
    if (hasPreciseDraft()) {
      commitPreciseDraft()
      return
    }
    if (preciseIntent(event.evt)) {
      selectOpening(id, 'quick')
      beginPreciseOpening(id, cm, rect, rect.wallId, rect.floorIndex)
      return
    }
    const alreadyEdit =
      selectedOpeningId.value === id &&
      settingsTarget.value?.kind === 'opening' &&
      settingsTarget.value.mode === 'edit'
    selectOpening(id, 'edit')
    if (!wantEdit && !alreadyEdit) return
    if (alreadyEdit) {
      beginOpeningDrag(id, 'move', cm, rect, rect.wallId, rect.floorIndex)
      return
    }
    startOpeningMovePending(id, rect, cm, event)
  }

  function onMoveHandleDown(event: { evt: MouseEvent }): void {
    event.evt.stopPropagation()
    if (activeTool.value !== 'select' || canvasLocked.value) return
    const rect = selectedOpeningRect.value
    const cm = pointerCm(event)
    if (!rect || !cm) return
    if (hasPreciseDraft()) {
      commitPreciseDraft()
      return
    }
    if (preciseIntent(event.evt)) {
      beginPreciseOpening(rect.openingId, cm, rect, rect.wallId, rect.floorIndex)
      return
    }
    beginOpeningDrag(rect.openingId, 'move', cm, rect, rect.wallId, rect.floorIndex)
  }

  function onHandleDown(side: ElevResizeSide, event: { evt: MouseEvent }): void {
    event.evt.stopPropagation()
    if (activeTool.value !== 'select' || canvasLocked.value) return
    if (settingsTarget.value?.kind !== 'opening' || settingsTarget.value.mode !== 'edit') return
    const rect = selectedOpeningRect.value
    const cm = pointerCm(event)
    if (!rect || !cm) return
    beginOpeningDrag(rect.openingId, side, cm, rect, rect.wallId, rect.floorIndex)
  }

  function onJunctionDown(junctionId: string, event: { evt: MouseEvent }): void {
    event.evt.stopPropagation()
    if (activeTool.value !== 'select' || canvasLocked.value) return
    const elev = elevation.value
    const junction = elev?.junctions.find((item) => item.id === junctionId)
    const cm = pointerCm(event)
    if (!junction || !cm) return
    if (hasPreciseDraft()) {
      commitPreciseDraft()
      return
    }
    if (preciseIntent(event.evt)) {
      beginPreciseJunction(junction, junction.refs, cm)
      return
    }
    if (junction.ridge) {
      const primary = junction.refs[0]
      if (primary) selectRidge(primary.wallId, junction.floorIndex, primary.end)
      beginRidgeEndDrag(junction.floorIndex, junction.refs)
      return
    }
    beginJunctionDrag(junction, junction.refs, cm.y, 'height')
  }

  function onJunctionElevHandleDown(mode: WallElevationEditMode, event: { evt: MouseEvent }): void {
    event.evt.stopPropagation()
    if (activeTool.value !== 'select' || canvasLocked.value) return
    const junction = settingsJunction.value
    const cm = pointerCm(event)
    if (!junction || junction.ridge || !cm) return
    beginJunctionDrag(junction, junction.refs, cm.y, mode)
  }

  function onRidgeWallDown(wall: ElevationWallRect, event: { evt: MouseEvent }): void {
    if (!wall.ridge || activeTool.value !== 'select' || canvasLocked.value) return
    const elev = elevation.value
    const cm = pointerCm(event)
    if (!elev || !cm) return
    event.evt.stopPropagation()
    if (hasPreciseDraft()) {
      commitPreciseDraft()
      return
    }
    if (!wall.endOn) {
      selectRidge(wall.wallId, wall.floorIndex)
      return
    }
    if (preciseIntent(event.evt)) {
      beginPreciseRidge(wall, cm)
      return
    }
    beginRidgeRectDrag(wall, 'move', cm)
  }

  function onRidgeMoveHandleDown(event: { evt: MouseEvent }): void {
    event.evt.stopPropagation()
    if (activeTool.value !== 'select' || canvasLocked.value) return
    const wall = selectedRidgeWall.value
    const cm = pointerCm(event)
    if (!wall?.endOn || !cm) return
    if (hasPreciseDraft()) {
      commitPreciseDraft()
      return
    }
    if (preciseIntent(event.evt)) {
      beginPreciseRidge(wall, cm)
      return
    }
    beginRidgeRectDrag(wall, 'move', cm)
  }

  function onRidgeHandleDown(side: ElevResizeSide, event: { evt: MouseEvent }): void {
    event.evt.stopPropagation()
    if (activeTool.value !== 'select' || canvasLocked.value) return
    const wall = selectedRidgeWall.value
    const cm = pointerCm(event)
    if (!wall || !cm) return
    beginRidgeRectDrag(wall, side, cm)
  }

  function onRidgeEndHandleDown(end: 'a' | 'b', event: { evt: MouseEvent }): void {
    event.evt.stopPropagation()
    markOpeningPointerHandled()
    if (activeTool.value !== 'select' || canvasLocked.value) return
    const wall = selectedRidgeWall.value
    if (!wall || wall.endOn) return
    selectRidge(wall.wallId, wall.floorIndex, end)
    beginRidgeEndDrag(wall.floorIndex, ridgeRefsForEnd(wall, end))
  }

  function cleanupSelectListeners(): void {
    cleanupOpeningDrag()
    cleanupStructureDrag()
  }

  return {
    ...state,
    applyOpeningRect,
    cancelOpeningMovePending,
    stopKonvaBubble,
    markOpeningPointerHandled,
    isContentClickIgnored,
    ...commits,
    onOpeningDown,
    onMoveHandleDown,
    onHandleDown,
    onJunctionDown,
    onJunctionElevHandleDown,
    onRidgeWallDown,
    onRidgeMoveHandleDown,
    onRidgeHandleDown,
    onRidgeEndHandleDown,
    onWallAxisEndHandleDown,
    onWallElevHandleDown,
    onRoofVertexDown,
    cleanupSelectListeners,
  }
}

export type ElevationSelectEdit = ReturnType<typeof useElevationSelectEdit>
