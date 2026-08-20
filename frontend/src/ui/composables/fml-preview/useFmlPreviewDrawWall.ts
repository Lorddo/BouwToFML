import { computed, ref, type Ref } from 'vue'
import type { Point2D } from '@/core/fml/types'
import type { useFmlPreviewEditor } from '@/ui/composables/useFmlPreviewEditor'
import { endFromDirection } from './fml-preview-draw-measure'
import type { RenderJunction } from './useFmlPreviewRenderModel'

type EditorApi = ReturnType<typeof useFmlPreviewEditor>

interface DrawWallHitTestApi {
  hitTestJunctionAtCm: (cm: Point2D) => RenderJunction | null
  clientToCm: (clientX: number, clientY: number) => Point2D | null
}

/**
 * Muurtekenen: klik → verplaats → klik (of typ lengte + Enter).
 * Geen pointerup-commit; rubber-band via hover.
 */
export function useFmlPreviewDrawWall(options: {
  hitTest: DrawWallHitTestApi
  editor: EditorApi
  hoveredJunctionId: Ref<string | null>
  wallThicknessDraft: Ref<number>
  resolvePoint: (cm: Point2D, axisAnchor?: Point2D) => Point2D
  beforeBegin: () => void
  syncPlanToParent: () => void
  onPlaced?: () => void
}) {
  const drawWallPreview = ref<{ a: Point2D; b: Point2D } | null>(null)
  const drafting = ref(false)
  let draft: { startCm: Point2D; hoverCm: Point2D } | null = null
  const lengthOverrideCm = ref<number | null>(null)

  const measureLengthCm = computed(() => {
    const preview = drawWallPreview.value
    if (!preview) return 0
    return Math.hypot(preview.b.x - preview.a.x, preview.b.y - preview.a.y)
  })

  function rebuildPreview(): void {
    if (!draft) {
      drawWallPreview.value = null
      return
    }
    const override = lengthOverrideCm.value
    const endCm =
      override != null && override > 0
        ? endFromDirection(draft.startCm, draft.hoverCm, override)
        : draft.hoverCm
    drawWallPreview.value = { a: draft.startCm, b: endCm }
  }

  function cancelDrawWallDrag(): void {
    draft = null
    drafting.value = false
    lengthOverrideCm.value = null
    drawWallPreview.value = null
    options.hoveredJunctionId.value = null
  }

  function resolveClick(event: MouseEvent): Point2D | null {
    const cm = options.hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return null
    return options.resolvePoint(cm, draft?.startCm)
  }

  function updateDrawWallHover(event: MouseEvent): void {
    if (!draft) return
    const cm = options.hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return
    draft.hoverCm = options.resolvePoint(cm, draft.startCm)
    rebuildPreview()
    const junction = options.hitTest.hitTestJunctionAtCm(cm)
    options.hoveredJunctionId.value = junction?.id ?? null
  }

  function clearDrawWallHover(): void {
    if (!draft) options.hoveredJunctionId.value = null
  }

  function placeWall(endCm: Point2D): boolean {
    if (!draft) return false
    options.editor.pushUndo()
    const wallId = options.editor.applyWallAdd(
      draft.startCm,
      endCm,
      options.wallThicknessDraft.value,
    )
    if (!wallId) {
      options.editor.undo()
      return false
    }
    options.syncPlanToParent()
    cancelDrawWallDrag()
    options.onPlaced?.()
    return true
  }

  function onDrawWallClick(event: MouseEvent): void {
    const locked = resolveClick(event)
    if (!locked) return

    if (!draft) {
      options.beforeBegin()
      draft = { startCm: locked, hoverCm: locked }
      drafting.value = true
      lengthOverrideCm.value = null
      rebuildPreview()
      return
    }

    const endCm =
      lengthOverrideCm.value != null && lengthOverrideCm.value > 0
        ? endFromDirection(draft.startCm, draft.hoverCm, lengthOverrideCm.value)
        : locked
    if (Math.hypot(endCm.x - draft.startCm.x, endCm.y - draft.startCm.y) < 1) return
    placeWall(endCm)
  }

  function setLengthOverrideCm(cm: number | null): void {
    if (!draft) return
    lengthOverrideCm.value = cm != null && Number.isFinite(cm) && cm > 0 ? cm : null
    rebuildPreview()
  }

  function commitFromMeasure(): boolean {
    if (!draft) return false
    const preview = drawWallPreview.value
    if (!preview) return false
    if (Math.hypot(preview.b.x - preview.a.x, preview.b.y - preview.a.y) < 1) return false
    return placeWall(preview.b)
  }

  return {
    drawWallPreview,
    measureLengthCm,
    lengthOverrideCm,
    isDrafting: () => drafting.value,
    /** Esc / legacy alias */
    isDragging: () => drafting.value,
    onDrawWallClick,
    updateDrawWallHover,
    clearDrawWallHover,
    setLengthOverrideCm,
    commitFromMeasure,
    cancelDrawWallDrag,
  }
}
