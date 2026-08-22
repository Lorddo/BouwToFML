import { ref, type Ref } from 'vue'
import {
  BOVENLICHT_GAP_CM,
  BOVENLICHT_HEIGHT_CM,
  clampBovenlichtGapCm,
  clampBovenlichtHeightCm,
} from '@/core/fml/bovenlicht'
import {
  isTriangleWindow,
  resolveDoorAddPreset,
  resolveDoorSubtypeFromRefid,
  resolveWindowAddPreset,
  resolveWindowSubtypeFromRefid,
  type DoorAddSubtype,
  type WindowAddSubtype,
} from '@/core/fml/opening-add-presets'
import type { OpeningSubtypeDraft } from './fml-preview-opening-draft'
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
import type { FmlPreviewDraftCommitScheduler } from './fml-preview-draft-commit'
import { bindNumericDraftField } from './fml-preview-draft-commit'
import { computeOpeningDraftState } from './fml-preview-opening-draft'
import type { FmlPreviewSelectionRefs } from './fml-preview-selection'

type EditorApi = ReturnType<typeof useFmlPreviewEditor>

const FIELD_WIDTH = 'opening-width'
const FIELD_HEIGHT = 'opening-height'
const FIELD_SILL_Z = 'opening-sill-z'
const FIELD_BOVENLICHT_HEIGHT = 'opening-bovenlicht-height'
const FIELD_BOVENLICHT_GAP = 'opening-bovenlicht-gap'

export function useFmlPreviewOpeningSelection(options: {
  editor: EditorApi
  selection: FmlPreviewSelectionRefs
  syncPlanToParent: () => void
  draftCommit: FmlPreviewDraftCommitScheduler
  flushPendingFieldCommits: () => void
  cancelMoveDragPending: () => void
  cancelOpeningDragPending: () => void
  bovenlichtDefault?: Ref<boolean>
  windowBovenlichtDefault?: Ref<boolean>
  bovenlichtHeightCm?: Ref<number>
  bovenlichtGapCm?: Ref<number>
}) {
  const {
    editor,
    selection,
    syncPlanToParent,
    draftCommit,
    flushPendingFieldCommits,
    cancelMoveDragPending,
    cancelOpeningDragPending,
    bovenlichtDefault,
    windowBovenlichtDefault,
    bovenlichtHeightCm,
    bovenlichtGapCm,
  } = options

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

  const openingSubtypeDraft = ref<OpeningSubtypeDraft>('standard')
  const openingSubtypeMixed = ref(false)
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
  const openingBovenlichtDraft = ref(false)
  const openingBovenlichtMixed = ref(false)
  const openingBovenlichtHeightDraft = ref(BOVENLICHT_HEIGHT_CM)
  const openingBovenlichtHeightMixed = ref(false)
  const openingBovenlichtGapDraft = ref(BOVENLICHT_GAP_CM)
  const openingBovenlichtGapMixed = ref(false)

  function selectedOpenings() {
    return settingsOpeningIds.value
      .map((id) => editor.resolveOpening(id))
      .filter((item): item is NonNullable<ReturnType<typeof editor.resolveOpening>> => item != null)
  }

  function syncOpeningDraftFromSelection(): void {
    const selected = selectedOpenings()
    if (selected.length === 0) {
      openingSubtypeMixed.value = false
      openingSubtypeDraft.value = 'standard'
      openingWidthMixed.value = false
      openingHeightMixed.value = false
      openingSillZMixed.value = false
      openingHingeMixed.value = false
      openingSwingMixed.value = false
      openingBovenlichtMixed.value = false
      openingBovenlichtDraft.value = bovenlichtDefault?.value === true
      openingBovenlichtHeightMixed.value = false
      openingBovenlichtHeightDraft.value = bovenlichtHeightCm?.value ?? BOVENLICHT_HEIGHT_CM
      openingBovenlichtGapMixed.value = false
      openingBovenlichtGapDraft.value = bovenlichtGapCm?.value ?? BOVENLICHT_GAP_CM
      return
    }
    const draft = computeOpeningDraftState(
      selected.map((item) => item.opening),
      {
        doorBovenlichtDefault: bovenlichtDefault?.value === true,
        windowBovenlichtDefault: windowBovenlichtDefault?.value === true,
        bovenlichtHeightCm: bovenlichtHeightCm?.value ?? BOVENLICHT_HEIGHT_CM,
        bovenlichtGapCm: bovenlichtGapCm?.value ?? BOVENLICHT_GAP_CM,
      },
    )
    if (!draft) return

    openingSubtypeMixed.value = draft.subtypeMixed
    openingSubtypeDraft.value = draft.subtype
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
    openingBovenlichtMixed.value = draft.bovenlichtMixed
    openingBovenlichtDraft.value = draft.bovenlichtOn
    openingBovenlichtHeightMixed.value = draft.bovenlichtHeightMixed
    openingBovenlichtHeightDraft.value = draft.bovenlichtHeightCm
    openingBovenlichtGapMixed.value = draft.bovenlichtGapMixed
    openingBovenlichtGapDraft.value = draft.bovenlichtGapCm
  }

  function clearOpeningSelectionState(): void {
    flushPendingFieldCommits()
    settingsOpeningIds.value = []
    moveOpeningId.value = null
    hoveredOpeningId.value = null
    openingSubtypeMixed.value = false
    openingWidthMixed.value = false
    openingHeightMixed.value = false
    openingSillZMixed.value = false
    openingHingeMixed.value = false
    openingSwingMixed.value = false
    openingBovenlichtMixed.value = false
    openingBovenlichtHeightMixed.value = false
    openingBovenlichtGapMixed.value = false
  }

  function toggleSettingsOpening(openingId: string): void {
    flushPendingFieldCommits()
    cancelMoveDragPending()
    cancelOpeningDragPending()
    moveWallId.value = null
    settingsWallIds.value = []
    selection.settingsJunctionId.value = null
    pinnedJunctionId.value = null
    moveOpeningId.value = null
    selection.settingsItemId.value = null
    selection.moveItemId.value = null
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

  function commitOpeningSubtype(subtype: OpeningSubtypeDraft): void {
    flushPendingFieldCommits()
    if (settingsOpeningIds.value.length === 0) return
    const selected = selectedOpenings()
    if (selected.length === 0) return
    const openingType = selected[0].opening.type
    if (openingType !== 'door' && openingType !== 'window') return
    if (!selected.every((item) => item.opening.type === openingType)) return

    const refid =
      openingType === 'window'
        ? resolveWindowAddPreset(subtype as WindowAddSubtype).refid
        : resolveDoorAddPreset(subtype as DoorAddSubtype).refid

    openingSubtypeDraft.value = subtype
    openingSubtypeMixed.value = false
    editor.pushUndo()
    for (const openingId of settingsOpeningIds.value) {
      const located = editor.resolveOpening(openingId)
      if (!located || located.opening.type !== openingType) continue
      editor.updateOpening(openingId, { refid })
    }
    syncOpeningDraftFromSelection()
    syncPlanToParent()
  }

  function applyWidthToOpenings(openingIds: string[], widthRaw: number): { mutated: boolean } {
    const width = clampOpeningWidth(widthRaw)
    openingWidthDraft.value = width
    openingWidthMixed.value = false
    if (openingIds.length === 0) return { mutated: false }
    const already = openingIds.every((id) => {
      const located = editor.resolveOpening(id)
      return located != null && clampOpeningWidth(located.opening.width) === width
    })
    if (already) return { mutated: false }
    draftCommit.beginUndoGroup(FIELD_WIDTH, () => editor.pushUndo())
    for (const openingId of openingIds) {
      editor.updateOpening(openingId, { width })
    }
    syncOpeningDraftFromSelection()
    syncPlanToParent()
    return { mutated: true }
  }

  function applyHeightToOpenings(openingIds: string[], heightRaw: number): { mutated: boolean } {
    if (openingIds.length === 0) return { mutated: false }
    const first = editor.resolveOpening(openingIds[0])
    if (first) {
      openingHeightDraft.value = clampOpeningHeight(heightRaw, first.opening.type)
    } else {
      openingHeightDraft.value = heightRaw
    }
    openingHeightMixed.value = false
    const needsWrite = openingIds.some((id) => {
      const located = editor.resolveOpening(id)
      if (!located) return false
      const height = clampOpeningHeight(heightRaw, located.opening.type)
      return located.opening.z_height !== height
    })
    if (!needsWrite) return { mutated: false }
    draftCommit.beginUndoGroup(FIELD_HEIGHT, () => editor.pushUndo())
    for (const openingId of openingIds) {
      const located = editor.resolveOpening(openingId)
      if (!located) continue
      const height = clampOpeningHeight(heightRaw, located.opening.type)
      editor.updateOpening(openingId, { z_height: height })
    }
    syncOpeningDraftFromSelection()
    syncPlanToParent()
    return { mutated: true }
  }

  function applySillZToOpenings(openingIds: string[], sillRaw: number): { mutated: boolean } {
    const sillZ = clampOpeningSillZ(sillRaw)
    openingSillZDraft.value = sillZ
    openingSillZMixed.value = false
    if (openingIds.length === 0) return { mutated: false }
    const needsWrite = openingIds.some((id) => {
      const located = editor.resolveOpening(id)
      if (!located || located.opening.type !== 'window') return false
      return resolveWindowSillZ(located.opening) !== sillZ
    })
    if (!needsWrite) return { mutated: false }
    draftCommit.beginUndoGroup(FIELD_SILL_Z, () => editor.pushUndo())
    for (const openingId of openingIds) {
      const located = editor.resolveOpening(openingId)
      if (!located || located.opening.type !== 'window') continue
      editor.updateOpening(openingId, { z: sillZ })
    }
    syncOpeningDraftFromSelection()
    syncPlanToParent()
    return { mutated: true }
  }

  function applyBovenlichtHeightToOpenings(
    openingIds: string[],
    heightRaw: number,
  ): { mutated: boolean } {
    const height = clampBovenlichtHeightCm(heightRaw)
    openingBovenlichtHeightDraft.value = height
    openingBovenlichtHeightMixed.value = false
    if (openingIds.length === 0) return { mutated: false }
    const needsWrite = openingIds.some((id) => {
      const located = editor.resolveOpening(id)
      if (!located) return false
      if (located.opening.type !== 'door' && located.opening.type !== 'window') return false
      return located.opening.bovenlichtHeightCm !== height
    })
    if (!needsWrite) return { mutated: false }
    draftCommit.beginUndoGroup(FIELD_BOVENLICHT_HEIGHT, () => editor.pushUndo())
    for (const openingId of openingIds) {
      const located = editor.resolveOpening(openingId)
      if (!located) continue
      if (located.opening.type !== 'door' && located.opening.type !== 'window') continue
      editor.updateOpening(openingId, { bovenlichtHeightCm: height })
    }
    syncOpeningDraftFromSelection()
    syncPlanToParent()
    return { mutated: true }
  }

  function applyBovenlichtGapToOpenings(
    openingIds: string[],
    gapRaw: number,
  ): { mutated: boolean } {
    const gap = clampBovenlichtGapCm(gapRaw)
    openingBovenlichtGapDraft.value = gap
    openingBovenlichtGapMixed.value = false
    if (openingIds.length === 0) return { mutated: false }
    const needsWrite = openingIds.some((id) => {
      const located = editor.resolveOpening(id)
      if (!located) return false
      if (located.opening.type !== 'door' && located.opening.type !== 'window') return false
      return located.opening.bovenlichtGapCm !== gap
    })
    if (!needsWrite) return { mutated: false }
    draftCommit.beginUndoGroup(FIELD_BOVENLICHT_GAP, () => editor.pushUndo())
    for (const openingId of openingIds) {
      const located = editor.resolveOpening(openingId)
      if (!located) continue
      if (located.opening.type !== 'door' && located.opening.type !== 'window') continue
      editor.updateOpening(openingId, { bovenlichtGapCm: gap })
    }
    syncOpeningDraftFromSelection()
    syncPlanToParent()
    return { mutated: true }
  }

  const widthField = bindNumericDraftField({
    fieldId: FIELD_WIDTH,
    draftCommit,
    draft: openingWidthDraft,
    mixed: openingWidthMixed,
    applyWithValue: (value) => {
      const openingIds = [...settingsOpeningIds.value]
      return () => applyWidthToOpenings(openingIds, value)
    },
  })
  const heightField = bindNumericDraftField({
    fieldId: FIELD_HEIGHT,
    draftCommit,
    draft: openingHeightDraft,
    mixed: openingHeightMixed,
    applyWithValue: (value) => {
      const openingIds = [...settingsOpeningIds.value]
      return () => applyHeightToOpenings(openingIds, value)
    },
  })
  const sillZField = bindNumericDraftField({
    fieldId: FIELD_SILL_Z,
    draftCommit,
    draft: openingSillZDraft,
    mixed: openingSillZMixed,
    applyWithValue: (value) => {
      const openingIds = [...settingsOpeningIds.value]
      return () => applySillZToOpenings(openingIds, value)
    },
  })
  const bovenlichtHeightField = bindNumericDraftField({
    fieldId: FIELD_BOVENLICHT_HEIGHT,
    draftCommit,
    draft: openingBovenlichtHeightDraft,
    mixed: openingBovenlichtHeightMixed,
    applyWithValue: (value) => {
      const openingIds = [...settingsOpeningIds.value]
      return () => applyBovenlichtHeightToOpenings(openingIds, value)
    },
  })
  const bovenlichtGapField = bindNumericDraftField({
    fieldId: FIELD_BOVENLICHT_GAP,
    draftCommit,
    draft: openingBovenlichtGapDraft,
    mixed: openingBovenlichtGapMixed,
    applyWithValue: (value) => {
      const openingIds = [...settingsOpeningIds.value]
      return () => applyBovenlichtGapToOpenings(openingIds, value)
    },
  })

  const onOpeningWidthInput = widthField.onInput
  const commitOpeningWidth = widthField.commit
  const onOpeningHeightInput = heightField.onInput
  const commitOpeningHeight = heightField.commit
  const onOpeningSillZInput = sillZField.onInput
  const commitOpeningSillZ = sillZField.commit
  const onOpeningBovenlichtHeightInput = bovenlichtHeightField.onInput
  const commitOpeningBovenlichtHeight = bovenlichtHeightField.commit
  const onOpeningBovenlichtGapInput = bovenlichtGapField.onInput
  const commitOpeningBovenlichtGap = bovenlichtGapField.commit

  function applyOpeningMirrorPatch(params: { hingeAtStart?: boolean; swingRight?: boolean }): void {
    flushPendingFieldCommits()
    if (settingsOpeningIds.value.length === 0) return
    editor.pushUndo()
    for (const openingId of settingsOpeningIds.value) {
      const located = editor.resolveOpening(openingId)
      if (!located) continue
      const canMirror =
        located.opening.type === 'door' ||
        isTriangleWindow(located.opening.type, located.opening.refid)
      if (!canMirror) continue
      const hingeAtStart = params.hingeAtStart ?? resolveHingeAtStart(located.opening.mirrored)
      const swingRight =
        located.opening.type === 'door'
          ? (params.swingRight ?? resolveSwingSign(located.opening.mirrored) > 0)
          : false
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

  function setOpeningBovenlicht(on: boolean): void {
    flushPendingFieldCommits()
    if (settingsOpeningIds.value.length === 0) return
    openingBovenlichtDraft.value = on
    openingBovenlichtMixed.value = false
    editor.pushUndo()
    for (const openingId of settingsOpeningIds.value) {
      const located = editor.resolveOpening(openingId)
      if (!located) continue
      if (located.opening.type !== 'door' && located.opening.type !== 'window') continue
      editor.updateOpening(openingId, { bovenlicht: on })
    }
    syncOpeningDraftFromSelection()
    syncPlanToParent()
  }

  function onOpeningBovenlichtChange(event: Event): void {
    setOpeningBovenlicht((event.target as HTMLInputElement).checked)
  }

  function deleteSelectedOpenings(): void {
    flushPendingFieldCommits()
    const ids = new Set(settingsOpeningIds.value)
    if (moveOpeningId.value) ids.add(moveOpeningId.value)
    if (ids.size === 0) return
    editor.pushUndo()
    editor.removeOpenings([...ids])
    moveOpeningId.value = null
    settingsOpeningIds.value = []
    syncOpeningDraftFromSelection()
    syncPlanToParent()
  }

  function copySelectedOpening(): void {
    flushPendingFieldCommits()
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
      selection.settingsJunctionId.value = null
      moveWallId.value = null
      pinnedJunctionId.value = null
      activeFmlTool.value = 'add_window'
      return
    }

    const subtype = resolveDoorSubtypeFromRefid(opening.refid)
    const width = clampOpeningWidth(opening.width)
    const doorHeight = Math.round(opening.z_height ?? DEFAULT_FML_DOOR_HEIGHT_CM)
    addDoorSubtype.value = subtype
    queueMicrotask(() => {
      addDoorWidthCm.value = width
      selection.addDoorHeightCm.value = doorHeight
    })
    clearOpeningSelectionState()
    settingsWallIds.value = []
    selection.settingsJunctionId.value = null
    moveWallId.value = null
    pinnedJunctionId.value = null
    activeFmlTool.value = 'add_door'
  }

  return {
    openingSubtypeDraft,
    openingSubtypeMixed,
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
    openingBovenlichtDraft,
    openingBovenlichtMixed,
    openingBovenlichtHeightDraft,
    openingBovenlichtHeightMixed,
    openingBovenlichtGapDraft,
    openingBovenlichtGapMixed,
    syncOpeningDraftFromSelection,
    clearOpeningSelectionState,
    toggleSettingsOpening,
    commitOpeningSubtype,
    onOpeningWidthInput,
    commitOpeningWidth,
    onOpeningHeightInput,
    commitOpeningHeight,
    onOpeningSillZInput,
    commitOpeningSillZ,
    toggleOpeningHingeAtStart,
    toggleOpeningSwingRight,
    onOpeningBovenlichtChange,
    onOpeningBovenlichtHeightInput,
    commitOpeningBovenlichtHeight,
    onOpeningBovenlichtGapInput,
    commitOpeningBovenlichtGap,
    copySelectedOpening,
    deleteSelectedOpenings,
  }
}
