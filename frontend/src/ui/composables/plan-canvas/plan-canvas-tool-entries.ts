import type { ComputedRef, Ref } from 'vue'
import type { Point2D } from '@/core/plan/types'
import type { HitTestApi } from './plan-canvas-hit-test-api'
import type { PlanCanvasSelectionRefs } from './plan-canvas-selection-types'
import { isSettingsMod } from '@/ui/composables/canvas-kernel/plan-canvas-mods'
import type { PlanToolEntry } from './plan-canvas-tool-registry'

/**
 * De tool-lijst zelf: welke tool wanneer actief is en wat een klik dan doet.
 *
 * Staat los van `usePlanCanvasInteraction` zodat de karakteriseringstests de
 * **echte** takken uitvoeren (deur plaatsen vereist een muur-hit, plaatsen wist
 * de tool, surface-edit mag doorvallen) in plaats van een kopie in het harnas.
 * De deps zijn de composables zelf, alleen versmald met `Pick`-achtige vormen —
 * geen adapterlaag, geen omgedoopte methodes.
 */

type Vlag = Ref<boolean> | ComputedRef<boolean>

export interface PlanToolEntryDeps {
  selection: PlanCanvasSelectionRefs
  hitTest: Pick<HitTestApi, 'hitTestWallAtCm'>
  modes: {
    inspectMode: Vlag
    drawWallMode: Vlag
    measureMode: Vlag
    nulpuntMode: Vlag
    underlayMoveMode: Vlag
    drawRoomMode: Vlag
    drawSurfaceMode: Vlag
    drawLabelMode: Vlag
    drawLineMode: Vlag
    addDoorMode: Vlag
    addWindowMode: Vlag
    addFixtureMode: Vlag
    areaSurfaceEditEnabled: Vlag
    settingsMod: Vlag
  }
  /** Slicer-edit vangt de klik zelf; de meet-tool mag dan niet starten. */
  isSlicerEditing: () => boolean
  inspect: {
    applyInspectPick: (cm: Point2D) => void
    updateInspectHover: (event: MouseEvent) => void
  }
  drawWall: {
    onDrawWallClick: (event: MouseEvent) => void
    updateDrawWallHover: (event: MouseEvent) => void
    clearDrawWallHover: () => void
  }
  measure: {
    beginMeasure: (event: MouseEvent) => void
    updateMeasureHover: (event: MouseEvent) => void
    clearMeasureHover: () => void
  }
  nulpunt: {
    beginNulpuntDrag: (event: MouseEvent) => boolean
    isDragging: () => boolean
  }
  underlayMove: {
    beginUnderlayMoveDrag: (event: MouseEvent) => boolean
    isDragging: () => boolean
  }
  drawRoom: {
    onDrawRoomClick: (event: MouseEvent) => void
    updateDrawRoomHover: (event: MouseEvent) => void
    clearDrawRoomHover: () => void
  }
  drawSurface: {
    onDrawSurfaceClick: (event: MouseEvent) => void
    onDrawSurfaceDblClick: (event: MouseEvent) => void
    updateDrawSurfaceHover: (event: MouseEvent) => void
    clearDrawSurfaceHover: () => void
  }
  drawLabel: { onDrawLabelClick: (event: MouseEvent) => void }
  drawLine: {
    onDrawLineClick: (event: MouseEvent) => void
    updateDrawLineHover: (event: MouseEvent) => void
    clearDrawLineHover: () => void
  }
  /** Expliciete naam: `surfaceEdit.onPointerDown` zegt buiten die module te weinig. */
  surfaceEdit: { onSurfaceEditPointerDown: (event: MouseEvent) => boolean }
  addOpening: {
    placeDoor: (wallId: string, cm: Point2D) => string | null
    placeWindow: (wallId: string, cm: Point2D) => string | null
  }
  addFixture: {
    placeFixture: (cm: Point2D, opts?: { snapDisabled?: boolean }) => string | null
  }
}

/**
 * De volgorde ís de prioriteit; één-op-één overgenomen uit de oude reeks
 * `if (mode.value)`-takken in de pointer. Verschuif hier niets zonder
 * `plan-canvas-pointer-cascade.spec.ts` erbij.
 */
export function createPlanToolEntries(deps: PlanToolEntryDeps): PlanToolEntry[] {
  const { selection, hitTest, modes } = deps
  const crosshair = () => 'crosshair'

  return [
    {
      id: 'inspect',
      active: () => modes.inspectMode.value,
      down: (cm) => {
        deps.inspect.applyInspectPick(cm)
        return true
      },
      hover: (event) => deps.inspect.updateInspectHover(event),
      cursor: () => 'pointer',
    },
    {
      id: 'draw_wall',
      active: () => modes.drawWallMode.value,
      down: (_cm, event) => {
        deps.drawWall.onDrawWallClick(event)
        return true
      },
      hover: (event) => deps.drawWall.updateDrawWallHover(event),
      clearHover: () => deps.drawWall.clearDrawWallHover(),
      cursor: crosshair,
    },
    {
      id: 'measure',
      active: () => modes.measureMode.value,
      down: (_cm, event) => {
        if (!deps.isSlicerEditing()) deps.measure.beginMeasure(event)
        return true
      },
      hover: (event) => {
        if (deps.isSlicerEditing()) {
          deps.measure.clearMeasureHover()
          return
        }
        deps.measure.updateMeasureHover(event)
      },
      clearHover: () => deps.measure.clearMeasureHover(),
      cursor: crosshair,
    },
    {
      id: 'nulpunt',
      active: () => modes.nulpuntMode.value,
      down: (_cm, event) => {
        deps.nulpunt.beginNulpuntDrag(event)
        return true
      },
      cursor: () => (deps.nulpunt.isDragging() ? 'grabbing' : 'grab'),
    },
    {
      id: 'underlay_move',
      active: () => modes.underlayMoveMode.value,
      down: (_cm, event) => {
        deps.underlayMove.beginUnderlayMoveDrag(event)
        return true
      },
      cursor: () => (deps.underlayMove.isDragging() ? 'grabbing' : 'grab'),
    },
    {
      id: 'draw_room',
      active: () => modes.drawRoomMode.value,
      down: (_cm, event) => {
        deps.drawRoom.onDrawRoomClick(event)
        return true
      },
      hover: (event) => deps.drawRoom.updateDrawRoomHover(event),
      clearHover: () => deps.drawRoom.clearDrawRoomHover(),
      cursor: crosshair,
    },
    {
      id: 'draw_surface',
      active: () => modes.drawSurfaceMode.value,
      down: (_cm, event) => {
        deps.drawSurface.onDrawSurfaceClick(event)
        return true
      },
      hover: (event) => deps.drawSurface.updateDrawSurfaceHover(event),
      clearHover: () => deps.drawSurface.clearDrawSurfaceHover(),
      dblClick: (event) => deps.drawSurface.onDrawSurfaceDblClick(event),
      cursor: crosshair,
    },
    {
      id: 'draw_label',
      active: () => modes.drawLabelMode.value,
      down: (_cm, event) => {
        deps.drawLabel.onDrawLabelClick(event)
        return true
      },
      cursor: crosshair,
    },
    {
      id: 'draw_line',
      active: () => modes.drawLineMode.value,
      down: (_cm, event) => {
        deps.drawLine.onDrawLineClick(event)
        return true
      },
      hover: (event) => deps.drawLine.updateDrawLineHover(event),
      clearHover: () => deps.drawLine.clearDrawLineHover(),
      cursor: crosshair,
    },
    {
      // Geen tool maar een edit-sessie: de enige die mag doorvallen naar de cascade.
      id: 'surface_edit',
      active: () =>
        selection.surfaceEditId.value != null && modes.areaSurfaceEditEnabled.value === true,
      down: (_cm, event) => deps.surfaceEdit.onSurfaceEditPointerDown(event),
    },
    {
      id: 'add_opening',
      active: () => modes.addDoorMode.value || modes.addWindowMode.value,
      down: (cm) => {
        const wallId = hitTest.hitTestWallAtCm(cm)
        // Naast een muur klikken plaatst niets, maar valt ook niet door naar
        // de cascade: anders selecteer je iets terwijl je wilde plaatsen.
        if (!wallId) return true
        const openingId = modes.addDoorMode.value
          ? deps.addOpening.placeDoor(wallId, cm)
          : deps.addOpening.placeWindow(wallId, cm)
        if (openingId) selection.activePlanTool.value = null
        return true
      },
      cursor: crosshair,
    },
    {
      // Bewust géén eigen cursor: plaatsen laat de standaardcursor staan.
      id: 'add_fixture',
      active: () => modes.addFixtureMode.value,
      down: (cm, event) => {
        const guid = deps.addFixture.placeFixture(cm, {
          snapDisabled: isSettingsMod(event, modes.settingsMod.value),
        })
        if (guid) {
          selection.settingsItemId.value = guid
          selection.moveItemId.value = null
          selection.activePlanTool.value = null
        }
        return true
      },
    },
  ]
}
