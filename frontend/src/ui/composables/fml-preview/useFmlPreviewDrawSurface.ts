import { ref, type Ref } from 'vue'
import { snapRoofVertexZ } from '@/core/fml/generate-roof-planes'
import { resolveRoofSurfaceColor } from '@/core/fml/roof-planes'
import { resolveRoomType } from '@/core/fml/roomtype-catalog'
import type { Point2D } from '@/core/fml/types'
import { snapDrawWallEndpoint } from '@/ui/components/fml-preview-junction-snap'
import type { useFmlPreviewEditor } from '@/ui/composables/useFmlPreviewEditor'
import type { FmlPreviewSelectionRefs } from './fml-preview-selection'

type EditorApi = ReturnType<typeof useFmlPreviewEditor>

/**
 * Surface-tekentool: klik vertices, rubber-band naar cursor.
 * Soft H/V naar geplaatste punten + muureinden; hoeken/ribben van andere polygonen;
 * Shift = vast H/V t.o.v. vorig punt; junction-snap (Ctrl/Cmd = uit);
 * sluiten via dubbelklik / eerste punt / Enter.
 */
export function useFmlPreviewDrawSurface(options: {
  selection: FmlPreviewSelectionRefs
  editor: EditorApi
  hitTest: { clientToCm: (clientX: number, clientY: number) => Point2D | null }
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
}) {
  const draftPoints = options.selection.drawSurfacePoints
  const hoverCm = ref<Point2D | null>(null)
  const pendingRole = ref<number | null>(null)
  const CLOSE_EPS_CM = 8

  function cancelDrawSurface(): void {
    draftPoints.value = null
    hoverCm.value = null
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
    options.editor.pushUndo()
    const dak = options.isDak?.() === true
    const role = dak ? null : pendingRole.value
    const rt = role != null ? resolveRoomType(role) : null
    const plan = options.editor.localPlan.value
    const floorIndex = options.editor.floorIndex.value
    options.editor.addSurface({
      poly: pts.map((p) => ({
        x: p.x,
        y: p.y,
        z: plan ? snapRoofVertexZ({ plan, floorIndex, point: p }) : 0,
      })),
      role: rt?.role,
      name: rt?.name,
      color: resolveRoofSurfaceColor(),
      showAreaLabel: false,
      isRoof: true,
    })
    draftPoints.value = null
    hoverCm.value = null
    options.selection.activeFmlTool.value = null
    options.syncPlanToParent()
    return true
  }

  function updateDrawSurfaceHover(event: MouseEvent): void {
    if (!draftPoints.value?.length) {
      hoverCm.value = null
      return
    }
    hoverCm.value = resolveClick(event)
  }

  function clearDrawSurfaceHover(): void {
    hoverCm.value = null
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
    cancelDrawSurface,
    onDrawSurfaceClick,
    onDrawSurfaceDblClick,
    updateDrawSurfaceHover,
    clearDrawSurfaceHover,
    commitDrawSurface,
  }
}
