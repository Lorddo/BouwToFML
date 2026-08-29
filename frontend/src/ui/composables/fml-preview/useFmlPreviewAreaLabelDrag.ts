import { ref } from 'vue'
import type { Point2D } from '@/core/fml/types'
import { areaLabelAnchorCm, areaPolygonCentroid } from './fml-preview-render-areas'
import type { FmlPreviewSelectionRefs } from './fml-preview-selection'
import type { useFmlPreviewEditor } from '@/ui/composables/useFmlPreviewEditor'

type EditorApi = ReturnType<typeof useFmlPreviewEditor>

export type AreaLabelTargetKind = 'area' | 'surface'

function roundOffsetCm(n: number): number {
  return Math.round(n * 100) / 100
}

export function useFmlPreviewAreaLabelDrag(options: {
  hitTest: { clientToCm: (clientX: number, clientY: number) => Point2D | null }
  editor: EditorApi
  selection: Pick<FmlPreviewSelectionRefs, 'settingsAreaId' | 'settingsSurfaceId'>
  spacePressed: { value: boolean }
  syncPlanToParent: () => void
}) {
  const draggingAreaLabel = ref(false)
  let kind: AreaLabelTargetKind | null = null
  let id: string | null = null
  let centroid = { x: 0, y: 0 }
  let grabOffset = { x: 0, y: 0 }
  let pending: {
    kind: AreaLabelTargetKind
    id: string
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

  function startAreaLabelDragPending(
    targetKind: AreaLabelTargetKind,
    targetId: string,
    event: { clientX: number; clientY: number },
  ): void {
    cancelPending()
    const onMove = (moveEvent: PointerEvent) => {
      if (!pending) return
      const dist = Math.hypot(
        moveEvent.clientX - pending.startClientX,
        moveEvent.clientY - pending.startClientY,
      )
      if (dist < 4) return
      const next = pending
      cancelPending()
      beginAreaLabelDrag(next.kind, next.id, moveEvent)
    }
    const onUp = () => {
      cancelPending()
    }
    pending = {
      kind: targetKind,
      id: targetId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      onMove,
      onUp,
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
  }

  function resolveItem(targetKind: AreaLabelTargetKind, targetId: string) {
    if (targetKind === 'area') {
      return options.editor.areas.value.find((area) => area.id === targetId) ?? null
    }
    return options.editor.surfaces.value.find((surface) => surface.id === targetId) ?? null
  }

  function beginAreaLabelDrag(
    targetKind: AreaLabelTargetKind,
    targetId: string,
    event: { clientX: number; clientY: number },
  ): void {
    cancelPending()
    if (options.spacePressed.value) return
    const item = resolveItem(targetKind, targetId)
    if (!item || item.poly.length < 3) return
    const cm = options.hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return
    options.editor.pushUndo()
    kind = targetKind
    id = targetId
    const poly = item.poly.map((p) => ({ x: p.x, y: p.y }))
    centroid = areaPolygonCentroid(poly)
    const label = areaLabelAnchorCm(poly, item.name_x, item.name_y)
    grabOffset = { x: label.x - cm.x, y: label.y - cm.y }
    draggingAreaLabel.value = true
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
    onMove(event)
  }

  function writeOffset(nameX: number, nameY: number): void {
    if (!id || !kind) return
    const patch = { name_x: nameX, name_y: nameY }
    if (kind === 'area') options.editor.updateArea(id, patch)
    else options.editor.updateSurface(id, patch)
  }

  function onMove(event: { clientX: number; clientY: number }): void {
    if (!draggingAreaLabel.value) return
    const cm = options.hitTest.clientToCm(event.clientX, event.clientY)
    if (!cm) return
    const x = cm.x + grabOffset.x
    const y = cm.y + grabOffset.y
    writeOffset(roundOffsetCm(x - centroid.x), roundOffsetCm(y - centroid.y))
  }

  function onUp(): void {
    window.removeEventListener('pointermove', onMove)
    if (draggingAreaLabel.value) options.syncPlanToParent()
    draggingAreaLabel.value = false
    kind = null
    id = null
  }

  function cleanupAreaLabelDrag(): void {
    cancelPending()
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    draggingAreaLabel.value = false
    kind = null
    id = null
  }

  return {
    draggingAreaLabel,
    beginAreaLabelDrag,
    startAreaLabelDragPending,
    cleanupAreaLabelDrag,
  }
}
