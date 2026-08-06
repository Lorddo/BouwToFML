import { ref, type Ref } from 'vue'
import type { Point2D } from '@/core/fml/types'
import type { useFmlPreviewEditor } from '@/ui/composables/useFmlPreviewEditor'
import type { FmlPreviewSelectionRefs } from './fml-preview-selection'

type EditorApi = ReturnType<typeof useFmlPreviewEditor>

interface OpeningDragHitTestApi {
  clientToCm: (clientX: number, clientY: number) => Point2D | null
}

export function useFmlPreviewOpeningDrag(options: {
  hitTest: OpeningDragHitTestApi
  editor: EditorApi
  selection: Pick<FmlPreviewSelectionRefs, 'moveOpeningId'>
  spacePressed: Ref<boolean>
  syncPlanToParent: () => void
}) {
  const { hitTest, editor, selection, spacePressed, syncPlanToParent } = options
  const { moveOpeningId } = selection

  const draggingOpening = ref(false)

  let openingDrag: {
    openingId: string
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
    window.removeEventListener('mousemove', openingDragPending.onMove)
    window.removeEventListener('mouseup', openingDragPending.onUp)
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
      beginOpeningDrag(openingId, moveEvent)
    }
    const onUp = () => {
      cancelOpeningDragPending()
    }
    openingDragPending = { openingId, startClientX, startClientY, onMove, onUp }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp, { once: true })
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
    openingDrag = { openingId }
    window.addEventListener('mousemove', onOpeningDragMove)
    window.addEventListener('mouseup', onOpeningDragEnd, { once: true })
    onOpeningDragMove(event)
  }

  function onOpeningDragMove(event: MouseEvent): void {
    if (!openingDrag) return
    const cm = hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return
    const nextId = editor.applyOpeningDragMove(openingDrag.openingId, cm)
    if (!nextId) return
    if (nextId !== openingDrag.openingId) {
      openingDrag.openingId = nextId
      moveOpeningId.value = nextId
    }
  }

  function endOpeningDrag(): void {
    window.removeEventListener('mousemove', onOpeningDragMove)
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
