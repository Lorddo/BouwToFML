import { ref } from 'vue'
import { snapRoofVertexZ } from '@/core/fml/generate-roof-planes'
import { isRoofSurface } from '@/core/fml/roof-planes'
import type { FloorSurface, Point2D } from '@/core/fml/types'
import { snapPolygonVertexAxisLock } from '@/ui/components/fml-preview-junction-snap'
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
 * Surface polygoon-edit: sleep vertices (andere polygonen hoek/ribbe + H/V,
 * Shift = ribben H/V, Ctrl/Cmd = uit), klik op rand → punt invoegen.
 */
export function useFmlPreviewSurfaceEdit(options: {
  selection: FmlPreviewSelectionRefs
  editor: EditorApi
  hitTest: { clientToCm: (clientX: number, clientY: number) => Point2D | null }
  resolvePoint: (
    cm: Point2D,
    snapDisabled: boolean,
    extraAxisPoints?: Point2D[],
    excludeSurfaceId?: string | null,
  ) => Point2D
  axisLocked: { value: boolean }
  syncPlanToParent: () => void
}) {
  const draggingVertexIndex = ref<number | null>(null)
  const selectedVertexIndex = ref<number | null>(null)
  let didPushUndo = false
  let snapDisabled = false
  let pendingZ: { index: number; z: number } | null = null
  let dragMoveHandler: ((event: MouseEvent) => void) | null = null
  const DRAG_START_PX = 4

  function isEditing(): boolean {
    return options.selection.surfaceEditId.value != null
  }

  function currentSurface(): FloorSurface | undefined {
    const id = options.selection.surfaceEditId.value
    if (!id) return undefined
    return options.editor.surfaces.value.find((s) => s.id === id)
  }

  function currentPoly(): Point2D[] | null {
    const surface = currentSurface()
    if (!surface?.poly?.length) return null
    return surface.poly.map((p) => ({ x: p.x, y: p.y }))
  }

  function resolveVertexZ(point: Point2D, previous?: { x: number; y: number; z?: number }): number {
    if (previous && Math.hypot(previous.x - point.x, previous.y - point.y) < 0.05) {
      return previous.z ?? 0
    }
    const plan = options.editor.localPlan.value
    if (plan && isRoofSurface(currentSurface())) {
      return snapRoofVertexZ({
        plan,
        floorIndex: options.editor.floorIndex.value,
        point,
      })
    }
    return previous?.z ?? 0
  }

  function commitPoly(poly: Point2D[]): void {
    const id = options.selection.surfaceEditId.value
    if (!id) return
    if (!didPushUndo) {
      options.editor.pushUndo()
      didPushUndo = true
    }
    const existing = currentSurface()
    const dragIdx = draggingVertexIndex.value
    options.editor.updateSurface(id, {
      poly: poly.map((p, index) => ({
        x: p.x,
        y: p.y,
        z:
          index === dragIdx
            ? resolveVertexZ(p, existing?.poly[index])
            : (existing?.poly[index]?.z ?? resolveVertexZ(p)),
      })),
    })
  }

  function cleanupDragListeners(): void {
    if (dragMoveHandler) window.removeEventListener('pointermove', dragMoveHandler)
    dragMoveHandler = null
    window.removeEventListener('pointermove', onDragMove)
    window.removeEventListener('pointerup', onDragUp)
  }

  function resolveEventPoint(event: MouseEvent): Point2D | null {
    const cm = options.hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return null
    const disabled = snapDisabled || event.ctrlKey || event.metaKey
    const poly = currentPoly()
    const idx = draggingVertexIndex.value
    const extra = poly && idx != null ? poly.filter((_, i) => i !== idx) : undefined
    let point = options.resolvePoint(cm, disabled, extra, options.selection.surfaceEditId.value)
    if (options.axisLocked.value && poly && idx != null) {
      point = snapPolygonVertexAxisLock(poly, idx, point)
    }
    return point
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
    const startX = event.clientX
    const startY = event.clientY
    draggingVertexIndex.value = null
    didPushUndo = false
    snapDisabled = event.ctrlKey || event.metaKey
    const onMove = (move: MouseEvent) => {
      if (draggingVertexIndex.value == null) {
        if (Math.hypot(move.clientX - startX, move.clientY - startY) < DRAG_START_PX) return
        draggingVertexIndex.value = index
      }
      onDragMove(move)
    }
    dragMoveHandler = onMove
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      if (dragMoveHandler === onMove) dragMoveHandler = null
      onDragUp()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
  }

  /** @returns true when the event was consumed by edit mode. */
  function removeVertex(index: number): void {
    const poly = currentPoly()
    if (!poly || poly.length <= 3) return
    if (index < 0 || index >= poly.length) return
    const next = poly.filter((_, i) => i !== index)
    commitPoly(next)
    selectedVertexIndex.value = Math.min(index, next.length - 1)
    options.syncPlanToParent()
    didPushUndo = false
  }

  function onPointerDown(event: MouseEvent): boolean {
    flushPendingVertexZ()
    if (!isEditing()) return false
    const raw = options.hitTest.clientToCm(event.clientX, event.clientY)
    if (!raw) return false
    const poly = currentPoly()
    if (!poly || poly.length < 3) return false
    const mutate = options.selection.roofPolyMutate.value === true || event.ctrlKey || event.metaKey

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
      if ((event.ctrlKey || event.metaKey) && poly.length > 3) {
        removeVertex(bestVi)
        event.preventDefault()
        return true
      }
      selectedVertexIndex.value = bestVi
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
    if (mutate && bestEi >= 0 && bestEd <= EDGE_HIT_CM && bestT > 0.05 && bestT < 0.95) {
      const a = poly[bestEi]
      const b = poly[(bestEi + 1) % poly.length]
      const along = {
        x: a.x + (b.x - a.x) * bestT,
        y: a.y + (b.y - a.y) * bestT,
      }
      const snapDisabledNow = event.ctrlKey || event.metaKey
      const inserted = options.resolvePoint(
        along,
        snapDisabledNow,
        poly,
        options.selection.surfaceEditId.value,
      )
      const next = [...poly.slice(0, bestEi + 1), inserted, ...poly.slice(bestEi + 1)]
      commitPoly(next)
      selectedVertexIndex.value = bestEi + 1
      beginVertexDrag(bestEi + 1, event)
      event.preventDefault()
      return true
    }

    return false
  }

  function cancelDrag(): void {
    cleanupDragListeners()
    draggingVertexIndex.value = null
    snapDisabled = false
    didPushUndo = false
  }

  function applyVertexZ(index: number, zCm: number): void {
    const surface = currentSurface()
    if (!surface?.poly[index]) return
    const z = Math.max(0, Math.round(zCm))
    if (Math.round(surface.poly[index]?.z ?? 0) === z) return
    if (!didPushUndo) {
      options.editor.pushUndo()
      didPushUndo = true
    }
    const next = surface.poly.map((point, i) => (i === index ? { ...point, z } : point))
    options.editor.updateSurface(surface.id, { poly: next })
    options.syncPlanToParent()
    didPushUndo = false
  }

  function flushPendingVertexZ(): void {
    if (!pendingZ) return
    applyVertexZ(pendingZ.index, pendingZ.z)
    pendingZ = null
  }

  function setSelectedVertexZ(zCm: number): void {
    const idx = selectedVertexIndex.value
    if (idx == null) return
    pendingZ = { index: idx, z: Math.max(0, Math.round(zCm)) }
    applyVertexZ(idx, pendingZ.z)
  }

  return {
    isEditing,
    onPointerDown,
    cancelDrag,
    draggingVertexIndex,
    selectedVertexIndex,
    setSelectedVertexZ,
  }
}
