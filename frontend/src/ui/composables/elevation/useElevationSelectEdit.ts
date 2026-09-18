import type { ElevationWallRect } from '@/core/plan/facade-elevation'
import {
  hitElevationOpeningTarget,
  hitElevationRoofPlane,
  hitElevationSkylight,
} from '@/core/plan/elevation-hit'
import { type ElevResizeSide } from '@/core/plan/elevation-opening-edit'
import { type WallElevationEditMode } from '@/core/plan/wall-endpoint-height'
import { isSettingsMod } from '@/ui/composables/canvas-kernel/plan-canvas-mods'
import type { ElevationSelectEditOptions } from './elevation-interaction-types'
import { createElevationSelectState } from './elevation-select-state'
import { useElevationOpeningDrag } from './useElevationOpeningDrag'
import { useElevationSkylightDrag } from './useElevationSkylightDrag'
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
    pendingPlaceFrame,
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
    selectedSkylightId,
    settingsTarget,
    selectedOpeningRect,
    selectedTransomRect,
    selectedSkylightElev,
    selectedAxisEditWall,
    selectedRidgeWall,
    selectedRoofPlane,
    settingsJunction,
    selectOpening,
    selectSkylight,
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

  const skylightDrag = useElevationSkylightDrag({
    props,
    elevation,
    clientToCm,
    snapGuide,
    pushUndo,
    commitPlan,
  })
  const { beginSkylightDrag, cleanup: cleanupSkylightDrag } = skylightDrag

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
    pendingPlaceFrame,
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

  function onRoofDown(roofId: string, event: { evt: MouseEvent }): void {
    stopKonvaBubble(event)
    markOpeningPointerHandled()
    if (activeTool.value !== 'select' || canvasLocked.value) return
    const cm = pointerCm(event)
    const elev = elevation.value
    const hit = cm && elev ? hitElevationRoofPlane(elev, cm) : null
    selectRoof(hit?.id ?? roofId, null)
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

  function onOpeningDown(
    openingId: string,
    event: { evt: MouseEvent },
    source?: 'transom',
  ): void {
    stopKonvaBubble(event)
    markOpeningPointerHandled()
    if (activeTool.value !== 'select' || canvasLocked.value) return
    const elev = elevation.value
    const cm = pointerCm(event)
    const wantEdit = isSettingsMod(event.evt, elevSettingsMod.value)
    let id = openingId
    let transom = source === 'transom'
    if (elev && cm) {
      const hit = hitElevationOpeningTarget(elev, cm, selectedOpeningId.value)
      if (hit) {
        if (!selectedOpeningId.value || wantEdit || hit.openingId === selectedOpeningId.value) {
          id = hit.openingId
          transom = hit.transom
        } else if (hit.openingId === openingId) {
          transom = hit.transom
        }
      } else if (source === 'transom') {
        transom = true
      }
    }
    const parentRect = elev?.openings.find((item) => item.openingId === id)
    const transomRect = elev?.transoms.find((item) => item.openingId === id)
    const rect = transom ? transomRect : parentRect
    if (!elev || !rect || !cm || !parentRect) return
    if (hasPreciseDraft()) {
      commitPreciseDraft()
      return
    }
    if (preciseIntent(event.evt)) {
      if (transom) {
        selectOpening(id, 'edit', 'transom')
        return
      }
      selectOpening(id, 'quick')
      beginPreciseOpening(id, cm, parentRect, parentRect.wallId, parentRect.floorIndex)
      return
    }
    const alreadySame =
      selectedOpeningId.value === id &&
      settingsTarget.value?.kind === 'opening' &&
      settingsTarget.value.mode === 'edit' &&
      (settingsTarget.value.part === 'transom') === transom
    selectOpening(id, 'edit', transom ? 'transom' : undefined)
    if (!wantEdit && !alreadySame) return
    const target = transom ? 'transom' : 'opening'
    if (alreadySame) {
      beginOpeningDrag(id, 'move', cm, rect, rect.wallId, rect.floorIndex, target)
      return
    }
    startOpeningMovePending(id, rect, cm, event, target)
  }

  function onSkylightDown(itemId: string, event: { evt: MouseEvent }): void {
    stopKonvaBubble(event)
    markOpeningPointerHandled()
    if (activeTool.value !== 'select' || canvasLocked.value) return
    const elev = elevation.value
    const cm = pointerCm(event)
    if (!elev || !cm) return
    const hit =
      hitElevationSkylight(elev, cm, selectedSkylightId.value) ??
      elev.skylights.find((item) => item.itemId === itemId)
    if (!hit) return
    const already =
      selectedSkylightId.value === hit.itemId && settingsTarget.value?.kind === 'skylight'
    selectSkylight(hit.itemId)
    if (already) {
      beginSkylightDrag(hit, 'move', { clientX: event.evt.clientX, clientY: event.evt.clientY, evt: event.evt })
    }
  }

  function onSkylightMoveHandleDown(event: { evt: MouseEvent }): void {
    event.evt.stopPropagation()
    if (activeTool.value !== 'select' || canvasLocked.value) return
    const skylight = selectedSkylightElev.value
    if (!skylight) return
    beginSkylightDrag(skylight, 'move', {
      clientX: event.evt.clientX,
      clientY: event.evt.clientY,
      evt: event.evt,
    })
  }

  function onSkylightHandleDown(side: ElevResizeSide, event: { evt: MouseEvent }): void {
    event.evt.stopPropagation()
    if (activeTool.value !== 'select' || canvasLocked.value) return
    if (settingsTarget.value?.kind !== 'skylight') return
    const skylight = selectedSkylightElev.value
    if (!skylight) return
    beginSkylightDrag(skylight, side, {
      clientX: event.evt.clientX,
      clientY: event.evt.clientY,
      evt: event.evt,
    })
  }

  function onMoveHandleDown(event: { evt: MouseEvent }): void {
    event.evt.stopPropagation()
    if (activeTool.value !== 'select' || canvasLocked.value) return
    const transom = settingsTarget.value?.kind === 'opening' && settingsTarget.value.part === 'transom'
    const rect = transom ? selectedTransomRect.value : selectedOpeningRect.value
    const cm = pointerCm(event)
    if (!rect || !cm) return
    if (hasPreciseDraft()) {
      commitPreciseDraft()
      return
    }
    if (preciseIntent(event.evt) && !transom) {
      beginPreciseOpening(rect.openingId, cm, rect, rect.wallId, rect.floorIndex)
      return
    }
    beginOpeningDrag(
      rect.openingId,
      'move',
      cm,
      rect,
      rect.wallId,
      rect.floorIndex,
      transom ? 'transom' : 'opening',
    )
  }

  function onHandleDown(side: ElevResizeSide, event: { evt: MouseEvent }): void {
    event.evt.stopPropagation()
    if (activeTool.value !== 'select' || canvasLocked.value) return
    if (settingsTarget.value?.kind !== 'opening' || settingsTarget.value.mode !== 'edit') return
    const transom = settingsTarget.value.part === 'transom'
    if (transom && side !== 'n' && side !== 's') return
    const rect = transom ? selectedTransomRect.value : selectedOpeningRect.value
    const cm = pointerCm(event)
    if (!rect || !cm) return
    beginOpeningDrag(
      rect.openingId,
      side,
      cm,
      rect,
      rect.wallId,
      rect.floorIndex,
      transom ? 'transom' : 'opening',
    )
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
    cleanupSkylightDrag()
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
    onSkylightDown,
    onSkylightMoveHandleDown,
    onSkylightHandleDown,
    onMoveHandleDown,
    onHandleDown,
    onJunctionDown,
    onRoofDown,
    onRoofVertexDown,
    onWallElevHandleDown,
    onJunctionElevHandleDown,
    onRidgeMoveHandleDown,
    onRidgeHandleDown,
    onRidgeEndHandleDown,
    onWallAxisEndHandleDown,
    onRidgeWallDown,
    cleanupSelectListeners,
  }
}

export type ElevationSelectEdit = ReturnType<typeof useElevationSelectEdit>
