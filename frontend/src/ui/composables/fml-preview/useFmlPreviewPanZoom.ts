import type { Ref } from 'vue'
import type Konva from 'konva'

/** Wheel-zoom clamp (t.o.v. fit-to-view = 1). */
export const VIEW_SCALE_MIN = 0.3
export const VIEW_SCALE_MAX = 40

export function clampViewScale(scale: number): number {
  return Math.max(VIEW_SCALE_MIN, Math.min(VIEW_SCALE_MAX, scale))
}

interface ViewportPanApi {
  viewScale: Ref<number>
  viewPosition: Ref<{ x: number; y: number }>
}

export function useFmlPreviewPanZoom(options: {
  viewport: ViewportPanApi
  containerRef: Ref<HTMLDivElement | null>
  isPanDragging: Ref<boolean>
  onBeforePan: () => void
}) {
  const { viewport, containerRef, isPanDragging, onBeforePan } = options

  let panDrag: {
    startClientX: number
    startClientY: number
    startViewX: number
    startViewY: number
  } | null = null

  function onPanDragMove(event: MouseEvent): void {
    if (!panDrag) return
    viewport.viewPosition.value = {
      x: panDrag.startViewX + (event.clientX - panDrag.startClientX),
      y: panDrag.startViewY + (event.clientY - panDrag.startClientY),
    }
  }

  function endPanDrag(): void {
    window.removeEventListener('pointermove', onPanDragMove)
    panDrag = null
    isPanDragging.value = false
  }

  function onPanDragEnd(): void {
    endPanDrag()
  }

  function beginPanDrag(event: MouseEvent): void {
    onBeforePan()
    event.preventDefault()
    isPanDragging.value = true
    panDrag = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      startViewX: viewport.viewPosition.value.x,
      startViewY: viewport.viewPosition.value.y,
    }
    window.addEventListener('pointermove', onPanDragMove)
    window.addEventListener('pointerup', onPanDragEnd, { once: true })
  }

  function onGroupDragStart(): void {
    isPanDragging.value = true
  }

  function onGroupDragMove(event: { target: Konva.Node }): void {
    viewport.viewPosition.value = {
      x: event.target.x(),
      y: event.target.y(),
    }
  }

  function onGroupDragEnd(event: { target: Konva.Node }): void {
    isPanDragging.value = false
    viewport.viewPosition.value = {
      x: event.target.x(),
      y: event.target.y(),
    }
  }

  function zoomAt(pointerX: number, pointerY: number, nextScale: number): void {
    const oldScale = viewport.viewScale.value
    const origin = {
      x: (pointerX - viewport.viewPosition.value.x) / oldScale,
      y: (pointerY - viewport.viewPosition.value.y) / oldScale,
    }
    const scale = clampViewScale(nextScale)
    viewport.viewScale.value = scale
    viewport.viewPosition.value = {
      x: pointerX - origin.x * scale,
      y: pointerY - origin.y * scale,
    }
  }

  function zoomBy(factor: number): void {
    const container = containerRef.value
    if (!container) return
    const rect = container.getBoundingClientRect()
    zoomAt(rect.width / 2, rect.height / 2, viewport.viewScale.value * factor)
  }

  function applyView(next: { scale: number; x: number; y: number }): void {
    viewport.viewScale.value = clampViewScale(next.scale)
    viewport.viewPosition.value = { x: next.x, y: next.y }
  }

  function onWheel(event: WheelEvent): void {
    event.preventDefault()
    const container = containerRef.value
    if (!container) return
    const rect = container.getBoundingClientRect()
    const pointerX = event.clientX - rect.left
    const pointerY = event.clientY - rect.top
    const oldScale = viewport.viewScale.value
    const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1
    const nextScale = clampViewScale(oldScale * zoomFactor)
    const origin = {
      x: (pointerX - viewport.viewPosition.value.x) / oldScale,
      y: (pointerY - viewport.viewPosition.value.y) / oldScale,
    }
    viewport.viewScale.value = nextScale
    viewport.viewPosition.value = {
      x: pointerX - origin.x * nextScale,
      y: pointerY - origin.y * nextScale,
    }
  }

  return {
    beginPanDrag,
    endPanDrag,
    onGroupDragStart,
    onGroupDragMove,
    onGroupDragEnd,
    onWheel,
    zoomBy,
    zoomAt,
    applyView,
  }
}
