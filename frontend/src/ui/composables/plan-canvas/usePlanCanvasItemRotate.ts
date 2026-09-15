import { ref, type ComputedRef, type Ref } from 'vue'
import type { FloorItem, Point2D } from '@/core/plan/types'
import {
  snapFixtureCenterToWallFaces,
  WALL_FACE_SNAP_CM,
} from '@/ui/components/plan-canvas-fixture-face-snap'
import { isSettingsMod } from '@/ui/composables/canvas-kernel/plan-canvas-mods'
import {
  hitItemRotateHandleAtCm,
  itemRotationSnapCandidatesDeg,
  pointerAngleDeg,
  rotationFromGrab,
  snapItemRotationDeg,
  type ItemRotateCorner,
} from './item-rotate-handles'
import type { usePlanEditor } from '@/ui/composables/usePlanEditor'

type EditorApi = ReturnType<typeof usePlanEditor>

export function usePlanCanvasItemRotate(options: {
  editor: EditorApi
  selectedItemId: ComputedRef<string | null>
  settingsItemId: Ref<string | null>
  clientToCm: (clientX: number, clientY: number) => Point2D | null
  screenPxToCm: (px: number) => number
  settingsMod: Ref<boolean> | ComputedRef<boolean>
  syncPlanToParent: () => void
}) {
  const dragging = ref(false)
  const activeCorner = ref<ItemRotateCorner | null>(null)

  function selectedItem(): FloorItem | undefined {
    const guid = options.selectedItemId.value
    if (!guid) return undefined
    return options.editor.items.value.find((entry) => entry.id === guid)
  }

  function hitTol(): number {
    return Math.max(8, options.screenPxToCm(16))
  }

  function hitHandleAtCm(cm: Point2D): ItemRotateCorner | null {
    const item = selectedItem()
    if (!item) return null
    return hitItemRotateHandleAtCm(item, cm, hitTol())
  }

  function applyRotation(
    guid: string,
    rotation: number,
    event: { ctrlKey?: boolean; metaKey?: boolean },
    snapPosition: boolean,
  ): void {
    const item = options.editor.items.value.find((entry) => entry.id === guid)
    if (!item) return
    const snapDisabled = isSettingsMod(event, options.settingsMod.value)
    const patch: Partial<FloorItem> = { rotation }
    if (snapPosition && !snapDisabled) {
      const snapped = snapFixtureCenterToWallFaces(
        options.editor.walls.value,
        { x: item.x, y: item.y },
        { width: item.width, height: item.height, rotationDeg: rotation },
        WALL_FACE_SNAP_CM,
      )
      patch.x = snapped.x
      patch.y = snapped.y
    }
    options.editor.updateItem(guid, patch)
  }

  function beginRotate(
    guid: string,
    corner: ItemRotateCorner,
    event: { clientX: number; clientY: number; ctrlKey?: boolean; metaKey?: boolean },
  ): void {
    const item = options.editor.items.value.find((entry) => entry.id === guid)
    if (!item) return
    const startCm = options.clientToCm(event.clientX, event.clientY)
    if (!startCm) return
    options.editor.pushUndo()
    options.settingsItemId.value = guid
    activeCorner.value = corner
    dragging.value = true
    const startRotation = item.rotation ?? 0
    const startPointer = pointerAngleDeg({ x: item.x, y: item.y }, startCm)
    const center = { x: item.x, y: item.y }
    let moved = false

    const onMove = (moveEvent: PointerEvent) => {
      const cm = options.clientToCm(moveEvent.clientX, moveEvent.clientY)
      if (!cm) return
      const live = options.editor.items.value.find((entry) => entry.id === guid)
      if (!live) return
      moved = true
      const raw = rotationFromGrab(startRotation, startPointer, pointerAngleDeg(center, cm))
      const snapDisabled = isSettingsMod(moveEvent, options.settingsMod.value)
      const snapped = snapDisabled
        ? raw
        : snapItemRotationDeg(
            raw,
            itemRotationSnapCandidatesDeg(options.editor.walls.value, center, {
              width: live.width,
              height: live.height,
              rotationDeg: raw,
            }),
          )
      applyRotation(guid, snapped, moveEvent, false)
    }
    const onUp = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      dragging.value = false
      activeCorner.value = null
      const live = options.editor.items.value.find((entry) => entry.id === guid)
      if (moved && live) applyRotation(guid, live.rotation ?? 0, upEvent, true)
      options.syncPlanToParent()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
  }

  function cleanup(): void {
    dragging.value = false
    activeCorner.value = null
  }

  return {
    draggingItemRotate: dragging,
    hitRotateHandleAtCm: hitHandleAtCm,
    beginItemRotate: beginRotate,
    cleanupItemRotate: cleanup,
  }
}
