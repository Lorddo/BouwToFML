import { computed, type ComputedRef, type Ref } from 'vue'
import type { Point2D } from '@/core/fml/types'
import type { usePlanEditor } from '@/ui/composables/usePlanEditor'
import type { PlanCanvasSelectionRefs } from './plan-canvas-selection'
import {
  hitPlanOpeningHandle,
  planOpeningHandlePointsCm,
  resizeOpeningAlongWallFromPointer,
  type PlanOpeningHandleKind,
  type PlanOpeningHandlePoint,
  type PlanOpeningResizeSide,
} from './plan-canvas-opening-handles'
import { PLAN_HANDLE_HIT_COARSE_PX, PLAN_HANDLE_HIT_PX } from './plan-canvas-vertex-hit'

type EditorApi = ReturnType<typeof usePlanEditor>

export function usePlanCanvasOpeningResize(options: {
  editor: EditorApi
  selection: Pick<PlanCanvasSelectionRefs, 'moveOpeningId' | 'settingsOpeningIds'>
  clientToCm: (clientX: number, clientY: number) => Point2D | null
  screenPxToCm: (px: number) => number
  coarseHits?: ComputedRef<boolean> | Ref<boolean>
  inspectMode: ComputedRef<boolean> | Ref<boolean>
  spacePressed: Ref<boolean>
  syncPlanToParent: () => void
  syncOpeningDraftFromSelection?: () => void
}) {
  const { moveOpeningId, settingsOpeningIds } = options.selection

  let resizeDrag: {
    openingId: string
    side: PlanOpeningResizeSide
    startT: number
    startWidth: number
  } | null = null

  const selectedOpeningId = computed(() => {
    if (options.inspectMode.value) return null
    if (moveOpeningId.value) return moveOpeningId.value
    if (settingsOpeningIds.value.length === 1) return settingsOpeningIds.value[0] ?? null
    return null
  })

  const openingHandlesCm = computed((): PlanOpeningHandlePoint[] => {
    const id = selectedOpeningId.value
    if (!id) return []
    const located = options.editor.resolveOpening(id)
    if (!located) return []
    return planOpeningHandlePointsCm(located.wall, located.opening)
  })

  function handleHitTolCm(): number {
    const fine = PLAN_HANDLE_HIT_PX
    const coarse = PLAN_HANDLE_HIT_COARSE_PX
    const px = options.coarseHits?.value === true ? coarse : fine
    return options.screenPxToCm(px)
  }

  function hitHandleAtCm(cm: Point2D): PlanOpeningHandleKind | null {
    const handles = openingHandlesCm.value
    if (handles.length === 0) return null
    return hitPlanOpeningHandle(handles, cm, handleHitTolCm())
  }

  function applyResize(
    openingId: string,
    side: PlanOpeningResizeSide,
    startT: number,
    startWidth: number,
    pointerCm: Point2D,
    snap: boolean,
  ): void {
    const located = options.editor.resolveOpening(openingId)
    if (!located) return
    const next = resizeOpeningAlongWallFromPointer(
      options.editor.walls.value,
      located.wall,
      { t: startT, width: startWidth },
      openingId,
      side,
      pointerCm,
      snap,
    )
    if (Math.abs(next.t - located.opening.t) < 1e-9 && next.width === located.opening.width) {
      return
    }
    options.editor.updateOpening(openingId, { t: next.t, width: next.width })
    options.syncOpeningDraftFromSelection?.()
  }

  function beginOpeningResize(
    openingId: string,
    side: PlanOpeningResizeSide,
    event: MouseEvent,
  ): void {
    if (options.spacePressed.value || options.inspectMode.value) return
    const located = options.editor.resolveOpening(openingId)
    if (!located) return
    options.editor.pushUndo()
    moveOpeningId.value = openingId
    resizeDrag = {
      openingId,
      side,
      startT: located.opening.t,
      startWidth: located.opening.width,
    }
    const onMove = (moveEvent: PointerEvent) => {
      if (!resizeDrag) return
      const cm = options.clientToCm(moveEvent.clientX, moveEvent.clientY)
      if (!cm) return
      const snap = !(moveEvent.ctrlKey || moveEvent.metaKey)
      applyResize(
        resizeDrag.openingId,
        resizeDrag.side,
        resizeDrag.startT,
        resizeDrag.startWidth,
        cm,
        snap,
      )
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      if (resizeDrag) options.syncPlanToParent()
      resizeDrag = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
    const startCm = options.clientToCm(event.clientX, event.clientY)
    if (startCm) {
      const snap = !(event.ctrlKey || event.metaKey)
      applyResize(openingId, side, located.opening.t, located.opening.width, startCm, snap)
    }
  }

  function cleanupOpeningResize(): void {
    resizeDrag = null
  }

  return {
    selectedOpeningId,
    openingHandlesCm,
    hitOpeningHandleAtCm: hitHandleAtCm,
    beginOpeningResize,
    cleanupOpeningResize,
  }
}
