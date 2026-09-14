import { computed, type ComputedRef, type Ref } from 'vue'
import type { Point2D, Wall } from '@/core/fml/types'
import type { PlanToolId } from '@/ui/components/canvas/planToolbeltItems'
import { isRidgeWallId } from '@/core/fml/ridge-walls'
import { listDakSnapWalls } from '@/core/fml/ridge-floor'
import { ROOF_TOUCH_SLACK_CM } from '@/core/fml/roof-planes'
import {
  JUNCTION_POINT_SNAP_CM,
  ROOM_DRAW_SNAP_CM,
  snapDrawWallEndpoint,
  snapPointToJunctions,
  snapPointToWallCenters,
  snapRoomDrawEndPoint,
  snapToNearbyEndpointAxes,
  snapToNearbyPointAxes,
  snapToPolygonGeometry,
  closedRingSegments,
  openPolylineSegments,
} from '@/ui/components/plan-canvas-junctions'
import {
  dakRoofRingsFromFloor,
  resolveDakSurfacePoint,
  resolveRidgeDrawPoint,
} from '@/ui/components/plan-canvas-dak-draw-snap'
import { loadUserSettings } from '@/ui/composables/settings/user-settings'
import type { usePlanEditor } from '@/ui/composables/usePlanEditor'
import type { HitTestApi } from './plan-canvas-hit-test-api'
import type { PlanViewContext } from './plan-view-context'

/**
 * Snap-geometrie voor álle teken-tools: muur, nok, ruimte, dakvlak.
 *
 * Kernel, geen plugin. Zonder eigen huis kopieert elke teken-tool dit stuk
 * geometrie; daarom staat deze service in fase 4b **vóór** de tool-registry.
 * De tools krijgen hem geïnjecteerd, ze bouwen hem niet zelf.
 */

type EditorApi = ReturnType<typeof usePlanEditor>

/** Alleen de zes editor-velden die de snap nodig heeft. */
export interface PlanSnapEditor {
  localPlan: EditorApi['localPlan']
  floorIndex: EditorApi['floorIndex']
  walls: EditorApi['walls']
  junctions: EditorApi['junctions']
  surfaces: EditorApi['surfaces']
  areas: EditorApi['areas']
}

export interface PlanSnapResolveDeps {
  editor: PlanSnapEditor
  hitTest: Pick<HitTestApi, 'hitTestJunctionAtCm'>
  view: PlanViewContext
  /** Muur of nok — bepaalt of de nok-snap of de gewone muur-snap geldt. */
  drawWallKind: Ref<'wall' | 'ridge'>
  activePlanTool: Ref<PlanToolId | null>
  axisLocked: ComputedRef<boolean>
  /** false = converter stap 4: geen overlay, dus geen wang-snap. */
  roofOverlayOnPlan?: Ref<boolean>
}

export interface PlanSnapResolve {
  /**
   * Dak-tab óf de `draw_roof`-tool op de plattegrond. Woont hier omdat de
   * dakvlak-snap de enige lezer is die niet aan de tool-modes hangt; de
   * ToolCoordinator leest hem hiervandaan i.p.v. een tweede computed.
   */
  drawingRoof: ComputedRef<boolean>
  resolveDrawPoint: (cm: Point2D, axisAnchor?: Point2D, snapDisabled?: boolean) => Point2D
  resolveRoomStartPoint: (cm: Point2D) => Point2D
  resolveRoomEndPoint: (cm: Point2D, start: Point2D) => Point2D
  resolveSurfacePoint: (
    cm: Point2D,
    snapDisabled: boolean,
    extraAxisPoints?: Point2D[],
    excludeSurfaceId?: string | null,
  ) => Point2D
}

export function createPlanSnapResolve(deps: PlanSnapResolveDeps): PlanSnapResolve {
  const { editor, hitTest, view, drawWallKind, axisLocked } = deps

  const drawingRoof = computed(
    () => view.mode === 'dak' || deps.activePlanTool.value === 'draw_roof',
  )

  function ridgeDrawSnapWalls(): ReadonlyArray<Pick<Wall, 'a' | 'b' | 'thickness' | 'balance'>> {
    const plan = editor.localPlan.value
    if (view.mode === 'dak' && plan) {
      return listDakSnapWalls(plan, editor.floorIndex.value)
    }
    return editor.walls.value
  }

  function roofOverlaySnapEnabled(): boolean {
    if (view.mode === 'dak') return false
    if (deps.roofOverlayOnPlan?.value === false) return false
    const viewer = loadUserSettings().fmlViewer
    if (deps.roofOverlayOnPlan == null && viewer.showRoofOverlayOnPlan === false) return false
    return viewer.showRoofPlanesOnPlan !== false
  }

  function snapToRoofPlaneRings(cm: Point2D): Point2D | null {
    const plan = editor.localPlan.value
    if (!plan || !roofOverlaySnapEnabled()) return null
    const rings = dakRoofRingsFromFloor(plan.floors[editor.floorIndex.value])
    if (rings.length === 0) return null
    const verts = rings.flat()
    const segments = rings.flatMap((ring) => closedRingSegments(ring))
    return snapToPolygonGeometry(cm, verts, segments, ROOF_TOUCH_SLACK_CM)
  }

  function resolveDrawPoint(cm: Point2D, axisAnchor?: Point2D, snapDisabled?: boolean): Point2D {
    if (drawWallKind.value === 'ridge') {
      return resolveRidgeDrawPoint(cm, {
        plan: editor.localPlan.value,
        floorIndex: editor.floorIndex.value,
        walls: ridgeDrawSnapWalls(),
        axisAnchor,
        lockAxis: axisLocked.value,
        snapDisabled,
      })
    }
    const junction = hitTest.hitTestJunctionAtCm(cm)
    let point = junction ? { x: junction.cmX, y: junction.cmY } : cm
    if (!junction) {
      point = snapToNearbyEndpointAxes(editor.walls.value, [], point)
      point = snapPointToJunctions(editor.junctions.value, point, JUNCTION_POINT_SNAP_CM)
      point = snapPointToWallCenters(editor.walls.value, point, JUNCTION_POINT_SNAP_CM)
      if (!snapDisabled) {
        const roofSnap = snapToRoofPlaneRings(point)
        if (roofSnap) point = roofSnap
      }
    }
    if (axisAnchor) {
      point = snapDrawWallEndpoint(axisAnchor, point, axisLocked.value)
    }
    return point
  }

  function resolveRoomStartPoint(cm: Point2D): Point2D {
    const junction = hitTest.hitTestJunctionAtCm(cm)
    if (junction) return { x: junction.cmX, y: junction.cmY }
    return snapPointToJunctions(editor.junctions.value, cm, ROOM_DRAW_SNAP_CM)
  }

  function resolveRoomEndPoint(cm: Point2D, start: Point2D): Point2D {
    return snapRoomDrawEndPoint(editor.junctions.value, editor.walls.value, cm, start)
  }

  function resolveSurfacePoint(
    cm: Point2D,
    snapDisabled: boolean,
    extraAxisPoints?: Point2D[],
    excludeSurfaceId?: string | null,
  ): Point2D {
    if (snapDisabled) return cm
    if (drawingRoof.value && editor.localPlan.value) {
      const extra = extraAxisPoints ?? []
      if (extra.length === 0) {
        const junction = hitTest.hitTestJunctionAtCm(cm)
        const onRidge =
          junction?.refs.some((ref) => isRidgeWallId(editor.localPlan.value, ref.wallId)) === true
        if (junction && onRidge) {
          return resolveDakSurfacePoint(
            { x: junction.cmX, y: junction.cmY },
            {
              plan: editor.localPlan.value,
              floorIndex: editor.floorIndex.value,
              extraAxisPoints: extra,
              lockAxis: axisLocked.value,
              excludeSurfaceId,
            },
          )
        }
      }
      return resolveDakSurfacePoint(cm, {
        plan: editor.localPlan.value,
        floorIndex: editor.floorIndex.value,
        extraAxisPoints: extra,
        axisAnchor: extra.length > 0 ? extra[extra.length - 1] : undefined,
        lockAxis: axisLocked.value,
        excludeSurfaceId,
      })
    }
    const junction = hitTest.hitTestJunctionAtCm(cm)
    if (junction) return { x: junction.cmX, y: junction.cmY }

    const extra = extraAxisPoints ?? []
    const rings: Point2D[][] = []
    for (const surface of editor.surfaces.value) {
      if (excludeSurfaceId && surface.id === excludeSurfaceId) continue
      if (surface.poly && surface.poly.length >= 2) {
        rings.push(surface.poly.map((p) => ({ x: p.x, y: p.y })))
      }
    }
    for (const area of editor.areas.value) {
      if (area.poly && area.poly.length >= 2) rings.push(area.poly)
    }
    const ringVerts = rings.flat()
    const segments = [
      ...rings.flatMap((ring) => closedRingSegments(ring)),
      ...openPolylineSegments(extra),
    ]
    const polySnap = snapToPolygonGeometry(
      cm,
      [...ringVerts, ...extra],
      segments,
      JUNCTION_POINT_SNAP_CM,
    )
    if (polySnap) return polySnap

    const wallPoints = editor.walls.value.flatMap((wall) => [wall.a, wall.b])
    const axis = snapToNearbyPointAxes([...wallPoints, ...ringVerts, ...extra], cm)
    const junctionSnap = snapPointToJunctions(editor.junctions.value, axis, JUNCTION_POINT_SNAP_CM)
    return snapPointToWallCenters(editor.walls.value, junctionSnap, JUNCTION_POINT_SNAP_CM)
  }

  return {
    drawingRoof,
    resolveDrawPoint,
    resolveRoomStartPoint,
    resolveRoomEndPoint,
    resolveSurfacePoint,
  }
}
