import { ref } from 'vue'

type Point = { x: number; y: number }
type Rect = { x: number; y: number; width: number; height: number }

export function useFloorplanFacePointer(deps: {
  spacePressed: () => boolean
  isFaceBoxMode: () => boolean
  isFaceSelectMode: () => boolean
  onFaceClick: (x: number, y: number) => void
  onFaceBoxSelect: (bounds: Rect) => void
}) {
  const faceBoxStrokeActive = ref(false)
  const faceBoxDraftStart = ref<Point | null>(null)
  const faceBoxPreviewRect = ref<Rect | null>(null)

  function resetFaceBoxDraft() {
    faceBoxStrokeActive.value = false
    faceBoxDraftStart.value = null
    faceBoxPreviewRect.value = null
  }

  function onFaceBoxMouseDown(p: Point, stopDrag: () => void): boolean {
    if (!deps.isFaceBoxMode() || deps.spacePressed()) return false
    stopDrag()
    faceBoxStrokeActive.value = true
    faceBoxDraftStart.value = { ...p }
    faceBoxPreviewRect.value = { x: p.x, y: p.y, width: 0, height: 0 }
    return true
  }

  function onFaceSelectMouseDown(
    p: Point,
    opts: { shiftKey: boolean; stopDrag: () => void },
  ): boolean {
    if (!deps.isFaceSelectMode() || !opts.shiftKey || deps.spacePressed()) return false
    opts.stopDrag()
    deps.onFaceClick(Math.round(p.x), Math.round(p.y))
    return true
  }

  function onFaceMouseMove(p: Point): boolean {
    if (!faceBoxStrokeActive.value || !faceBoxDraftStart.value || deps.spacePressed()) return false
    const start = faceBoxDraftStart.value
    faceBoxPreviewRect.value = {
      x: start.x,
      y: start.y,
      width: p.x - start.x,
      height: p.y - start.y,
    }
    return true
  }

  function onFaceMouseUp(): boolean {
    if (!faceBoxStrokeActive.value || !faceBoxDraftStart.value) return false
    const rect = faceBoxPreviewRect.value
    resetFaceBoxDraft()
    if (rect && (Math.abs(rect.width) >= 4 || Math.abs(rect.height) >= 4)) {
      deps.onFaceBoxSelect(rect)
    }
    return true
  }

  return {
    faceBoxStrokeActive,
    faceBoxDraftStart,
    faceBoxPreviewRect,
    resetFaceBoxDraft,
    onFaceBoxMouseDown,
    onFaceSelectMouseDown,
    onFaceMouseMove,
    onFaceMouseUp,
  }
}
