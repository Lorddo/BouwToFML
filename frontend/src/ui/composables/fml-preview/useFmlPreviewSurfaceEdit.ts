import { ref } from 'vue'
import type { Point2D } from '@/core/fml/types'
import type { useFmlPreviewEditor } from '@/ui/composables/useFmlPreviewEditor'
import type { FmlPreviewSelectionRefs } from './fml-preview-selection'

type EditorApi = ReturnType<typeof useFmlPreviewEditor>

const VERTEX_HIT_CM = 12
const EDGE_HIT_CM = 10

function distPointSeg(p: Point2D, a: Point2D, b: Point2D): { dist: number; t: number } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq < 1e-9) return { dist: Math.hypot(p.x - a.x, p.y - a.y), t: 0 }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
  return { dist: Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)), t }
}

/**
 * Surface polygoon-edit: sleep vertices (junction-snap, Ctrl/Cmd = uit),
 * klik op rand → punt invoegen.
 */
export function useFmlPreviewSurfaceEdit(options: {
  selection: FmlPreviewSelectionRefs
  editor: EditorApi
  hitTest: { clientToCm: (clientX: number, clientY: number) => Point2D | null }
  resolvePoint: (cm: Point2D, snapDisabled: boolean) => Point2D
  syncPlanToParent: () => void
}) {
  const draggingVertexIndex = ref<number | null>(null)
  let didPushUndo = false
  let snapDisabled = false

  function isEditing(): boolean {
    return options.selection.surfaceEditId.value != null
  }

  function currentPoly(): Point2D[] | null {
    const id = options.selection.surfaceEditId.value
    if (!id) return null
    const surface = options.editor.surfaces.value.find((s) => s.id === id)
    if (!surface?.poly?.length) return null
    return surface.poly.map((p) => ({ x: p.x, y: p.y }))
  }

  function commitPoly(poly: Point2D[]): void {
    const id = options.selection.surfaceEditId.value
    if (!id) return
    if (!didPushUndo) {
      options.editor.pushUndo()
      didPushUndo = true
    }
    options.editor.updateSurface(id, {
      poly: poly.map((p) => ({ x: p.x, y: p.y, z: 0 })),
    })
  }

  function cleanupDragListeners(): void {
    window.removeEventListener('pointermove', onDragMove)
    window.removeEventListener('pointerup', onDragUp)
  }

  function resolveEventPoint(event: MouseEvent): Point2D | null {
    const cm = options.hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return null
    const disabled = snapDisabled || event.ctrlKey || event.metaKey
    return options.resolvePoint(cm, disabled)
  }

  function onDragMove(event: MouseEvent): void {
    if (draggingVertexIndex.value == null) return
    snapDisabled = snapDisabled || event.ctrlKey || event.metaKey
    const point = resolveEventPoint(event)
    if (!point) return
    const poly = currentPoly()
    if (!poly) return
    const idx = draggingVertexIndex.value
    if (idx < 0 || idx >= poly.length) return
    const next = poly.map((p, i) => (i === idx ? { x: point.x, y: point.y } : p))
    commitPoly(next)
  }

  function onDragUp(): void {
    draggingVertexIndex.value = null
    snapDisabled = false
    cleanupDragListeners()
    if (didPushUndo) {
      options.syncPlanToParent()
      didPushUndo = false
    }
  }

  function beginVertexDrag(index: number, event: MouseEvent): void {
    draggingVertexIndex.value = index
    didPushUndo = false
    snapDisabled = event.ctrlKey || event.metaKey
    window.addEventListener('pointermove', onDragMove)
    window.addEventListener('pointerup', onDragUp, { once: true })
  }

  /** @returns true when the event was consumed by edit mode. */
  function onPointerDown(event: MouseEvent): boolean {
    if (!isEditing()) return false
    const raw = options.hitTest.clientToCm(event.clientX, event.clientY)
    if (!raw) return true
    const poly = currentPoly()
    if (!poly || poly.length < 3) return true

    let bestVi = -1
    let bestVd = Number.POSITIVE_INFINITY
    for (let i = 0; i < poly.length; i++) {
      const d = Math.hypot(raw.x - poly[i].x, raw.y - poly[i].y)
      if (d < bestVd) {
        bestVd = d
        bestVi = i
      }
    }
    if (bestVi >= 0 && bestVd <= VERTEX_HIT_CM) {
      beginVertexDrag(bestVi, event)
      event.preventDefault()
      return true
    }

    let bestEi = -1
    let bestEd = Number.POSITIVE_INFINITY
    let bestT = 0.5
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]
      const b = poly[(i + 1) % poly.length]
      const { dist, t } = distPointSeg(raw, a, b)
      if (dist < bestEd) {
        bestEd = dist
        bestEi = i
        bestT = t
      }
    }
    if (bestEi >= 0 && bestEd <= EDGE_HIT_CM && bestT > 0.05 && bestT < 0.95) {
      const a = poly[bestEi]
      const b = poly[(bestEi + 1) % poly.length]
      const along = {
        x: a.x + (b.x - a.x) * bestT,
        y: a.y + (b.y - a.y) * bestT,
      }
      const snapDisabledNow = event.ctrlKey || event.metaKey
      const inserted = options.resolvePoint(along, snapDisabledNow)
      const next = [...poly.slice(0, bestEi + 1), inserted, ...poly.slice(bestEi + 1)]
      commitPoly(next)
      beginVertexDrag(bestEi + 1, event)
      event.preventDefault()
      return true
    }

    return true
  }

  function cancelDrag(): void {
    cleanupDragListeners()
    draggingVertexIndex.value = null
    snapDisabled = false
    didPushUndo = false
  }

  return {
    isEditing,
    onPointerDown,
    cancelDrag,
    draggingVertexIndex,
  }
}
