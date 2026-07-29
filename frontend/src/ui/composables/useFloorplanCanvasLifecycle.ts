import { ref, onMounted, onUnmounted, type Ref } from 'vue'

export function useFloorplanCanvasLifecycle(deps: {
  containerSize: Ref<{ width: number; height: number }>
  onKeyDown: (e: KeyboardEvent) => void
  onKeyUp: (e: KeyboardEvent) => void
  onPolygonKeyDown: (e: KeyboardEvent) => void
  onSelectionKeyDown: (e: KeyboardEvent) => void
  endEraserStroke: () => void
  endInkBrushStroke: () => void
  onSelectionMouseUp: () => void
}) {
  const containerRef = ref<HTMLDivElement | null>(null)
  let containerResizeObserver: ResizeObserver | null = null

  function updateContainerSize() {
    const el = containerRef.value
    if (!el) return
    const width = Math.max(1, Math.round(el.clientWidth))
    const height = Math.max(1, Math.round(el.clientHeight))
    deps.containerSize.value = { width, height }
  }

  onMounted(() => {
    updateContainerSize()
    if (containerRef.value && typeof ResizeObserver !== 'undefined') {
      containerResizeObserver = new ResizeObserver(() => {
        updateContainerSize()
      })
      containerResizeObserver.observe(containerRef.value)
    }
    window.addEventListener('keydown', deps.onKeyDown)
    window.addEventListener('keyup', deps.onKeyUp)
    window.addEventListener('keydown', deps.onPolygonKeyDown)
    window.addEventListener('keydown', deps.onSelectionKeyDown)
    window.addEventListener('mouseup', deps.endEraserStroke)
    window.addEventListener('mouseup', deps.endInkBrushStroke)
    window.addEventListener('mouseup', deps.onSelectionMouseUp)
    window.addEventListener('resize', updateContainerSize)
  })

  onUnmounted(() => {
    containerResizeObserver?.disconnect()
    containerResizeObserver = null
    window.removeEventListener('keydown', deps.onKeyDown)
    window.removeEventListener('keyup', deps.onKeyUp)
    window.removeEventListener('keydown', deps.onPolygonKeyDown)
    window.removeEventListener('keydown', deps.onSelectionKeyDown)
    window.removeEventListener('mouseup', deps.endEraserStroke)
    window.removeEventListener('mouseup', deps.endInkBrushStroke)
    window.removeEventListener('mouseup', deps.onSelectionMouseUp)
    window.removeEventListener('resize', updateContainerSize)
  })

  return {
    containerRef,
    updateContainerSize,
  }
}
