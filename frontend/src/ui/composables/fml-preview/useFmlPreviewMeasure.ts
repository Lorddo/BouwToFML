import { ref, type Ref } from 'vue'
import type { Point2D } from '@/core/fml/types'
import type { RenderJunction } from './useFmlPreviewRenderModel'
import {
  type MeasureLine,
  measureDistanceCm,
} from './fml-preview-measure'

let measureIdCounter = 0

interface MeasureHitTestApi {
  hitTestJunctionAtCm: (cm: Point2D) => RenderJunction | null
  clientToCm: (clientX: number, clientY: number) => Point2D | null
}

export function useFmlPreviewMeasure(options: {
  hitTest: MeasureHitTestApi
  hoveredJunctionId: Ref<string | null>
  resolvePoint: (cm: Point2D, axisAnchor?: Point2D) => Point2D
  beforeBegin: () => void
}) {
  const measurePreview = ref<{ a: Point2D; b: Point2D } | null>(null)
  const measureLines = ref<MeasureLine[]>([])
  let measureDrag: { startCm: Point2D } | null = null

  function cancelMeasureDrag(): void {
    window.removeEventListener('mousemove', onMeasurePointerMove)
    measureDrag = null
    measurePreview.value = null
  }

  function beginMeasure(event: MouseEvent): void {
    const cm = options.hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return
    cancelMeasureDrag()
    options.beforeBegin()
    const startCm = options.resolvePoint(cm)
    measureDrag = { startCm }
    measurePreview.value = { a: startCm, b: startCm }
    window.addEventListener('mousemove', onMeasurePointerMove)
    window.addEventListener('mouseup', onMeasurePointerUp, { once: true })
  }

  function onMeasurePointerMove(event: MouseEvent): void {
    if (!measureDrag) return
    const cm = options.hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return
    const endCm = options.resolvePoint(cm, measureDrag.startCm)
    measurePreview.value = { a: measureDrag.startCm, b: endCm }
    const junction = options.hitTest.hitTestJunctionAtCm(cm)
    options.hoveredJunctionId.value = junction?.id ?? null
  }

  function onMeasurePointerUp(event: MouseEvent): void {
    window.removeEventListener('mousemove', onMeasurePointerMove)
    const drag = measureDrag
    measureDrag = null
    const preview = measurePreview.value
    measurePreview.value = null
    options.hoveredJunctionId.value = null
    if (!drag || !preview) return

    const endCm = options.resolvePoint(
      options.hitTest.clientToCm(event.clientX, event.clientY) ?? preview.b,
      drag.startCm,
    )
    if (measureDistanceCm(drag.startCm, endCm) < 1) return

    measureLines.value = [
      ...measureLines.value,
      {
        id: `measure-${++measureIdCounter}`,
        a: drag.startCm,
        b: endCm,
      },
    ]
  }

  function clearMeasureLines(): void {
    measureLines.value = []
  }

  return {
    measurePreview,
    measureLines,
    isDragging: () => measureDrag != null,
    beginMeasure,
    cancelMeasureDrag,
    clearMeasureLines,
  }
}
