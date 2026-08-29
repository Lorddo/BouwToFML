import { computed, watch } from 'vue'
import type { Point2D } from '@/core/fml/types'
import type { useFmlPreviewEditor } from '@/ui/composables/useFmlPreviewEditor'
import {
  groupIdsForWall,
  isWallInStampGroup,
  listFacadeGroups,
  STAMP_FACADE_GROUP_ID,
  type FacadeGroup,
} from '@/core/fml/facade-groups'
import { promptFacadeGroupName, promptFacadeGroupsEdit } from '@/ui/composables/fml-chrome-dialog'
import { withStackedFacadeWalls } from '@/ui/composables/fml-facade-stacked'
import type { FmlPreviewSelectionRefs } from './fml-preview-selection'

type EditorApi = ReturnType<typeof useFmlPreviewEditor>

export interface WallFacadeSelectionDeps {
  editor: EditorApi
  selection: FmlPreviewSelectionRefs
  syncPlanToParent: () => void
  flushPendingFieldCommits: () => void
  wallThicknessDraft: { value: number }
  wallThicknessMixed: { value: boolean }
  settingsWallSplitClickCm: { value: Point2D | null }
  syncFacadeThicknessDraftFromGroup: () => void
  syncWallThicknessDraftFromSelection: () => void
}

/**
 * Facade-group computeds, actions and watchers extracted from WallSelection.
 * Pure data / async helpers — no draft-commit / box-select / DOM.
 */

export function createWallFacadeSelection(deps: WallFacadeSelectionDeps) {
  const {
    editor,
    selection,
    syncPlanToParent,
    flushPendingFieldCommits,
    syncWallThicknessDraftFromSelection,
  } = deps

  const {
    settingsWallIds,
    settingsFacadeGroupId,
    settingsJunctionId,
    settingsOpeningIds,
    moveOpeningId,
    moveWallId,
    activeFmlTool,
  } = selection

  // ── Computeds ──

  const facadeGroupOptions = computed((): FacadeGroup[] => listFacadeGroups(editor.localPlan.value))

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

  const selectedFacadeGroupPanel = computed(() => {
    const groupId = settingsFacadeGroupId.value
    const plan = editor.localPlan.value
    if (!groupId || !plan) return null
    const group = listFacadeGroups(plan).find((entry) => entry.id === groupId)
    if (!group) return null
    const idSet = new Set(group.wallGuids)
    let wallCount = 0
    let floorCount = 0
    for (const floor of plan.floors) {
      const n = floor.walls.reduce((sum, wall) => sum + (idSet.has(wall.id) ? 1 : 0), 0)
      if (n === 0) continue
      wallCount += n
      floorCount += 1
    }
    return {
      groupId,
      name: group.name || group.id,
      wallCount,
      floorCount,
    }
  })

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

  // ── Actions ──

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

  function selectFacadeGroupMembersById(groupId: string): void {
    const group = listFacadeGroups(editor.localPlan.value).find((entry) => entry.id === groupId)
    if (!group) return
    flushPendingFieldCommits()
    if (activeFmlTool.value != null && activeFmlTool.value !== 'box_select') {
      activeFmlTool.value = null
    }
    const onFloor = new Set(editor.walls.value.map((wall) => wall.id))
    settingsFacadeGroupId.value = groupId
    settingsWallIds.value = group.wallGuids.filter((id) => onFloor.has(id))
    deps.settingsWallSplitClickCm.value = null
    settingsJunctionId.value = null
    settingsOpeningIds.value = []
    moveOpeningId.value = null
    moveWallId.value = null
    selection.settingsAreaId.value = null
    selection.settingsSurfaceId.value = null
    selection.settingsLabelId.value = null
    selection.settingsLineId.value = null
    selection.settingsItemId.value = null
    deps.syncFacadeThicknessDraftFromGroup()
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
    settingsFacadeGroupId.value = null
    settingsWallIds.value = [...ids]
    deps.settingsWallSplitClickCm.value = null
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

  // ── Watchers ──

  watch(
    () => editor.floorIndex.value,
    () => {
      const groupId = settingsFacadeGroupId.value
      if (!groupId) return
      flushPendingFieldCommits()
      const onFloor = new Set(editor.walls.value.map((wall) => wall.id))
      settingsWallIds.value =
        listFacadeGroups(editor.localPlan.value)
          .find((group) => group.id === groupId)
          ?.wallGuids.filter((id) => onFloor.has(id)) ?? []
    },
  )

  watch(activeFmlTool, (tool) => {
    if (!settingsFacadeGroupId.value) return
    if (tool == null || tool === 'box_select') return
    settingsFacadeGroupId.value = null
    settingsWallIds.value = []
  })

  return {
    facadeGroupOptions,
    facadeGroupChecks,
    stampGroupDraft,
    stampGroupMixed,
    facadeMemberIdsOnActiveFloor,
    stampMemberIdsOnActiveFloor,
    selectedFacadeGroupPanel,
    canSelectFacadeMembers,
    canSelectStampMembers,
    createFacadeGroupFromSelection,
    toggleFacadeGroup,
    removeFacadeGroupFromSelection,
    editAllFacadeGroups,
    applyFacadeGroupSelection,
    applyStampGroupSelection,
    renameFacadeGroupById,
    renameSelectedFacadeGroup,
    selectFacadeGroupMembersById,
    selectFacadeGroupMembers,
    canSelectMembersOfGroup,
    selectStampGroupMembers,
  }
}
