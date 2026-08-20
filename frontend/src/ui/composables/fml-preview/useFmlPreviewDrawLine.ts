import { ref, type Ref } from 'vue'
import type { Point2D } from '@/core/fml/types'
import type { useFmlPreviewEditor } from '@/ui/composables/useFmlPreviewEditor'
import type { FmlPreviewSelectionRefs } from './fml-preview-selection'

type EditorApi = ReturnType<typeof useFmlPreviewEditor>

/**
 * Notatielijn: twee klikken, Shift = H/V t.o.v. startpunt.
 * Preview toont geplaatste punten + rubber-band naar cursor (zoals surface-polygon).
 */
export function useFmlPreviewDrawLine(options: {
  selection: FmlPreviewSelectionRefs
  editor: EditorApi
  hitTest: { clientToCm: (clientX: number, clientY: number) => Point2D | null }
  shiftPressed: Ref<boolean>
  resolvePoint: (cm: Point2D, snapDisabled: boolean) => Point2D
  beforeBegin: () => void
  syncPlanToParent: () => void
}) {
  const draftPoints = options.selection.drawLinePoints
  const hoverCm = ref<Point2D | null>(null)
  const thickness = ref(2)

  function cancelDrawLine(): void {
    draftPoints.value = null
    hoverCm.value = null
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

  function updateDrawLineHover(event: MouseEvent): void {
    if (!draftPoints.value?.length) {
      hoverCm.value = null
      return
    }
    const locked = resolveClick(event)
    hoverCm.value = locked
  }

  function clearDrawLineHover(): void {
    hoverCm.value = null
  }

  function placeLine(end: Point2D): boolean {
    const pts = draftPoints.value
    if (!pts || pts.length === 0) return false
    const a = pts[0]
    if (Math.hypot(end.x - a.x, end.y - a.y) < 1) return false
    options.editor.pushUndo()
    const id = options.editor.addLine({
      a,
      b: end,
      type: 'solid_line',
      color: 0,
      thickness: Math.max(1, Math.round(thickness.value)),
    })
    draftPoints.value = null
    hoverCm.value = null
    options.selection.settingsLineId.value = id
    options.selection.settingsLabelId.value = null
    options.selection.activeFmlTool.value = null
    options.syncPlanToParent()
    return true
  }

  function onDrawLineClick(event: MouseEvent): void {
    const locked = resolveClick(event)
    if (!locked) return
    if (!draftPoints.value) {
      options.beforeBegin()
      draftPoints.value = [locked]
      hoverCm.value = locked
      return
    }
    placeLine(locked)
  }

  function commitFromHover(): boolean {
    const end = hoverCm.value
    if (!end) return false
    return placeLine(end)
  }

  return {
    cancelDrawLine,
    onDrawLineClick,
    updateDrawLineHover,
    clearDrawLineHover,
    commitFromHover,
    hoverCm,
    thickness,
  }
}
