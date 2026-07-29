import { ref, computed, type Ref } from 'vue'
import {
  applyInkOverlayBrush,
  applyInkOverlayErase,
  applyInkOverlayLine,
  applyInkOverlayRect,
  inkOverlayHasEdits,
} from '@/cv/preprocess/compose-wall-bw'
import { createByteArrayHistory } from '@/cv/tools/maskHistory'
import type { InkRectBounds, InkStrokePoint } from '@/cv/tools/inkEdit'
import type { InkToolId } from '@/ui/components/canvas/canvas-toolbelt.types'
import type { WorkspaceFlowStep } from './workspace/constants'
import { isUndoKey } from './workspace/isUndoKey'
import type { WorkspaceWallBwCompose } from './workspace/useWorkspaceWallBwCompose'

export function useWorkspaceInkEdit(deps: {
  flowStep: Ref<WorkspaceFlowStep>
  wallBw: WorkspaceWallBwCompose
  /** Zorg dat baseBw bestaat vóór stroke (async rebuild). */
  ensureWallBwReady: () => Promise<boolean>
  onInkChanged?: () => void
}) {
  const activeInkTool = ref<InkToolId | null>(null)
  const brushSizePx = ref(4)
  const inkEditTouched = ref(false)
  const inkEditStale = ref(false)
  const editHistory = createByteArrayHistory({ maxSteps: 30 })
  const canUndoInkEdit = ref(false)

  const inkToolbeltVisible = computed(
    () => deps.flowStep.value === 'preprocess' || deps.flowStep.value === 'templates',
  )

  const canvasInkTool = computed(() => (inkToolbeltVisible.value ? activeInkTool.value : null))

  function syncCanUndo() {
    canUndoInkEdit.value = editHistory.canUndo()
  }

  function ensureOverlay(): { overlay: Uint8Array; width: number; height: number } | null {
    const w = deps.wallBw.baseBwWidth.value
    const h = deps.wallBw.baseBwHeight.value
    if (w <= 0 || h <= 0) return null
    const overlay = deps.wallBw.ensureInkOverlaySize(w, h)
    return { overlay, width: w, height: h }
  }

  function pushUndoSnapshot() {
    const state = ensureOverlay()
    if (!state) return
    editHistory.push(state.overlay)
    syncCanUndo()
  }

  function notifyChanged() {
    inkEditTouched.value = inkOverlayHasEdits(deps.wallBw.inkOverlay.value)
    if (deps.flowStep.value === 'templates') {
      inkEditStale.value = true
    }
    deps.onInkChanged?.()
  }

  async function withOverlay(
    run: (overlay: Uint8Array, width: number, height: number) => void,
  ): Promise<void> {
    const ready = await deps.ensureWallBwReady()
    if (!ready) return
    const state = ensureOverlay()
    if (!state) return
    pushUndoSnapshot()
    run(state.overlay, state.width, state.height)
    notifyChanged()
  }

  function onInkBrushStroke(points: InkStrokePoint[], radius: number) {
    void withOverlay((overlay, width, height) => {
      applyInkOverlayBrush(overlay, width, height, points, radius)
    })
  }

  function onInkEraseStroke(points: InkStrokePoint[], radius: number) {
    void withOverlay((overlay, width, height) => {
      applyInkOverlayErase(overlay, width, height, points, radius)
    })
  }

  function onInkLine(start: InkStrokePoint, end: InkStrokePoint, lineWidth: number) {
    void withOverlay((overlay, width, height) => {
      applyInkOverlayLine(overlay, width, height, start, end, lineWidth)
    })
  }

  function onInkRect(bounds: InkRectBounds, lineWidth: number) {
    void withOverlay((overlay, width, height) => {
      applyInkOverlayRect(overlay, width, height, bounds, lineWidth)
    })
  }

  function undoInkEdit() {
    const state = ensureOverlay()
    if (!state || !editHistory.undo(state.overlay)) return
    inkEditTouched.value = inkOverlayHasEdits(state.overlay)
    if (deps.flowStep.value === 'templates') {
      inkEditStale.value = true
    }
    syncCanUndo()
    deps.onInkChanged?.()
  }

  function onInkUndoKeydown(event: KeyboardEvent) {
    if (!inkToolbeltVisible.value) return
    if (!isUndoKey(event) || !canUndoInkEdit.value) return
    event.preventDefault()
    undoInkEdit()
  }

  function clearInkEditState() {
    activeInkTool.value = null
    inkEditTouched.value = false
    inkEditStale.value = false
    editHistory.clear()
    syncCanUndo()
  }

  function resetInkEdit() {
    deps.wallBw.clearInkOverlay()
    clearInkEditState()
  }

  function clearInkEditStale() {
    inkEditStale.value = false
  }

  /**
   * Stap 2 afronden: live ink → baseBw (+ bakedInkOverlay); overlay leeg.
   * Geen bake naar kleur-onderlegger (FML-underlay blijft kleur).
   * Buiten preprocess: alleen touched-flag sync.
   */
  async function commitInkEdits(): Promise<void> {
    if (deps.flowStep.value === 'preprocess') {
      const ready = await deps.ensureWallBwReady()
      if (ready) {
        deps.wallBw.bakeInkIntoBase()
      }
      inkEditTouched.value = false
      inkEditStale.value = false
      editHistory.clear()
      syncCanUndo()
      return
    }
    inkEditTouched.value = inkOverlayHasEdits(deps.wallBw.inkOverlay.value)
  }

  return {
    activeInkTool,
    brushSizePx,
    inkEditTouched,
    inkEditStale,
    canUndoInkEdit,
    inkToolbeltVisible,
    canvasInkTool,
    onInkBrushStroke,
    onInkEraseStroke,
    onInkLine,
    onInkRect,
    undoInkEdit,
    onInkUndoKeydown,
    resetInkEdit,
    clearInkEditStale,
    commitInkEdits,
  }
}
