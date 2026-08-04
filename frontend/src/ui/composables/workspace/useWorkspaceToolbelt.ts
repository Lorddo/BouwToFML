import { computed, watch, type ComputedRef, type Ref } from 'vue'
import { resolveInkToolbeltHint } from '@/ui/components/canvas/canvas-toolbelt-hints'
import type { InkToolId, FaceToolId } from '@/ui/components/canvas/canvas-toolbelt.types'
import { tGlobal } from '@/ui/i18n'
import type { WorkspaceFlowStep } from './constants'

export function useWorkspaceToolbelt(deps: {
  inkEdit: {
    activeInkTool: Ref<InkToolId | null>
    inkToolbeltVisible: Ref<boolean>
    inkEditStale: Ref<boolean>
  }
  roomFaces: {
    activeFaceBoxTool: Ref<FaceToolId | null>
    faceToolbeltVisible: Ref<boolean>
    faceToolbeltHint: ComputedRef<string>
  }
  flowStep: Ref<WorkspaceFlowStep>
}) {
  watch(deps.inkEdit.activeInkTool, (tool) => {
    if (tool) deps.roomFaces.activeFaceBoxTool.value = null
  })
  watch(deps.roomFaces.activeFaceBoxTool, (tool) => {
    if (tool) deps.inkEdit.activeInkTool.value = null
  })

  const canvasFaceTool = computed(() =>
    deps.roomFaces.faceToolbeltVisible.value && !deps.inkEdit.activeInkTool.value
      ? deps.roomFaces.activeFaceBoxTool.value
      : null,
  )

  const toolbeltCanvasHint = computed(() => {
    if (!deps.inkEdit.inkToolbeltVisible.value) return ''
    if (deps.inkEdit.inkEditStale.value && deps.flowStep.value === 'templates') {
      return tGlobal('toolbelt.hints.staleUnderlay')
    }
    if (deps.inkEdit.activeInkTool.value) {
      return resolveInkToolbeltHint(deps.inkEdit.activeInkTool.value)
    }
    return deps.roomFaces.faceToolbeltHint.value
  })

  const toolbeltCanvasHintStale = computed(
    () =>
      deps.inkEdit.inkToolbeltVisible.value &&
      deps.inkEdit.inkEditStale.value &&
      deps.flowStep.value === 'templates',
  )

  return {
    canvasFaceTool,
    toolbeltCanvasHint,
    toolbeltCanvasHintStale,
  } satisfies {
    canvasFaceTool: ComputedRef<FaceToolId | null>
    toolbeltCanvasHint: ComputedRef<string>
    toolbeltCanvasHintStale: ComputedRef<boolean>
  }
}
