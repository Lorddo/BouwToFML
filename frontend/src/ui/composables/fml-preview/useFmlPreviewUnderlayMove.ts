import { ref, watch } from 'vue'
import type { Point2D } from '@/core/fml/types'
import type { PreviewUnderlayLayout } from '@/ui/composables/project/types'

interface UnderlayMoveHitTest {
  clientToCm: (clientX: number, clientY: number) => Point2D | null
}

/**
 * Toggle-modus: sleep verschuift alleen underlay-origin; muren blijven.
 * origin' = origin − Δcm; nulpuntImageCm volgt origin (FML 0,0 ↔ image).
 */
export function useFmlPreviewUnderlayMove(options: {
  hitTest: UnderlayMoveHitTest
  underlayMoveMode: { value: boolean }
  getUnderlayLayout: () => PreviewUnderlayLayout | null
  setFmlNulpuntImageCm: (point: Point2D | null) => void
  syncLayoutToParent: (layout: PreviewUnderlayLayout) => void
  beforeBegin: () => void
}) {
  const dragging = ref(false)
  const dragStartCm = ref<Point2D | null>(null)
  const dragStartOrigin = ref<Point2D | null>(null)

  watch(
    () => options.underlayMoveMode.value,
    (on) => {
      if (!on) cancelUnderlayMoveDrag()
    },
    { flush: 'sync' },
  )

  function stopListeners(): void {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    dragging.value = false
    dragStartCm.value = null
    dragStartOrigin.value = null
  }

  function cancelUnderlayMoveDrag(): void {
    stopListeners()
  }

  function beginUnderlayMoveDrag(event: MouseEvent): boolean {
    if (!options.underlayMoveMode.value) return false
    const layout = options.getUnderlayLayout()
    const cm = options.hitTest.clientToCm(event.clientX, event.clientY)
    if (!layout || !cm) return false
    options.beforeBegin()
    dragging.value = true
    dragStartCm.value = { ...cm }
    dragStartOrigin.value = { ...layout.origin }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return true
  }

  function applyDelta(cm: Point2D): void {
    const startCm = dragStartCm.value
    const startOrigin = dragStartOrigin.value
    const layout = options.getUnderlayLayout()
    if (!startCm || !startOrigin || !layout) return
    const dx = cm.x - startCm.x
    const dy = cm.y - startCm.y
    const next: PreviewUnderlayLayout = {
      ...layout,
      origin: {
        x: startOrigin.x - dx,
        y: startOrigin.y - dy,
      },
    }
    options.setFmlNulpuntImageCm({ ...next.origin })
    options.syncLayoutToParent(next)
  }

  function onPointerMove(event: MouseEvent): void {
    if (!dragging.value) return
    const cm = options.hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return
    applyDelta(cm)
  }

  function onPointerUp(event: MouseEvent): void {
    if (!dragging.value) return
    const cm = options.hitTest.clientToCm(event.clientX, event.clientY) ?? dragStartCm.value
    if (cm) applyDelta(cm)
    stopListeners()
  }

  function isDragging(): boolean {
    return dragging.value
  }

  return {
    beginUnderlayMoveDrag,
    cancelUnderlayMoveDrag,
    isDragging,
  }
}
