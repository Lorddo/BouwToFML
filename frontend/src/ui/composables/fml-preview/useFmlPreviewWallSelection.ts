import { computed, ref, type Ref } from 'vue'
import type { Point2D } from '@/core/fml/types'
import { clampBalance } from '@/ui/components/fml-preview-wall-edit'
import { projectPointToWallT } from '@/ui/components/fml-preview-openings'
import type { useFmlPreviewEditor } from '@/ui/composables/useFmlPreviewEditor'
import type { FmlPreviewSelectionRefs } from './fml-preview-selection'
import { findWallsFullyInCmBBox } from './fml-preview-wall-select'

type EditorApi = ReturnType<typeof useFmlPreviewEditor>

interface WallSelectionHitTestApi {
  containerRectToCmBBox: (rect: { x: number; y: number; width: number; height: number }) => {
    x: number
    y: number
    width: number
    height: number
  } | null
}

export function useFmlPreviewWallSelection(options: {
  editor: EditorApi
  hitTest: WallSelectionHitTestApi
  selection: FmlPreviewSelectionRefs
  syncPlanToParent: () => void
  containerRef: Ref<HTMLDivElement | null>
  cancelMoveDragPending: () => void
  cancelDrawWallDrag: () => void
  cancelMeasureDrag: () => void
}) {
  const {
    editor,
    hitTest,
    selection,
    syncPlanToParent,
    containerRef,
    cancelMoveDragPending,
    cancelDrawWallDrag,
    cancelMeasureDrag,
  } = options

  const {
    settingsWallIds,
    moveWallId,
    settingsOpeningIds,
    moveOpeningId,
    pinnedJunctionId,
    activeFmlTool,
  } = selection

  const wallThicknessDraft = ref(20)
  const wallThicknessMixed = ref(false)
  const wallBalanceDraft = ref(0.5)
  const wallBalanceMixed = ref(false)
  const selectionBoxPreview = ref<{ x: number; y: number; width: number; height: number } | null>(
    null,
  )
  /** Laatste Ctrl-klik op een settings-muur (cm); gebruikt voor split-positie. */
  const settingsWallSplitClickCm = ref<Point2D | null>(null)

  const selectionBoxMode = computed(() => activeFmlTool.value === 'box_select')

  let selectionBoxDrag: {
    startX: number
    startY: number
  } | null = null

  function syncWallThicknessDraftFromSelection(): void {
    const ids = settingsWallIds.value
    if (ids.length === 0) {
      wallThicknessMixed.value = false
      wallBalanceMixed.value = false
      return
    }
    const thicknesses = ids
      .map((id) => editor.walls.value.find((item) => item.id === id)?.thickness)
      .filter((value): value is number => value != null)
    const balances = ids
      .map((id) => editor.walls.value.find((item) => item.id === id)?.balance ?? 0.5)
      .filter((value): value is number => value != null)
    if (thicknesses.length === 0) {
      wallThicknessMixed.value = false
      wallBalanceMixed.value = false
      return
    }
    const first = Math.round(thicknesses[0])
    const mixed = thicknesses.some((value) => Math.round(value) !== first)
    wallThicknessMixed.value = mixed
    wallThicknessDraft.value = mixed ? first : first

    if (balances.length > 0) {
      const firstBalance = Math.round(balances[0] * 100) / 100
      const balanceMixed = balances.some((value) => Math.round(value * 100) / 100 !== firstBalance)
      wallBalanceMixed.value = balanceMixed
      wallBalanceDraft.value = firstBalance
    }
  }

  function toggleSettingsWall(wallId: string, clickCm?: Point2D | null): void {
    cancelMoveDragPending()
    settingsOpeningIds.value = []
    moveOpeningId.value = null
    const current = settingsWallIds.value
    if (current.includes(wallId)) {
      settingsWallIds.value = current.filter((id) => id !== wallId)
      if (settingsWallIds.value.length !== 1) settingsWallSplitClickCm.value = null
    } else {
      settingsWallIds.value = [...current, wallId]
      settingsWallSplitClickCm.value = clickCm ? { ...clickCm } : null
    }
    syncWallThicknessDraftFromSelection()
  }

  function onWallThicknessInput(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value)
    if (!Number.isFinite(value)) return
    wallThicknessDraft.value = value
    wallThicknessMixed.value = false
  }

  function commitWallThickness(): void {
    applyWallsThicknessCm(wallThicknessDraft.value)
  }

  function applyWallsThicknessCm(thicknessCm: number): void {
    const thickness = Math.max(1, Math.min(200, Math.round(thicknessCm)))
    wallThicknessDraft.value = thickness
    wallThicknessMixed.value = false
    if (settingsWallIds.value.length === 0) return
    editor.pushUndo()
    editor.applyWallsThickness(settingsWallIds.value, thickness)
    syncPlanToParent()
  }

  function onWallBalanceInput(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value)
    if (!Number.isFinite(value)) return
    wallBalanceDraft.value = value
    wallBalanceMixed.value = false
  }

  function commitWallBalance(): void {
    if (settingsWallIds.value.length === 0) return
    const balance = clampBalance(wallBalanceDraft.value)
    wallBalanceDraft.value = balance
    wallBalanceMixed.value = false
    editor.pushUndo()
    editor.applyWallsBalance(settingsWallIds.value, balance)
    syncPlanToParent()
  }

  function splitSelectedWall(): void {
    if (settingsWallIds.value.length !== 1) return
    const wallId = settingsWallIds.value[0]
    const wall = editor.walls.value.find((item) => item.id === wallId)
    if (!wall) return
    const lengthCm = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y)
    if (lengthCm < 8) return
    const click = settingsWallSplitClickCm.value
    const tSplit = click ? projectPointToWallT(wall, click) : 0.5
    editor.pushUndo()
    const result = editor.applyWallSplit(wallId, tSplit)
    if (!result) return
    settingsWallIds.value = [result.firstWallId]
    settingsWallSplitClickCm.value = null
    pinnedJunctionId.value = result.junctionId
    syncWallThicknessDraftFromSelection()
    syncPlanToParent()
  }

  function deleteSelectedWalls(): void {
    if (settingsWallIds.value.length === 0) return
    editor.pushUndo()
    const deletedIds = new Set(settingsWallIds.value)
    editor.applyWallsDelete(settingsWallIds.value)
    if (moveWallId.value && deletedIds.has(moveWallId.value)) moveWallId.value = null
    settingsWallIds.value = []
    settingsWallSplitClickCm.value = null
    pinnedJunctionId.value = null
    syncPlanToParent()
  }

  function clearSelection(): void {
    settingsWallIds.value = []
    moveWallId.value = null
    settingsOpeningIds.value = []
    moveOpeningId.value = null
    pinnedJunctionId.value = null
    settingsWallSplitClickCm.value = null
    wallThicknessMixed.value = false
    wallBalanceMixed.value = false
  }

  function toggleSelectionBoxMode(): void {
    activeFmlTool.value = activeFmlTool.value === 'box_select' ? null : 'box_select'
    cancelSelectionBoxDrag()
    cancelDrawWallDrag()
    cancelMeasureDrag()
  }

  function cancelSelectionBoxDrag(): void {
    window.removeEventListener('mousemove', onSelectionBoxPointerMove)
    window.removeEventListener('mouseup', onSelectionBoxPointerUp)
    selectionBoxDrag = null
    selectionBoxPreview.value = null
  }

  function containerPointFromEvent(event: MouseEvent): { x: number; y: number } | null {
    const container = containerRef.value
    if (!container) return null
    const rect = container.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  function beginSelectionBoxDrag(event: MouseEvent): void {
    const point = containerPointFromEvent(event)
    if (!point) return
    cancelSelectionBoxDrag()
    cancelMoveDragPending()
    selectionBoxDrag = { startX: point.x, startY: point.y }
    selectionBoxPreview.value = { x: point.x, y: point.y, width: 0, height: 0 }
    window.addEventListener('mousemove', onSelectionBoxPointerMove)
    window.addEventListener('mouseup', onSelectionBoxPointerUp, { once: true })
  }

  function onSelectionBoxPointerMove(event: MouseEvent): void {
    if (!selectionBoxDrag) return
    const point = containerPointFromEvent(event)
    if (!point) return
    selectionBoxPreview.value = {
      x: selectionBoxDrag.startX,
      y: selectionBoxDrag.startY,
      width: point.x - selectionBoxDrag.startX,
      height: point.y - selectionBoxDrag.startY,
    }
  }

  function applySelectionBox(rect: { x: number; y: number; width: number; height: number }): void {
    const cmBBox = hitTest.containerRectToCmBBox(rect)
    settingsWallSplitClickCm.value = null
    if (!cmBBox) {
      settingsWallIds.value = []
      wallThicknessMixed.value = false
      wallBalanceMixed.value = false
      return
    }
    const wallIds = findWallsFullyInCmBBox(editor.walls.value, cmBBox)
    settingsWallIds.value = wallIds
    settingsOpeningIds.value = []
    moveOpeningId.value = null
    syncWallThicknessDraftFromSelection()
  }

  function onSelectionBoxPointerUp(event: MouseEvent): void {
    window.removeEventListener('mousemove', onSelectionBoxPointerMove)
    const preview = selectionBoxPreview.value
    selectionBoxDrag = null
    selectionBoxPreview.value = null
    if (!preview) return

    const dist = Math.hypot(preview.width, preview.height)
    if (dist < 4) {
      clearSelection()
      return
    }

    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      const cmBBox = hitTest.containerRectToCmBBox(preview)
      if (!cmBBox) return
      const added = new Set(findWallsFullyInCmBBox(editor.walls.value, cmBBox))
      if (added.size === 0) return
      const merged = new Set(settingsWallIds.value)
      for (const id of added) merged.add(id)
      settingsWallIds.value = [...merged]
      settingsWallSplitClickCm.value = null
      syncWallThicknessDraftFromSelection()
      return
    }

    applySelectionBox(preview)
  }

  return {
    wallThicknessDraft,
    wallThicknessMixed,
    wallBalanceDraft,
    wallBalanceMixed,
    selectionBoxMode,
    selectionBoxPreview,
    syncWallThicknessDraftFromSelection,
    toggleSettingsWall,
    onWallThicknessInput,
    commitWallThickness,
    applyWallsThicknessCm,
    onWallBalanceInput,
    commitWallBalance,
    splitSelectedWall,
    deleteSelectedWalls,
    clearSelection,
    toggleSelectionBoxMode,
    cancelSelectionBoxDrag,
    beginSelectionBoxDrag,
  }
}
