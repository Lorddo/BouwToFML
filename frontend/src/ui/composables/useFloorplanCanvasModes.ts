import { ref, computed, type Ref } from 'vue'
import type { ElementClass } from '@/core/extraction/types'
import type { PolygonToolMode } from '@/cv/tools/polygon'
import type { FaceToolId, InkToolId } from '@/ui/components/canvas/canvas-toolbelt.types'

export function useFloorplanCanvasModes(deps: {
  lbeEnabled: () => boolean
  drawType: () => ElementClass | null | undefined
  inkTool: () => InkToolId | null | undefined
  eraserEnabled: () => boolean
  polygonToolMode: () => PolygonToolMode
  faceSelectEnabled: () => boolean
  faceTool: () => FaceToolId | null | undefined
  probeEnabled: () => boolean
  imageDimmed: () => boolean
  rotationPreviewDeg: () => number
  containerSize: () => { width: number; height: number }
  spacePressed: () => boolean
  shiftPressed: () => boolean
  imageObj: Ref<HTMLImageElement | null>
  imgSize: () => { w: number; h: number }
  stageScale: () => number
}) {
  const isPanDragging = ref(false)

  const isDrawMode = computed(
    () => deps.lbeEnabled() && deps.drawType() != null && !deps.inkTool(),
  )
  const isSelectionMode = computed(
    () =>
      deps.lbeEnabled() &&
      deps.drawType() == null &&
      !deps.eraserEnabled() &&
      !deps.polygonToolMode() &&
      !deps.inkTool(),
  )
  const isFaceSelectMode = computed(
    () =>
      deps.faceSelectEnabled() &&
      !deps.faceTool() &&
      !deps.eraserEnabled() &&
      !deps.polygonToolMode() &&
      !deps.probeEnabled() &&
      !deps.inkTool(),
  )
  const isFaceBoxMode = computed(() => deps.faceTool() != null)
  const isProbeMode = computed(
    () =>
      deps.probeEnabled() &&
      !deps.eraserEnabled() &&
      !deps.polygonToolMode() &&
      !deps.inkTool(),
  )
  const isInkBrushMode = computed(
    () => deps.inkTool() === 'brush' || deps.inkTool() === 'eraser',
  )
  const isInkLineMode = computed(() => deps.inkTool() === 'line')
  const isInkRectMode = computed(() => deps.inkTool() === 'rect')
  const isInkToolMode = computed(() => deps.inkTool() != null)
  const isEraserMode = computed(() => deps.eraserEnabled())
  const isPolygonMode = computed(() => deps.polygonToolMode() != null)

  const stageDraggable = computed(
    () =>
      (!isDrawMode.value &&
        !isEraserMode.value &&
        !isPolygonMode.value &&
        !isProbeMode.value &&
        !isInkToolMode.value &&
        !isFaceBoxMode.value) ||
      deps.spacePressed(),
  )

  const stageConfig = computed(() => ({
    width: deps.containerSize().width,
    height: deps.containerSize().height,
    draggable: stageDraggable.value,
  }))

  const wrapClass = computed(() => {
    if (isProbeMode.value && !deps.spacePressed()) return 'cursor-crosshair'
    if (isFaceBoxMode.value && !deps.spacePressed()) return 'cursor-crosshair'
    if (isFaceSelectMode.value && deps.shiftPressed() && !deps.spacePressed()) {
      return 'cursor-pointer'
    }
    if (isDrawMode.value && !deps.spacePressed()) return 'cursor-crosshair'
    if (
      (isEraserMode.value || isPolygonMode.value || isInkToolMode.value) &&
      !deps.spacePressed()
    ) {
      return 'cursor-crosshair'
    }
    return isPanDragging.value ? 'cursor-grabbing' : 'cursor-grab'
  })

  const faceBoxPreviewStroke = computed(() => {
    const tool = deps.faceTool()
    if (tool === 'box_wall') return '#1e293b'
    return '#ef4444'
  })

  const polygonCloseThreshold = computed(() =>
    Math.max(10, 14 / deps.stageScale()),
  )

  const hasRotationPreview = computed(
    () => Math.abs(deps.rotationPreviewDeg() ?? 0) > 0.001,
  )

  const underlayGroupConfig = computed(() => {
    const w = deps.imgSize().w
    const h = deps.imgSize().h
    const rotation = deps.rotationPreviewDeg() ?? 0
    if (!hasRotationPreview.value) return {}
    return {
      x: w / 2,
      y: h / 2,
      offsetX: w / 2,
      offsetY: h / 2,
      rotation,
    }
  })

  const baseImageConfig = computed(() => ({
    image: deps.imageObj.value,
    x: 0,
    y: 0,
    width: deps.imgSize().w,
    height: deps.imgSize().h,
    opacity: deps.imageDimmed() ? 0.5 : 1,
  }))

  const polygonDraftStroke = computed(() => {
    if (deps.polygonToolMode() === 'erase') return '#ef4444'
    return '#10b981'
  })

  function onDragStart() {
    isPanDragging.value = true
  }

  function onDragEnd() {
    isPanDragging.value = false
  }

  return {
    isPanDragging,
    isDrawMode,
    isSelectionMode,
    isFaceSelectMode,
    isFaceBoxMode,
    isProbeMode,
    isInkBrushMode,
    isInkLineMode,
    isInkRectMode,
    isInkToolMode,
    isEraserMode,
    isPolygonMode,
    stageDraggable,
    stageConfig,
    wrapClass,
    faceBoxPreviewStroke,
    polygonCloseThreshold,
    hasRotationPreview,
    underlayGroupConfig,
    baseImageConfig,
    polygonDraftStroke,
    onDragStart,
    onDragEnd,
  }
}
