import { ref } from 'vue'
import type { Point2D } from '@/core/fml/types'
import type { useFmlPreviewEditor } from '@/ui/composables/useFmlPreviewEditor'
import {
  clampLabelFontSize,
  DEFAULT_LABEL_FONT_COLOR,
  DEFAULT_LABEL_FONT_SIZE_PX,
} from './fml-preview-render-annotations'
import type { FmlPreviewSelectionRefs } from './fml-preview-selection'

type EditorApi = ReturnType<typeof useFmlPreviewEditor>

/**
 * Label-plaats tool: enkele klik → tekstlabel (default styling Kinderdijk).
 */
export function useFmlPreviewDrawLabel(options: {
  selection: FmlPreviewSelectionRefs
  editor: EditorApi
  hitTest: { clientToCm: (clientX: number, clientY: number) => Point2D | null }
  beforeBegin: () => void
  syncPlanToParent: () => void
}) {
  const pendingText = ref('Tekst')
  const fontSize = ref(DEFAULT_LABEL_FONT_SIZE_PX)
  const fontColor = ref(DEFAULT_LABEL_FONT_COLOR)
  const outline = ref(false)
  const bold = ref(false)
  const italic = ref(false)

  function cancelDrawLabel(): void {
    // single-click tool — nothing to cancel mid-draw
  }

  function onDrawLabelClick(event: MouseEvent): void {
    const cm = options.hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return
    options.beforeBegin()
    options.editor.pushUndo()
    const text = pendingText.value.trim() || 'Tekst'
    const id = options.editor.addLabel({
      x: cm.x,
      y: cm.y,
      text,
      fontFamily: 'arial',
      fontSize: clampLabelFontSize(fontSize.value),
      letterSpacing: 0,
      fontColor: fontColor.value,
      backgroundColor: '#f4f8f4',
      align: 'left',
      rotation: 0,
      outline: outline.value || undefined,
      bold: bold.value || undefined,
      italic: italic.value || undefined,
    })
    options.selection.settingsLabelId.value = id
    options.selection.settingsLineId.value = null
    options.selection.settingsAreaId.value = null
    options.selection.settingsSurfaceId.value = null
    options.selection.activeFmlTool.value = null
    options.syncPlanToParent()
  }

  return {
    cancelDrawLabel,
    onDrawLabelClick,
    pendingText,
    fontSize,
    fontColor,
    outline,
    bold,
    italic,
  }
}
