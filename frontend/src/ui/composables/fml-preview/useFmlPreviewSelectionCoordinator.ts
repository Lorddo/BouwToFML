import { computed, ref, watch, type Ref, type ComputedRef } from 'vue'
import { parseFmlHex } from '@/core/fml/roomtype-catalog'
import type { FloorItem, FloorLineType, Point2D } from '@/core/fml/types'
import { resolveFixtureCatalog } from '@/core/fml/fixture-refid-catalog'
import { isRidgeWallId, listRidgeWallsOnFloor, ridgeEndpointZCm } from '@/core/fml/ridge-walls'
import { bindFloorWallsToRoofs, type BindWallsToRoofsResult } from '@/core/fml/bind-walls-to-roofs'
import { splitWallAtT } from '@/ui/components/fml-preview-wall-edit'
import type { useFmlPreviewEditor } from '@/ui/composables/useFmlPreviewEditor'
import type { HitTestApi } from './fml-preview-hit-test-api'
import { useFmlPreviewAreaSelection } from './useFmlPreviewAreaSelection'
import { useFmlPreviewSurfaceEdit } from './useFmlPreviewSurfaceEdit'
import { useFmlPreviewOpeningSelection } from './useFmlPreviewOpeningSelection'
import { useFmlPreviewWallSelection } from './useFmlPreviewWallSelection'
import type { FmlPreviewSelectionRefs } from './fml-preview-selection'
import { clampLabelFontSize, lineStrokeColor } from './fml-preview-render-annotations'
import type { createFmlPreviewDraftCommitScheduler } from './fml-preview-draft-commit'
import type { FixturePlaceOption } from '@/core/fml/fixture-refid-catalog'
import type { UnderlayOriginLayout } from '@/core/fml/translate-floor-plan'

type EditorApi = ReturnType<typeof useFmlPreviewEditor>
type DraftCommitScheduler = ReturnType<typeof createFmlPreviewDraftCommitScheduler>

interface SelectionCoordinatorOptions {
  hitTest: HitTestApi
  selection: FmlPreviewSelectionRefs
  editor: EditorApi
  draftCommit: DraftCommitScheduler
  syncPlanToParent: (layout?: UnderlayOriginLayout | null) => void
  flushPendingFieldCommits: () => void
  cancelMoveDragPending: () => void
  cancelOpeningDragPending: () => void
  cancelItemDragPending: () => void
  cancelDrawWallDrag: () => void
  cancelMeasureDrag: () => void
  containerRef: Ref<HTMLDivElement | null>
  axisLocked: ComputedRef<boolean>
  areaSurfaceEditEnabled: ComputedRef<boolean>
  bovenlichtDefault?: Ref<boolean>
  windowBovenlichtDefault?: Ref<boolean>
  bovenlichtHeightCm?: Ref<number>
  bovenlichtGapCm?: Ref<number>
  dakMode?: Ref<boolean>
  ridgeZCm: Ref<number | undefined>
  pendingFixture: Ref<FixturePlaceOption | null>
  ensureRidgeZDraft: () => number
  thicknessPresetCms?: Ref<number[] | undefined>
}

export function useFmlPreviewSelectionCoordinator(options: SelectionCoordinatorOptions) {
  const {
    hitTest,
    selection,
    editor,
    draftCommit,
    syncPlanToParent,
    flushPendingFieldCommits,
    cancelMoveDragPending,
    cancelOpeningDragPending,
    cancelItemDragPending,
    containerRef,
    axisLocked,
    bovenlichtDefault,
    windowBovenlichtDefault,
    bovenlichtHeightCm,
    bovenlichtGapCm,
    ridgeZCm,
    pendingFixture,
    ensureRidgeZDraft,
    thicknessPresetCms,
  } = options

  const {
    settingsWallIds,
    moveWallId,
    settingsOpeningIds,
    moveOpeningId,
    hoveredWallId,
    hoveredJunctionId,
    activeFmlTool,
    drawWallKind,
  } = selection

  const openingDraftSync = { run: (): void => {} }

  const wallSelection = useFmlPreviewWallSelection({
    editor,
    hitTest,
    selection,
    syncPlanToParent,
    draftCommit,
    flushPendingFieldCommits,
    containerRef,
    cancelMoveDragPending,
    cancelDrawWallDrag: () => options.cancelDrawWallDrag(),
    cancelMeasureDrag: () => options.cancelMeasureDrag(),
    syncOpeningDraftFromSelection: () => openingDraftSync.run(),
    thicknessPresetCms,
  })

  const {
    selectedFacadeGroupPanel,
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
  } = wallSelection

  const openingSelection = useFmlPreviewOpeningSelection({
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
  })
  openingDraftSync.run = () => openingSelection.syncOpeningDraftFromSelection()

  const {
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
    clearOpeningSelectionState,
    toggleSettingsOpening,
    syncOpeningDraftFromSelection,
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
    copySelectedOpening,
    deleteSelectedOpenings,
  } = openingSelection

  if (bovenlichtDefault) {
    watch(bovenlichtDefault, () => {
      syncOpeningDraftFromSelection()
    })
  }
  if (windowBovenlichtDefault) {
    watch(windowBovenlichtDefault, () => {
      syncOpeningDraftFromSelection()
    })
  }
  if (bovenlichtHeightCm) {
    watch(bovenlichtHeightCm, () => {
      syncOpeningDraftFromSelection()
    })
  }
  if (bovenlichtGapCm) {
    watch(bovenlichtGapCm, () => {
      syncOpeningDraftFromSelection()
    })
  }

  const areaSelection = useFmlPreviewAreaSelection({
    selection,
    editor,
    syncPlanToParent,
    draftCommit,
    flushPendingFieldCommits,
    cancelMoveDragPending: () => cancelMoveDragPending(),
    cancelOpeningDragPending: () => cancelOpeningDragPending(),
  })

  const surfaceEdit = useFmlPreviewSurfaceEdit({
    selection,
    editor,
    hitTest,
    resolvePoint: (cm, snapDisabled, extraAxisPoints, excludeSurfaceId) => {
      // Deferred binding — caller sets resolveSurfacePoint after construction.
      return surfaceEditResolvePoint(cm, snapDisabled, extraAxisPoints, excludeSurfaceId)
    },
    axisLocked,
    syncPlanToParent,
    isRidgeHit: (cm) => {
      if (options.dakMode?.value !== true) return false
      const wallId = hitTest.hitTestWallAtCm(cm)
      return wallId != null && isRidgeWallId(editor.localPlan.value, wallId)
    },
  })

  let surfaceEditResolvePoint: (
    cm: Point2D,
    snapDisabled: boolean,
    extraAxisPoints?: Point2D[],
    excludeSurfaceId?: string | null,
  ) => Point2D = (cm) => cm

  function bindResolveSurfacePoint(
    fn: (
      cm: Point2D,
      snapDisabled: boolean,
      extraAxisPoints?: Point2D[],
      excludeSurfaceId?: string | null,
    ) => Point2D,
  ): void {
    surfaceEditResolvePoint = fn
  }

  // --- Annotation label/line edit ---

  function toggleSettingsLabel(labelId: string): void {
    flushPendingFieldCommits()
    cancelMoveDragPending()
    cancelOpeningDragPending()
    moveWallId.value = null
    settingsWallIds.value = []
    selection.settingsFacadeGroupId.value = null
    selection.pinnedJunctionId.value = null
    moveOpeningId.value = null
    settingsOpeningIds.value = []
    selection.settingsAreaId.value = null
    selection.settingsSurfaceId.value = null
    selection.settingsLineId.value = null
    selection.settingsItemId.value = null
    selection.moveItemId.value = null
    selection.settingsLabelId.value = selection.settingsLabelId.value === labelId ? null : labelId
    syncLabelTextDraftFromSelection()
  }

  function toggleSettingsLine(lineId: string): void {
    flushPendingFieldCommits()
    cancelMoveDragPending()
    cancelOpeningDragPending()
    moveWallId.value = null
    settingsWallIds.value = []
    selection.settingsFacadeGroupId.value = null
    selection.pinnedJunctionId.value = null
    moveOpeningId.value = null
    settingsOpeningIds.value = []
    selection.settingsAreaId.value = null
    selection.settingsSurfaceId.value = null
    selection.settingsLabelId.value = null
    selection.settingsItemId.value = null
    selection.moveItemId.value = null
    selection.settingsLineId.value = selection.settingsLineId.value === lineId ? null : lineId
  }

  const FIELD_LABEL_TEXT = 'label-text'
  const labelTextDraft = ref('')

  function syncLabelTextDraftFromSelection(): void {
    const id = selection.settingsLabelId.value
    if (!id) {
      labelTextDraft.value = ''
      return
    }
    const label = editor.labels.value.find((item) => item.id === id)
    labelTextDraft.value = label?.text ?? ''
  }

  function applyLabelTextToId(labelId: string | null, text: string): { mutated: boolean } {
    labelTextDraft.value = text
    if (!labelId) return { mutated: false }
    const label = editor.labels.value.find((item) => item.id === labelId)
    if (!label || label.text === text) return { mutated: false }
    draftCommit.beginUndoGroup(FIELD_LABEL_TEXT, () => editor.pushUndo())
    editor.updateLabel(labelId, { text })
    syncPlanToParent()
    return { mutated: true }
  }

  function onLabelTextInput(text: string): void {
    labelTextDraft.value = text
    const labelId = selection.settingsLabelId.value
    draftCommit.schedule(FIELD_LABEL_TEXT, () => applyLabelTextToId(labelId, text))
  }

  function commitLabelText(): void {
    const labelId = selection.settingsLabelId.value
    const text = labelTextDraft.value
    draftCommit.schedule(FIELD_LABEL_TEXT, () => applyLabelTextToId(labelId, text))
    draftCommit.flush(FIELD_LABEL_TEXT)
  }

  function updateSelectedLabelText(text: string): void {
    labelTextDraft.value = text
    commitLabelText()
  }

  function patchSelectedLabel(patch: {
    fontSize?: number
    fontColor?: string
    outline?: boolean
    bold?: boolean
    italic?: boolean
  }): void {
    const labelId = selection.settingsLabelId.value
    if (!labelId) return
    const label = editor.labels.value.find((item) => item.id === labelId)
    if (!label) return
    const nextSize = patch.fontSize != null ? clampLabelFontSize(patch.fontSize) : label.fontSize
    const nextColor = patch.fontColor ?? label.fontColor
    const nextOutline = patch.outline ?? label.outline === true
    const nextBold = patch.bold ?? label.bold === true
    const nextItalic = patch.italic ?? label.italic === true
    if (
      label.fontSize === nextSize &&
      label.fontColor === nextColor &&
      (label.outline === true) === nextOutline &&
      (label.bold === true) === nextBold &&
      (label.italic === true) === nextItalic
    ) {
      return
    }
    flushPendingFieldCommits()
    editor.pushUndo()
    editor.updateLabel(labelId, {
      fontSize: nextSize,
      fontColor: nextColor,
      outline: nextOutline || undefined,
      bold: nextBold || undefined,
      italic: nextItalic || undefined,
    })
    syncPlanToParent()
  }

  function updateSelectedLabelFontSize(fontSize: number): void {
    patchSelectedLabel({ fontSize })
  }

  function updateSelectedLabelFontColor(color: string): void {
    const hex = parseFmlHex(color)
    if (!hex) return
    patchSelectedLabel({ fontColor: hex })
  }

  function updateSelectedLabelOutline(outline: boolean): void {
    patchSelectedLabel({ outline })
  }

  function updateSelectedLabelBold(bold: boolean): void {
    patchSelectedLabel({ bold })
  }

  function updateSelectedLabelItalic(italic: boolean): void {
    patchSelectedLabel({ italic })
  }

  function deleteSelectedAnnotation(): void {
    flushPendingFieldCommits()
    if (selection.settingsLabelId.value) {
      editor.pushUndo()
      editor.removeLabel(selection.settingsLabelId.value)
      selection.settingsLabelId.value = null
      labelTextDraft.value = ''
      syncPlanToParent()
      return
    }
    if (selection.settingsLineId.value) {
      editor.pushUndo()
      editor.removeLine(selection.settingsLineId.value)
      selection.settingsLineId.value = null
      syncPlanToParent()
    }
  }

  function patchSelectedLine(patch: {
    type?: FloorLineType
    color?: string
    thickness?: number
  }): void {
    const lineId = selection.settingsLineId.value
    if (!lineId) return
    const line = editor.lines.value.find((item) => item.id === lineId)
    if (!line) return
    const nextType = patch.type ?? line.type
    const nextColor = patch.color ?? lineStrokeColor(line.color)
    const nextThickness =
      patch.thickness != null ? Math.max(1, Math.round(patch.thickness)) : line.thickness
    if (
      line.type === nextType &&
      lineStrokeColor(line.color) === nextColor &&
      line.thickness === nextThickness
    ) {
      return
    }
    flushPendingFieldCommits()
    editor.pushUndo()
    editor.updateLine(lineId, {
      type: nextType,
      color: nextColor,
      thickness: nextThickness,
    })
    syncPlanToParent()
  }

  function updateSelectedLineType(type: FloorLineType): void {
    patchSelectedLine({ type })
  }

  function updateSelectedLineColor(color: string): void {
    const hex = parseFmlHex(color)
    if (!hex) return
    patchSelectedLine({ color: hex })
  }

  function updateSelectedLineThickness(thickness: number): void {
    patchSelectedLine({ thickness })
  }

  // --- Item toggle/delete ---

  function toggleSettingsItem(guid: string): void {
    flushPendingFieldCommits()
    cancelMoveDragPending()
    cancelOpeningDragPending()
    cancelItemDragPending()
    moveWallId.value = null
    settingsWallIds.value = []
    selection.settingsFacadeGroupId.value = null
    selection.settingsJunctionId.value = null
    selection.pinnedJunctionId.value = null
    moveOpeningId.value = null
    settingsOpeningIds.value = []
    selection.settingsAreaId.value = null
    selection.settingsSurfaceId.value = null
    selection.settingsLabelId.value = null
    selection.settingsLineId.value = null
    selection.moveItemId.value = null
    selection.settingsItemId.value = selection.settingsItemId.value === guid ? null : guid
  }

  function deleteSelectedItem(): void {
    const ids = new Set<string>()
    if (selection.settingsItemId.value) ids.add(selection.settingsItemId.value)
    if (selection.moveItemId.value) ids.add(selection.moveItemId.value)
    if (ids.size === 0) return
    editor.pushUndo()
    for (const guid of ids) editor.removeItem(guid)
    selection.settingsItemId.value = null
    selection.moveItemId.value = null
    syncPlanToParent()
  }

  function deleteSelected(): void {
    if (selection.settingsOpeningIds.value.length > 0 || selection.moveOpeningId.value != null) {
      deleteSelectedOpenings()
      return
    }
    if (selection.settingsItemId.value != null || selection.moveItemId.value != null) {
      deleteSelectedItem()
      return
    }
    if (selection.settingsWallIds.value.length > 0 || selection.moveWallId.value != null) {
      deleteSelectedWalls()
      return
    }
    if (selection.settingsAreaId.value != null || selection.settingsSurfaceId.value != null) {
      areaSelection.deleteSelectedTagged()
      return
    }
    if (selection.settingsLabelId.value != null || selection.settingsLineId.value != null) {
      deleteSelectedAnnotation()
      return
    }
    if (selection.moveDimensionId.value) {
      editor.pushUndo()
      editor.removeDimension(selection.moveDimensionId.value)
      selection.moveDimensionId.value = null
      syncPlanToParent()
    }
  }

  // --- Junction hover ---

  let wallHoverClearTimer: ReturnType<typeof setTimeout> | null = null

  function onJunctionHover(junctionId: string): void {
    if (wallHoverClearTimer) {
      clearTimeout(wallHoverClearTimer)
      wallHoverClearTimer = null
    }
    hoveredJunctionId.value = junctionId
    const junction = editor.junctions.value.find((item) => item.id === junctionId)
    const wallId = junction?.refs[0]?.wallId
    if (wallId) hoveredWallId.value = wallId
  }

  function onJunctionHoverEnd(): void {
    hoveredJunctionId.value = null
  }

  function cleanupHoverTimer(): void {
    if (wallHoverClearTimer) clearTimeout(wallHoverClearTimer)
  }

  // --- Ridge Z / floor drafts ---

  function syncRidgeZFromSelection(): void {
    const floorH = editor.floorHeightCm.value
    const ridgeIds = settingsWallIds.value.filter((id) => isRidgeWallId(editor.localPlan.value, id))
    if (ridgeIds.length > 0) {
      const zs = ridgeIds
        .map((id) => editor.ridgeWalls.value.find((wall) => wall.id === id))
        .filter((wall): wall is NonNullable<typeof wall> => wall != null)
        .flatMap((wall) => [
          Math.round(ridgeEndpointZCm(wall, 'a', floorH)),
          Math.round(ridgeEndpointZCm(wall, 'b', floorH)),
        ])
      if (zs.length > 0 && zs.every((value) => value === zs[0])) {
        ridgeZCm.value = zs[0]
      }
      return
    }
    const junctionId = selection.settingsJunctionId.value
    if (!junctionId) {
      if (drawWallKind.value === 'ridge') ensureRidgeZDraft()
      return
    }
    const junction = editor.junctions.value.find((item) => item.id === junctionId)
    if (
      !junction ||
      !junction.refs.some((ref) => isRidgeWallId(editor.localPlan.value, ref.wallId))
    ) {
      return
    }
    const zs = junction.refs
      .map((ref) => {
        const wall = editor.ridgeWalls.value.find((item) => item.id === ref.wallId)
        if (!wall) return null
        return Math.round(ridgeEndpointZCm(wall, ref.end, floorH))
      })
      .filter((value): value is number => value != null)
    if (zs.length > 0 && zs.every((value) => value === zs[0])) {
      ridgeZCm.value = zs[0]
    }
  }

  function applyRidgeZInput(cm: number | null): void {
    const z = cm != null && Number.isFinite(cm) ? Math.max(0, cm) : null
    ridgeZCm.value = z ?? editor.floorHeightCm.value
    if (z == null) return
    const selectedRidgeIds = settingsWallIds.value.filter((id) =>
      isRidgeWallId(editor.localPlan.value, id),
    )
    const floor = editor.localPlan.value?.floors[editor.floorIndex.value]
    const ridgeIds =
      selectedRidgeIds.length > 0
        ? selectedRidgeIds
        : listRidgeWallsOnFloor(floor).map((wall) => wall.id)
    const junction = editor.junctions.value.find(
      (item) => item.id === selection.settingsJunctionId.value,
    )
    const junctionIsRidge =
      junction != null &&
      junction.refs.some((ref) => isRidgeWallId(editor.localPlan.value, ref.wallId))
    if (ridgeIds.length === 0 && !junctionIsRidge) return
    flushPendingFieldCommits()
    editor.pushUndo()
    if (ridgeIds.length > 0) editor.applyRidgeZ(ridgeIds, z)
    if (junctionIsRidge && junction) editor.applyRidgeJunctionZ(junction.refs, z)
    syncPlanToParent()
  }

  function applySelectedWallKind(kind: 'wall' | 'ridge'): void {
    drawWallKind.value = kind
    if (kind === 'ridge') ensureRidgeZDraft()
    const ids = settingsWallIds.value
    if (ids.length === 0) return
    flushPendingFieldCommits()
    editor.pushUndo()
    editor.applyWallKind(ids, kind, wallThicknessDraft.value, ridgeZCm.value)
    syncWallThicknessDraftFromSelection()
    syncRidgeZFromSelection()
    syncPlanToParent()
  }

  watch([settingsWallIds, () => selection.settingsJunctionId.value], () => {
    syncRidgeZFromSelection()
  })

  watch(
    () => editor.floorHeightCm.value,
    (height) => {
      if (!Number.isFinite(height) || height <= 0) return
      if (settingsWallIds.value.length > 0) return
      wallHeightDraft.value = Math.round(height)
    },
    { immediate: true },
  )

  const ridgeFloorDraft = computed(() => {
    const ids = settingsWallIds.value.filter((id) => isRidgeWallId(editor.localPlan.value, id))
    if (ids.length === 0) return null
    const indexes = ids.map((id) => editor.ridgeFloorIndexForWall(id)).filter((index) => index >= 0)
    if (indexes.length === 0) return null
    if (indexes.every((index) => index === indexes[0])) return indexes[0]
    return null
  })

  const ridgeFloorMixed = computed(() => {
    const ids = settingsWallIds.value.filter((id) => isRidgeWallId(editor.localPlan.value, id))
    if (ids.length < 2) return false
    const indexes = ids.map((id) => editor.ridgeFloorIndexForWall(id))
    return indexes.some((index) => index !== indexes[0])
  })

  function applyRidgeFloorInput(floorIndexTarget: number): void {
    const ids = settingsWallIds.value.filter((id) => isRidgeWallId(editor.localPlan.value, id))
    if (ids.length === 0) return
    flushPendingFieldCommits()
    editor.pushUndo()
    editor.applyRidgeFloor(ids, floorIndexTarget)
    syncPlanToParent()
  }

  // --- Sanitize / bind / stamp wrappers ---

  function sanitizeWalls(): boolean {
    flushPendingFieldCommits()
    const changed = editor.applyWallsSanitize()
    if (!changed) return false
    clearSelection()
    syncPlanToParent()
    return true
  }

  function bindWallsToRoof(floorIndexTarget: number): BindWallsToRoofsResult | null {
    if (!editor.localPlan.value) return null
    flushPendingFieldCommits()
    const result = bindFloorWallsToRoofs(editor.localPlan.value, floorIndexTarget, {
      splitCreases: true,
      splitWalls: splitWallAtT,
    })
    if (result.boundJunctions === 0 && result.splits === 0) return result
    editor.pushUndo()
    editor.replaceLocalPlan(result.plan, { keepUndo: true, keepParentSyncSkip: true })
    clearSelection()
    syncPlanToParent()
    return result
  }

  function applyStampToActiveFloor(): boolean {
    flushPendingFieldCommits()
    const changed = editor.applyStampToActiveFloor()
    if (!changed) return false
    clearSelection()
    syncPlanToParent()
    return true
  }

  function canApplyStampOnActiveFloor(): boolean {
    return editor.canApplyStampOnActiveFloor()
  }

  // --- Item helpers exposed on return ---

  function updateSelectedItem(patch: Partial<FloorItem>): void {
    const guid = selection.settingsItemId.value
    if (!guid) return
    editor.pushUndo()
    editor.updateItem(guid, patch)
    syncPlanToParent()
  }

  function copySelectedItem(): void {
    const guid = selection.settingsItemId.value
    if (!guid) return
    const item = editor.items.value.find((entry) => entry.guid === guid)
    if (!item) return
    const info = resolveFixtureCatalog(item.refid, { width: item.width, height: item.height })
    pendingFixture.value = {
      refid: item.refid,
      label: item.name ?? info.label,
      kind: info.kind,
      categorie: info.categorie,
    }
    activeFmlTool.value = 'add_fixture'
    selection.settingsItemId.value = null
    selection.moveItemId.value = null
  }

  function rotateSelectedItem(deltaDeg: number): void {
    const guid = selection.settingsItemId.value
    if (!guid) return
    const item = editor.items.value.find((entry) => entry.guid === guid)
    if (!item) return
    editor.pushUndo()
    editor.updateItem(guid, { rotation: ((item.rotation ?? 0) + deltaDeg + 360) % 360 })
    syncPlanToParent()
  }

  function toggleSelectedItemMirror(axis: 0 | 1): void {
    const guid = selection.settingsItemId.value
    if (!guid) return
    const item = editor.items.value.find((entry) => entry.guid === guid)
    if (!item) return
    const cur = item.mirrored ?? [0, 0]
    const next: [number, number] = [cur[0] === 1 ? 1 : 0, cur[1] === 1 ? 1 : 0]
    next[axis] = next[axis] === 1 ? 0 : 1
    editor.pushUndo()
    editor.updateItem(guid, { mirrored: next })
    syncPlanToParent()
  }

  return {
    // Wall selection
    wallSelection,
    selectedFacadeGroupPanel,
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

    // Opening selection
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
    clearOpeningSelectionState,
    toggleSettingsOpening,
    syncOpeningDraftFromSelection,
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
    copySelectedOpening,
    deleteSelectedOpenings,

    // Area / surface
    areaSelection,
    surfaceEdit,
    bindResolveSurfacePoint,

    // Annotation label/line
    toggleSettingsLabel,
    toggleSettingsLine,
    labelTextDraft,
    updateSelectedLabelText,
    onLabelTextInput,
    commitLabelText,
    patchSelectedLabel,
    deleteSelectedAnnotation,
    updateSelectedLabelFontSize,
    updateSelectedLabelFontColor,
    updateSelectedLabelOutline,
    updateSelectedLabelBold,
    updateSelectedLabelItalic,
    updateSelectedLineType,
    updateSelectedLineColor,
    updateSelectedLineThickness,

    // Item toggle/delete
    toggleSettingsItem,
    deleteSelectedItem,
    deleteSelected,
    updateSelectedItem,
    copySelectedItem,
    rotateSelectedItem,
    toggleSelectedItemMirror,

    // Junction hover
    onJunctionHover,
    onJunctionHoverEnd,
    cleanupHoverTimer,

    // Ridge Z / floor
    syncRidgeZFromSelection,
    applyRidgeZInput,
    applySelectedWallKind,
    ridgeFloorDraft,
    ridgeFloorMixed,
    applyRidgeFloorInput,

    // Sanitize / bind / stamp
    sanitizeWalls,
    bindWallsToRoof,
    applyStampToActiveFloor,
    canApplyStampOnActiveFloor,
  }
}

export type SelectionCoordinatorApi = ReturnType<typeof useFmlPreviewSelectionCoordinator>
