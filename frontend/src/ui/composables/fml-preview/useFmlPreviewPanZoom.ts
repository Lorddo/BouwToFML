import type { Ref } from 'vue'
import type Konva from 'konva'

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
    window.removeEventListener('mousemove', onPanDragMove)
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
    window.addEventListener('mousemove', onPanDragMove)
    window.addEventListener('mouseup', onPanDragEnd, { once: true })
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

  function onWheel(event: WheelEvent): void {
    event.preventDefault()
    const container = containerRef.value
    if (!container) return
    const rect = container.getBoundingClientRect()
    const pointerX = event.clientX - rect.left
    const pointerY = event.clientY - rect.top
    const oldScale = viewport.viewScale.value
    const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1
    const nextScale = Math.max(0.3, Math.min(6, oldScale * zoomFactor))
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
  }
}
