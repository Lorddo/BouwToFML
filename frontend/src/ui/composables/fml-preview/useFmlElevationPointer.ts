import type { Ref } from 'vue'
import type { Point2D } from '@/core/fml/types'
import type { ContentLayout } from './useFmlPreviewViewport'
import { layoutTransform } from './useFmlPreviewViewport'

export function elevationClientToCm(
  clientX: number,
  clientY: number,
  container: HTMLElement | null,
  viewScale: number,
  viewPosition: { x: number; y: number },
  layout: ContentLayout | null,
): Point2D | null {
  if (!container || !layout) return null
  const rect = container.getBoundingClientRect()
  const local = {
    x: (clientX - rect.left - viewPosition.x) / viewScale,
    y: (clientY - rect.top - viewPosition.y) / viewScale,
  }
  return layoutTransform(layout).toCmPoint(local.x, local.y)
}

export function elevationPointerCm(
  event: {
    evt?: MouseEvent
    target?: {
      getStage?: () => { getPointerPosition?: () => { x: number; y: number } | null } | null
    }
  },
  viewScale: number,
  viewPosition: { x: number; y: number },
  toCmPoint: (x: number, y: number) => Point2D,
): Point2D | null {
  const stage = event.target?.getStage?.()
  const pos = stage?.getPointerPosition?.()
  if (!pos) return null
  const local = {
    x: (pos.x - viewPosition.x) / viewScale,
    y: (pos.y - viewPosition.y) / viewScale,
  }
  return toCmPoint(local.x, local.y)
}

export function useFmlElevationPointer(options: {
  containerRef: Ref<HTMLElement | null>
  viewScale: Ref<number>
  viewPosition: Ref<{ x: number; y: number }>
  contentLayout: Ref<ContentLayout | null>
  toCmPoint: (x: number, y: number) => Point2D
}): {
  clientToCm: (clientX: number, clientY: number) => Point2D | null
  pointerCm: (event: {
    evt?: MouseEvent
    target?: {
      getStage?: () => { getPointerPosition?: () => { x: number; y: number } | null } | null
    }
  }) => Point2D | null
} {
  function clientToCm(clientX: number, clientY: number): Point2D | null {
    return elevationClientToCm(
      clientX,
      clientY,
      options.containerRef.value,
      options.viewScale.value,
      options.viewPosition.value,
      options.contentLayout.value,
    )
  }

  function pointerCm(event: {
    evt?: MouseEvent
    target?: {
      getStage?: () => { getPointerPosition?: () => { x: number; y: number } | null } | null
    }
  }): Point2D | null {
    return elevationPointerCm(
      event,
      options.viewScale.value,
      options.viewPosition.value,
      options.toCmPoint,
    )
  }

  return { clientToCm, pointerCm }
}
