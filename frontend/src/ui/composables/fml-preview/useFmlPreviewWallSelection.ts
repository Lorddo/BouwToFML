import { computed, ref, type Ref } from 'vue'
import type { Point2D } from '@/core/fml/types'
import { DEFAULT_FML_WALL_HEIGHT_CM } from '@/core/fml/extraction-to-plan-types'
import { wallEndpointHeightCm } from '@/core/fml/wall-endpoint-height'
import { balanceToPercent, percentToBalance } from '@/ui/components/fml-preview-wall-edit'
import { projectPointToWallT } from '@/ui/components/fml-preview-openings'
import type { useFmlPreviewEditor } from '@/ui/composables/useFmlPreviewEditor'
import type { FmlPreviewDraftCommitScheduler } from './fml-preview-draft-commit'
import { bindNumericDraftField } from './fml-preview-draft-commit'
import type { FmlPreviewSelectionRefs } from './fml-preview-selection'
import { findWallsFullyInCmBBox } from './fml-preview-wall-select'
import {
  groupIdForWall,
  isWallInStampGroup,
  listFacadeGroups,
  STAMP_FACADE_GROUP_ID,
  type FacadeGroup,
} from '@/core/fml/facade-groups'
import { promptFacadeGroupName } from '@/ui/composables/fml-chrome-dialog'

type EditorApi = ReturnType<typeof useFmlPreviewEditor>

const FIELD_THICKNESS = 'wall-thickness'
const FIELD_BALANCE = 'wall-balance'
const FIELD_WALL_HEIGHT = 'wall-height'
const FIELD_JUNCTION_HEIGHT = 'junction-height'

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
  draftCommit: FmlPreviewDraftCommitScheduler
  flushPendingFieldCommits: () => void
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
    draftCommit,
    flushPendingFieldCommits,
    containerRef,
    cancelMoveDragPending,
    cancelDrawWallDrag,
    cancelMeasureDrag,
  } = options

  const {
    settingsWallIds,
    settingsJunctionId,
    moveWallId,
    settingsOpeningIds,
    moveOpeningId,
    pinnedJunctionId,
    activeFmlTool,
  } = selection

  const wallThicknessDraft = ref(20)
  const wallThicknessMixed = ref(false)
  const wallBalanceDraft = ref(50)
  const wallBalanceMixed = ref(false)
  const wallHeightDraft = ref(DEFAULT_FML_WALL_HEIGHT_CM)
  const wallHeightMixed = ref(false)
  const junctionHeightDraft = ref(DEFAULT_FML_WALL_HEIGHT_CM)
  const junctionHeightMixed = ref(false)
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

  function floorHeight(): number {
    return editor.floorHeightCm.value
  }

  function syncWallThicknessDraftFromSelection(): void {
    const ids = settingsWallIds.value
    if (ids.length === 0) {
      wallThicknessMixed.value = false
      wallBalanceMixed.value = false
      wallHeightMixed.value = false
      return
    }
    const floorH = floorHeight()
    const thicknesses = ids
      .map((id) => editor.walls.value.find((item) => item.id === id)?.thickness)
      .filter((value): value is number => value != null)
    const balances = ids
      .map((id) => editor.walls.value.find((item) => item.id === id)?.balance ?? 0.5)
      .filter((value): value is number => value != null)
    const heights: number[] = []
    for (const id of ids) {
      const wall = editor.walls.value.find((item) => item.id === id)
      if (!wall) continue
      heights.push(wallEndpointHeightCm(wall, 'a', floorH))
      heights.push(wallEndpointHeightCm(wall, 'b', floorH))
    }
    if (thicknesses.length === 0) {
      wallThicknessMixed.value = false
      wallBalanceMixed.value = false
      wallHeightMixed.value = false
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
  }

  function syncJunctionHeightDraftFromSelection(): void {
    const junctionId = settingsJunctionId.value
    if (!junctionId) {
      junctionHeightMixed.value = false
      return
    }
    const junction = editor.junctions.value.find((item) => item.id === junctionId)
    if (!junction || junction.refs.length === 0) {
      junctionHeightMixed.value = false
      return
    }
    const floorH = floorHeight()
    const heights = junction.refs
      .map((ref) => {
        const wall = editor.walls.value.find((item) => item.id === ref.wallId)
        if (!wall) return null
        return wallEndpointHeightCm(wall, ref.end, floorH)
      })
      .filter((value): value is number => value != null)
    if (heights.length === 0) {
      junctionHeightMixed.value = false
      return
    }
    const first = Math.round(heights[0])
    const mixed = heights.some((value) => Math.round(value) !== first)
    junctionHeightMixed.value = mixed
    junctionHeightDraft.value = first
  }

  function applyThicknessToWalls(wallIds: string[], thicknessCm: number): { mutated: boolean } {
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
      const wall = editor.walls.value.find((item) => item.id === id)
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
      const wall = editor.walls.value.find((item) => item.id === id)
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

  function applyHeightToJunction(
    junctionId: string | null,
    heightRaw: number,
  ): { mutated: boolean } {
    const height = Math.max(1, Math.min(1000, Math.round(heightRaw)))
    junctionHeightDraft.value = height
    junctionHeightMixed.value = false
    if (!junctionId) return { mutated: false }
    const junction = editor.junctions.value.find((item) => item.id === junctionId)
    if (!junction || junction.refs.length === 0) return { mutated: false }
    const floorH = floorHeight()
    const already = junction.refs.every((ref) => {
      const wall = editor.walls.value.find((item) => item.id === ref.wallId)
      if (!wall) return false
      return Math.round(wallEndpointHeightCm(wall, ref.end, floorH)) === height
    })
    if (already) return { mutated: false }
    draftCommit.beginUndoGroup(FIELD_JUNCTION_HEIGHT, () => editor.pushUndo())
    editor.applyJunctionHeight(junction.refs, height)
    syncJunctionHeightDraftFromSelection()
    syncPlanToParent()
    return { mutated: true }
  }

  function toggleSettingsWall(wallId: string, clickCm?: Point2D | null): void {
    flushPendingFieldCommits()
    cancelMoveDragPending()
    settingsOpeningIds.value = []
    moveOpeningId.value = null
    settingsJunctionId.value = null
    junctionHeightMixed.value = false
    selection.settingsItemId.value = null
    selection.moveItemId.value = null
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

  function toggleSettingsJunction(junctionId: string): void {
    flushPendingFieldCommits()
    cancelMoveDragPending()
    settingsOpeningIds.value = []
    moveOpeningId.value = null
    settingsWallIds.value = []
    settingsWallSplitClickCm.value = null
    moveWallId.value = null
    selection.settingsItemId.value = null
    selection.moveItemId.value = null
    wallThicknessMixed.value = false
    wallBalanceMixed.value = false
    wallHeightMixed.value = false
    if (settingsJunctionId.value === junctionId) {
      settingsJunctionId.value = null
      junctionHeightMixed.value = false
      return
    }
    settingsJunctionId.value = junctionId
    pinnedJunctionId.value = junctionId
    syncJunctionHeightDraftFromSelection()
  }

  const thicknessField = bindNumericDraftField({
    fieldId: FIELD_THICKNESS,
    draftCommit,
    draft: wallThicknessDraft,
    mixed: wallThicknessMixed,
    applyWithValue: (value) => {
      const wallIds = [...settingsWallIds.value]
      return () => applyThicknessToWalls(wallIds, value)
    },
  })

  const balanceField = bindNumericDraftField({
    fieldId: FIELD_BALANCE,
    draftCommit,
    draft: wallBalanceDraft,
    mixed: wallBalanceMixed,
    applyWithValue: (value) => {
      const wallIds = [...settingsWallIds.value]
      return () => applyBalanceToWalls(wallIds, value)
    },
  })

  const wallHeightField = bindNumericDraftField({
    fieldId: FIELD_WALL_HEIGHT,
    draftCommit,
    draft: wallHeightDraft,
    mixed: wallHeightMixed,
    applyWithValue: (value) => {
      const wallIds = [...settingsWallIds.value]
      return () => applyHeightToWalls(wallIds, value)
    },
  })

  const junctionHeightField = bindNumericDraftField({
    fieldId: FIELD_JUNCTION_HEIGHT,
    draftCommit,
    draft: junctionHeightDraft,
    mixed: junctionHeightMixed,
    applyWithValue: (value) => {
      const junctionId = settingsJunctionId.value
      return () => applyHeightToJunction(junctionId, value)
    },
  })

  const onWallThicknessInput = thicknessField.onInput
  const commitWallThickness = thicknessField.commit
  const onWallBalanceInput = balanceField.onInput
  const commitWallBalance = balanceField.commit
  const onWallHeightInput = wallHeightField.onInput
  const commitWallHeight = wallHeightField.commit
  const onJunctionHeightInput = junctionHeightField.onInput
  const commitJunctionHeight = junctionHeightField.commit

  /** Immediate preset / programmatic thickness (own undo step). */
  function applyWallsThicknessCm(thicknessCm: number): void {
    draftCommit.endUndoGroup(FIELD_THICKNESS)
    const thickness = Math.max(1, Math.min(200, Math.round(thicknessCm)))
    wallThicknessDraft.value = thickness
    wallThicknessMixed.value = false
    if (settingsWallIds.value.length === 0) return
    const wallIds = [...settingsWallIds.value]
    const already = wallIds.every((id) => {
      const wall = editor.walls.value.find((item) => item.id === id)
      return wall != null && Math.round(wall.thickness) === thickness
    })
    if (already) return
    editor.pushUndo()
    editor.applyWallsThickness(wallIds, thickness)
    syncWallThicknessDraftFromSelection()
    syncPlanToParent()
  }

  function splitSelectedWall(): void {
    flushPendingFieldCommits()
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

  const facadeGroupOptions = computed((): FacadeGroup[] => listFacadeGroups(editor.localPlan.value))

  /** Shared gevelgroep-id, '' = none, null = mixed. Stamp zit hier niet in (aparte checkbox). */
  const facadeGroupDraft = computed((): string | null => {
    const ids = settingsWallIds.value
    if (ids.length === 0) return ''
    const groupIds = ids.map((id) => groupIdForWall(editor.localPlan.value, id))
    const first = groupIds[0] ?? null
    if (groupIds.some((id) => id !== first)) return null
    return first ?? ''
  })

  const facadeGroupMixed = computed(() => facadeGroupDraft.value === null)

  /** Stempel-lidmaatschap: true/false/null(mixed). */
  const stampGroupDraft = computed((): boolean | null => {
    const ids = settingsWallIds.value
    if (ids.length === 0) return false
    const flags = ids.map((id) => isWallInStampGroup(editor.localPlan.value, id))
    const first = flags[0] ?? false
    if (flags.some((flag) => flag !== first)) return null
    return first
  })

  const stampGroupMixed = computed(() => stampGroupDraft.value === null)

  const facadeMemberIdsOnActiveFloor = computed((): string[] => {
    const draft = facadeGroupDraft.value
    if (!draft) return []
    const onFloor = new Set(editor.walls.value.map((wall) => wall.id))
    return (
      listFacadeGroups(editor.localPlan.value)
        .find((group) => group.id === draft)
        ?.wallGuids.filter((id) => onFloor.has(id)) ?? []
    )
  })

  const stampMemberIdsOnActiveFloor = computed((): string[] => {
    const onFloor = new Set(editor.walls.value.map((wall) => wall.id))
    return (
      listFacadeGroups(editor.localPlan.value)
        .find((group) => group.id === STAMP_FACADE_GROUP_ID)
        ?.wallGuids.filter((id) => onFloor.has(id)) ?? []
    )
  })

  async function applyFacadeGroupSelection(value: string): Promise<void> {
    flushPendingFieldCommits()
    const wallIds = [...settingsWallIds.value]
    if (wallIds.length === 0) return

    if (value === '__new__') {
      const name = await promptFacadeGroupName()
      if (name == null) return
      editor.pushUndo()
      editor.applyFacadeCreate({ name }, wallIds)
      syncPlanToParent()
      return
    }

    if (value === '' || value === '__none__') {
      editor.pushUndo()
      editor.applyFacadeDetach(wallIds)
      syncPlanToParent()
      return
    }

    // Workspace stamp-preset kan nog via applyFacadeGroupSelection komen.
    if (value === STAMP_FACADE_GROUP_ID) {
      editor.pushUndo()
      editor.applyStampAssign(wallIds)
      syncPlanToParent()
      return
    }

    editor.pushUndo()
    editor.applyFacadeAssign(value, wallIds)
    syncPlanToParent()
  }

  function applyStampGroupSelection(enabled: boolean): void {
    flushPendingFieldCommits()
    const wallIds = [...settingsWallIds.value]
    if (wallIds.length === 0) return
    editor.pushUndo()
    if (enabled) editor.applyStampAssign(wallIds)
    else editor.applyStampDetach(wallIds)
    syncPlanToParent()
  }

  function renameSelectedFacadeGroup(name: string): void {
    const draft = facadeGroupDraft.value
    if (!draft || draft === STAMP_FACADE_GROUP_ID) return
    const trimmed = name.trim()
    if (!trimmed) return
    editor.pushUndo()
    editor.applyFacadeRename(draft, { name: trimmed })
    syncPlanToParent()
  }

  /** Zet alle groepsleden op deze floor in de settings-selectie (blauwe/oranje highlight). */
  function selectFacadeGroupMembers(): void {
    const ids = facadeMemberIdsOnActiveFloor.value
    if (ids.length === 0) return
    flushPendingFieldCommits()
    settingsWallIds.value = [...ids]
    settingsWallSplitClickCm.value = null
    settingsJunctionId.value = null
    settingsOpeningIds.value = []
    moveOpeningId.value = null
    moveWallId.value = null
    selection.settingsAreaId.value = null
    selection.settingsSurfaceId.value = null
    selection.settingsLabelId.value = null
    selection.settingsLineId.value = null
    selection.settingsItemId.value = null
    syncWallThicknessDraftFromSelection()
  }

  function selectStampGroupMembers(): void {
    const ids = stampMemberIdsOnActiveFloor.value
    if (ids.length === 0) return
    flushPendingFieldCommits()
    settingsWallIds.value = [...ids]
    settingsWallSplitClickCm.value = null
    settingsJunctionId.value = null
    settingsOpeningIds.value = []
    moveOpeningId.value = null
    moveWallId.value = null
    selection.settingsAreaId.value = null
    selection.settingsSurfaceId.value = null
    selection.settingsLabelId.value = null
    selection.settingsLineId.value = null
    selection.settingsItemId.value = null
    syncWallThicknessDraftFromSelection()
  }

  const canSelectFacadeMembers = computed(() => {
    const members = facadeMemberIdsOnActiveFloor.value
    if (members.length === 0) return false
    if (settingsWallIds.value.length !== members.length) return true
    const selected = new Set(settingsWallIds.value)
    return members.some((id) => !selected.has(id))
  })

  const canSelectStampMembers = computed(() => {
    const members = stampMemberIdsOnActiveFloor.value
    if (members.length === 0) return false
    if (settingsWallIds.value.length !== members.length) return true
    const selected = new Set(settingsWallIds.value)
    return members.some((id) => !selected.has(id))
  })

  function clearSelection(opts?: { flush?: boolean }): void {
    if (opts?.flush !== false) flushPendingFieldCommits()
    settingsWallIds.value = []
    settingsJunctionId.value = null
    moveWallId.value = null
    settingsOpeningIds.value = []
    moveOpeningId.value = null
    pinnedJunctionId.value = null
    settingsWallSplitClickCm.value = null
    wallThicknessMixed.value = false
    wallBalanceMixed.value = false
    wallHeightMixed.value = false
    junctionHeightMixed.value = false
    selection.settingsAreaId.value = null
    selection.settingsSurfaceId.value = null
    selection.settingsLabelId.value = null
    selection.settingsLineId.value = null
    selection.settingsItemId.value = null
    selection.moveItemId.value = null
    selection.surfaceEditId.value = null
    selection.drawSurfacePoints.value = null
    selection.drawLinePoints.value = null
  }

  function toggleSelectionBoxMode(): void {
    activeFmlTool.value = activeFmlTool.value === 'box_select' ? null : 'box_select'
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

  function applySelectionBox(rect: { x: number; y: number; width: number; height: number }): void {
    flushPendingFieldCommits()
    const cmBBox = hitTest.containerRectToCmBBox(rect)
    settingsWallSplitClickCm.value = null
    settingsJunctionId.value = null
    if (!cmBBox) {
      settingsWallIds.value = []
      wallThicknessMixed.value = false
      wallBalanceMixed.value = false
      wallHeightMixed.value = false
      return
    }
    const wallIds = findWallsFullyInCmBBox(editor.walls.value, cmBBox)
    settingsWallIds.value = wallIds
    settingsOpeningIds.value = []
    moveOpeningId.value = null
    syncWallThicknessDraftFromSelection()
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
      const added = new Set(findWallsFullyInCmBBox(editor.walls.value, cmBBox))
      if (added.size === 0) return
      const merged = new Set(settingsWallIds.value)
      for (const id of added) merged.add(id)
      settingsWallIds.value = [...merged]
      settingsWallSplitClickCm.value = null
      settingsJunctionId.value = null
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
    wallHeightDraft,
    wallHeightMixed,
    junctionHeightDraft,
    junctionHeightMixed,
    selectionBoxMode,
    selectionBoxPreview,
    syncWallThicknessDraftFromSelection,
    syncJunctionHeightDraftFromSelection,
    toggleSettingsWall,
    toggleSettingsJunction,
    onWallThicknessInput,
    commitWallThickness,
    applyWallsThicknessCm,
    onWallBalanceInput,
    commitWallBalance,
    onWallHeightInput,
    commitWallHeight,
    onJunctionHeightInput,
    commitJunctionHeight,
    splitSelectedWall,
    deleteSelectedWalls,
    facadeGroupOptions,
    facadeGroupDraft,
    facadeGroupMixed,
    facadeMemberIdsOnActiveFloor,
    stampGroupDraft,
    stampGroupMixed,
    stampMemberIdsOnActiveFloor,
    applyFacadeGroupSelection,
    applyStampGroupSelection,
    renameSelectedFacadeGroup,
    selectFacadeGroupMembers,
    selectStampGroupMembers,
    canSelectFacadeMembers,
    canSelectStampMembers,
    clearSelection,
    toggleSelectionBoxMode,
    cancelSelectionBoxDrag,
    beginSelectionBoxDrag,
  }
}
