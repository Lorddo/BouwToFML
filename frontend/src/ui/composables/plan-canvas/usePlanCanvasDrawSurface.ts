import { ref, type Ref } from 'vue'
import { snapRoofVertexZ } from '@/core/fml/roof-vertex-snap'
import { listRidgeSurfacesOnFloor, resolveDormerParent, resolveRoofSurfaceColor } from '@/core/fml/roof-planes'
import {
  effectiveRoomTypeColor,
  resolveRoomType,
  UNLABELED_AREA_COLOR,
} from '@/core/fml/roomtype-catalog'
import { loadUserSettings } from '@/ui/composables/settings/user-settings'
import type { Point2D } from '@/core/fml/types'
import { snapDrawWallEndpoint } from '@/ui/components/plan-canvas-junction-snap'
import type { usePlanEditor } from '@/ui/composables/usePlanEditor'
import type { PlanCanvasSelectionRefs } from './plan-canvas-selection'
import type { RenderJunction } from './plan-canvas-render-types'

type EditorApi = ReturnType<typeof usePlanEditor>

/**
 * Surface-tekentool: klik vertices, rubber-band naar cursor.
 * Soft H/V naar geplaatste punten + muureinden; hoeken/ribben van andere polygonen;
 * Shift = vast H/V t.o.v. vorig punt; snap (Ctrl/Cmd = uit);
 * eerste dakvlak-punt heeft dezelfde hover-snap als latere punten;
 * sluiten via dubbelklik / eerste punt / Enter.
 */
export function usePlanCanvasDrawSurface(options: {
  selection: PlanCanvasSelectionRefs
  editor: EditorApi
  hitTest: {
    clientToCm: (clientX: number, clientY: number) => Point2D | null
    hitTestJunctionAtCm?: (cm: Point2D) => RenderJunction | null
  }
  hoveredJunctionId?: Ref<string | null>
  shiftPressed: Ref<boolean>
  /** Snap naar junctions, andere polygonen (hoek/ribbe) en H/V-assen; Ctrl/Cmd = raw. */
  resolvePoint: (
    cm: Point2D,
    snapDisabled: boolean,
    extraAxisPoints?: Point2D[],
    excludeSurfaceId?: string | null,
  ) => Point2D
  beforeBegin: () => void
  syncPlanToParent: () => void
  /** Dak-tab: punt moet op de uitslag van de actieve floor liggen. */
  acceptPoint?: (point: Point2D) => boolean
  /** Dakvlak-tool: geen roomtype, altijd dakvlak. */
  isDak?: () => boolean
  /** Na succesvol dakvlak: overlay aanzetten. */
  onRoofPlaced?: () => void
}) {
  const draftPoints = options.selection.drawSurfacePoints
  const hoverCm = ref<Point2D | null>(null)
  const pendingRole = ref<number | null>(null)
  const pendingCutout = ref(false)
  /** Dak-tab: teken als hoofddak of dakkapel. */
  const pendingRoofKind = ref<'plane' | 'dormer'>('plane')
  const CLOSE_EPS_CM = 8

  function setJunctionHover(event: MouseEvent): void {
    const hoverId = options.hoveredJunctionId
    if (!hoverId) return
    if (draftPoints.value?.length) {
      hoverId.value = null
      return
    }
    const cm = options.hitTest.clientToCm(event.clientX, event.clientY)
    const junction = cm ? options.hitTest.hitTestJunctionAtCm?.(cm) : null
    hoverId.value = junction?.id ?? null
  }

  function cancelDrawSurface(): void {
    draftPoints.value = null
    hoverCm.value = null
    if (options.hoveredJunctionId) options.hoveredJunctionId.value = null
  }

  function maybeCloseSnap(point: Point2D, snapDisabled: boolean): Point2D {
    if (snapDisabled) return point
    const pts = draftPoints.value
    if (!pts || pts.length < 3) return point
    const first = pts[0]
    if (Math.hypot(point.x - first.x, point.y - first.y) <= CLOSE_EPS_CM) {
      return { x: first.x, y: first.y }
    }
    return point
  }

  function resolveClick(event: MouseEvent): Point2D | null {
    const cm = options.hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return null
    const snapDisabled = event.ctrlKey || event.metaKey
    const pts = draftPoints.value
    const snapped = options.resolvePoint(cm, snapDisabled, pts ?? undefined)
    const last = pts && pts.length > 0 ? pts[pts.length - 1] : null
    const locked = last ? snapDrawWallEndpoint(last, snapped, options.shiftPressed.value) : snapped
    return maybeCloseSnap(locked, snapDisabled)
  }

  function tryClose(): boolean {
    const pts = draftPoints.value
    if (!pts || pts.length < 3) return false
    const dak = options.isDak?.() === true
    const plan = options.editor.localPlan.value
    const floorIndex = options.editor.floorIndex.value
    if (dak) {
      options.editor.pushUndo()
      const kind = pendingRoofKind.value === 'dormer' ? 'dormer' : 'plane'
      const poly = pts.map((p) => ({
        x: p.x,
        y: p.y,
        z: plan ? snapRoofVertexZ({ plan, floorIndex, point: p }) : 0,
      }))
      let parentId: string | undefined
      if (kind === 'dormer' && plan) {
        const existing = listRidgeSurfacesOnFloor(plan.floors[floorIndex])
        parentId = resolveDormerParent({ poly }, existing)?.id
      }
      const id = options.editor.addSurface({
        poly,
        color: resolveRoofSurfaceColor(undefined, kind === 'dormer'),
        showAreaLabel: false,
        isRoof: true,
        roofKind: kind,
        roofParentId: parentId,
      })
      if (!id) {
        options.editor.undo()
        return false
      }
      options.onRoofPlaced?.()
    } else {
      options.editor.pushUndo()
      const role = pendingRole.value
      const rt = role != null ? resolveRoomType(role) : null
      const cutout = pendingCutout.value === true
      const overrides = loadUserSettings().roomTagColors
      options.editor.addSurface({
        poly: pts.map((p) => ({ x: p.x, y: p.y, z: 0 })),
        role: rt?.role,
        name: rt?.name,
        customName: cutout ? 'Trapgat' : undefined,
        color: rt ? effectiveRoomTypeColor(rt.role, overrides) : UNLABELED_AREA_COLOR,
        showAreaLabel: true,
        isCutout: cutout || undefined,
      })
    }
    draftPoints.value = null
    hoverCm.value = null
    options.selection.activePlanTool.value = null
    options.syncPlanToParent()
    return true
  }

  function updateDrawSurfaceHover(event: MouseEvent): void {
    hoverCm.value = resolveClick(event)
    setJunctionHover(event)
  }

  function clearDrawSurfaceHover(): void {
    hoverCm.value = null
    if (options.hoveredJunctionId) options.hoveredJunctionId.value = null
  }

  function onDrawSurfaceClick(event: MouseEvent): void {
    const locked = resolveClick(event)
    if (!locked) return
    if (options.acceptPoint && !options.acceptPoint(locked)) return
    if (!draftPoints.value) {
      options.beforeBegin()
      draftPoints.value = [locked]
      hoverCm.value = locked
      return
    }
    const first = draftPoints.value[0]
    if (
      draftPoints.value.length >= 3 &&
      Math.hypot(locked.x - first.x, locked.y - first.y) <= CLOSE_EPS_CM
    ) {
      tryClose()
      return
    }
    draftPoints.value = [...draftPoints.value, locked]
    hoverCm.value = locked
  }

  function onDrawSurfaceDblClick(event: MouseEvent): void {
    event.preventDefault()
    if (!draftPoints.value) return
    tryClose()
  }

  function commitDrawSurface(): boolean {
    return tryClose()
  }

  return {
    draftPoints,
    hoverCm,
    pendingRole,
    pendingCutout,
    pendingRoofKind,
    cancelDrawSurface,
    onDrawSurfaceClick,
    onDrawSurfaceDblClick,
    updateDrawSurfaceHover,
    clearDrawSurfaceHover,
    commitDrawSurface,
  }
}
