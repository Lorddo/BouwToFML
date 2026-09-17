import { ref, watch, type Ref } from 'vue'
import {
  BOVENLICHT_GAP_CM,
  BOVENLICHT_HEIGHT_CM,
  clampBovenlichtGapCm,
  clampBovenlichtHeightCm,
} from '@/core/plan/bovenlicht'
import {
  isTriangleWindow,
  resolveDoorAddPreset,
  resolveDoorSubtypeFromRefid,
  resolveWindowAddPreset,
  resolveWindowSubtypeFromRefid,
  type DoorAddSubtype,
  type WindowAddSubtype,
} from '@/core/plan/opening-add-presets'
import type { OpeningSubtypeDraft } from './plan-canvas-opening-draft'
import {
  DEFAULT_DOOR_HEIGHT_CM,
  DEFAULT_WINDOW_SILL_Z_CM,
} from '@/core/plan/extraction-to-plan-types'
import {
  buildMirrored,
  resolveHingeAtStart,
  resolveSwingSign,
} from '@/ui/composables/plan-canvas/plan-canvas-doors'
import {
  clampOpeningHeight,
  clampOpeningSillZ,
  clampOpeningWidth,
  resolveOpeningHeight,
  resolveOpeningSillZ,
  resolveWindowSillZ,
} from '@/core/plan/opening-plan-ops'
import {
  buildOpeningFramePatch,
  effectiveOpeningFrame,
  isFramelessOpeningKind,
  type OpeningFrameCm,
} from '@/core/plan/opening-display-geom'
import type { usePlanEditor } from '@/ui/composables/usePlanEditor'
import type { PlanCanvasDraftCommitScheduler } from '@/ui/composables/canvas-kernel/plan-canvas-draft-commit'
import { bindScaleLengthDraftField } from '@/ui/composables/canvas-kernel/plan-canvas-draft-commit'
import { computeOpeningDraftState } from './plan-canvas-opening-draft'
import type { PlanCanvasSelectionRefs } from './plan-canvas-selection-types'
import { setPlanSelected } from './plan-canvas-selected'

type EditorApi = ReturnType<typeof usePlanEditor>

const FIELD_WIDTH = 'opening-width'
const FIELD_HEIGHT = 'opening-height'
const FIELD_SILL_Z = 'opening-sill-z'
const FIELD_BOVENLICHT_HEIGHT = 'opening-bovenlicht-height'
const FIELD_BOVENLICHT_GAP = 'opening-bovenlicht-gap'
const FIELD_FRAME_LEFT = 'opening-frame-left'
const FIELD_FRAME_RIGHT = 'opening-frame-right'
const FIELD_FRAME_TOP = 'opening-frame-top'
const FIELD_FRAME_BOTTOM = 'opening-frame-bottom'

type FrameSide = keyof OpeningFrameCm

export function usePlanCanvasOpeningSelection(options: {
  editor: EditorApi
  selection: PlanCanvasSelectionRefs
  syncPlanToParent: () => void
  draftCommit: PlanCanvasDraftCommitScheduler
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
    activePlanTool,
    pinnedJunctionId,
  } = selection

  const openingSubtypeDraft = ref<OpeningSubtypeDraft>('standard')
  const openingSubtypeMixed = ref(false)
  const openingWidthDraft = ref(90)
  const openingWidthMixed = ref(false)
  const openingHeightDraft = ref(DEFAULT_DOOR_HEIGHT_CM)
  const openingHeightMixed = ref(false)
  const openingSillZDraft = ref(DEFAULT_WINDOW_SILL_Z_CM)
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
  const openingFrameLeftDraft = ref(5)
  const openingFrameLeftMixed = ref(false)
  const openingFrameRightDraft = ref(5)
  const openingFrameRightMixed = ref(false)
  const openingFrameTopDraft = ref(5)
  const openingFrameTopMixed = ref(false)
  const openingFrameBottomDraft = ref(0)
  const openingFrameBottomMixed = ref(false)
  /** Kopie-plaatsing: instance-frame tot de volgende placeOpening. */
  const pendingPlaceFrame = ref<OpeningFrameCm | null>(null)

  /** Settings-selectie, of enkele move-selectie bij gewone klik. */
  function editableOpeningIds(): string[] {
    if (settingsOpeningIds.value.length > 0) return [...settingsOpeningIds.value]
    if (moveOpeningId.value) return [moveOpeningId.value]
    return []
  }

  function selectedOpenings() {
    return editableOpeningIds()
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
      openingFrameLeftMixed.value = false
      openingFrameRightMixed.value = false
      openingFrameTopMixed.value = false
      openingFrameBottomMixed.value = false
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
    openingFrameLeftMixed.value = draft.frameLeftMixed
    openingFrameLeftDraft.value = draft.frameLeftCm
    openingFrameRightMixed.value = draft.frameRightMixed
    openingFrameRightDraft.value = draft.frameRightCm
    openingFrameTopMixed.value = draft.frameTopMixed
    openingFrameTopDraft.value = draft.frameTopCm
    openingFrameBottomMixed.value = draft.frameBottomMixed
    openingFrameBottomDraft.value = draft.frameBottomCm
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
    openingFrameLeftMixed.value = false
    openingFrameRightMixed.value = false
    openingFrameTopMixed.value = false
    openingFrameBottomMixed.value = false
  }

  function toggleSettingsOpening(openingId: string): void {
    flushPendingFieldCommits()
    cancelMoveDragPending()
    cancelOpeningDragPending()

    // Eerst de huidige opening-staat lezen: `setPlanSelected` wist de bak.
    const located = editor.resolveOpening(openingId)
    const current = [...settingsOpeningIds.value]
    let nextIds: string[]
    if (current.includes(openingId)) {
      nextIds = current.filter((id) => id !== openingId)
    } else if (located) {
      const existing = selectedOpenings()
      const sameType =
        existing.length === 0 ||
        existing.every((item) => item.opening.type === located.opening.type)
      nextIds = sameType ? [...current, openingId] : [openingId]
    } else {
      nextIds = [...current, openingId]
    }

    setPlanSelected(selection, { kind: 'opening', settingsIds: nextIds })
    syncOpeningDraftFromSelection()
  }

  function commitOpeningSubtype(subtype: OpeningSubtypeDraft): void {
    flushPendingFieldCommits()
    const openingIds = editableOpeningIds()
    if (openingIds.length === 0) return
    const selected = selectedOpenings()
    if (selected.length === 0) return
    const openingType = selected[0].opening.type
    if (openingType !== 'door' && openingType !== 'window') return
    if (!selected.every((item) => item.opening.type === openingType)) return

    const kind =
      openingType === 'window'
        ? resolveWindowAddPreset(subtype as WindowAddSubtype).kind
        : resolveDoorAddPreset(subtype as DoorAddSubtype).kind

    openingSubtypeDraft.value = subtype
    openingSubtypeMixed.value = false
    editor.pushUndo()
    for (const openingId of openingIds) {
      const located = editor.resolveOpening(openingId)
      if (!located || located.opening.type !== openingType) continue
      editor.updateOpening(openingId, { kind })
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
      if (!located || (located.opening.type !== 'window' && located.opening.type !== 'door')) {
        return false
      }
      return resolveOpeningSillZ(located.opening) !== sillZ
    })
    if (!needsWrite) return { mutated: false }
    draftCommit.beginUndoGroup(FIELD_SILL_Z, () => editor.pushUndo())
    for (const openingId of openingIds) {
      const located = editor.resolveOpening(openingId)
      if (!located || (located.opening.type !== 'window' && located.opening.type !== 'door')) {
        continue
      }
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

  function setFrameSideDraft(side: FrameSide, value: number): void {
    if (side === 'leftCm') {
      openingFrameLeftDraft.value = value
      openingFrameLeftMixed.value = false
    } else if (side === 'rightCm') {
      openingFrameRightDraft.value = value
      openingFrameRightMixed.value = false
    } else if (side === 'topCm') {
      openingFrameTopDraft.value = value
      openingFrameTopMixed.value = false
    } else {
      openingFrameBottomDraft.value = value
      openingFrameBottomMixed.value = false
    }
  }

  function applyFrameSideToOpenings(
    openingIds: string[],
    side: FrameSide,
    valueRaw: number,
  ): { mutated: boolean } {
    const value = Math.max(0, Math.round(valueRaw))
    setFrameSideDraft(side, value)
    if (openingIds.length === 0) return { mutated: false }
    const needsWrite = openingIds.some((id) => {
      const located = editor.resolveOpening(id)
      if (!located) return false
      if (located.opening.type !== 'door' && located.opening.type !== 'window') return false
      if (isFramelessOpeningKind(located.opening.kind)) return false
      const next = buildOpeningFramePatch(located.opening, { [side]: value })
      const current = located.opening.frame
      if (!current) return true
      return (
        current.leftCm !== next.leftCm ||
        current.rightCm !== next.rightCm ||
        current.topCm !== next.topCm ||
        current.bottomCm !== next.bottomCm
      )
    })
    if (!needsWrite) return { mutated: false }
    const fieldId =
      side === 'leftCm'
        ? FIELD_FRAME_LEFT
        : side === 'rightCm'
          ? FIELD_FRAME_RIGHT
          : side === 'topCm'
            ? FIELD_FRAME_TOP
            : FIELD_FRAME_BOTTOM
    draftCommit.beginUndoGroup(fieldId, () => editor.pushUndo())
    for (const openingId of openingIds) {
      const located = editor.resolveOpening(openingId)
      if (!located) continue
      if (located.opening.type !== 'door' && located.opening.type !== 'window') continue
      if (isFramelessOpeningKind(located.opening.kind)) continue
      editor.updateOpening(openingId, {
        frame: buildOpeningFramePatch(located.opening, { [side]: value }),
      })
    }
    syncOpeningDraftFromSelection()
    syncPlanToParent()
    return { mutated: true }
  }

  const widthField = bindScaleLengthDraftField({
    fieldId: FIELD_WIDTH,
    draftCommit,
    draft: openingWidthDraft,
    mixed: openingWidthMixed,
    applyWithValue: (value) => {
      const openingIds = editableOpeningIds()
      return () => applyWidthToOpenings(openingIds, value)
    },
  })
  const heightField = bindScaleLengthDraftField({
    fieldId: FIELD_HEIGHT,
    draftCommit,
    draft: openingHeightDraft,
    mixed: openingHeightMixed,
    applyWithValue: (value) => {
      const openingIds = editableOpeningIds()
      return () => applyHeightToOpenings(openingIds, value)
    },
  })
  const sillZField = bindScaleLengthDraftField({
    fieldId: FIELD_SILL_Z,
    draftCommit,
    draft: openingSillZDraft,
    mixed: openingSillZMixed,
    applyWithValue: (value) => {
      const openingIds = editableOpeningIds()
      return () => applySillZToOpenings(openingIds, value)
    },
  })
  const bovenlichtHeightField = bindScaleLengthDraftField({
    fieldId: FIELD_BOVENLICHT_HEIGHT,
    draftCommit,
    draft: openingBovenlichtHeightDraft,
    mixed: openingBovenlichtHeightMixed,
    applyWithValue: (value) => {
      const openingIds = editableOpeningIds()
      return () => applyBovenlichtHeightToOpenings(openingIds, value)
    },
  })
  const bovenlichtGapField = bindScaleLengthDraftField({
    fieldId: FIELD_BOVENLICHT_GAP,
    draftCommit,
    draft: openingBovenlichtGapDraft,
    mixed: openingBovenlichtGapMixed,
    applyWithValue: (value) => {
      const openingIds = editableOpeningIds()
      return () => applyBovenlichtGapToOpenings(openingIds, value)
    },
  })
  const frameLeftField = bindScaleLengthDraftField({
    fieldId: FIELD_FRAME_LEFT,
    draftCommit,
    draft: openingFrameLeftDraft,
    mixed: openingFrameLeftMixed,
    applyWithValue: (value) => {
      const openingIds = editableOpeningIds()
      return () => applyFrameSideToOpenings(openingIds, 'leftCm', value)
    },
  })
  const frameRightField = bindScaleLengthDraftField({
    fieldId: FIELD_FRAME_RIGHT,
    draftCommit,
    draft: openingFrameRightDraft,
    mixed: openingFrameRightMixed,
    applyWithValue: (value) => {
      const openingIds = editableOpeningIds()
      return () => applyFrameSideToOpenings(openingIds, 'rightCm', value)
    },
  })
  const frameTopField = bindScaleLengthDraftField({
    fieldId: FIELD_FRAME_TOP,
    draftCommit,
    draft: openingFrameTopDraft,
    mixed: openingFrameTopMixed,
    applyWithValue: (value) => {
      const openingIds = editableOpeningIds()
      return () => applyFrameSideToOpenings(openingIds, 'topCm', value)
    },
  })
  const frameBottomField = bindScaleLengthDraftField({
    fieldId: FIELD_FRAME_BOTTOM,
    draftCommit,
    draft: openingFrameBottomDraft,
    mixed: openingFrameBottomMixed,
    applyWithValue: (value) => {
      const openingIds = editableOpeningIds()
      return () => applyFrameSideToOpenings(openingIds, 'bottomCm', value)
    },
  })

  const onOpeningWidthCm = widthField.onCm
  const commitOpeningWidth = widthField.commit
  const onOpeningHeightCm = heightField.onCm
  const commitOpeningHeight = heightField.commit
  const onOpeningSillZCm = sillZField.onCm
  const commitOpeningSillZ = sillZField.commit
  const onOpeningBovenlichtHeightCm = bovenlichtHeightField.onCm
  const commitOpeningBovenlichtHeight = bovenlichtHeightField.commit
  const onOpeningBovenlichtGapCm = bovenlichtGapField.onCm
  const commitOpeningBovenlichtGap = bovenlichtGapField.commit
  const onOpeningFrameLeftCm = frameLeftField.onCm
  const commitOpeningFrameLeft = frameLeftField.commit
  const onOpeningFrameRightCm = frameRightField.onCm
  const commitOpeningFrameRight = frameRightField.commit
  const onOpeningFrameTopCm = frameTopField.onCm
  const commitOpeningFrameTop = frameTopField.commit
  const onOpeningFrameBottomCm = frameBottomField.onCm
  const commitOpeningFrameBottom = frameBottomField.commit

  function applyOpeningMirrorPatch(params: { hingeAtStart?: boolean; swingRight?: boolean }): void {
    flushPendingFieldCommits()
    const openingIds = editableOpeningIds()
    if (openingIds.length === 0) return
    editor.pushUndo()
    for (const openingId of openingIds) {
      const located = editor.resolveOpening(openingId)
      if (!located) continue
      const canMirror =
        located.opening.type === 'door' ||
        isTriangleWindow(located.opening.type, located.opening.kind)
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
    const openingIds = editableOpeningIds()
    if (openingIds.length === 0) return
    openingBovenlichtDraft.value = on
    openingBovenlichtMixed.value = false
    editor.pushUndo()
    for (const openingId of openingIds) {
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
    pendingPlaceFrame.value = isFramelessOpeningKind(opening.kind)
      ? null
      : { ...effectiveOpeningFrame(opening) }
    if (opening.type === 'window') {
      const subtype = resolveWindowSubtypeFromRefid(opening.kind)
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
      selection.settingsFacadeGroupId.value = null
      selection.settingsJunctionId.value = null
      moveWallId.value = null
      pinnedJunctionId.value = null
      activePlanTool.value = 'add_window'
      return
    }

    const subtype = resolveDoorSubtypeFromRefid(opening.kind)
    const width = clampOpeningWidth(opening.width)
    const doorHeight = Math.round(opening.z_height ?? DEFAULT_DOOR_HEIGHT_CM)
    const doorSill = Math.round(opening.z ?? 0)
    addDoorSubtype.value = subtype
    queueMicrotask(() => {
      addDoorWidthCm.value = width
      selection.addDoorHeightCm.value = doorHeight
      selection.addDoorSillZCm.value = doorSill
    })
    clearOpeningSelectionState()
    settingsWallIds.value = []
    selection.settingsFacadeGroupId.value = null
    selection.settingsJunctionId.value = null
    moveWallId.value = null
    pinnedJunctionId.value = null
    activePlanTool.value = 'add_door'
  }

  function takePendingPlaceFrame(): OpeningFrameCm | null {
    const frame = pendingPlaceFrame.value
    pendingPlaceFrame.value = null
    return frame
  }

  watch([moveOpeningId, settingsOpeningIds], () => {
    syncOpeningDraftFromSelection()
  })

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
    openingFrameLeftDraft,
    openingFrameLeftMixed,
    openingFrameRightDraft,
    openingFrameRightMixed,
    openingFrameTopDraft,
    openingFrameTopMixed,
    openingFrameBottomDraft,
    openingFrameBottomMixed,
    syncOpeningDraftFromSelection,
    clearOpeningSelectionState,
    toggleSettingsOpening,
    commitOpeningSubtype,
    onOpeningWidthCm,
    commitOpeningWidth,
    onOpeningHeightCm,
    commitOpeningHeight,
    onOpeningSillZCm,
    commitOpeningSillZ,
    toggleOpeningHingeAtStart,
    toggleOpeningSwingRight,
    onOpeningBovenlichtChange,
    onOpeningBovenlichtHeightCm,
    commitOpeningBovenlichtHeight,
    onOpeningBovenlichtGapCm,
    commitOpeningBovenlichtGap,
    onOpeningFrameLeftCm,
    commitOpeningFrameLeft,
    onOpeningFrameRightCm,
    commitOpeningFrameRight,
    onOpeningFrameTopCm,
    commitOpeningFrameTop,
    onOpeningFrameBottomCm,
    commitOpeningFrameBottom,
    takePendingPlaceFrame,
    copySelectedOpening,
    deleteSelectedOpenings,
  }
}
