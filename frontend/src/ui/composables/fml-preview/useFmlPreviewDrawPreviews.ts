import { computed, type Ref } from 'vue'
import type { Point2D } from '@/core/fml/types'
import { layoutTransform, type ContentLayout } from './useFmlPreviewViewport'

export function useFmlPreviewDrawPreviews(opts: {
  drawWallPreview: Ref<{ a: Point2D; b: Point2D } | null>
  drawRoomPreview: Ref<Point2D[] | null>
  contentLayout: Ref<ContentLayout | null>
  viewPosition: Ref<{ x: number; y: number }>
  viewScale: Ref<number>
}) {
  const { drawWallPreview, drawRoomPreview, contentLayout, viewPosition, viewScale } = opts

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
    cmToScreen,
  }
}
