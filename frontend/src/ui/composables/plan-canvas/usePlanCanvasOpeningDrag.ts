import { ref, type Ref } from 'vue'
import type { Point2D } from '@/core/plan/types'
import type { usePlanEditor } from '@/ui/composables/usePlanEditor'
import {
  openingDragPointerWithGrab,
  openingGrabOffsetCm,
} from '@/ui/components/plan-canvas-opening-drag-geom'
import type { PlanCanvasSelectionRefs } from './plan-canvas-selection'

type EditorApi = ReturnType<typeof usePlanEditor>

interface OpeningDragHitTestApi {
  clientToCm: (clientX: number, clientY: number) => Point2D | null
}

export function usePlanCanvasOpeningDrag(options: {
  hitTest: OpeningDragHitTestApi
  editor: EditorApi
  selection: Pick<PlanCanvasSelectionRefs, 'moveOpeningId'>
  spacePressed: Ref<boolean>
  syncPlanToParent: () => void
}) {
  const { hitTest, editor, selection, spacePressed, syncPlanToParent } = options
  const { moveOpeningId } = selection

  const draggingOpening = ref(false)

  let openingDrag: {
    openingId: string
    /** Pointer − centrum bij start; voorkomt spring naar muis. */
    grabOffsetCm: Point2D
  } | null = null

  let openingDragPending: {
    openingId: string
    startClientX: number
    startClientY: number
    onMove: (event: MouseEvent) => void
    onUp: () => void
  } | null = null

  function cancelOpeningDragPending(): void {
    if (!openingDragPending) return
    window.removeEventListener('pointermove', openingDragPending.onMove)
    window.removeEventListener('pointerup', openingDragPending.onUp)
    openingDragPending = null
  }

  function startOpeningDragPending(openingId: string, event: MouseEvent): void {
    cancelOpeningDragPending()
    const startClientX = event.clientX
    const startClientY = event.clientY
    const onMove = (moveEvent: MouseEvent) => {
      if (!openingDragPending) return
      const dist = Math.hypot(moveEvent.clientX - startClientX, moveEvent.clientY - startClientY)
      if (dist < 4) return
      cancelOpeningDragPending()
      // Vastpak vanaf de oorspronkelijke down, niet de slop-positie.
      beginOpeningDrag(openingId, {
        clientX: startClientX,
        clientY: startClientY,
      } as MouseEvent)
      onOpeningDragMove(moveEvent)
    }
    const onUp = () => {
      cancelOpeningDragPending()
    }
    openingDragPending = { openingId, startClientX, startClientY, onMove, onUp }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
  }

  function beginOpeningDrag(openingId: string, event: MouseEvent): void {
    cancelOpeningDragPending()
    if (spacePressed.value) return
    const cm = hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return
    const located = editor.resolveOpening(openingId)
    if (!located) return
    const len = Math.hypot(located.wall.b.x - located.wall.a.x, located.wall.b.y - located.wall.a.y)
    if (len < 1e-6) return
    editor.pushUndo()
    moveOpeningId.value = openingId
    draggingOpening.value = true
    openingDrag = {
      openingId,
      grabOffsetCm: openingGrabOffsetCm(located.wall, located.opening.t, cm),
    }
    window.addEventListener('pointermove', onOpeningDragMove)
    window.addEventListener('pointerup', onOpeningDragEnd, { once: true })
  }

  function onOpeningDragMove(event: MouseEvent): void {
    if (!openingDrag) return
    const cm = hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return
    const adjusted = openingDragPointerWithGrab(cm, openingDrag.grabOffsetCm)
    const nextId = editor.applyOpeningDragMove(openingDrag.openingId, adjusted)
    if (!nextId) return
    if (nextId !== openingDrag.openingId) {
      openingDrag.openingId = nextId
      moveOpeningId.value = nextId
    }
  }

  function endOpeningDrag(): void {
    window.removeEventListener('pointermove', onOpeningDragMove)
    if (openingDrag) {
      syncPlanToParent()
    }
    openingDrag = null
    draggingOpening.value = false
  }

  function onOpeningDragEnd(): void {
    endOpeningDrag()
  }

  function cleanupOpeningDrag(): void {
    cancelOpeningDragPending()
    endOpeningDrag()
  }

  return {
    draggingOpening,
    cancelOpeningDragPending,
    startOpeningDragPending,
    beginOpeningDrag,
    cleanupOpeningDrag,
  }
}
