import { computed, type Ref } from 'vue'
import type { Point2D } from '@/core/plan/types'
import { layoutTransform, type ContentLayout } from '@/ui/composables/canvas-kernel/usePlanCanvasViewport'

export function usePlanCanvasDrawPreviews(opts: {
  drawWallPreview: Ref<{ a: Point2D; b: Point2D } | null>
  drawRoomPreview: Ref<Point2D[] | null>
  drawSurfacePoints?: Ref<Point2D[] | null>
  drawSurfaceHoverCm?: Ref<Point2D | null>
  drawLinePoints?: Ref<Point2D[] | null>
  drawLineHoverCm?: Ref<Point2D | null>
  contentLayout: Ref<ContentLayout | null>
  viewPosition: Ref<{ x: number; y: number }>
  viewScale: Ref<number>
}) {
  const {
    drawWallPreview,
    drawRoomPreview,
    drawSurfacePoints,
    drawSurfaceHoverCm,
    drawLinePoints,
    drawLineHoverCm,
    contentLayout,
    viewPosition,
    viewScale,
  } = opts

  const drawWallPreviewScreen = computed(() => {
    const preview = drawWallPreview.value
    const layout = contentLayout.value
    if (!preview || !layout) return null
    const { toStagePoint } = layoutTransform(layout)
    const a = toStagePoint(preview.a.x, preview.a.y)
    const b = toStagePoint(preview.b.x, preview.b.y)
    return {
      x1: viewPosition.value.x + a.x * viewScale.value,
      y1: viewPosition.value.y + a.y * viewScale.value,
      x2: viewPosition.value.x + b.x * viewScale.value,
      y2: viewPosition.value.y + b.y * viewScale.value,
    }
  })

  const drawRoomPreviewScreen = computed(() => {
    const preview = drawRoomPreview.value
    const layout = contentLayout.value
    if (!preview || !layout || preview.length < 4) return null
    const { toStagePoint } = layoutTransform(layout)
    return preview.map((corner) => {
      const stage = toStagePoint(corner.x, corner.y)
      return {
        x: viewPosition.value.x + stage.x * viewScale.value,
        y: viewPosition.value.y + stage.y * viewScale.value,
      }
    })
  })

  const drawRoomPreviewPolygon = computed(() => {
    if (!drawRoomPreviewScreen.value) return ''
    return drawRoomPreviewScreen.value.map((point) => `${point.x},${point.y}`).join(' ')
  })

  const drawWallMeasureLabel = computed(() => {
    const screen = drawWallPreviewScreen.value
    if (!screen) return null
    return {
      x: (screen.x1 + screen.x2) / 2,
      y: (screen.y1 + screen.y2) / 2,
    }
  })

  const drawRoomMeasureLabels = computed(() => {
    const pts = drawRoomPreviewScreen.value
    if (!pts || pts.length < 4) return null
    return {
      h: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
      v: { x: (pts[1].x + pts[2].x) / 2, y: (pts[1].y + pts[2].y) / 2 },
    }
  })

  const drawSurfacePreviewScreen = computed(() => {
    const pts = drawSurfacePoints?.value ?? []
    const hover = drawSurfaceHoverCm?.value
    const layout = contentLayout.value
    if (!layout || (pts.length === 0 && !hover)) return null
    const { toStagePoint } = layoutTransform(layout)
    const toScreen = (p: Point2D) => {
      const stage = toStagePoint(p.x, p.y)
      return {
        x: viewPosition.value.x + stage.x * viewScale.value,
        y: viewPosition.value.y + stage.y * viewScale.value,
      }
    }
    const screen = pts.map(toScreen)
    if (hover) screen.push(toScreen(hover))
    return screen.length > 0 ? screen : null
  })

  const drawSurfacePreviewPolyline = computed(() => {
    if (!drawSurfacePreviewScreen.value) return ''
    return drawSurfacePreviewScreen.value.map((point) => `${point.x},${point.y}`).join(' ')
  })

  const drawLinePreviewScreen = computed(() => {
    const pts = drawLinePoints?.value
    const layout = contentLayout.value
    if (!pts || pts.length === 0 || !layout) return null
    const { toStagePoint } = layoutTransform(layout)
    const placed = pts.map((p) => {
      const stage = toStagePoint(p.x, p.y)
      return {
        x: viewPosition.value.x + stage.x * viewScale.value,
        y: viewPosition.value.y + stage.y * viewScale.value,
      }
    })
    const hover = drawLineHoverCm?.value
    let hoverScreen: { x: number; y: number } | null = null
    if (hover) {
      const stage = toStagePoint(hover.x, hover.y)
      hoverScreen = {
        x: viewPosition.value.x + stage.x * viewScale.value,
        y: viewPosition.value.y + stage.y * viewScale.value,
      }
    }
    return { placed, hover: hoverScreen }
  })

  const drawLinePreviewPolyline = computed(() => {
    const preview = drawLinePreviewScreen.value
    if (!preview) return ''
    const pts = [...preview.placed]
    if (preview.hover) pts.push(preview.hover)
    return pts.map((point) => `${point.x},${point.y}`).join(' ')
  })

  function cmToScreen(x: number, y: number): { x: number; y: number } {
    const layout = contentLayout.value
    if (!layout) return { x: 0, y: 0 }
    const { toStagePoint } = layoutTransform(layout)
    const stage = toStagePoint(x, y)
    return {
      x: viewPosition.value.x + stage.x * viewScale.value,
      y: viewPosition.value.y + stage.y * viewScale.value,
    }
  }

  return {
    drawWallPreviewScreen,
    drawRoomPreviewScreen,
    drawRoomPreviewPolygon,
    drawWallMeasureLabel,
    drawRoomMeasureLabels,
    drawSurfacePreviewScreen,
    drawSurfacePreviewPolyline,
    drawLinePreviewScreen,
    drawLinePreviewPolyline,
    cmToScreen,
  }
}
