import { ref } from 'vue'
import { isRoofSurface } from '@/core/fml/roof-planes'
import type { FloorArea, FloorSurface } from '@/core/fml/types'
import {
  effectiveRoomTypeColor,
  listRoomTypes,
  parseFmlHex,
  resolveRoomType,
} from '@/core/fml/roomtype-catalog'
import { loadUserSettings } from '@/ui/composables/settings/user-settings'
import type { FmlPreviewDraftCommitScheduler } from './fml-preview-draft-commit'
import type { FmlPreviewSelectionRefs } from './fml-preview-selection'
import type { useFmlPreviewEditor } from '@/ui/composables/useFmlPreviewEditor'

type EditorApi = ReturnType<typeof useFmlPreviewEditor>

const FIELD_CUSTOM_NAME = 'area-custom-name'

export function useFmlPreviewAreaSelection(options: {
  selection: FmlPreviewSelectionRefs
  editor: EditorApi
  syncPlanToParent: () => void
  draftCommit: FmlPreviewDraftCommitScheduler
  flushPendingFieldCommits: () => void
  cancelMoveDragPending: () => void
  cancelOpeningDragPending: () => void
}) {
  const {
    settingsAreaId,
    settingsSurfaceId,
    surfaceEditId,
    roofPolyMutate,
    settingsWallIds,
    moveWallId,
    settingsOpeningIds,
    moveOpeningId,
    pinnedJunctionId,
  } = options.selection

  const { draftCommit, flushPendingFieldCommits } = options

  /** Local draft so Vue `:value` does not fight mid-typing. */
  const customNameDraft = ref('')

  function syncCustomNameDraftFromSelection(): void {
    const area = selectedArea()
    if (area) {
      customNameDraft.value = area.customName ?? ''
      return
    }
    const surface = selectedSurface()
    customNameDraft.value = surface?.customName ?? ''
  }

  function clearTaggedSelection(): void {
    settingsAreaId.value = null
    settingsSurfaceId.value = null
    surfaceEditId.value = null
    roofPolyMutate.value = false
    customNameDraft.value = ''
  }

  function clearOtherSelections(): void {
    options.cancelMoveDragPending()
    options.cancelOpeningDragPending()
    moveWallId.value = null
    settingsWallIds.value = []
    options.selection.settingsJunctionId.value = null
    pinnedJunctionId.value = null
    moveOpeningId.value = null
    settingsOpeningIds.value = []
    options.selection.settingsItemId.value = null
    options.selection.moveItemId.value = null
  }

  function toggleSettingsArea(areaId: string): void {
    flushPendingFieldCommits()
    clearOtherSelections()
    settingsSurfaceId.value = null
    surfaceEditId.value = null
    roofPolyMutate.value = false
    settingsAreaId.value = settingsAreaId.value === areaId ? null : areaId
    syncCustomNameDraftFromSelection()
  }

  function toggleSettingsSurface(surfaceId: string): void {
    selectRoofSurface(surfaceId, false)
  }

  function selectRoofSurface(surfaceId: string, mutate: boolean): void {
    flushPendingFieldCommits()
    clearOtherSelections()
    settingsAreaId.value = null
    const surface = options.editor.surfaces.value.find((item) => item.id === surfaceId)
    const roof = surface != null && isRoofSurface(surface)
    if (settingsSurfaceId.value === surfaceId && !mutate) {
      settingsSurfaceId.value = null
      surfaceEditId.value = null
      roofPolyMutate.value = false
      syncCustomNameDraftFromSelection()
      return
    }
    settingsSurfaceId.value = surfaceId
    surfaceEditId.value = roof ? surfaceId : mutate ? surfaceId : null
    roofPolyMutate.value = roof && mutate
    syncCustomNameDraftFromSelection()
  }

  function beginSurfacePolygonEdit(): void {
    flushPendingFieldCommits()
    if (!settingsSurfaceId.value) return
    surfaceEditId.value = settingsSurfaceId.value
    roofPolyMutate.value = true
  }

  function endSurfacePolygonEdit(): void {
    if (roofPolyMutate.value) {
      roofPolyMutate.value = false
      return
    }
    const surface = selectedSurface()
    if (surface && isRoofSurface(surface)) {
      settingsSurfaceId.value = null
      surfaceEditId.value = null
      return
    }
    surfaceEditId.value = null
  }

  function applyRoomTypeToSelection(role: number): void {
    flushPendingFieldCommits()
    const rt = resolveRoomType(role)
    if (!rt) return
    const overrides = loadUserSettings().roomTagColors
    const color = effectiveRoomTypeColor(role, overrides)
    options.editor.pushUndo()
    if (settingsAreaId.value) {
      options.editor.updateArea(settingsAreaId.value, {
        role: rt.role,
        name: rt.name,
        color,
      })
    } else if (settingsSurfaceId.value) {
      options.editor.updateSurface(settingsSurfaceId.value, {
        role: rt.role,
        name: rt.name,
        color,
      })
    }
    options.syncPlanToParent()
  }

  function applyCustomNameToTarget(
    areaId: string | null,
    surfaceId: string | null,
    customName: string,
  ): { mutated: boolean } {
    const trimmed = customName.trim()
    const value = trimmed.length > 0 ? trimmed : undefined
    customNameDraft.value = value ?? ''
    if (!areaId && !surfaceId) return { mutated: false }
    if (areaId) {
      const area = options.editor.areas.value.find((a) => a.id === areaId)
      const current = area?.customName
      if ((current ?? undefined) === value) return { mutated: false }
      draftCommit.beginUndoGroup(FIELD_CUSTOM_NAME, () => options.editor.pushUndo())
      options.editor.updateArea(areaId, { customName: value })
    } else if (surfaceId) {
      const surface = options.editor.surfaces.value.find((s) => s.id === surfaceId)
      const current = surface?.customName
      if ((current ?? undefined) === value) return { mutated: false }
      draftCommit.beginUndoGroup(FIELD_CUSTOM_NAME, () => options.editor.pushUndo())
      options.editor.updateSurface(surfaceId, { customName: value })
    }
    options.syncPlanToParent()
    return { mutated: true }
  }

  function onCustomNameInput(customName: string): void {
    customNameDraft.value = customName
    const areaId = settingsAreaId.value
    const surfaceId = settingsSurfaceId.value
    draftCommit.schedule(FIELD_CUSTOM_NAME, () =>
      applyCustomNameToTarget(areaId, surfaceId, customName),
    )
  }

  function commitCustomName(): void {
    const areaId = settingsAreaId.value
    const surfaceId = settingsSurfaceId.value
    const customName = customNameDraft.value
    draftCommit.schedule(FIELD_CUSTOM_NAME, () =>
      applyCustomNameToTarget(areaId, surfaceId, customName),
    )
    draftCommit.flush(FIELD_CUSTOM_NAME)
  }

  /** @deprecated Prefer onCustomNameInput / commitCustomName — kept for emit name. */
  function applyCustomName(customName: string): void {
    customNameDraft.value = customName
    commitCustomName()
  }

  function applyColor(color: string): void {
    const hex = parseFmlHex(color)
    if (!hex) return
    flushPendingFieldCommits()
    options.editor.pushUndo()
    if (settingsAreaId.value) {
      options.editor.updateArea(settingsAreaId.value, { color: hex })
    } else if (settingsSurfaceId.value) {
      options.editor.updateSurface(settingsSurfaceId.value, { color: hex })
    }
    options.syncPlanToParent()
  }

  function applyShowAreaLabel(show: boolean): void {
    flushPendingFieldCommits()
    const current = selectedArea() ?? selectedSurface()
    if (!current) return
    const shown = current.showAreaLabel !== false
    if (shown === show) return
    options.editor.pushUndo()
    if (settingsAreaId.value) {
      options.editor.updateArea(settingsAreaId.value, { showAreaLabel: show })
    } else if (settingsSurfaceId.value) {
      options.editor.updateSurface(settingsSurfaceId.value, { showAreaLabel: show })
    }
    options.syncPlanToParent()
  }

  function deleteSelectedTagged(): void {
    flushPendingFieldCommits()
    options.editor.pushUndo()
    if (settingsAreaId.value) {
      options.editor.removeArea(settingsAreaId.value)
      settingsAreaId.value = null
    } else if (settingsSurfaceId.value) {
      options.editor.removeSurface(settingsSurfaceId.value)
      settingsSurfaceId.value = null
      surfaceEditId.value = null
      roofPolyMutate.value = false
    }
    customNameDraft.value = ''
    options.syncPlanToParent()
  }

  function selectedArea(): FloorArea | null {
    if (!settingsAreaId.value) return null
    return options.editor.areas.value.find((a) => a.id === settingsAreaId.value) ?? null
  }

  function selectedSurface(): FloorSurface | null {
    if (!settingsSurfaceId.value) return null
    return options.editor.surfaces.value.find((s) => s.id === settingsSurfaceId.value) ?? null
  }

  return {
    roomTypes: listRoomTypes(),
    customNameDraft,
    syncCustomNameDraftFromSelection,
    clearTaggedSelection,
    toggleSettingsArea,
    toggleSettingsSurface,
    selectRoofSurface,
    beginSurfacePolygonEdit,
    endSurfacePolygonEdit,
    applyRoomTypeToSelection,
    onCustomNameInput,
    commitCustomName,
    applyCustomName,
    applyColor,
    applyShowAreaLabel,
    deleteSelectedTagged,
    selectedArea,
    selectedSurface,
  }
}

export type AreaSelectionPanel = {
  kind: 'area' | 'surface'
  id: string
  role: number | null
  name: string | null
  customName: string
  color: string
  showAreaLabel: boolean
  canEditPolygon: boolean
}
