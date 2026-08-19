import { computed, ref, watch, type Ref } from 'vue'
import type Konva from 'konva'
import { resolveDoorAddPreset, resolveWindowAddPreset } from '@/core/fml/opening-add-presets'
import type { FloorItem, FloorPlan, Point2D } from '@/core/fml/types'
import { resolveFixtureCatalog } from '@/core/fml/fixture-refid-catalog'
import type { FmlThicknessBand } from '@/core/fml/fml-wall-thickness-tiers'
import {
  JUNCTION_POINT_SNAP_CM,
  ROOM_DRAW_SNAP_CM,
  snapDrawWallEndpoint,
  snapPointToJunctions,
  snapPointToWallCenters,
  snapToNearbyEndpointAxes,
} from '@/ui/components/fml-preview-junctions'
import type { useFmlPreviewEditor } from '@/ui/composables/useFmlPreviewEditor'
import type { FmlInspectHit } from './fml-inspect'
import { createFmlPreviewEditorKeyHandlers } from './fml-preview-editor-keyboard'
import type { HitTestApi } from './fml-preview-hit-test-api'
import { useFmlPreviewAddOpening } from './useFmlPreviewAddOpening'
import { useFmlPreviewInspect } from './useFmlPreviewInspect'
import { useFmlPreviewDrawWall } from './useFmlPreviewDrawWall'
import { useFmlPreviewDrawRoom } from './useFmlPreviewDrawRoom'
import { useFmlPreviewDrawSurface } from './useFmlPreviewDrawSurface'
import { useFmlPreviewDrawLabel } from './useFmlPreviewDrawLabel'
import { useFmlPreviewDrawLine } from './useFmlPreviewDrawLine'
import { useFmlPreviewAreaSelection } from './useFmlPreviewAreaSelection'
import { useFmlPreviewSurfaceEdit } from './useFmlPreviewSurfaceEdit'
import { useFmlPreviewMeasure } from './useFmlPreviewMeasure'
import { useFmlPreviewNulpunt } from './useFmlPreviewNulpunt'
import { useFmlPreviewUnderlayMove } from './useFmlPreviewUnderlayMove'
import { useFmlPreviewOpeningDrag } from './useFmlPreviewOpeningDrag'
import { useFmlPreviewOpeningSelection } from './useFmlPreviewOpeningSelection'
import { useFmlPreviewPanZoom } from './useFmlPreviewPanZoom'
import { useFmlPreviewPointer } from './useFmlPreviewPointer'
import { useFmlPreviewWallDrag } from './useFmlPreviewWallDrag'
import { useFmlPreviewWallSelection } from './useFmlPreviewWallSelection'
import { useFmlPreviewItemDrag } from './useFmlPreviewItemDrag'
import { useFmlPreviewItemResize } from './useFmlPreviewItemResize'
import { useFmlPreviewAddFixture } from './useFmlPreviewAddFixture'
import type { FixturePlaceOption } from '@/core/fml/fixture-refid-catalog'
import { createFmlPreviewDraftCommitScheduler } from './fml-preview-draft-commit'

export type { FmlPreviewSelectionRefs } from './fml-preview-selection'
export { createFmlPreviewSelection } from './fml-preview-selection'
import type { FmlPreviewSelectionRefs } from './fml-preview-selection'

import type { ContentLayout } from './useFmlPreviewViewport'
import type { PreviewUnderlayLayout } from '@/ui/composables/project/types'

type EditorApi = ReturnType<typeof useFmlPreviewEditor>

interface ViewportApi {
  viewScale: Ref<number>
  viewPosition: Ref<{ x: number; y: number }>
  contentLayout: Ref<ContentLayout | null>
  resetView: () => void
  refitContentLayout: () => void
  nudgeContentLayout: (dxCm: number, dyCm: number) => void
}

export function useFmlPreviewInteraction(options: {
  viewport: ViewportApi
  hitTest: HitTestApi
  selection: FmlPreviewSelectionRefs
  editor: EditorApi
  emit: (
    event: 'planUpdate' | 'thicknessWallPick' | 'cancelThicknessPick',
    payload?: FloorPlan | string,
    layout?: PreviewUnderlayLayout | null,
  ) => void
  containerRef: Ref<HTMLDivElement | null>
  contentGroupRef: Ref<{ getNode: () => Konva.Group } | null>
  shiftPressed: Ref<boolean>
  spacePressed: Ref<boolean>
  thicknessPickTier: Ref<FmlThicknessBand | null>
  bovenlichtDefault?: Ref<boolean>
  windowBovenlichtDefault?: Ref<boolean>
  bovenlichtHeightCm?: Ref<number>
  bovenlichtGapCm?: Ref<number>
  /** Huidige underlay-layout (voor nulpunt + undo). */
  getUnderlayLayout?: () => PreviewUnderlayLayout | null
  setFmlNulpuntImageCm?: (point: Point2D | null) => void
  /** Extern: onderlegger-verplaats-modus (sidebar toggle). */
  underlayMoveMode?: Ref<boolean>
  /** Area/surface Ctrl+klik + draw_surface (product-gate). Ontbreekt/false = uit. */
  areaSurfaceEditEnabled?: Ref<boolean>
  /** Labels/lijnen plaatsen (losse viewer). Default uit. */
  annotationEditEnabled?: Ref<boolean>
  /** Kamer-/FML-labels zichtbaar. Default true. */
  labelsVisible?: Ref<boolean>
  /** Read-only inspect (losse viewer). Default uit. */
  inspectMode?: Ref<boolean>
  /** Touch-editor host (`/FML-editor`). Default uit. */
  touchEditor?: Ref<boolean>
  /** Coarse pointer: Move-rail i.p.v. muis two-step. Default uit. */
  touchNav?: Ref<boolean>
  onInspectSelect?: (hit: FmlInspectHit | null) => void
  onKeyDown: (event: KeyboardEvent) => void
  onKeyUp: (event: KeyboardEvent) => void
}) {
  const {
    viewport,
    hitTest,
    selection,
    editor,
    emit,
    contentGroupRef,
    shiftPressed,
    spacePressed,
    thicknessPickTier,
    bovenlichtDefault,
    windowBovenlichtDefault,
    bovenlichtHeightCm,
    bovenlichtGapCm,
    getUnderlayLayout,
    setFmlNulpuntImageCm,
    underlayMoveMode: underlayMoveModeProp,
    areaSurfaceEditEnabled: areaSurfaceEditEnabledProp,
    annotationEditEnabled: annotationEditEnabledProp,
    labelsVisible: labelsVisibleProp,
    inspectMode: inspectModeProp,
    touchEditor: touchEditorProp,
    touchNav: touchNavProp,
    onInspectSelect,
    onKeyDown,
    onKeyUp,
  } = options

  const areaSurfaceEditEnabled = computed(() => areaSurfaceEditEnabledProp?.value === true)
  const annotationEditEnabled = computed(() => annotationEditEnabledProp?.value === true)
  const labelsVisible = computed(() => labelsVisibleProp?.value !== false)
  const inspectMode = computed(() => inspectModeProp?.value === true)
  const touchEditor = computed(() => touchEditorProp?.value === true)
  const touchNav = computed(() => touchNavProp?.value === true)
  const settingsMod = ref(false)
  const axisLockMod = ref(false)
  const moveMod = ref(false)
  const axisLocked = computed(() => shiftPressed.value || axisLockMod.value)
  const pendingFixture = ref<FixturePlaceOption | null>(null)

  const {
    settingsWallIds,
    moveWallId,
    settingsOpeningIds,
    moveOpeningId,
    hoveredWallId,
    hoveredOpeningId,
    hoveredJunctionId,
    addDoorSubtype,
    addDoorWidthCm,
    addDoorHeightCm,
    addWindowSubtype,
    addWindowWidthCm,
    addWindowSillZCm,
    addWindowHeightCm,
    activeFmlTool,
  } = selection

  const drawWallMode = computed(() => activeFmlTool.value === 'draw_wall')
  const drawRoomMode = computed(() => activeFmlTool.value === 'draw_room')
  const drawSurfaceMode = computed(
    () => areaSurfaceEditEnabled.value && activeFmlTool.value === 'draw_surface',
  )
  const drawLabelMode = computed(
    () => annotationEditEnabled.value && activeFmlTool.value === 'draw_label',
  )
  const drawLineMode = computed(
    () => annotationEditEnabled.value && activeFmlTool.value === 'draw_line',
  )
  const addDoorMode = computed(() => activeFmlTool.value === 'add_door')
  const addWindowMode = computed(() => activeFmlTool.value === 'add_window')
  const addFixtureMode = computed(() => touchEditor.value && activeFmlTool.value === 'add_fixture')
  const measureMode = computed(() => activeFmlTool.value === 'measure')
  const nulpuntMode = computed(() => activeFmlTool.value === 'nulpunt')

  watch(
    areaSurfaceEditEnabled,
    (on) => {
      if (on) return
      if (activeFmlTool.value === 'draw_surface') activeFmlTool.value = null
      selection.settingsAreaId.value = null
      selection.settingsSurfaceId.value = null
      selection.surfaceEditId.value = null
      selection.drawSurfacePoints.value = null
    },
    { immediate: true },
  )

  watch(
    annotationEditEnabled,
    (on) => {
      if (on) return
      if (activeFmlTool.value === 'draw_label' || activeFmlTool.value === 'draw_line') {
        activeFmlTool.value = null
      }
      selection.settingsLabelId.value = null
      selection.settingsLineId.value = null
      selection.drawLinePoints.value = null
    },
    { immediate: true },
  )

  watch(labelsVisible, (on) => {
    if (on) return
    selection.settingsLabelId.value = null
    selection.hoveredLabelId.value = null
  })
  const underlayMoveModeInternal = ref(false)
  const underlayMoveMode = computed({
    get: () => underlayMoveModeProp?.value ?? underlayMoveModeInternal.value,
    set: (on: boolean) => {
      if (underlayMoveModeProp) underlayMoveModeProp.value = on
      else underlayMoveModeInternal.value = on
    },
  })
  const isPanDragging = ref(false)

  const draftCommit = createFmlPreviewDraftCommitScheduler()
  function flushPendingFieldCommits(): void {
    draftCommit.flushAll()
  }
  function cancelPendingFieldCommits(): void {
    draftCommit.cancelAll()
  }

  // Exclusive: nulpunt-tool ↔ underlay-move
  watch(nulpuntMode, (on) => {
    if (on && underlayMoveMode.value) underlayMoveMode.value = false
  })
  watch(underlayMoveMode, (on) => {
    if (on && nulpuntMode.value) activeFmlTool.value = null
  })

  watch(addDoorSubtype, (subtype) => {
    addDoorWidthCm.value = resolveDoorAddPreset(subtype).defaultWidthCm
  })
  watch(addWindowSubtype, (subtype) => {
    addWindowWidthCm.value = resolveWindowAddPreset(subtype).defaultWidthCm
  })

  const ignoreNextPlanWatch = ref(false)
  const pendingPlanSyncSkips = ref(0)

  let wallHoverClearTimer: ReturnType<typeof setTimeout> | null = null

  const drawMeasureCancels = {
    cancelDrawWallDrag: () => {},
    cancelDrawRoomDrag: () => {},
    cancelMeasureDrag: () => {},
    cancelNulpuntDrag: () => {},
    cancelUnderlayMoveDrag: () => {},
  }

  function syncPlanToParent(layout?: PreviewUnderlayLayout | null): void {
    if (!editor.localPlan.value) return
    // +2: parent kan edited + imported in één tick zetten; extra marge tegen dubbele watch.
    ignoreNextPlanWatch.value = true
    pendingPlanSyncSkips.value = Math.max(pendingPlanSyncSkips.value, 2)
    editor.prepareParentSync()
    emit('planUpdate', JSON.parse(JSON.stringify(editor.localPlan.value)) as FloorPlan, layout)
  }

  function syncPlanToParentAfterUndo(): void {
    const layoutOrigin = editor.consumePendingUndoLayoutOrigin()
    if (layoutOrigin === undefined) {
      syncPlanToParent()
      return
    }
    const current = getUnderlayLayout?.() ?? null
    if (!current) {
      syncPlanToParent()
      return
    }
    const nextLayout: PreviewUnderlayLayout = {
      ...current,
      origin: layoutOrigin ? { ...layoutOrigin } : current.origin,
    }
    // FML (0,0) ↔ imageCm = layout.origin
    setFmlNulpuntImageCm?.(nextLayout.origin)
    // Zelfde contentLayout-refit als bij nulpunt-apply.
    viewport.refitContentLayout()
    syncPlanToParent(nextLayout)
  }

  const wallDrag = useFmlPreviewWallDrag({
    hitTest,
    editor,
    selection,
    spacePressed,
    syncPlanToParent,
  })

  const openingDrag = useFmlPreviewOpeningDrag({
    hitTest,
    editor,
    selection,
    spacePressed,
    syncPlanToParent,
  })

  const wallSelection = useFmlPreviewWallSelection({
    editor,
    hitTest,
    selection,
    syncPlanToParent,
    draftCommit,
    flushPendingFieldCommits,
    containerRef: options.containerRef,
    cancelMoveDragPending: wallDrag.cancelMoveDragPending,
    cancelDrawWallDrag: () => drawMeasureCancels.cancelDrawWallDrag(),
    cancelMeasureDrag: () => drawMeasureCancels.cancelMeasureDrag(),
  })

  const {
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
    cancelMoveDragPending: wallDrag.cancelMoveDragPending,
    cancelOpeningDragPending: openingDrag.cancelOpeningDragPending,
    bovenlichtDefault,
    windowBovenlichtDefault,
    bovenlichtHeightCm,
    bovenlichtGapCm,
  })

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
  } = openingSelection

  const inspect = useFmlPreviewInspect({
    hitTest,
    selection,
    walls: editor.walls,
    surfaces: editor.surfaces,
    floorIndex: editor.floorIndex,
    onInspectSelect,
  })
  const { applyInspectPick, updateInspectHover, clearInspectSelect } = inspect

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

  const { draggingJunction, draggingWall } = wallDrag
  const { draggingOpening } = openingDrag

  function resolveDrawPoint(cm: Point2D, axisAnchor?: Point2D): Point2D {
    const junction = hitTest.hitTestJunctionAtCm(cm)
    let point = junction ? { x: junction.cmX, y: junction.cmY } : cm
    if (!junction) {
      point = snapToNearbyEndpointAxes(editor.walls.value, [], point)
      point = snapPointToJunctions(editor.junctions.value, point, JUNCTION_POINT_SNAP_CM)
    }
    if (axisAnchor) {
      point = snapDrawWallEndpoint(axisAnchor, point, axisLocked.value)
    }
    return point
  }

  /**
   * Kamer-start: junction-hit zodat je makkelijk op een knoop bindt.
   * Daarna krappe hartlijn — de 15 cm as-magnet trekt kleine schachten dicht.
   */
  function resolveRoomStartPoint(cm: Point2D): Point2D {
    const junction = hitTest.hitTestJunctionAtCm(cm)
    if (junction) return { x: junction.cmX, y: junction.cmY }
    return snapPointToJunctions(editor.junctions.value, cm, ROOM_DRAW_SNAP_CM)
  }

  function resolveRoomEndPoint(cm: Point2D): Point2D {
    const junctionSnap = snapPointToJunctions(editor.junctions.value, cm, ROOM_DRAW_SNAP_CM)
    return snapPointToWallCenters(editor.walls.value, junctionSnap, ROOM_DRAW_SNAP_CM)
  }

  function resolveSurfacePoint(cm: Point2D, snapDisabled: boolean): Point2D {
    if (snapDisabled) return cm
    const junction = hitTest.hitTestJunctionAtCm(cm)
    if (junction) return { x: junction.cmX, y: junction.cmY }
    return snapPointToJunctions(editor.junctions.value, cm, JUNCTION_POINT_SNAP_CM)
  }

  const drawWall = useFmlPreviewDrawWall({
    hitTest,
    editor,
    hoveredJunctionId,
    wallThicknessDraft,
    resolvePoint: resolveDrawPoint,
    beforeBegin: () => {
      cancelSelectionBoxDrag()
      wallDrag.cancelMoveDragPending()
      clearSelection()
    },
    syncPlanToParent,
  })

  const drawRoom = useFmlPreviewDrawRoom({
    hitTest,
    editor,
    hoveredJunctionId,
    wallThicknessDraft,
    shiftPressed: axisLocked,
    resolveStartPoint: resolveRoomStartPoint,
    resolveEndPoint: resolveRoomEndPoint,
    beforeBegin: () => {
      cancelSelectionBoxDrag()
      wallDrag.cancelMoveDragPending()
      openingDrag.cancelOpeningDragPending()
      clearSelection()
    },
    syncPlanToParent,
  })

  const drawSurface = useFmlPreviewDrawSurface({
    selection,
    editor,
    hitTest,
    shiftPressed: axisLocked,
    resolvePoint: resolveSurfacePoint,
    beforeBegin: () => {
      cancelSelectionBoxDrag()
      wallDrag.cancelMoveDragPending()
      openingDrag.cancelOpeningDragPending()
      clearSelection()
    },
    syncPlanToParent,
  })

  const drawLabel = useFmlPreviewDrawLabel({
    selection,
    editor,
    hitTest,
    beforeBegin: () => {
      cancelSelectionBoxDrag()
      wallDrag.cancelMoveDragPending()
      openingDrag.cancelOpeningDragPending()
      clearSelection()
    },
    syncPlanToParent,
  })

  const drawLine = useFmlPreviewDrawLine({
    selection,
    editor,
    hitTest,
    shiftPressed: axisLocked,
    resolvePoint: resolveSurfacePoint,
    beforeBegin: () => {
      cancelSelectionBoxDrag()
      wallDrag.cancelMoveDragPending()
      openingDrag.cancelOpeningDragPending()
      clearSelection()
    },
    syncPlanToParent,
  })

  function toggleSettingsLabel(labelId: string): void {
    flushPendingFieldCommits()
    wallDrag.cancelMoveDragPending()
    openingDrag.cancelOpeningDragPending()
    moveWallId.value = null
    settingsWallIds.value = []
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
    wallDrag.cancelMoveDragPending()
    openingDrag.cancelOpeningDragPending()
    moveWallId.value = null
    settingsWallIds.value = []
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

  const areaSelection = useFmlPreviewAreaSelection({
    selection,
    editor,
    syncPlanToParent,
    draftCommit,
    flushPendingFieldCommits,
    cancelMoveDragPending: () => wallDrag.cancelMoveDragPending(),
    cancelOpeningDragPending: () => openingDrag.cancelOpeningDragPending(),
  })

  const surfaceEdit = useFmlPreviewSurfaceEdit({
    selection,
    editor,
    hitTest,
    resolvePoint: resolveSurfacePoint,
    syncPlanToParent,
  })

  const measure = useFmlPreviewMeasure({
    hitTest,
    hoveredJunctionId,
    getWalls: () => editor.walls.value,
    shiftPressed: axisLocked,
    beforeBegin: () => {
      cancelSelectionBoxDrag()
      wallDrag.cancelMoveDragPending()
      clearSelection()
    },
  })

  watch(measureMode, (on) => {
    if (!on) measure.clearMeasureHover()
  })

  const addOpening = useFmlPreviewAddOpening({
    editor,
    addDoorSubtype,
    addDoorWidthCm,
    addDoorHeightCm,
    addWindowSubtype,
    addWindowWidthCm,
    addWindowSillZCm,
    addWindowHeightCm,
    beforePlace: () => {
      cancelSelectionBoxDrag()
      wallDrag.cancelMoveDragPending()
      openingDrag.cancelOpeningDragPending()
      clearSelection()
    },
    syncPlanToParent,
  })

  const itemDrag = useFmlPreviewItemDrag({
    hitTest,
    editor,
    selection,
    spacePressed,
    settingsMod,
    syncPlanToParent,
  })

  const itemResize = useFmlPreviewItemResize({
    editor,
    settingsItemId: selection.settingsItemId,
    clientToCm: (x, y) => hitTest.clientToCm(x, y),
    screenPxToCm: (px) => {
      const layout = viewport.contentLayout.value
      if (!layout) return 10
      return px / layout.scale / viewport.viewScale.value
    },
    syncPlanToParent,
  })

  const addFixture = useFmlPreviewAddFixture({
    editor,
    pendingFixture,
    beforePlace: () => {
      cancelSelectionBoxDrag()
      wallDrag.cancelMoveDragPending()
      openingDrag.cancelOpeningDragPending()
      itemDrag.cancelItemDragPending()
      clearSelection()
    },
    syncPlanToParent,
  })

  function toggleSettingsItem(guid: string): void {
    flushPendingFieldCommits()
    wallDrag.cancelMoveDragPending()
    openingDrag.cancelOpeningDragPending()
    itemDrag.cancelItemDragPending()
    moveWallId.value = null
    settingsWallIds.value = []
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

  drawMeasureCancels.cancelDrawWallDrag = drawWall.cancelDrawWallDrag
  drawMeasureCancels.cancelDrawRoomDrag = drawRoom.cancelDrawRoomDrag
  drawMeasureCancels.cancelMeasureDrag = measure.cancelMeasureDrag

  watch(drawWallMode, (on) => {
    if (!on) drawWall.cancelDrawWallDrag()
  })
  watch(drawRoomMode, (on) => {
    if (!on) drawRoom.cancelDrawRoomDrag()
  })

  const nulpunt = useFmlPreviewNulpunt({
    hitTest,
    editor,
    nulpuntMode,
    getUnderlayLayout: () => getUnderlayLayout?.() ?? null,
    getFloorIndex: () => editor.floorIndex.value,
    setFmlNulpuntImageCm: (point) => setFmlNulpuntImageCm?.(point),
    markParentPlanSync: () => {
      ignoreNextPlanWatch.value = true
      pendingPlanSyncSkips.value = Math.max(pendingPlanSyncSkips.value, 2)
    },
    nudgeContentLayout: (dx, dy) => viewport.nudgeContentLayout(dx, dy),
    beforeBegin: () => {
      cancelSelectionBoxDrag()
      wallDrag.cancelMoveDragPending()
      clearSelection()
    },
  })
  drawMeasureCancels.cancelNulpuntDrag = nulpunt.cancelNulpuntPending

  const underlayMove = useFmlPreviewUnderlayMove({
    hitTest,
    underlayMoveMode,
    getUnderlayLayout: () => getUnderlayLayout?.() ?? null,
    setFmlNulpuntImageCm: (point) => setFmlNulpuntImageCm?.(point),
    syncLayoutToParent: (layout) => syncPlanToParent(layout),
    beforeBegin: () => {
      cancelSelectionBoxDrag()
      wallDrag.cancelMoveDragPending()
      clearSelection()
    },
  })
  drawMeasureCancels.cancelUnderlayMoveDrag = underlayMove.cancelUnderlayMoveDrag

  function confirmNulpuntBake(): boolean {
    const applied = nulpunt.confirmNulpuntBake()
    if (!applied) return false
    // Alleen actieve preview → parent; andere project-floors zitten in eigen blobs.
    syncPlanToParent(applied.layout)
    return true
  }

  function undoEdit(): void {
    if (editor.undo()) {
      syncPlanToParentAfterUndo()
      syncWallThicknessDraftFromSelection()
    }
  }

  const panZoom = useFmlPreviewPanZoom({
    viewport,
    containerRef: options.containerRef,
    isPanDragging,
    onBeforePan: wallDrag.cancelMoveDragPending,
  })

  watch(inspectMode, (on) => {
    if (!on) return
    activeFmlTool.value = null
    underlayMoveMode.value = false
    moveWallId.value = null
    moveOpeningId.value = null
    selection.pinnedJunctionId.value = null
    selection.surfaceEditId.value = null
    selection.drawSurfacePoints.value = null
    selection.drawLinePoints.value = null
    wallDrag.cancelMoveDragPending()
    openingDrag.cancelOpeningDragPending()
    cancelSelectionBoxDrag()
    drawWall.cancelDrawWallDrag()
    drawRoom.cancelDrawRoomDrag()
    drawSurface.cancelDrawSurface()
    drawLine.cancelDrawLine()
    measure.cancelMeasureDrag()
    nulpunt.cancelNulpuntPending()
    underlayMove.cancelUnderlayMoveDrag()
  })

  const { canvasCursor, onWrapPointerDown, onWrapPointerMove, onWrapDblClick, cancelPendingMove } =
    useFmlPreviewPointer({
      hitTest,
      selection,
      modes: {
        drawWallMode,
        drawRoomMode,
        drawSurfaceMode,
        drawLabelMode,
        drawLineMode,
        addDoorMode,
        addWindowMode,
        measureMode,
        nulpuntMode,
        underlayMoveMode,
        selectionBoxMode,
        areaSurfaceEditEnabled,
        annotationEditEnabled,
        labelsVisible,
        inspectMode,
        addFixtureMode,
        settingsMod,
        moveMod,
        touchNav,
      },
      drag: {
        draggingWall,
        draggingJunction,
        draggingOpening,
        draggingItem: itemDrag.draggingItem,
        draggingItemResize: itemResize.draggingItemResize,
        isMeasureDragging: () => measure.isDragging(),
        isNulpuntDragging: () => nulpunt.isDragging(),
        isUnderlayMoveDragging: () => underlayMove.isDragging(),
        isPanDragging,
      },
      actions: {
        beginPanDrag: panZoom.beginPanDrag,
        onDrawWallClick: drawWall.onDrawWallClick,
        updateDrawWallHover: drawWall.updateDrawWallHover,
        clearDrawWallHover: drawWall.clearDrawWallHover,
        beginMeasure: measure.beginMeasure,
        updateMeasureHover: measure.updateMeasureHover,
        clearMeasureHover: measure.clearMeasureHover,
        onDrawRoomClick: drawRoom.onDrawRoomClick,
        updateDrawRoomHover: drawRoom.updateDrawRoomHover,
        clearDrawRoomHover: drawRoom.clearDrawRoomHover,
        onDrawSurfaceClick: drawSurface.onDrawSurfaceClick,
        onDrawSurfaceDblClick: drawSurface.onDrawSurfaceDblClick,
        onDrawLabelClick: drawLabel.onDrawLabelClick,
        onDrawLineClick: drawLine.onDrawLineClick,
        updateDrawLineHover: drawLine.updateDrawLineHover,
        clearDrawLineHover: drawLine.clearDrawLineHover,
        onSurfaceEditPointerDown: surfaceEdit.onPointerDown,
        beginNulpuntDrag: nulpunt.beginNulpuntDrag,
        beginUnderlayMoveDrag: underlayMove.beginUnderlayMoveDrag,
        placeDoor: addOpening.placeDoor,
        placeWindow: addOpening.placeWindow,
        startJunctionDrag: wallDrag.startJunctionDrag,
        beginSelectionBoxDrag,
        toggleSettingsOpening,
        toggleSettingsArea: areaSelection.toggleSettingsArea,
        toggleSettingsSurface: areaSelection.toggleSettingsSurface,
        toggleSettingsLabel,
        toggleSettingsLine,
        toggleSettingsWall,
        toggleSettingsJunction,
        clearSelection,
        clearOpeningSelectionState,
        beginOpeningDrag: openingDrag.beginOpeningDrag,
        startOpeningDragPending: openingDrag.startOpeningDragPending,
        beginWallDrag: wallDrag.beginWallDrag,
        startMoveDragPending: wallDrag.startMoveDragPending,
        stopContentGroupDrag: () => {
          contentGroupRef.value?.getNode()?.stopDrag()
        },
        applyInspectPick,
        updateInspectHover,
        placeFixture: addFixture.placeFixture,
        startItemDragPending: itemDrag.startItemDragPending,
        beginItemDrag: itemDrag.beginItemDrag,
        toggleSettingsItem,
        cancelItemDragPending: itemDrag.cancelItemDragPending,
        hitItemResizeHandle: (cm) => itemResize.hitHandleAtCm(cm),
        beginItemResize: itemResize.beginItemResize,
      },
      spacePressed,
      thicknessPickTier,
      emit: (event, payload) => emit(event, payload),
    })

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
    }
  }

  const { onEditorKeyDown, onEditorKeyUp } = createFmlPreviewEditorKeyHandlers({
    selection,
    inspectMode,
    drawSurfaceMode,
    measureMode,
    nulpuntMode,
    underlayMoveMode,
    thicknessPickTier,
    onKeyDown,
    onKeyUp,
    flushPendingFieldCommits,
    deleteSelected,
    clearSelection,
    clearInspectSelect,
    emitCancelThicknessPick: () => emit('cancelThicknessPick'),
    undo: () => editor.undo(),
    redo: () => editor.redo(),
    syncPlanToParentAfterUndo,
    drawSurface,
    areaSelection,
    surfaceEdit,
    drawWall,
    drawRoom,
    drawLine,
    measure,
    nulpunt,
    underlayMove,
  })

  function handleExternalPlanChange(): void {
    // Round-trip na lokale edit (delete/move/draw): viewport + selectie behouden.
    if (pendingPlanSyncSkips.value > 0) {
      pendingPlanSyncSkips.value -= 1
      ignoreNextPlanWatch.value = pendingPlanSyncSkips.value > 0
      return
    }
    if (ignoreNextPlanWatch.value) {
      ignoreNextPlanWatch.value = false
      return
    }
    // Echte externe plan-vervanging: pending drafts droppen (plan is weg).
    cancelPendingFieldCommits()
    // Echte externe plan-vervanging: selectie wissen. Zoom alleen fitten als er
    // nog geen layout is — anders voelt elke plan-sync als uitzoomen.
    clearSelection({ flush: false })
    hoveredOpeningId.value = null
    measure.clearMeasureLines()
    if (!viewport.contentLayout.value) {
      viewport.resetView()
    }
  }

  function mountKeyboardListeners(): void {
    window.addEventListener('keydown', onEditorKeyDown)
    window.addEventListener('keyup', onEditorKeyUp)
  }

  function unmountInteraction(): void {
    if (wallHoverClearTimer) clearTimeout(wallHoverClearTimer)
    // Floor remount (workspace :key): flush drafts vóór dispose.
    draftCommit.dispose()
    cancelPendingMove()
    wallDrag.cleanupWallDrag()
    openingDrag.cleanupOpeningDrag()
    itemDrag.cleanupItemDrag()
    itemResize.cleanupItemResize()
    cancelSelectionBoxDrag()
    drawWall.cancelDrawWallDrag()
    drawRoom.cancelDrawRoomDrag()
    drawSurface.cancelDrawSurface()
    drawLine.cancelDrawLine()
    surfaceEdit.cancelDrag()
    measure.cancelMeasureDrag()
    measure.clearMeasureHover()
    nulpunt.cancelNulpuntPending()
    underlayMove.cancelUnderlayMoveDrag()
    panZoom.endPanDrag()
    window.removeEventListener('keydown', onEditorKeyDown)
    window.removeEventListener('keyup', onEditorKeyUp)
  }

  function sanitizeWalls(): boolean {
    flushPendingFieldCommits()
    const changed = editor.applyWallsSanitize()
    if (!changed) return false
    clearSelection()
    syncPlanToParent()
    return true
  }

  return {
    activeFmlTool,
    selectionBoxMode,
    drawWallMode,
    drawRoomMode,
    drawSurfaceMode,
    drawLabelMode,
    drawLineMode,
    addDoorMode,
    addWindowMode,
    measureMode,
    nulpuntMode,
    underlayMoveMode,
    selectionBoxPreview,
    drawWallPreview: drawWall.drawWallPreview,
    drawRoomPreview: drawRoom.drawRoomPreview,
    drawWallDrafting: computed(() => drawWall.isDrafting()),
    drawRoomDrafting: computed(() => drawRoom.isDrafting()),
    drawWallMeasureLengthCm: drawWall.measureLengthCm,
    drawRoomMeasureHCm: drawRoom.measureHCm,
    drawRoomMeasureVCm: drawRoom.measureVCm,
    setDrawWallLengthOverrideCm: drawWall.setLengthOverrideCm,
    setDrawRoomHOverrideCm: drawRoom.setHOverrideCm,
    setDrawRoomVOverrideCm: drawRoom.setVOverrideCm,
    commitDrawWallFromMeasure: drawWall.commitFromMeasure,
    commitDrawRoomFromMeasure: drawRoom.commitFromMeasure,
    cancelDrawWallDraft: drawWall.cancelDrawWallDrag,
    cancelDrawRoomDraft: drawRoom.cancelDrawRoomDrag,
    drawSurfacePoints: drawSurface.draftPoints,
    drawLinePoints: selection.drawLinePoints,
    drawLineHoverCm: drawLine.hoverCm,
    measurePreview: measure.measurePreview,
    measureLines: measure.measureLines,
    measureHoverCm: measure.measureHoverCm,
    clearMeasureLines: measure.clearMeasureLines,
    nulpuntDisplayCm: nulpunt.nulpuntDisplayCm,
    nulpuntHasPending: nulpunt.nulpuntHasPending,
    nulpuntShowBakeActions: nulpunt.nulpuntShowBakeActions,
    confirmNulpuntBake,
    cancelNulpuntPending: nulpunt.cancelNulpuntPending,
    toggleSelectionBoxMode,
    canUndoEdit: editor.canUndoEdit,
    canRedoEdit: editor.canRedoEdit,
    undoEdit,
    redoEdit: () => {
      if (editor.redo()) {
        syncPlanToParentAfterUndo()
        syncWallThicknessDraftFromSelection()
      }
    },
    zoomBy: panZoom.zoomBy,
    applyView: panZoom.applyView,
    settingsMod,
    axisLockMod,
    moveMod,
    pendingFixture,
    settingsItemId: selection.settingsItemId,
    moveItemId: selection.moveItemId,
    itemDragPreview: itemDrag.itemDragPreview,
    touchEditor,
    updateSelectedItem(patch: Partial<FloorItem>) {
      const guid = selection.settingsItemId.value
      if (!guid) return
      editor.pushUndo()
      editor.updateItem(guid, patch)
      syncPlanToParent()
    },
    deleteSelectedItem,
    copySelectedItem() {
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
    },
    rotateSelectedItem(deltaDeg: number) {
      const guid = selection.settingsItemId.value
      if (!guid) return
      const item = editor.items.value.find((entry) => entry.guid === guid)
      if (!item) return
      editor.pushUndo()
      editor.updateItem(guid, { rotation: ((item.rotation ?? 0) + deltaDeg + 360) % 360 })
      syncPlanToParent()
    },
    toggleSelectedItemMirror(axis: 0 | 1) {
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
    },
    settingsWallIds,
    moveWallId,
    settingsOpeningIds,
    moveOpeningId,
    wallThicknessDraft,
    wallThicknessMixed,
    wallBalanceDraft,
    wallBalanceMixed,
    wallHeightDraft,
    wallHeightMixed,
    junctionHeightDraft,
    junctionHeightMixed,
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
    addDoorSubtype,
    addDoorWidthCm,
    addDoorHeightCm,
    addWindowSubtype,
    addWindowWidthCm,
    addWindowSillZCm,
    addWindowHeightCm,
    canvasCursor,
    syncPlanToParent,
    onWallThicknessInput,
    commitWallThickness,
    applyWallsThicknessCm,
    onWallBalanceInput,
    commitWallBalance,
    onWallHeightInput,
    commitWallHeight,
    onJunctionHeightInput,
    commitJunctionHeight,
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
    splitSelectedWall,
    deleteSelectedWalls,
    clearSelection,
    flushPendingFieldCommits,
    sanitizeWalls,
    applyRoomTypeToSelection: areaSelection.applyRoomTypeToSelection,
    applyAreaCustomName: areaSelection.applyCustomName,
    onAreaCustomNameInput: areaSelection.onCustomNameInput,
    commitAreaCustomName: areaSelection.commitCustomName,
    customNameDraft: areaSelection.customNameDraft,
    applyAreaColor: areaSelection.applyColor,
    deleteSelectedTagged: areaSelection.deleteSelectedTagged,
    beginSurfacePolygonEdit: areaSelection.beginSurfacePolygonEdit,
    endSurfacePolygonEdit: () => {
      areaSelection.endSurfacePolygonEdit()
      surfaceEdit.cancelDrag()
    },
    roomTypes: areaSelection.roomTypes,
    commitDrawSurface: drawSurface.commitDrawSurface,
    cancelDrawSurface: drawSurface.cancelDrawSurface,
    updateSelectedLabelText,
    onLabelTextInput,
    commitLabelText,
    labelTextDraft,
    deleteSelectedAnnotation,
    settingsLabelId: selection.settingsLabelId,
    settingsLineId: selection.settingsLineId,
    onWrapPointerDown,
    onWrapPointerMove,
    onWrapDblClick,
    onWheel: panZoom.onWheel,
    onGroupDragStart: panZoom.onGroupDragStart,
    onGroupDragMove: panZoom.onGroupDragMove,
    onGroupDragEnd: panZoom.onGroupDragEnd,
    onJunctionHover,
    onJunctionHoverEnd,
    handleExternalPlanChange,
    mountKeyboardListeners,
    unmountInteraction,
    resetView: viewport.resetView,
  }
}
