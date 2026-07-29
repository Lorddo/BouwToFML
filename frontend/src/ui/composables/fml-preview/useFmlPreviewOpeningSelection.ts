import { ref } from 'vue'
import {
  resolveDoorSubtypeFromRefid,
  resolveWindowSubtypeFromRefid,
} from '@/core/fml/opening-add-presets'
import {
  DEFAULT_FML_DOOR_HEIGHT_CM,
  DEFAULT_FML_WINDOW_SILL_Z_CM,
} from '@/core/fml/extraction-to-plan-types'
import {
  buildMirrored,
  resolveHingeAtStart,
  resolveSwingSign,
} from '@/ui/components/fml-preview-doors'
import {
  clampOpeningHeight,
  clampOpeningSillZ,
  clampOpeningWidth,
  resolveOpeningHeight,
  resolveWindowSillZ,
} from '@/ui/components/fml-preview-openings'
import type { useFmlPreviewEditor } from '@/ui/composables/useFmlPreviewEditor'
import { computeOpeningDraftState } from './fml-preview-opening-draft'
import type { FmlPreviewSelectionRefs } from './fml-preview-selection'

type EditorApi = ReturnType<typeof useFmlPreviewEditor>

export function useFmlPreviewOpeningSelection(options: {
  editor: EditorApi
  selection: FmlPreviewSelectionRefs
  syncPlanToParent: () => void
  cancelMoveDragPending: () => void
  cancelOpeningDragPending: () => void
}) {
  const { editor, selection, syncPlanToParent, cancelMoveDragPending, cancelOpeningDragPending } =
    options

  const {
    settingsWallIds,
    moveWallId,
    settingsOpeningIds,
    moveOpeningId,
    hoveredOpeningId,
    addDoorSubtype,
    addDoorWidthCm,
    addWindowSubtype,
    addWindowWidthCm,
    addWindowSillZCm,
    addWindowHeightCm,
    activeFmlTool,
    pinnedJunctionId,
  } = selection

  const openingWidthDraft = ref(90)
  const openingWidthMixed = ref(false)
  const openingHeightDraft = ref(DEFAULT_FML_DOOR_HEIGHT_CM)
  const openingHeightMixed = ref(false)
  const openingSillZDraft = ref(DEFAULT_FML_WINDOW_SILL_Z_CM)
  const openingSillZMixed = ref(false)
  const openingHingeAtStartDraft = ref(true)
  const openingHingeMixed = ref(false)
  const openingSwingRightDraft = ref(false)
  const openingSwingMixed = ref(false)

  function selectedOpenings() {
    return settingsOpeningIds.value
      .map((id) => editor.resolveOpening(id))
      .filter((item): item is NonNullable<ReturnType<typeof editor.resolveOpening>> => item != null)
  }

  function syncOpeningDraftFromSelection(): void {
    const selected = selectedOpenings()
    if (selected.length === 0) {
      openingWidthMixed.value = false
      openingHeightMixed.value = false
      openingSillZMixed.value = false
      openingHingeMixed.value = false
      openingSwingMixed.value = false
      return
    }
    const draft = computeOpeningDraftState(selected.map((item) => item.opening))
    if (!draft) return

    openingWidthMixed.value = draft.widthMixed
    openingWidthDraft.value = draft.widthCm
    openingHeightMixed.value = draft.heightMixed
    openingHeightDraft.value = draft.heightCm
    openingSillZMixed.value = draft.sillZMixed
    openingSillZDraft.value = draft.sillZCm
    openingHingeMixed.value = draft.hingeMixed
    openingHingeAtStartDraft.value = draft.hingeAtStart
    openingSwingMixed.value = draft.swingMixed
    openingSwingRightDraft.value = draft.swingRight
  }

  function clearOpeningSelectionState(): void {
    settingsOpeningIds.value = []
    moveOpeningId.value = null
    hoveredOpeningId.value = null
    openingWidthMixed.value = false
    openingHeightMixed.value = false
    openingSillZMixed.value = false
    openingHingeMixed.value = false
    openingSwingMixed.value = false
  }

  function toggleSettingsOpening(openingId: string): void {
    cancelMoveDragPending()
    cancelOpeningDragPending()
    moveWallId.value = null
    settingsWallIds.value = []
    pinnedJunctionId.value = null
    moveOpeningId.value = null
    const located = editor.resolveOpening(openingId)
    const current = settingsOpeningIds.value
    if (current.includes(openingId)) {
      settingsOpeningIds.value = current.filter((id) => id !== openingId)
    } else if (located) {
      const existing = selectedOpenings()
      const sameType =
        existing.length === 0 ||
        existing.every((item) => item.opening.type === located.opening.type)
      settingsOpeningIds.value = sameType ? [...current, openingId] : [openingId]
    } else {
      settingsOpeningIds.value = [...current, openingId]
    }
    syncOpeningDraftFromSelection()
  }

  function onOpeningWidthInput(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value)
    if (!Number.isFinite(value)) return
    openingWidthDraft.value = value
    openingWidthMixed.value = false
  }

  function commitOpeningWidth(): void {
    if (settingsOpeningIds.value.length === 0) return
    const width = clampOpeningWidth(openingWidthDraft.value)
    openingWidthDraft.value = width
    editor.pushUndo()
    for (const openingId of settingsOpeningIds.value) {
      editor.updateOpening(openingId, { width })
    }
    syncOpeningDraftFromSelection()
    syncPlanToParent()
  }

  function onOpeningHeightInput(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value)
    if (!Number.isFinite(value)) return
    openingHeightDraft.value = value
    openingHeightMixed.value = false
  }

  function commitOpeningHeight(): void {
    if (settingsOpeningIds.value.length === 0) return
    editor.pushUndo()
    for (const openingId of settingsOpeningIds.value) {
      const located = editor.resolveOpening(openingId)
      if (!located) continue
      const height = clampOpeningHeight(openingHeightDraft.value, located.opening.type)
      editor.updateOpening(openingId, { z_height: height })
    }
    syncOpeningDraftFromSelection()
    syncPlanToParent()
  }

  function onOpeningSillZInput(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value)
    if (!Number.isFinite(value)) return
    openingSillZDraft.value = value
    openingSillZMixed.value = false
  }

  function commitOpeningSillZ(): void {
    if (settingsOpeningIds.value.length === 0) return
    const sillZ = clampOpeningSillZ(openingSillZDraft.value)
    openingSillZDraft.value = sillZ
    editor.pushUndo()
    for (const openingId of settingsOpeningIds.value) {
      const located = editor.resolveOpening(openingId)
      if (!located || located.opening.type !== 'window') continue
      editor.updateOpening(openingId, { z: sillZ })
    }
    syncOpeningDraftFromSelection()
    syncPlanToParent()
  }

  function applyOpeningMirrorPatch(params: { hingeAtStart?: boolean; swingRight?: boolean }): void {
    if (settingsOpeningIds.value.length === 0) return
    editor.pushUndo()
    for (const openingId of settingsOpeningIds.value) {
      const located = editor.resolveOpening(openingId)
      if (!located || located.opening.type !== 'door') continue
      const hingeAtStart = params.hingeAtStart ?? resolveHingeAtStart(located.opening.mirrored)
      const swingRight = params.swingRight ?? resolveSwingSign(located.opening.mirrored) > 0
      editor.updateOpening(openingId, { mirrored: buildMirrored(hingeAtStart, swingRight) })
    }
    syncOpeningDraftFromSelection()
    syncPlanToParent()
  }

  function toggleOpeningHingeAtStart(): void {
    const next = openingHingeMixed.value ? true : !openingHingeAtStartDraft.value
    openingHingeAtStartDraft.value = next
    openingHingeMixed.value = false
    applyOpeningMirrorPatch({ hingeAtStart: next })
  }

  function toggleOpeningSwingRight(): void {
    const next = openingSwingMixed.value ? true : !openingSwingRightDraft.value
    openingSwingRightDraft.value = next
    openingSwingMixed.value = false
    applyOpeningMirrorPatch({ swingRight: next })
  }

  function deleteSelectedOpenings(): void {
    if (settingsOpeningIds.value.length === 0) return
    editor.pushUndo()
    const deleted = new Set(settingsOpeningIds.value)
    editor.removeOpenings(settingsOpeningIds.value)
    if (moveOpeningId.value && deleted.has(moveOpeningId.value)) {
      moveOpeningId.value = null
    }
    settingsOpeningIds.value = []
    syncOpeningDraftFromSelection()
    syncPlanToParent()
  }

  function copySelectedOpening(): void {
    const selected = selectedOpenings()
    if (selected.length !== 1) return
    const { opening } = selected[0]
    if (opening.type === 'window') {
      const subtype = resolveWindowSubtypeFromRefid(opening.refid)
      const width = clampOpeningWidth(opening.width)
      const sillZ = resolveWindowSillZ(opening)
      const height = resolveOpeningHeight(opening)
      addWindowSubtype.value = subtype
      queueMicrotask(() => {
        addWindowWidthCm.value = width
        addWindowSillZCm.value = sillZ
        addWindowHeightCm.value = height
      })
      clearOpeningSelectionState()
      settingsWallIds.value = []
      moveWallId.value = null
      pinnedJunctionId.value = null
      activeFmlTool.value = 'add_window'
      return
    }

    const subtype = resolveDoorSubtypeFromRefid(opening.refid)
    const width = clampOpeningWidth(opening.width)
    addDoorSubtype.value = subtype
    queueMicrotask(() => {
      addDoorWidthCm.value = width
    })
    clearOpeningSelectionState()
    settingsWallIds.value = []
    moveWallId.value = null
    pinnedJunctionId.value = null
    activeFmlTool.value = 'add_door'
  }

  return {
    openingWidthDraft,
    openingWidthMixed,
    openingHeightDraft,
    openingHeightMixed,
    openingSillZDraft,
    openingSillZMixed,
    openingHingeAtStartDraft,
    openingHingeMixed,
    openingSwingRightDraft,
    openingSwingMixed,
    syncOpeningDraftFromSelection,
    clearOpeningSelectionState,
    toggleSettingsOpening,
    onOpeningWidthInput,
    commitOpeningWidth,
    onOpeningHeightInput,
    commitOpeningHeight,
    onOpeningSillZInput,
    commitOpeningSillZ,
    toggleOpeningHingeAtStart,
    toggleOpeningSwingRight,
    copySelectedOpening,
    deleteSelectedOpenings,
  }
}
