import { ref, type Ref } from 'vue'
import type { Point2D } from '@/core/fml/types'
import type { useFmlPreviewEditor } from '@/ui/composables/useFmlPreviewEditor'
import type { RenderJunction } from './useFmlPreviewRenderModel'

type EditorApi = ReturnType<typeof useFmlPreviewEditor>

interface DrawWallHitTestApi {
  hitTestJunctionAtCm: (cm: Point2D) => RenderJunction | null
  clientToCm: (clientX: number, clientY: number) => Point2D | null
}

export function useFmlPreviewDrawWall(options: {
  hitTest: DrawWallHitTestApi
  editor: EditorApi
  hoveredJunctionId: Ref<string | null>
  wallThicknessDraft: Ref<number>
  resolvePoint: (cm: Point2D, axisAnchor?: Point2D) => Point2D
  beforeBegin: () => void
  syncPlanToParent: () => void
}) {
  const drawWallPreview = ref<{ a: Point2D; b: Point2D } | null>(null)
  let drawWallDrag: { startCm: Point2D } | null = null

  function cancelDrawWallDrag(): void {
    window.removeEventListener('mousemove', onDrawWallPointerMove)
    drawWallDrag = null
    drawWallPreview.value = null
  }

  function beginDrawWall(event: MouseEvent): void {
    const cm = options.hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return
    cancelDrawWallDrag()
    options.beforeBegin()
    const startCm = options.resolvePoint(cm)
    drawWallDrag = { startCm }
    drawWallPreview.value = { a: startCm, b: startCm }
    window.addEventListener('mousemove', onDrawWallPointerMove)
    window.addEventListener('mouseup', onDrawWallPointerUp, { once: true })
  }

  function onDrawWallPointerMove(event: MouseEvent): void {
    if (!drawWallDrag) return
    const cm = options.hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return
    const endCm = options.resolvePoint(cm, drawWallDrag.startCm)
    drawWallPreview.value = { a: drawWallDrag.startCm, b: endCm }
    const junction = options.hitTest.hitTestJunctionAtCm(cm)
    options.hoveredJunctionId.value = junction?.id ?? null
  }

  function onDrawWallPointerUp(event: MouseEvent): void {
    window.removeEventListener('mousemove', onDrawWallPointerMove)
    const drag = drawWallDrag
    drawWallDrag = null
    const preview = drawWallPreview.value
    drawWallPreview.value = null
    options.hoveredJunctionId.value = null
    if (!drag || !preview) return

    const endCm = options.resolvePoint(
      options.hitTest.clientToCm(event.clientX, event.clientY) ?? preview.b,
      drag.startCm,
    )
    options.editor.pushUndo()
    const wallId = options.editor.applyWallAdd(
      drag.startCm,
      endCm,
      options.wallThicknessDraft.value,
    )
    if (!wallId) {
      options.editor.undo()
      return
    }
    options.syncPlanToParent()
  }

  return {
    drawWallPreview,
    isDragging: () => drawWallDrag != null,
    beginDrawWall,
    cancelDrawWallDrag,
  }
}
