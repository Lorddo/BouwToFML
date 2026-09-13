import { ref, type Ref } from 'vue'
import {
  hitTestDimensionEndpointAtCm,
  moveDimensionEndpointAlongAxis,
  offsetDimensionForSlide,
  snapDimensionSlideToParallel,
  type DimensionEnd,
} from '@/core/fml/offset-dimension-line'
import { filterManualDimensions, readPlanSlices } from '@/core/fml/plan-slices'
import type { FloorDimension, Point2D } from '@/core/fml/types'
import {
  MANUAL_DIM_FACE_SNAP_CM,
  snapDrawPointWithManualDimensions,
} from '@/ui/components/plan-canvas-wall-face-snap'
import type { usePlanEditor } from '@/ui/composables/usePlanEditor'
import type { PlanCanvasSelectionRefs } from './plan-canvas-selection'

type EditorApi = ReturnType<typeof usePlanEditor>

export function usePlanCanvasDimensionDrag(options: {
  clientToCm: (clientX: number, clientY: number) => Point2D | null
  editor: EditorApi
  selection: Pick<PlanCanvasSelectionRefs, 'moveDimensionId' | 'hoveredDimensionId'>
  spacePressed: Ref<boolean>
  syncPlanToParent: () => void
}) {
  const { clientToCm, editor, selection, spacePressed, syncPlanToParent } = options
  const draggingDimension = ref(false)
  const draggingDimensionEnd = ref<DimensionEnd | null>(null)

  let dimDrag: {
    id: string
    base: FloorDimension
    startCm: Point2D
    end: DimensionEnd | null
  } | null = null

  let pending: {
    id: string
    startClientX: number
    startClientY: number
    onMove: (event: MouseEvent) => void
    onUp: () => void
  } | null = null

  function manuals(): FloorDimension[] {
    const floor = editor.localPlan.value?.floors[editor.floorIndex.value]
    return filterManualDimensions(editor.dimensions.value, readPlanSlices(floor))
  }

  function cancelPending(): void {
    if (!pending) return
    window.removeEventListener('pointermove', pending.onMove)
    window.removeEventListener('pointerup', pending.onUp)
    pending = null
  }

  function startPending(id: string, event: MouseEvent): void {
    cancelPending()
    const startClientX = event.clientX
    const startClientY = event.clientY
    const onMove = (moveEvent: MouseEvent) => {
      if (!pending) return
      const dist = Math.hypot(moveEvent.clientX - startClientX, moveEvent.clientY - startClientY)
      if (dist < 4) return
      cancelPending()
      beginDrag(id, moveEvent)
    }
    const onUp = () => {
      cancelPending()
    }
    pending = { id, startClientX, startClientY, onMove, onUp }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
  }

  function beginDrag(id: string, event: MouseEvent): void {
    if (spacePressed.value) return
    cancelPending()
    const cm = clientToCm(event.clientX, event.clientY)
    if (!cm) return
    const dim = editor.dimensions.value.find((item) => item.id === id)
    if (!dim) return
    editor.pushUndo()
    draggingDimension.value = true
    draggingDimensionEnd.value = null
    selection.moveDimensionId.value = id
    dimDrag = { id, base: { ...dim, a: { ...dim.a }, b: { ...dim.b } }, startCm: cm, end: null }
    window.addEventListener('pointermove', onDragMove)
    window.addEventListener('pointerup', endDrag, { once: true })
  }

  function beginEndpointDrag(id: string, end: DimensionEnd, event: MouseEvent): void {
    if (spacePressed.value) return
    cancelPending()
    const cm = clientToCm(event.clientX, event.clientY)
    if (!cm) return
    const dim = editor.dimensions.value.find((item) => item.id === id)
    if (!dim) return
    editor.pushUndo()
    draggingDimension.value = true
    draggingDimensionEnd.value = end
    selection.moveDimensionId.value = id
    dimDrag = { id, base: { ...dim, a: { ...dim.a }, b: { ...dim.b } }, startCm: cm, end }
    window.addEventListener('pointermove', onDragMove)
    window.addEventListener('pointerup', endDrag, { once: true })
  }

  function snapEndpointPoint(id: string, cm: Point2D, snapDisabled: boolean): Point2D {
    return snapDrawPointWithManualDimensions(editor.walls.value, manuals(), cm, {
      snapDisabled,
      radiusCm: MANUAL_DIM_FACE_SNAP_CM,
      excludeDimensionId: id,
    })
  }

  function onDragMove(event: MouseEvent): void {
    if (!dimDrag) return
    const cm = clientToCm(event.clientX, event.clientY)
    if (!cm) return
    const snapDisabled = event.ctrlKey || event.metaKey
    if (dimDrag.end) {
      const snapped = snapEndpointPoint(dimDrag.id, cm, snapDisabled)
      const next = moveDimensionEndpointAlongAxis(dimDrag.base, dimDrag.end, snapped)
      editor.updateDimension(dimDrag.id, { a: next.a, b: next.b })
      return
    }
    let next = offsetDimensionForSlide(dimDrag.base, {
      x: cm.x - dimDrag.startCm.x,
      y: cm.y - dimDrag.startCm.y,
    })
    if (!snapDisabled) {
      next = snapDimensionSlideToParallel(next, manuals(), MANUAL_DIM_FACE_SNAP_CM, dimDrag.id)
    }
    editor.updateDimension(dimDrag.id, { a: next.a, b: next.b })
  }

  function endDrag(): void {
    window.removeEventListener('pointermove', onDragMove)
    if (dimDrag) syncPlanToParent()
    dimDrag = null
    draggingDimension.value = false
    draggingDimensionEnd.value = null
  }

  function cleanup(): void {
    endDrag()
    cancelPending()
  }

  return {
    draggingDimension,
    draggingDimensionEnd,
    startPending,
    beginDrag,
    beginEndpointDrag,
    cancelPending,
    cleanup,
    manuals,
    hitTestEndpoint: (cm: Point2D, tolCm: number) =>
      hitTestDimensionEndpointAtCm(cm, manuals(), tolCm),
  }
}
