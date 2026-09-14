import { computed, ref, watch, type Ref } from 'vue'
import type { Point2D } from '@/core/fml/types'
import { catalogMaxCm } from '@/core/fml/fml-wall-thickness-catalog'
import { DEFAULT_WALL_HEIGHT_CM } from '@/core/fml/extraction-to-plan-types'
import { wallEndpointHeightCm, wallUniformBottomZCm } from '@/core/fml/wall-endpoint-height'
import {
  balanceToPercent,
  collectPlanWallsByIds,
  percentToBalance,
} from '@/ui/components/plan-canvas-wall-edit'
import { projectPointToWallT } from '@/ui/components/plan-canvas-openings'
import type { usePlanEditor } from '@/ui/composables/usePlanEditor'
import type { PlanCanvasDraftCommitScheduler } from './plan-canvas-draft-commit'
import { bindNumericDraftField, bindScaleLengthDraftField } from './plan-canvas-draft-commit'
import type { PlanCanvasSelectionRefs } from './plan-canvas-selection'
import { clearPlanSelected, setPlanSelected } from './plan-canvas-selected'
import {
  collectAllOfBoxKind,
  collectBoxSelectHits,
  type BoxSelectHits,
  type BoxSelectKind,
} from './plan-canvas-wall-select'
import { wallGuidsInGroup } from '@/core/fml/facade-groups'
import { createWallFacadeSelection } from './plan-canvas-wall-facade-selection'
import { createJunctionDrafts } from './plan-canvas-junction-drafts'

type EditorApi = ReturnType<typeof usePlanEditor>

const FIELD_THICKNESS = 'wall-thickness'
const FIELD_BALANCE = 'wall-balance'
const FIELD_WALL_HEIGHT = 'wall-height'
const FIELD_WALL_BOTTOM_Z = 'wall-bottom-z'

interface WallSelectionHitTestApi {
  containerRectToCmBBox: (rect: { x: number; y: number; width: number; height: number }) => {
    x: number
    y: number
    width: number
    height: number
  } | null
}

export function usePlanCanvasWallSelection(options: {
  editor: EditorApi
  hitTest: WallSelectionHitTestApi
  selection: PlanCanvasSelectionRefs
  syncPlanToParent: () => void
  draftCommit: PlanCanvasDraftCommitScheduler
  flushPendingFieldCommits: () => void
  containerRef: Ref<HTMLDivElement | null>
  cancelMoveDragPending: () => void
  cancelDrawWallDrag: () => void
  cancelMeasureDrag: () => void
  syncOpeningDraftFromSelection?: () => void
  thicknessPresetCms?: Ref<number[] | undefined>
}) {
  const {
    editor,
    hitTest,
    selection,
    syncPlanToParent,
    draftCommit,
    flushPendingFieldCommits,
    containerRef,
    cancelMoveDragPending,
    cancelDrawWallDrag,
    cancelMeasureDrag,
    syncOpeningDraftFromSelection,
    thicknessPresetCms,
  } = options

  const {
    settingsWallIds,
    settingsFacadeGroupId,
    settingsJunctionId,
    moveWallId,
    settingsOpeningIds,
    moveOpeningId,
    pinnedJunctionId,
    activePlanTool,
  } = selection

  const wallThicknessDraft = ref(catalogMaxCm(thicknessPresetCms?.value))
  watch(
    () => thicknessPresetCms?.value,
    (cms) => {
      if (settingsWallIds.value.length > 0) return
      wallThicknessDraft.value = catalogMaxCm(cms)
    },
  )
  const wallThicknessMixed = ref(false)
  const wallBalanceDraft = ref(50)
  const wallBalanceMixed = ref(false)
  const wallHeightDraft = ref(DEFAULT_WALL_HEIGHT_CM)
  const wallHeightMixed = ref(false)
  const wallBottomZDraft = ref(0)
  const wallBottomZMixed = ref(false)
  const selectionBoxPreview = ref<{ x: number; y: number; width: number; height: number } | null>(
    null,
  )
  /** Laatste selectie-klik op een muur (cm); gebruikt voor split-positie. */
  const settingsWallSplitClickCm = ref<Point2D | null>(null)

  const selectionBoxMode = computed(() => activePlanTool.value === 'box_select')
  const boxSelectKind = ref<BoxSelectKind>('wall')

  let selectionBoxDrag: {
    startX: number
    startY: number
  } | null = null

  function floorHeight(): number {
    return editor.floorHeightCm.value
  }

  // ── Junction drafts (delegated) ──

  const junctionDrafts = createJunctionDrafts({
    editor,
    selection,
    syncPlanToParent,
    draftCommit,
    floorHeight,
  })

  const {
    junctionHeightDraft,
    junctionHeightMixed,
    junctionBottomZDraft,
    junctionBottomZMixed,
    syncJunctionHeightDraftFromSelection,
    onJunctionHeightCm,
    commitJunctionHeight,
    onJunctionBottomZCm,
    commitJunctionBottomZ,
  } = junctionDrafts

  // ── Wall thickness sync (needed by facade selection) ──

  function syncFacadeThicknessDraftFromGroup(): void {
    const groupId = settingsFacadeGroupId.value
    const plan = editor.localPlan.value
    if (!groupId || !plan) {
      wallThicknessMixed.value = false
      return
    }
    const thicknesses = collectPlanWallsByIds(plan, wallGuidsInGroup(plan, groupId))
      .map((wall) => wall.thickness)
      .filter((value): value is number => value != null)
    if (thicknesses.length === 0) {
      wallThicknessMixed.value = false
      return
    }
    const first = Math.round(thicknesses[0])
    const mixed = thicknesses.some((value) => Math.round(value) !== first)
    wallThicknessMixed.value = mixed
    wallThicknessDraft.value = first
  }

  function wallIdsForEdit(): string[] {
    if (settingsWallIds.value.length > 0) return [...settingsWallIds.value]
    if (moveWallId.value) return [moveWallId.value]
    return []
  }

  function syncWallThicknessDraftFromSelection(): void {
    if (settingsFacadeGroupId.value) {
      syncFacadeThicknessDraftFromGroup()
      return
    }
    const ids = wallIdsForEdit()
    if (ids.length === 0) {
      wallThicknessMixed.value = false
      wallBalanceMixed.value = false
      wallHeightMixed.value = false
      wallBottomZMixed.value = false
      return
    }
    const floorH = floorHeight()
    const thicknesses = ids
      .map((id) => editor.selectableWalls.value.find((item) => item.id === id)?.thickness)
      .filter((value): value is number => value != null)
    const balances = ids
      .map((id) => editor.selectableWalls.value.find((item) => item.id === id)?.balance ?? 0.5)
      .filter((value): value is number => value != null)
    const heights: number[] = []
    const bottoms: number[] = []
    for (const id of ids) {
      const wall = editor.selectableWalls.value.find((item) => item.id === id)
      if (!wall) continue
      heights.push(wallEndpointHeightCm(wall, 'a', floorH))
      heights.push(wallEndpointHeightCm(wall, 'b', floorH))
      const bottom = wallUniformBottomZCm(wall, floorH)
      if (bottom != null) bottoms.push(bottom)
      else bottoms.push(Number.NaN)
    }
    if (thicknesses.length === 0) {
      wallThicknessMixed.value = false
      wallBalanceMixed.value = false
      wallHeightMixed.value = false
      wallBottomZMixed.value = false
      return
    }
    const first = Math.round(thicknesses[0])
    const mixed = thicknesses.some((value) => Math.round(value) !== first)
    wallThicknessMixed.value = mixed
    wallThicknessDraft.value = mixed ? first : first

    if (balances.length > 0) {
      const firstPct = balanceToPercent(balances[0])
      const balanceMixed = balances.some((value) => balanceToPercent(value) !== firstPct)
      wallBalanceMixed.value = balanceMixed
      wallBalanceDraft.value = firstPct
    }

    if (heights.length > 0) {
      const firstHeight = Math.round(heights[0])
      const heightMixed = heights.some((value) => Math.round(value) !== firstHeight)
      wallHeightMixed.value = heightMixed
      wallHeightDraft.value = firstHeight
    }

    if (bottoms.length > 0) {
      const firstBottom = bottoms.find((value) => Number.isFinite(value)) ?? 0
      const bottomMixed = bottoms.some(
        (value) => !Number.isFinite(value) || Math.round(value) !== Math.round(firstBottom),
      )
      wallBottomZMixed.value = bottomMixed
      wallBottomZDraft.value = Math.round(firstBottom)
    }
  }

  // ── Facade-group helpers (delegated) ──

  const facade = createWallFacadeSelection({
    editor,
    selection,
    syncPlanToParent,
    flushPendingFieldCommits,
    wallThicknessDraft,
    wallThicknessMixed,
    settingsWallSplitClickCm,
    syncFacadeThicknessDraftFromGroup,
    syncWallThicknessDraftFromSelection,
  })

  // ── Wall thickness / balance / height / bottomZ apply ──

  function applyFacadeGroupThicknessValue(
    groupId: string,
    thicknessCm: number,
  ): { mutated: boolean } {
    const thickness = Math.max(1, Math.min(200, Math.round(thicknessCm)))
    wallThicknessDraft.value = thickness
    wallThicknessMixed.value = false
    const plan = editor.localPlan.value
    if (!plan) return { mutated: false }
    const walls = collectPlanWallsByIds(plan, wallGuidsInGroup(plan, groupId))
    if (walls.length === 0) return { mutated: false }
    if (walls.every((wall) => Math.round(wall.thickness) === thickness)) {
      return { mutated: false }
    }
    draftCommit.beginUndoGroup(FIELD_THICKNESS, () => editor.pushUndo())
    const mutated = editor.applyFacadeGroupThickness(groupId, thickness)
    syncFacadeThicknessDraftFromGroup()
    if (mutated) syncPlanToParent()
    return { mutated }
  }

  function applyThicknessToWalls(wallIds: string[], thicknessCm: number): { mutated: boolean } {
    const groupId = settingsFacadeGroupId.value
    if (groupId) return applyFacadeGroupThicknessValue(groupId, thicknessCm)
    const thickness = Math.max(1, Math.min(200, Math.round(thicknessCm)))
    wallThicknessDraft.value = thickness
    wallThicknessMixed.value = false
    if (wallIds.length === 0) return { mutated: false }
    const already = wallIds.every((id) => {
      const wall = editor.walls.value.find((item) => item.id === id)
      return wall != null && Math.round(wall.thickness) === thickness
    })
    if (already) return { mutated: false }
    draftCommit.beginUndoGroup(FIELD_THICKNESS, () => editor.pushUndo())
    editor.applyWallsThickness(wallIds, thickness)
    syncWallThicknessDraftFromSelection()
    syncPlanToParent()
    return { mutated: true }
  }

  function applyBalanceToWalls(wallIds: string[], percentRaw: number): { mutated: boolean } {
    const balance = percentToBalance(percentRaw)
    wallBalanceDraft.value = balanceToPercent(balance)
    wallBalanceMixed.value = false
    if (wallIds.length === 0) return { mutated: false }
    const already = wallIds.every((id) => {
      const wall = editor.selectableWalls.value.find((item) => item.id === id)
      if (!wall) return false
      return balanceToPercent(wall.balance ?? 0.5) === balanceToPercent(balance)
    })
    if (already) return { mutated: false }
    draftCommit.beginUndoGroup(FIELD_BALANCE, () => editor.pushUndo())
    editor.applyWallsBalance(wallIds, balance)
    syncPlanToParent()
    return { mutated: true }
  }

  function applyHeightToWalls(wallIds: string[], heightRaw: number): { mutated: boolean } {
    const height = Math.max(1, Math.min(1000, Math.round(heightRaw)))
    wallHeightDraft.value = height
    wallHeightMixed.value = false
    if (wallIds.length === 0) return { mutated: false }
    const floorH = floorHeight()
    const already = wallIds.every((id) => {
      const wall = editor.selectableWalls.value.find((item) => item.id === id)
      if (!wall) return false
      return (
        Math.round(wallEndpointHeightCm(wall, 'a', floorH)) === height &&
        Math.round(wallEndpointHeightCm(wall, 'b', floorH)) === height
      )
    })
    if (already) return { mutated: false }
    draftCommit.beginUndoGroup(FIELD_WALL_HEIGHT, () => editor.pushUndo())
    editor.applyWallsHeight(wallIds, height)
    syncWallThicknessDraftFromSelection()
    syncPlanToParent()
    return { mutated: true }
  }

  function applyBottomZToWalls(wallIds: string[], bottomRaw: number): { mutated: boolean } {
    const bottomZ = Math.max(0, Math.min(2000, Math.round(bottomRaw)))
    wallBottomZDraft.value = bottomZ
    wallBottomZMixed.value = false
    if (wallIds.length === 0) return { mutated: false }
    const floorH = floorHeight()
    const already = wallIds.every((id) => {
      const wall = editor.selectableWalls.value.find((item) => item.id === id)
      if (!wall) return false
      return wallUniformBottomZCm(wall, floorH) === bottomZ
    })
    if (already) return { mutated: false }
    draftCommit.beginUndoGroup(FIELD_WALL_BOTTOM_Z, () => editor.pushUndo())
    editor.applyWallsBottomZ(wallIds, bottomZ)
    syncWallThicknessDraftFromSelection()
    syncPlanToParent()
    return { mutated: true }
  }

  // ── Toggle settings ──

  /**
   * Wat er náást de Selected-bak hoort en dus niet in `setPlanSelected` zit:
   * de teken-sessie en de mixed-vlag van de knoop.
   */
  function clearCompetingToolSession(): void {
    junctionHeightMixed.value = false
    selection.surfaceEditId.value = null
    selection.roofPolyMutate.value = false
  }

  /** Left-klik: basis-settings (dikte/balans/split/delete) + verplaatsen. */
  function selectWall(wallId: string, clickCm?: Point2D | null): void {
    flushPendingFieldCommits()
    cancelMoveDragPending()
    clearCompetingToolSession()
    setPlanSelected(selection, { kind: 'wall', moveId: wallId })
    settingsWallSplitClickCm.value = clickCm ? { ...clickCm } : null
    syncWallThicknessDraftFromSelection()
  }

  function toggleSettingsWall(wallId: string, clickCm?: Point2D | null): void {
    flushPendingFieldCommits()
    cancelMoveDragPending()
    const leavingFacade = settingsFacadeGroupId.value != null
    clearCompetingToolSession()

    // Eerst de huidige muurstaat lezen: `setPlanSelected` wist de bak.
    const current = [...settingsWallIds.value]
    const currentMove = moveWallId.value
    let nextIds: string[]
    let nextMove: string | null
    let splitClick: Point2D | null

    if (leavingFacade) {
      // Niet toevoegen aan de groep, maar er uit stappen naar deze ene muur.
      nextIds = [wallId]
      nextMove = currentMove === wallId ? currentMove : null
      splitClick = clickCm ? { ...clickCm } : null
    } else if (current.includes(wallId)) {
      nextIds = current.filter((id) => id !== wallId)
      nextMove = currentMove === wallId ? null : currentMove
      splitClick = nextIds.length === 1 ? settingsWallSplitClickCm.value : null
    } else {
      nextIds = [...current, wallId]
      nextMove = currentMove != null && nextIds.includes(currentMove) ? currentMove : null
      splitClick = clickCm ? { ...clickCm } : null
    }

    setPlanSelected(selection, { kind: 'wall', settingsIds: nextIds, moveId: nextMove })
    settingsWallSplitClickCm.value = splitClick
    syncWallThicknessDraftFromSelection()
  }

  function toggleSettingsJunction(junctionId: string): void {
    flushPendingFieldCommits()
    cancelMoveDragPending()
    settingsWallSplitClickCm.value = null
    wallThicknessMixed.value = false
    wallBalanceMixed.value = false
    wallHeightMixed.value = false
    wallBottomZMixed.value = false

    const wasSelected = settingsJunctionId.value === junctionId
    setPlanSelected(
      selection,
      wasSelected ? null : { kind: 'junction', settingsIds: [junctionId], moveId: junctionId },
    )
    if (wasSelected) {
      junctionHeightMixed.value = false
      return
    }
    syncJunctionHeightDraftFromSelection()
  }

  // ── Draft field bindings ──

  const thicknessField = bindScaleLengthDraftField({
    fieldId: FIELD_THICKNESS,
    draftCommit,
    draft: wallThicknessDraft,
    mixed: wallThicknessMixed,
    applyWithValue: (value) => {
      const wallIds = wallIdsForEdit()
      return () => applyThicknessToWalls(wallIds, value)
    },
  })

  const balanceField = bindNumericDraftField({
    fieldId: FIELD_BALANCE,
    draftCommit,
    draft: wallBalanceDraft,
    mixed: wallBalanceMixed,
    applyWithValue: (value) => {
      const wallIds = wallIdsForEdit()
      return () => applyBalanceToWalls(wallIds, value)
    },
  })

  const wallHeightField = bindScaleLengthDraftField({
    fieldId: FIELD_WALL_HEIGHT,
    draftCommit,
    draft: wallHeightDraft,
    mixed: wallHeightMixed,
    applyWithValue: (value) => {
      const wallIds = wallIdsForEdit()
      return () => applyHeightToWalls(wallIds, value)
    },
  })

  const wallBottomZField = bindScaleLengthDraftField({
    fieldId: FIELD_WALL_BOTTOM_Z,
    draftCommit,
    draft: wallBottomZDraft,
    mixed: wallBottomZMixed,
    applyWithValue: (value) => {
      const wallIds = wallIdsForEdit()
      return () => applyBottomZToWalls(wallIds, value)
    },
  })

  const onWallThicknessCm = thicknessField.onCm
  const commitWallThickness = thicknessField.commit
  const onWallBalanceInput = balanceField.onInput
  const commitWallBalance = balanceField.commit
  const onWallHeightCm = wallHeightField.onCm
  const commitWallHeight = wallHeightField.commit
  const onWallBottomZCm = wallBottomZField.onCm
  const commitWallBottomZ = wallBottomZField.commit

  /** Immediate preset / programmatic thickness (own undo step). */
  function applyWallsThicknessCm(thicknessCm: number): void {
    draftCommit.endUndoGroup(FIELD_THICKNESS)
    const thickness = Math.max(1, Math.min(200, Math.round(thicknessCm)))
    wallThicknessDraft.value = thickness
    wallThicknessMixed.value = false
    const groupId = settingsFacadeGroupId.value
    if (groupId) {
      const plan = editor.localPlan.value
      const walls = plan ? collectPlanWallsByIds(plan, wallGuidsInGroup(plan, groupId)) : []
      if (walls.length === 0) return
      if (walls.every((wall) => Math.round(wall.thickness) === thickness)) return
      editor.pushUndo()
      if (editor.applyFacadeGroupThickness(groupId, thickness)) {
        syncFacadeThicknessDraftFromGroup()
        syncPlanToParent()
      }
      return
    }
    if (wallIdsForEdit().length === 0) return
    const wallIds = wallIdsForEdit()
    const already = wallIds.every((id) => {
      const wall = editor.selectableWalls.value.find((item) => item.id === id)
      return wall != null && Math.round(wall.thickness) === thickness
    })
    if (already) return
    editor.pushUndo()
    editor.applyWallsThickness(wallIds, thickness)
    syncWallThicknessDraftFromSelection()
    syncPlanToParent()
  }

  // ── Split / delete ──

  function splitSelectedWall(): void {
    flushPendingFieldCommits()
    const ids = wallIdsForEdit()
    if (ids.length !== 1) return
    const wallId = ids[0]
    const wall = editor.selectableWalls.value.find((item) => item.id === wallId)
    if (!wall) return
    const lengthCm = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y)
    if (lengthCm < 8) return
    const click = settingsWallSplitClickCm.value
    const tSplit = click ? projectPointToWallT(wall, click) : 0.5
    editor.pushUndo()
    const result = editor.applyWallSplit(wallId, tSplit)
    if (!result) return
    const wasFull = settingsWallIds.value.length > 0
    if (wasFull) settingsWallIds.value = [result.firstWallId]
    else moveWallId.value = result.firstWallId
    settingsWallSplitClickCm.value = null
    pinnedJunctionId.value = result.junctionId
    syncWallThicknessDraftFromSelection()
    syncPlanToParent()
  }

  function deleteSelectedWalls(): void {
    flushPendingFieldCommits()
    const ids = new Set(settingsWallIds.value)
    if (moveWallId.value) ids.add(moveWallId.value)
    if (ids.size === 0) return
    editor.pushUndo()
    editor.applyWallsDelete([...ids])
    moveWallId.value = null
    settingsWallIds.value = []
    settingsWallSplitClickCm.value = null
    settingsJunctionId.value = null
    pinnedJunctionId.value = null
    syncPlanToParent()
  }

  // ── Clear / box-select ──

  function clearSelection(opts?: { flush?: boolean }): void {
    if (opts?.flush !== false) flushPendingFieldCommits()
    clearPlanSelected(selection)
    // Hover, mixed-vlaggen en teken-sessie horen niet in de Selected-bak.
    selection.hoveredDimensionId.value = null
    selection.hoveredDimensionEnd.value = null
    settingsWallSplitClickCm.value = null
    wallThicknessMixed.value = false
    wallBalanceMixed.value = false
    wallHeightMixed.value = false
    junctionHeightMixed.value = false
    selection.surfaceEditId.value = null
    selection.drawSurfacePoints.value = null
    selection.drawLinePoints.value = null
  }

  function toggleSelectionBoxMode(): void {
    activePlanTool.value = activePlanTool.value === 'box_select' ? null : 'box_select'
    cancelSelectionBoxDrag()
    cancelDrawWallDrag()
    cancelMeasureDrag()
  }

  function cancelSelectionBoxDrag(): void {
    window.removeEventListener('pointermove', onSelectionBoxPointerMove)
    window.removeEventListener('pointerup', onSelectionBoxPointerUp)
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
    flushPendingFieldCommits()
    const point = containerPointFromEvent(event)
    if (!point) return
    cancelSelectionBoxDrag()
    cancelMoveDragPending()
    selectionBoxDrag = { startX: point.x, startY: point.y }
    selectionBoxPreview.value = { x: point.x, y: point.y, width: 0, height: 0 }
    window.addEventListener('pointermove', onSelectionBoxPointerMove)
    window.addEventListener('pointerup', onSelectionBoxPointerUp, { once: true })
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

  function mergeIds(current: string[], added: string[], additive: boolean): string[] {
    if (!additive) return added
    const merged = new Set(current)
    for (const id of added) merged.add(id)
    return [...merged]
  }

  function applyBoxHits(hits: BoxSelectHits, additive: boolean): void {
    settingsWallSplitClickCm.value = null
    settingsJunctionId.value = null
    pinnedJunctionId.value = null
    selection.settingsAreaId.value = null
    selection.settingsSurfaceId.value = null
    selection.settingsLabelId.value = null
    selection.settingsLineId.value = null
    selection.settingsItemId.value = null
    const kind = boxSelectKind.value
    const applyWalls = kind === 'wall' || kind === 'all'
    const applyOpenings = kind === 'door' || kind === 'window' || kind === 'all'

    if (applyWalls) {
      settingsFacadeGroupId.value = null
      settingsWallIds.value = mergeIds(settingsWallIds.value, hits.wallIds, additive)
      syncWallThicknessDraftFromSelection()
    } else {
      settingsFacadeGroupId.value = null
      settingsWallIds.value = []
      moveWallId.value = null
      wallThicknessMixed.value = false
      wallBalanceMixed.value = false
      wallHeightMixed.value = false
    }

    if (applyOpenings) {
      moveOpeningId.value = null
      settingsOpeningIds.value = mergeIds(settingsOpeningIds.value, hits.openingIds, additive)
      syncOpeningDraftFromSelection?.()
    } else {
      settingsOpeningIds.value = []
      moveOpeningId.value = null
    }
  }

  function applySelectionBox(rect: { x: number; y: number; width: number; height: number }): void {
    flushPendingFieldCommits()
    const cmBBox = hitTest.containerRectToCmBBox(rect)
    if (!cmBBox) {
      applyBoxHits({ wallIds: [], openingIds: [] }, false)
      return
    }
    applyBoxHits(
      collectBoxSelectHits(editor.selectableWalls.value, cmBBox, boxSelectKind.value),
      false,
    )
  }

  function selectAllOfBoxKind(): void {
    flushPendingFieldCommits()
    applyBoxHits(collectAllOfBoxKind(editor.selectableWalls.value, boxSelectKind.value), false)
  }

  function onSelectionBoxPointerUp(event: MouseEvent): void {
    window.removeEventListener('pointermove', onSelectionBoxPointerMove)
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
      flushPendingFieldCommits()
      const cmBBox = hitTest.containerRectToCmBBox(preview)
      if (!cmBBox) return
      const added = collectBoxSelectHits(editor.selectableWalls.value, cmBBox, boxSelectKind.value)
      if (added.wallIds.length === 0 && added.openingIds.length === 0) return
      applyBoxHits(added, true)
      return
    }

    applySelectionBox(preview)
  }

  return {
    selectedFacadeGroupPanel: facade.selectedFacadeGroupPanel,
    wallThicknessDraft,
    wallThicknessMixed,
    wallBalanceDraft,
    wallBalanceMixed,
    wallHeightDraft,
    wallHeightMixed,
    wallBottomZDraft,
    wallBottomZMixed,
    junctionHeightDraft,
    junctionHeightMixed,
    junctionBottomZDraft,
    junctionBottomZMixed,
    selectionBoxMode,
    selectionBoxPreview,
    boxSelectKind,
    selectAllOfBoxKind,
    syncWallThicknessDraftFromSelection,
    syncJunctionHeightDraftFromSelection,
    selectWall,
    toggleSettingsWall,
    toggleSettingsJunction,
    onWallThicknessCm,
    commitWallThickness,
    applyWallsThicknessCm,
    onWallBalanceInput,
    commitWallBalance,
    onWallHeightCm,
    commitWallHeight,
    onWallBottomZCm,
    commitWallBottomZ,
    onJunctionHeightCm,
    commitJunctionHeight,
    onJunctionBottomZCm,
    commitJunctionBottomZ,
    splitSelectedWall,
    deleteSelectedWalls,
    facadeGroupOptions: facade.facadeGroupOptions,
    facadeGroupChecks: facade.facadeGroupChecks,
    facadeMemberIdsOnActiveFloor: facade.facadeMemberIdsOnActiveFloor,
    stampGroupDraft: facade.stampGroupDraft,
    stampGroupMixed: facade.stampGroupMixed,
    stampMemberIdsOnActiveFloor: facade.stampMemberIdsOnActiveFloor,
    applyFacadeGroupSelection: facade.applyFacadeGroupSelection,
    removeFacadeGroupFromSelection: facade.removeFacadeGroupFromSelection,
    editAllFacadeGroups: facade.editAllFacadeGroups,
    createFacadeGroupFromSelection: facade.createFacadeGroupFromSelection,
    toggleFacadeGroup: facade.toggleFacadeGroup,
    applyStampGroupSelection: facade.applyStampGroupSelection,
    renameSelectedFacadeGroup: facade.renameSelectedFacadeGroup,
    renameFacadeGroupById: facade.renameFacadeGroupById,
    selectFacadeGroupMembers: facade.selectFacadeGroupMembers,
    selectFacadeGroupMembersById: facade.selectFacadeGroupMembersById,
    selectStampGroupMembers: facade.selectStampGroupMembers,
    canSelectFacadeMembers: facade.canSelectFacadeMembers,
    canSelectMembersOfGroup: facade.canSelectMembersOfGroup,
    canSelectStampMembers: facade.canSelectStampMembers,
    clearSelection,
    toggleSelectionBoxMode,
    cancelSelectionBoxDrag,
    beginSelectionBoxDrag,
  }
}
