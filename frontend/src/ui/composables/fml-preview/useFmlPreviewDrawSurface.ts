import { type Ref } from 'vue'
import type { Point2D } from '@/core/fml/types'
import { UNLABELED_AREA_COLOR } from '@/core/fml/roomtype-catalog'
import type { useFmlPreviewEditor } from '@/ui/composables/useFmlPreviewEditor'
import type { FmlPreviewSelectionRefs } from './fml-preview-selection'

type EditorApi = ReturnType<typeof useFmlPreviewEditor>

/**
 * Surface-tekentool: klik vertices, Shift = H/V t.o.v. vorig punt,
 * junction-snap (Ctrl/Cmd = uit), sluiten via dubbelklik / eerste punt / Enter.
 */
export function useFmlPreviewDrawSurface(options: {
  selection: FmlPreviewSelectionRefs
  editor: EditorApi
  hitTest: { clientToCm: (clientX: number, clientY: number) => Point2D | null }
  shiftPressed: Ref<boolean>
  /** Snap naar junctions; bij Ctrl/Cmd gewoon raw cm teruggeven. */
  resolvePoint: (cm: Point2D, snapDisabled: boolean) => Point2D
  beforeBegin: () => void
  syncPlanToParent: () => void
}) {
  const draftPoints = options.selection.drawSurfacePoints
  const CLOSE_EPS_CM = 8

  function cancelDrawSurface(): void {
    draftPoints.value = null
  }

  function lockAxis(cm: Point2D): Point2D {
    const pts = draftPoints.value
    if (!options.shiftPressed.value || !pts || pts.length === 0) return cm
    const last = pts[pts.length - 1]
    const dx = Math.abs(cm.x - last.x)
    const dy = Math.abs(cm.y - last.y)
    if (dx >= dy) return { x: cm.x, y: last.y }
    return { x: last.x, y: cm.y }
  }

  function resolveClick(event: MouseEvent): Point2D | null {
    const cm = options.hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return null
    const snapDisabled = event.ctrlKey || event.metaKey
    return lockAxis(options.resolvePoint(cm, snapDisabled))
  }

  function tryClose(): boolean {
    const pts = draftPoints.value
    if (!pts || pts.length < 3) return false
    options.editor.pushUndo()
    options.editor.addSurface({
      poly: pts.map((p) => ({ x: p.x, y: p.y, z: 0 })),
      color: UNLABELED_AREA_COLOR,
      showAreaLabel: true,
    })
    draftPoints.value = null
    options.selection.activeFmlTool.value = null
    options.syncPlanToParent()
    return true
  }

  function onDrawSurfaceClick(event: MouseEvent): void {
    const locked = resolveClick(event)
    if (!locked) return
    if (!draftPoints.value) {
      options.beforeBegin()
      draftPoints.value = [locked]
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
    cancelDrawSurface,
    onDrawSurfaceClick,
    onDrawSurfaceDblClick,
    commitDrawSurface,
  }
}
