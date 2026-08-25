import { computed, ref, type Ref } from 'vue'
import type { Point2D } from '@/core/fml/types'
import { DEFAULT_FML_WALL_HEIGHT_CM } from '@/core/fml/extraction-to-plan-types'
import {
  wallEndpoint3D,
  wallEndpointHeightCm,
  wallUniformBottomZCm,
} from '@/core/fml/wall-endpoint-height'
import { balanceToPercent, percentToBalance } from '@/ui/components/fml-preview-wall-edit'
import { projectPointToWallT } from '@/ui/components/fml-preview-openings'
import type { useFmlPreviewEditor } from '@/ui/composables/useFmlPreviewEditor'
import type { FmlPreviewDraftCommitScheduler } from './fml-preview-draft-commit'
import { bindNumericDraftField, bindScaleLengthDraftField } from './fml-preview-draft-commit'
import type { FmlPreviewSelectionRefs } from './fml-preview-selection'
import {
  collectAllOfBoxKind,
  collectBoxSelectHits,
  type BoxSelectHits,
  type BoxSelectKind,
} from './fml-preview-wall-select'
import {
  groupIdsForWall,
  isWallInStampGroup,
  listFacadeGroups,
  STAMP_FACADE_GROUP_ID,
  type FacadeGroup,
} from '@/core/fml/facade-groups'
import { promptFacadeGroupName, promptFacadeGroupsEdit } from '@/ui/composables/fml-chrome-dialog'
import { withStackedFacadeWalls } from '@/ui/composables/fml-facade-stacked'

type EditorApi = ReturnType<typeof useFmlPreviewEditor>

const FIELD_THICKNESS = 'wall-thickness'
const FIELD_BALANCE = 'wall-balance'
const FIELD_WALL_HEIGHT = 'wall-height'
const FIELD_WALL_BOTTOM_Z = 'wall-bottom-z'
const FIELD_JUNCTION_HEIGHT = 'junction-height'
const FIELD_JUNCTION_BOTTOM_Z = 'junction-bottom-z'

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
  syncOpeningDraftFromSelection?: () => void
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
  const wallBottomZDraft = ref(0)
  const wallBottomZMixed = ref(false)
  const junctionHeightDraft = ref(DEFAULT_FML_WALL_HEIGHT_CM)
  const junctionHeightMixed = ref(false)
  const junctionBottomZDraft = ref(0)
  const junctionBottomZMixed = ref(false)
  const selectionBoxPreview = ref<{ x: number; y: number; width: number; height: number } | null>(
    null,
  )
  /** Laatste Ctrl-klik op een settings-muur (cm); gebruikt voor split-positie. */
  const settingsWallSplitClickCm = ref<Point2D | null>(null)

  const selectionBoxMode = computed(() => activeFmlTool.value === 'box_select')
  const boxSelectKind = ref<BoxSelectKind>('wall')

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

  function syncJunctionHeightDraftFromSelection(): void {
    const junctionId = settingsJunctionId.value
    if (!junctionId) {
      junctionHeightMixed.value = false
      junctionBottomZMixed.value = false
      return
    }
    const junction = editor.junctions.value.find((item) => item.id === junctionId)
    if (!junction || junction.refs.length === 0) {
      junctionHeightMixed.value = false
      junctionBottomZMixed.value = false
      return
    }
    const floorH = floorHeight()
    const heights = junction.refs
      .map((ref) => {
        const wall = editor.selectableWalls.value.find((item) => item.id === ref.wallId)
        if (!wall) return null
        return wallEndpointHeightCm(wall, ref.end, floorH)
      })
      .filter((value): value is number => value != null)
    const bottoms = junction.refs
      .map((ref) => {
        const wall = editor.selectableWalls.value.find((item) => item.id === ref.wallId)
        if (!wall) return null
        return wallEndpoint3D(wall, ref.end, floorH).z
      })
      .filter((value): value is number => value != null)
    if (heights.length === 0) {
      junctionHeightMixed.value = false
      junctionBottomZMixed.value = false
      return
    }
    const first = Math.round(heights[0])
    const mixed = heights.some((value) => Math.round(value) !== first)
    junctionHeightMixed.value = mixed
    junctionHeightDraft.value = first
    if (bottoms.length > 0) {
      const firstBottom = Math.round(bottoms[0])
      const bottomMixed = bottoms.some((value) => Math.round(value) !== firstBottom)
      junctionBottomZMixed.value = bottomMixed
      junctionBottomZDraft.value = firstBottom
    }
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
      const wall = editor.selectableWalls.value.find((item) => item.id === ref.wallId)
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

  function applyBottomZToJunction(
    junctionId: string | null,
    bottomRaw: number,
  ): { mutated: boolean } {
    const bottomZ = Math.max(0, Math.min(2000, Math.round(bottomRaw)))
    junctionBottomZDraft.value = bottomZ
    junctionBottomZMixed.value = false
    if (!junctionId) return { mutated: false }
    const junction = editor.junctions.value.find((item) => item.id === junctionId)
    if (!junction || junction.refs.length === 0) return { mutated: false }
    const floorH = floorHeight()
    const already = junction.refs.every((ref) => {
      const wall = editor.selectableWalls.value.find((item) => item.id === ref.wallId)
      if (!wall) return false
      return Math.round(wallEndpoint3D(wall, ref.end, floorH).z) === bottomZ
    })
    if (already) return { mutated: false }
    draftCommit.beginUndoGroup(FIELD_JUNCTION_BOTTOM_Z, () => editor.pushUndo())
    editor.applyJunctionBottomZ(junction.refs, bottomZ)
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
    wallBottomZMixed.value = false
    if (settingsJunctionId.value === junctionId) {
      settingsJunctionId.value = null
      junctionHeightMixed.value = false
      return
    }
    settingsJunctionId.value = junctionId
    pinnedJunctionId.value = junctionId
    syncJunctionHeightDraftFromSelection()
  }

  const thicknessField = bindScaleLengthDraftField({
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

  const wallHeightField = bindScaleLengthDraftField({
    fieldId: FIELD_WALL_HEIGHT,
    draftCommit,
    draft: wallHeightDraft,
    mixed: wallHeightMixed,
    applyWithValue: (value) => {
      const wallIds = [...settingsWallIds.value]
      return () => applyHeightToWalls(wallIds, value)
    },
  })

  const wallBottomZField = bindScaleLengthDraftField({
    fieldId: FIELD_WALL_BOTTOM_Z,
    draftCommit,
    draft: wallBottomZDraft,
    mixed: wallBottomZMixed,
    applyWithValue: (value) => {
      const wallIds = [...settingsWallIds.value]
      return () => applyBottomZToWalls(wallIds, value)
    },
  })

  const junctionHeightField = bindScaleLengthDraftField({
    fieldId: FIELD_JUNCTION_HEIGHT,
    draftCommit,
    draft: junctionHeightDraft,
    mixed: junctionHeightMixed,
    applyWithValue: (value) => {
      const junctionId = settingsJunctionId.value
      return () => applyHeightToJunction(junctionId, value)
    },
  })

  const junctionBottomZField = bindScaleLengthDraftField({
    fieldId: FIELD_JUNCTION_BOTTOM_Z,
    draftCommit,
    draft: junctionBottomZDraft,
    mixed: junctionBottomZMixed,
    applyWithValue: (value) => {
      const junctionId = settingsJunctionId.value
      return () => applyBottomZToJunction(junctionId, value)
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
  const onJunctionHeightCm = junctionHeightField.onCm
  const commitJunctionHeight = junctionHeightField.commit
  const onJunctionBottomZCm = junctionBottomZField.onCm
  const commitJunctionBottomZ = junctionBottomZField.commit

  /** Immediate preset / programmatic thickness (own undo step). */
  function applyWallsThicknessCm(thicknessCm: number): void {
    draftCommit.endUndoGroup(FIELD_THICKNESS)
    const thickness = Math.max(1, Math.min(200, Math.round(thicknessCm)))
    wallThicknessDraft.value = thickness
    wallThicknessMixed.value = false
    if (settingsWallIds.value.length === 0) return
    const wallIds = [...settingsWallIds.value]
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

  function splitSelectedWall(): void {
    flushPendingFieldCommits()
    if (settingsWallIds.value.length !== 1) return
    const wallId = settingsWallIds.value[0]
    const wall = editor.selectableWalls.value.find((item) => item.id === wallId)
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

  /**
   * Per gevelgroep: true = alle geselecteerde muren lid, false = geen, null = gemengd.
   * Stamp zit hier niet in (aparte checkbox).
   */
  const facadeGroupChecks = computed((): Record<string, boolean | null> => {
    const ids = settingsWallIds.value
    const out: Record<string, boolean | null> = {}
    for (const group of facadeGroupOptions.value) {
      if (group.id === STAMP_FACADE_GROUP_ID) continue
      if (ids.length === 0) {
        out[group.id] = false
        continue
      }
      const flags = ids.map((id) => groupIdsForWall(editor.localPlan.value, id).includes(group.id))
      const first = flags[0] ?? false
      out[group.id] = flags.some((flag) => flag !== first) ? null : first
    }
    return out
  })

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

  /** Highlight: unie van floor-leden van groepen die alle geselecteerde muren delen. */
  const facadeMemberIdsOnActiveFloor = computed((): string[] => {
    const ids = settingsWallIds.value
    if (ids.length === 0) return []
    const plan = editor.localPlan.value
    let common: Set<string> | null = null
    for (const wallId of ids) {
      const set = new Set(groupIdsForWall(plan, wallId))
      if (common == null) common = set
      else {
        for (const gid of [...common]) {
          if (!set.has(gid)) common.delete(gid)
        }
      }
    }
    if (!common || common.size === 0) return []
    const onFloor = new Set(editor.walls.value.map((wall) => wall.id))
    const out = new Set<string>()
    for (const group of listFacadeGroups(plan)) {
      if (!common.has(group.id)) continue
      for (const id of group.wallGuids) {
        if (onFloor.has(id)) out.add(id)
      }
    }
    return [...out]
  })

  const stampMemberIdsOnActiveFloor = computed((): string[] => {
    const onFloor = new Set(editor.walls.value.map((wall) => wall.id))
    return (
      listFacadeGroups(editor.localPlan.value)
        .find((group) => group.id === STAMP_FACADE_GROUP_ID)
        ?.wallGuids.filter((id) => onFloor.has(id)) ?? []
    )
  })

  async function createFacadeGroupFromSelection(): Promise<void> {
    flushPendingFieldCommits()
    const selectedIds = [...settingsWallIds.value]
    if (selectedIds.length === 0) return
    const plan = editor.localPlan.value
    if (!plan) return
    const name = await promptFacadeGroupName()
    if (name == null) return
    const wallIds = await withStackedFacadeWalls(plan, selectedIds, 'create')
    editor.pushUndo()
    editor.applyFacadeCreate({ name }, wallIds)
    syncPlanToParent()
  }

  async function toggleFacadeGroup(groupId: string, enabled: boolean): Promise<void> {
    flushPendingFieldCommits()
    const selectedIds = [...settingsWallIds.value]
    if (selectedIds.length === 0) return
    const plan = editor.localPlan.value
    if (!plan) return

    if (groupId === STAMP_FACADE_GROUP_ID) {
      editor.pushUndo()
      if (enabled) editor.applyStampAssign(selectedIds)
      else editor.applyStampDetach(selectedIds)
      syncPlanToParent()
      return
    }

    if (enabled) {
      const wallIds = await withStackedFacadeWalls(plan, selectedIds, 'assign', groupId)
      editor.pushUndo()
      editor.applyFacadeAssign(groupId, wallIds)
    } else {
      const wallIds = await withStackedFacadeWalls(plan, selectedIds, 'detach', groupId)
      editor.pushUndo()
      editor.applyFacadeDetachFromGroup(groupId, wallIds)
    }
    syncPlanToParent()
  }

  async function removeFacadeGroupFromSelection(groupId: string): Promise<void> {
    await toggleFacadeGroup(groupId, false)
  }

  async function editAllFacadeGroups(): Promise<void> {
    const groups = facadeGroupOptions.value.filter((g) => g.id !== STAMP_FACADE_GROUP_ID)
    if (groups.length === 0) return
    const edited = await promptFacadeGroupsEdit(groups.map((g) => ({ id: g.id, name: g.name })))
    if (!edited) return
    const renames = edited.filter((row) => {
      const current = groups.find((g) => g.id === row.id)
      return current != null && current.name !== row.name
    })
    if (renames.length === 0) return
    editor.pushUndo()
    for (const row of renames) {
      editor.applyFacadeRename(row.id, { name: row.name })
    }
    syncPlanToParent()
  }

  async function applyFacadeGroupSelection(value: string): Promise<void> {
    if (value === '__edit__') {
      await editAllFacadeGroups()
      return
    }
    if (value === '__new__') {
      await createFacadeGroupFromSelection()
      return
    }
    if (value === STAMP_FACADE_GROUP_ID) {
      await toggleFacadeGroup(STAMP_FACADE_GROUP_ID, true)
      return
    }
    if (value === '' || value === '__none__') {
      flushPendingFieldCommits()
      const selectedIds = [...settingsWallIds.value]
      if (selectedIds.length === 0) return
      const plan = editor.localPlan.value
      if (!plan) return
      const wallIds = await withStackedFacadeWalls(plan, selectedIds, 'detach')
      editor.pushUndo()
      editor.applyFacadeDetach(wallIds)
      syncPlanToParent()
      return
    }
    await toggleFacadeGroup(value, true)
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

  async function renameFacadeGroupById(groupId: string): Promise<void> {
    if (!groupId || groupId === STAMP_FACADE_GROUP_ID) return
    const current = facadeGroupOptions.value.find((group) => group.id === groupId)
    const name = await promptFacadeGroupName({ currentName: current?.name })
    if (name == null || name === current?.name) return
    editor.pushUndo()
    editor.applyFacadeRename(groupId, { name })
    syncPlanToParent()
  }

  async function renameSelectedFacadeGroup(): Promise<void> {
    const checked = Object.entries(facadeGroupChecks.value).filter(([, v]) => v === true)
    if (checked.length !== 1) return
    await renameFacadeGroupById(checked[0][0])
  }

  /** Zet alle leden van `groupId` op deze floor in de settings-selectie. */
  function selectFacadeGroupMembersById(groupId: string): void {
    const onFloor = new Set(editor.walls.value.map((wall) => wall.id))
    const ids =
      listFacadeGroups(editor.localPlan.value)
        .find((group) => group.id === groupId)
        ?.wallGuids.filter((id) => onFloor.has(id)) ?? []
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

  function selectFacadeGroupMembers(): void {
    const common = Object.entries(facadeGroupChecks.value)
      .filter(([, v]) => v === true)
      .map(([id]) => id)
    if (common.length !== 1) return
    selectFacadeGroupMembersById(common[0])
  }

  function canSelectMembersOfGroup(groupId: string): boolean {
    const onFloor = new Set(editor.walls.value.map((wall) => wall.id))
    const members =
      listFacadeGroups(editor.localPlan.value)
        .find((group) => group.id === groupId)
        ?.wallGuids.filter((id) => onFloor.has(id)) ?? []
    if (members.length === 0) return false
    if (settingsWallIds.value.length !== members.length) return true
    const selected = new Set(settingsWallIds.value)
    return members.some((id) => !selected.has(id))
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
    const checked = Object.entries(facadeGroupChecks.value).filter(([, v]) => v === true)
    if (checked.length !== 1) return false
    return canSelectMembersOfGroup(checked[0][0])
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
    selection.moveDimensionId.value = null
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
      settingsWallIds.value = mergeIds(settingsWallIds.value, hits.wallIds, additive)
      syncWallThicknessDraftFromSelection()
    } else {
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
    facadeGroupOptions,
    facadeGroupChecks,
    facadeMemberIdsOnActiveFloor,
    stampGroupDraft,
    stampGroupMixed,
    stampMemberIdsOnActiveFloor,
    applyFacadeGroupSelection,
    removeFacadeGroupFromSelection,
    editAllFacadeGroups,
    createFacadeGroupFromSelection,
    toggleFacadeGroup,
    applyStampGroupSelection,
    renameSelectedFacadeGroup,
    renameFacadeGroupById,
    selectFacadeGroupMembers,
    selectFacadeGroupMembersById,
    selectStampGroupMembers,
    canSelectFacadeMembers,
    canSelectMembersOfGroup,
    canSelectStampMembers,
    clearSelection,
    toggleSelectionBoxMode,
    cancelSelectionBoxDrag,
    beginSelectionBoxDrag,
  }
}
