import { ref, type ComputedRef, type Ref } from 'vue'
import type { Point2D } from '@/core/fml/types'
import { isSettingsMod } from './fml-preview-mods'
import {
  snapFixtureCenterToWallFaces,
  WALL_FACE_SNAP_CM,
} from '@/ui/components/fml-preview-fixture-face-snap'
import type { useFmlPreviewEditor } from '@/ui/composables/useFmlPreviewEditor'
import type { FmlPreviewSelectionRefs } from './fml-preview-selection'

type EditorApi = ReturnType<typeof useFmlPreviewEditor>

export type ItemDragPreview = { guid: string; x: number; y: number }

export function useFmlPreviewItemDrag(options: {
  hitTest: { clientToCm: (clientX: number, clientY: number) => Point2D | null }
  editor: EditorApi
  selection: Pick<FmlPreviewSelectionRefs, 'settingsItemId' | 'moveItemId'>
  spacePressed: Ref<boolean>
  settingsMod: Ref<boolean> | ComputedRef<boolean>
  syncPlanToParent: () => void
}) {
  const draggingItem = ref(false)
  const itemDragPreview = ref<ItemDragPreview | null>(null)
  let grabOffset = { x: 0, y: 0 }
  let pending: {
    guid: string
    startClientX: number
    startClientY: number
    onMove: (event: PointerEvent) => void
    onUp: () => void
  } | null = null

  function cancelPending(): void {
    if (!pending) return
    window.removeEventListener('pointermove', pending.onMove)
    window.removeEventListener('pointerup', pending.onUp)
    pending = null
  }

  function startItemDragPending(guid: string, event: { clientX: number; clientY: number }): void {
    cancelPending()
    const onMove = (moveEvent: PointerEvent) => {
      if (!pending) return
      const dist = Math.hypot(
        moveEvent.clientX - pending.startClientX,
        moveEvent.clientY - pending.startClientY,
      )
      if (dist < 4) return
      cancelPending()
      beginItemDrag(guid, moveEvent)
    }
    const onUp = () => {
      cancelPending()
    }
    pending = {
      guid,
      startClientX: event.clientX,
      startClientY: event.clientY,
      onMove,
      onUp,
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
  }

  function beginItemDrag(guid: string, event: { clientX: number; clientY: number }): void {
    cancelPending()
    if (options.spacePressed.value) return
    const cm = options.hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return
    const item = options.editor.items.value.find((entry) => entry.guid === guid)
    if (!item) return
    options.editor.pushUndo()
    options.selection.moveItemId.value = guid
    grabOffset = { x: item.x - cm.x, y: item.y - cm.y }
    itemDragPreview.value = { guid, x: item.x, y: item.y }
    draggingItem.value = true
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
    onMove(event)
  }

  function snapCenter(
    guid: string,
    cm: Point2D,
    event: { ctrlKey?: boolean; metaKey?: boolean },
  ): Point2D {
    const item = options.editor.items.value.find((entry) => entry.guid === guid)
    if (!item) return cm
    return snapFixtureCenterToWallFaces(
      options.editor.walls.value,
      cm,
      { width: item.width, height: item.height, rotationDeg: item.rotation ?? 0 },
      WALL_FACE_SNAP_CM,
      { disabled: isSettingsMod(event, options.settingsMod.value) },
    )
  }

  function onMove(event: {
    clientX: number
    clientY: number
    ctrlKey?: boolean
    metaKey?: boolean
  }): void {
    if (!draggingItem.value) return
    const guid = options.selection.moveItemId.value
    if (!guid) return
    const cm = options.hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return
    const raw = { x: cm.x + grabOffset.x, y: cm.y + grabOffset.y }
    const snapped = snapCenter(guid, raw, event)
    itemDragPreview.value = { guid, x: snapped.x, y: snapped.y }
  }

  function onUp(): void {
    window.removeEventListener('pointermove', onMove)
    const preview = itemDragPreview.value
    if (draggingItem.value && preview) {
      options.editor.applyItemDrag(preview.guid, { x: preview.x, y: preview.y })
      options.syncPlanToParent()
    }
    itemDragPreview.value = null
    draggingItem.value = false
  }

  function cleanup(): void {
    cancelPending()
    window.removeEventListener('pointermove', onMove)
    itemDragPreview.value = null
    draggingItem.value = false
  }

  return {
    draggingItem,
    itemDragPreview,
    startItemDragPending,
    beginItemDrag,
    cancelItemDragPending: cancelPending,
    cleanupItemDrag: cleanup,
  }
}
