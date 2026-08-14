import { computed, ref, watch, type Ref } from 'vue'
import { applyNulpunt } from '@/core/fml/translate-floor-plan'
import type { FloorPlan, Point2D } from '@/core/fml/types'
import type { PreviewUnderlayLayout } from '@/ui/composables/project/types'
import type { useFmlPreviewEditor } from '@/ui/composables/useFmlPreviewEditor'

type EditorApi = ReturnType<typeof useFmlPreviewEditor>

const NULPUNT_HIT_RADIUS_CM = 12
const NULPUNT_EPS_CM = 0.05

interface NulpuntHitTestApi {
  clientToCm: (clientX: number, clientY: number) => Point2D | null
}

export type AppliedNulpunt = {
  plan: FloorPlan
  layout: PreviewUnderlayLayout
  nulpuntImageCm: Point2D
  /** Delta die op muren is toegepast (−P); contentLayout moet +delta nudgen. */
  wallDeltaCm: Point2D
}

/**
 * FML nulpunt-tool — alleen de actieve floor in het plan.
 *
 * Bake: applyNulpunt(localPlan, floorIndex) → replaceLocalPlan → setNulpunt → sync.
 * Viewport: nudge i.p.v. refit zodat de tekening niet over het scherm springt.
 */
export function useFmlPreviewNulpunt(options: {
  hitTest: NulpuntHitTestApi
  editor: EditorApi
  nulpuntMode: Ref<boolean>
  getUnderlayLayout: () => PreviewUnderlayLayout | null
  /** Actieve floor in localPlan (workspace preview = meestal 0). */
  getFloorIndex: () => number
  setFmlNulpuntImageCm: (point: Point2D | null) => void
  markParentPlanSync: () => void
  nudgeContentLayout: (dxCm: number, dyCm: number) => void
  beforeBegin: () => void
}) {
  const nulpuntPendingCm = ref<Point2D | null>(null)
  const nulpuntDragging = ref(false)

  const nulpuntDisplayCm = computed((): Point2D => {
    return nulpuntPendingCm.value ?? { x: 0, y: 0 }
  })

  const nulpuntHasPending = computed(() => {
    const p = nulpuntPendingCm.value
    if (!p) return false
    return Math.hypot(p.x, p.y) >= NULPUNT_EPS_CM
  })

  const nulpuntShowBakeActions = computed(() => nulpuntHasPending.value && !nulpuntDragging.value)

  watch(
    () => options.nulpuntMode.value,
    (on) => {
      if (!on) {
        cancelNulpuntPending()
      }
    },
    { flush: 'sync' },
  )

  function stopDragListeners(): void {
    window.removeEventListener('mousemove', onNulpuntPointerMove)
    window.removeEventListener('mouseup', onNulpuntPointerUp)
    nulpuntDragging.value = false
  }

  function cancelNulpuntPending(): void {
    stopDragListeners()
    nulpuntPendingCm.value = null
  }

  function hitTestNulpuntAtCm(cm: Point2D): boolean {
    const marker = nulpuntDisplayCm.value
    return Math.hypot(cm.x - marker.x, cm.y - marker.y) <= NULPUNT_HIT_RADIUS_CM
  }

  function beginNulpuntDrag(event: MouseEvent): boolean {
    if (!options.nulpuntMode.value) return false
    const cm = options.hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return false
    stopDragListeners()
    options.beforeBegin()
    nulpuntDragging.value = true
    nulpuntPendingCm.value = hitTestNulpuntAtCm(cm) ? { ...nulpuntDisplayCm.value } : { ...cm }
    window.addEventListener('mousemove', onNulpuntPointerMove)
    window.addEventListener('mouseup', onNulpuntPointerUp, { once: true })
    return true
  }

  function onNulpuntPointerMove(event: MouseEvent): void {
    if (!nulpuntDragging.value) return
    const cm = options.hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return
    nulpuntPendingCm.value = { ...cm }
  }

  function onNulpuntPointerUp(event: MouseEvent): void {
    window.removeEventListener('mousemove', onNulpuntPointerMove)
    if (!nulpuntDragging.value) return
    nulpuntDragging.value = false
    const dropCm =
      options.hitTest.clientToCm(event.clientX, event.clientY) ?? nulpuntPendingCm.value
    if (!dropCm) {
      nulpuntPendingCm.value = null
      return
    }
    if (Math.hypot(dropCm.x, dropCm.y) < NULPUNT_EPS_CM) {
      nulpuntPendingCm.value = null
      return
    }
    nulpuntPendingCm.value = { ...dropCm }
  }

  function confirmNulpuntBake(): AppliedNulpunt | null {
    const dropCm = nulpuntPendingCm.value
    if (!dropCm || Math.hypot(dropCm.x, dropCm.y) < NULPUNT_EPS_CM) {
      nulpuntPendingCm.value = null
      return null
    }

    const layout = options.getUnderlayLayout()
    const plan = options.editor.localPlan.value
    if (!layout || !plan) {
      console.error('[nulpunt] bake aborted: missing plan or layout', {
        hasPlan: !!plan,
        hasLayout: !!layout,
      })
      return null
    }

    const floorIndex = options.getFloorIndex()
    const applied = applyNulpunt(plan, layout, dropCm, floorIndex)

    options.editor.pushUndo({ layoutOrigin: { ...layout.origin } })
    options.editor.prepareParentSync()
    options.markParentPlanSync()

    nulpuntPendingCm.value = null

    options.editor.replaceLocalPlan(applied.plan, {
      keepUndo: true,
      keepParentSyncSkip: true,
    })
    options.setFmlNulpuntImageCm(applied.nulpuntImageCm)
    // Muren gingen −P; layout-min moet mee −P zodat schermpositie gelijk blijft.
    options.nudgeContentLayout(-dropCm.x, -dropCm.y)

    return {
      plan: applied.plan,
      layout: {
        origin: { ...applied.layout.origin },
        pxPerMmX: applied.layout.pxPerMmX,
        pxPerMmY: applied.layout.pxPerMmY,
      },
      nulpuntImageCm: { ...applied.nulpuntImageCm },
      wallDeltaCm: { x: -dropCm.x, y: -dropCm.y },
    }
  }

  function isDragging(): boolean {
    return nulpuntDragging.value
  }

  return {
    nulpuntPendingCm,
    nulpuntDisplayCm,
    nulpuntHasPending,
    nulpuntShowBakeActions,
    beginNulpuntDrag,
    cancelNulpuntPending,
    cancelNulpuntDrag: cancelNulpuntPending,
    confirmNulpuntBake,
    isDragging,
    hitTestNulpuntAtCm,
  }
}
