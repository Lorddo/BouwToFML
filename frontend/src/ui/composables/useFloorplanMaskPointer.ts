import { ref } from 'vue'

type Point = { x: number; y: number }

/** Gum/eraser-strokes op de onderlegger-masker (stap 1), los van inkt-tools. */
export function useFloorplanMaskPointer(deps: {
  eraserEnabled: () => boolean
  eraserRadius: () => number
  spacePressed: () => boolean
  onEraseStroke: (points: Point[], radius: number) => void
}) {
  const eraserStrokeActive = ref(false)
  const eraserStrokePoints = ref<Point[]>([])
  const eraserPointer = ref<Point | null>(null)

  function resetEraserDraft() {
    eraserPointer.value = null
    eraserStrokeActive.value = false
    eraserStrokePoints.value = []
  }

  function endEraserStroke() {
    if (eraserStrokeActive.value && eraserStrokePoints.value.length > 0) {
      deps.onEraseStroke(eraserStrokePoints.value, deps.eraserRadius())
    }
    eraserStrokeActive.value = false
    eraserStrokePoints.value = []
  }

  function onMaskMouseDown(p: Point, stopDrag?: () => void): boolean {
    if (!deps.eraserEnabled() || deps.spacePressed()) return false
    stopDrag?.()
    eraserStrokeActive.value = true
    eraserStrokePoints.value = [p]
    return true
  }

  function onMaskMouseMove(p: Point): boolean {
    if (deps.eraserEnabled() && !deps.spacePressed()) {
      eraserPointer.value = p
    } else {
      eraserPointer.value = null
    }
    if (deps.eraserEnabled() && eraserStrokeActive.value && !deps.spacePressed()) {
      eraserStrokePoints.value.push(p)
      return true
    }
    return false
  }

  function onMaskMouseUp(): boolean {
    if (!deps.eraserEnabled()) return false
    endEraserStroke()
    return true
  }

  function clearEraserPointer() {
    eraserPointer.value = null
  }

  return {
    eraserStrokeActive,
    eraserStrokePoints,
    eraserPointer,
    resetEraserDraft,
    endEraserStroke,
    onMaskMouseDown,
    onMaskMouseMove,
    onMaskMouseUp,
    clearEraserPointer,
  }
}
