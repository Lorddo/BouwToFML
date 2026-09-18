import { ref, type ComputedRef, type Ref } from 'vue'
import type { FloorItem, Point2D } from '@/core/plan/types'
import type { usePlanEditor } from '@/ui/composables/usePlanEditor'
import {
  hitItemResizeHandle,
  resizeFromSide,
  worldToItemLocal,
  type ItemResizeSide,
} from './item-resize-handles'

type EditorApi = ReturnType<typeof usePlanEditor>

const MIN_SIZE_CM = 5

export function usePlanCanvasItemResize(options: {
  editor: EditorApi
  selectedItemId: ComputedRef<string | null>
  settingsItemId: Ref<string | null>
  clientToCm: (clientX: number, clientY: number) => Point2D | null
  screenPxToCm: (px: number) => number
  syncPlanToParent: () => void
}) {
  const dragging = ref(false)
  const activeSide = ref<ItemResizeSide | null>(null)

  function selectedItem(): FloorItem | undefined {
    const guid = options.selectedItemId.value
    if (!guid) return undefined
    return options.editor.items.value.find((entry) => entry.id === guid)
  }

  function hitHandleAtCm(cm: Point2D): ItemResizeSide | null {
    const item = selectedItem()
    if (!item) return null
    const local = worldToItemLocal({ x: item.x, y: item.y }, cm, item.rotation ?? 0, item.mirrored)
    return hitItemResizeHandle(
      local,
      item.width,
      item.height,
      Math.max(8, options.screenPxToCm(16)),
    )
  }

  function applySide(guid: string, side: ItemResizeSide, cm: Point2D): void {
    const item = options.editor.items.value.find((entry) => entry.id === guid)
    if (!item) return
    const local = worldToItemLocal({ x: item.x, y: item.y }, cm, item.rotation ?? 0, item.mirrored)
    options.editor.updateItem(guid, resizeFromSide(item, side, local, MIN_SIZE_CM))
    options.editor.refreshSkylightRoof(guid)
  }

  function beginResize(
    guid: string,
    side: ItemResizeSide,
    event: { clientX: number; clientY: number },
  ): void {
    const item = options.editor.items.value.find((entry) => entry.id === guid)
    if (!item) return
    options.editor.pushUndo()
    options.settingsItemId.value = guid
    activeSide.value = side
    dragging.value = true
    const onMove = (moveEvent: PointerEvent) => {
      const cm = options.clientToCm(moveEvent.clientX, moveEvent.clientY)
      if (!cm) return
      applySide(guid, side, cm)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      dragging.value = false
      activeSide.value = null
      options.syncPlanToParent()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
    const startCm = options.clientToCm(event.clientX, event.clientY)
    if (startCm) applySide(guid, side, startCm)
  }

  function cleanup(): void {
    dragging.value = false
    activeSide.value = null
  }

  return {
    draggingItemResize: dragging,
    hitHandleAtCm,
    beginItemResize: beginResize,
    cleanupItemResize: cleanup,
  }
}
