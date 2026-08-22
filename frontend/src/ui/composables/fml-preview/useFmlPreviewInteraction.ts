import { computed, ref, watch, type Ref } from 'vue'
import type Konva from 'konva'
import { BOVENLICHT_GAP_CM, BOVENLICHT_HEIGHT_CM } from '@/core/fml/bovenlicht'
import { resolveDoorAddPreset, resolveWindowAddPreset } from '@/core/fml/opening-add-presets'
import { countGeneratedRoofPlanesOnPlan } from '@/core/fml/generate-roof-planes'
import { parseFmlHex } from '@/core/fml/roomtype-catalog'
import { alertFmlChrome, confirmFmlChrome } from '@/ui/composables/fml-chrome-dialog'
import { tGlobal } from '@/ui/i18n'
import type { FloorItem, FloorLineType, FloorPlan, Point2D, Wall } from '@/core/fml/types'
import { resolveFixtureCatalog } from '@/core/fml/fixture-refid-catalog'
import { isRidgeWallId, listRidgeWallsOnFloor, ridgeEndpointZCm } from '@/core/fml/ridge-walls'
import type { FmlThicknessBand } from '@/core/fml/fml-wall-thickness-tiers'
import { listDakSnapWalls } from '@/core/fml/ridge-floor'
import {
  JUNCTION_POINT_SNAP_CM,
  ROOM_DRAW_SNAP_CM,
  snapDrawWallEndpoint,
  snapPointToJunctions,
  snapPointToWallCenters,
  snapRoomDrawEndPoint,
  snapToNearbyEndpointAxes,
  snapToNearbyPointAxes,
  snapToPolygonGeometry,
  closedRingSegments,
  openPolylineSegments,
} from '@/ui/components/fml-preview-junctions'
import {
  isAllowedDakDrawPoint,
  resolveDakSurfacePoint,
  resolveRidgeDrawPoint,
} from '@/ui/components/fml-preview-dak-draw-snap'
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
import { useFmlPreviewMeasure, type MeasureDrawMode } from './useFmlPreviewMeasure'
import { loadUserSettings } from '@/ui/composables/settings/user-settings'
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
import { clampLabelFontSize, lineStrokeColor } from './fml-preview-render-annotations'

export type { FmlPreviewSelectionRefs } from './fml-preview-selection'
export { createFmlPreviewSelection } from './fml-preview-selection'
import type { FmlPreviewSelectionRefs } from './fml-preview-selection'

import type { ContentLayout } from './useFmlPreviewViewport'
import type { UnderlayOriginLayout } from '@/core/fml/translate-floor-plan'

type EditorApi = ReturnType<typeof useFmlPreviewEditor>

interface ViewportApi {
  viewScale: Ref<number>
  viewPosition: Ref<{ x: number; y: number }>
  contentLayout: Ref<ContentLayout | null>
  resetView: () => void
  refitContentLayout: () => void
  nudgeContentLayout: (dxCm: number, dyCm: number) => void
  worldOverflowsCurrentLayout: () => boolean
}

export function useFmlPreviewInteraction(options: {
  viewport: ViewportApi
  hitTest: HitTestApi
  selection: FmlPreviewSelectionRefs
  editor: EditorApi
  emit: (
    event: 'planUpdate' | 'thicknessWallPick' | 'cancelThicknessPick',
    payload?: FloorPlan | string,
    layout?: UnderlayOriginLayout | null,
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
  bovenlichtPacked?: Ref<boolean>
  /** Huidige underlay-layout (voor nulpunt + undo). */
  getUnderlayLayout?: () => UnderlayOriginLayout | null
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
  /** Dak-tab: geen plattegrond-muren selecteren. */
  dakMode?: Ref<boolean>
  /** Meet-tool subtype: tape / manual / slicer. */
  measureDrawMode?: Ref<MeasureDrawMode>
  /** Slicer: bewerk bestaande M/P i.p.v. nieuwe plaatsen. */
  slicerEditMode?: Ref<boolean>
  /** Vis-dropdown exclusief; commit schakelt mee. */
  dimensionVis?: Ref<import('@/core/fml/fml-dimension-vis').DimensionVis>
  /** Geselecteerde slicer-index (−1 = geen liniaal). */
  selectedSliceIndex?: Ref<number>
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
    bovenlichtPacked,
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
    drawWallKind,
  } = selection
  const ridgeZCm = ref<number | undefined>(undefined)
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
      selection.roofPolyMutate.value = false
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

  function syncPlanToParent(layout?: UnderlayOriginLayout | null): void {
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
    const nextLayout: UnderlayOriginLayout = {
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
    plan: editor.localPlan,
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

  function ridgeDrawSnapWalls(): ReadonlyArray<Pick<Wall, 'a' | 'b' | 'thickness' | 'balance'>> {
    const plan = editor.localPlan.value
    if (options.dakMode?.value === true && plan) {
      return listDakSnapWalls(plan, editor.floorIndex.value)
    }
    return editor.walls.value
  }

  function resolveDrawPoint(cm: Point2D, axisAnchor?: Point2D, snapDisabled?: boolean): Point2D {
    if (drawWallKind.value === 'ridge') {
      return resolveRidgeDrawPoint(cm, {
        plan: editor.localPlan.value,
        floorIndex: editor.floorIndex.value,
        walls: ridgeDrawSnapWalls(),
        axisAnchor,
        lockAxis: axisLocked.value,
        snapDisabled,
      })
    }
    const junction = hitTest.hitTestJunctionAtCm(cm)
    let point = junction ? { x: junction.cmX, y: junction.cmY } : cm
    if (!junction) {
      point = snapToNearbyEndpointAxes(editor.walls.value, [], point)
      point = snapPointToJunctions(editor.junctions.value, point, JUNCTION_POINT_SNAP_CM)
      point = snapPointToWallCenters(editor.walls.value, point, JUNCTION_POINT_SNAP_CM)
    }
    if (axisAnchor) {
      point = snapDrawWallEndpoint(axisAnchor, point, axisLocked.value)
    }
    return point
  }

  /**
   * Kamer-start: junction-hit zodat je makkelijk op een knoop bindt.
   * Eindhoek: 8 cm H/V op andere knopen — geen 15 cm as-magnet (schachten).
   */
  function resolveRoomStartPoint(cm: Point2D): Point2D {
    const junction = hitTest.hitTestJunctionAtCm(cm)
    if (junction) return { x: junction.cmX, y: junction.cmY }
    return snapPointToJunctions(editor.junctions.value, cm, ROOM_DRAW_SNAP_CM)
  }

  function resolveRoomEndPoint(cm: Point2D, start: Point2D): Point2D {
    return snapRoomDrawEndPoint(editor.junctions.value, editor.walls.value, cm, start)
  }

  function resolveSurfacePoint(
    cm: Point2D,
    snapDisabled: boolean,
    extraAxisPoints?: Point2D[],
    excludeSurfaceId?: string | null,
  ): Point2D {
    if (snapDisabled) return cm
    if (options.dakMode?.value === true && editor.localPlan.value) {
      const extra = extraAxisPoints ?? []
      return resolveDakSurfacePoint(cm, {
        plan: editor.localPlan.value,
        floorIndex: editor.floorIndex.value,
        extraAxisPoints: extra,
        axisAnchor: extra.length > 0 ? extra[extra.length - 1] : undefined,
        lockAxis: axisLocked.value,
        excludeSurfaceId,
      })
    }
    const junction = hitTest.hitTestJunctionAtCm(cm)
    if (junction) return { x: junction.cmX, y: junction.cmY }

    const extra = extraAxisPoints ?? []
    const rings: Point2D[][] = []
    for (const surface of editor.surfaces.value) {
      if (excludeSurfaceId && surface.id === excludeSurfaceId) continue
      if (surface.poly && surface.poly.length >= 2) {
        rings.push(surface.poly.map((p) => ({ x: p.x, y: p.y })))
      }
    }
    for (const area of editor.areas.value) {
      if (area.poly && area.poly.length >= 2) rings.push(area.poly)
    }
    const ringVerts = rings.flat()
    const segments = [
      ...rings.flatMap((ring) => closedRingSegments(ring)),
      ...openPolylineSegments(extra),
    ]
    const polySnap = snapToPolygonGeometry(
      cm,
      [...ringVerts, ...extra],
      segments,
      JUNCTION_POINT_SNAP_CM,
    )
    if (polySnap) return polySnap

    const wallPoints = editor.walls.value.flatMap((wall) => [wall.a, wall.b])
    const axis = snapToNearbyPointAxes([...wallPoints, ...ringVerts, ...extra], cm)
    const junctionSnap = snapPointToJunctions(editor.junctions.value, axis, JUNCTION_POINT_SNAP_CM)
    return snapPointToWallCenters(editor.walls.value, junctionSnap, JUNCTION_POINT_SNAP_CM)
  }

  const drawWall = useFmlPreviewDrawWall({
    hitTest,
    editor,
    hoveredJunctionId,
    wallThicknessDraft,
    drawKind: drawWallKind,
    ridgeZCm,
    requireFloorIndex: () =>
      options.dakMode?.value === true ? editor.floorIndex.value : undefined,
    resolvePoint: resolveDrawPoint,
    beforeBegin: () => {
      cancelSelectionBoxDrag()
      wallDrag.cancelMoveDragPending()
      clearSelection()
    },
    syncPlanToParent,
    onPlaced: () => {
      activeFmlTool.value = null
    },
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
    onPlaced: () => {
      activeFmlTool.value = null
    },
  })

  const drawSurface = useFmlPreviewDrawSurface({
    selection,
    editor,
    hitTest,
    shiftPressed: axisLocked,
    resolvePoint: resolveSurfacePoint,
    acceptPoint: (point) => {
      if (options.dakMode?.value !== true || !editor.localPlan.value) return true
      return isAllowedDakDrawPoint(editor.localPlan.value, editor.floorIndex.value, point)
    },
    isDak: () => options.dakMode?.value === true,
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
    axisLocked,
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
      // Slicer-tool: bestaande linialen blijven zichtbaar (niet deselecteren bij nieuwe sleep).
      if (options.measureDrawMode?.value !== 'slicer' && options.selectedSliceIndex) {
        options.selectedSliceIndex.value = -1
      }
    },
    getMode: () => options.measureDrawMode?.value ?? 'tape',
    canPersist: () => !inspectMode.value,
    getSlicerSlices: () => editor.btfSlices.value,
    getSlicerOffsetSnapCm: () => loadUserSettings().fmlViewer.slicerOffsetSnapCm,
    onCommitManual: (a, b) => {
      editor.pushUndo()
      editor.addDimension({ type: 'custom_dimension', a, b })
      syncPlanToParent()
      if (options.dimensionVis) options.dimensionVis.value = 'manual'
    },
    onCommitSlicer: (p, m) => {
      editor.pushUndo()
      const idx = editor.addBtfSlice({ m, p })
      syncPlanToParent()
      if (options.dimensionVis) options.dimensionVis.value = 'slicer'
      // Place-modus: geen selectie (anders lijkt het edit); edit-modus wel.
      if (options.selectedSliceIndex) {
        options.selectedSliceIndex.value = options.slicerEditMode?.value ? idx : -1
      }
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
    bovenlichtPacked,
    bovenlichtDefaults: computed(() => ({
      doorDefault: bovenlichtDefault?.value === true,
      windowDefault: windowBovenlichtDefault?.value === true,
      heightCm: bovenlichtHeightCm?.value ?? BOVENLICHT_HEIGHT_CM,
      gapCm: bovenlichtGapCm?.value ?? BOVENLICHT_GAP_CM,
    })),
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
  watch(drawLineMode, (on) => {
    if (!on) drawLine.cancelDrawLine()
  })

  function deactivateDrawTool(): void {
    drawWall.cancelDrawWallDrag()
    drawRoom.cancelDrawRoomDrag()
    drawSurface.cancelDrawSurface()
    drawLine.cancelDrawLine()
    measure.cancelMeasureDrag()
    if (options.selectedSliceIndex) options.selectedSliceIndex.value = -1
    activeFmlTool.value = null
  }

  function acceptDrawDraft(): boolean {
    if (drawWall.isDrafting()) return drawWall.commitFromMeasure()
    if (drawRoom.isDrafting()) return drawRoom.commitFromMeasure()
    if (drawSurface.commitDrawSurface()) return true
    return drawLine.commitFromHover()
  }

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
    selection.roofPolyMutate.value = false
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
        dakMode: computed(() => options.dakMode?.value === true),
        isRidgeWallId: (wallId: string) => isRidgeWallId(editor.localPlan.value, wallId),
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
        beginMeasure: (event) => {
          if (
            options.measureDrawMode?.value === 'slicer' &&
            options.slicerEditMode?.value === true
          ) {
            return
          }
          measure.beginMeasure(event)
        },
        updateMeasureHover: (event) => {
          if (
            options.measureDrawMode?.value === 'slicer' &&
            options.slicerEditMode?.value === true
          ) {
            measure.clearMeasureHover()
            return
          }
          measure.updateMeasureHover(event)
        },
        clearMeasureHover: measure.clearMeasureHover,
        onDrawRoomClick: drawRoom.onDrawRoomClick,
        updateDrawRoomHover: drawRoom.updateDrawRoomHover,
        clearDrawRoomHover: drawRoom.clearDrawRoomHover,
        onDrawSurfaceClick: drawSurface.onDrawSurfaceClick,
        onDrawSurfaceDblClick: drawSurface.onDrawSurfaceDblClick,
        updateDrawSurfaceHover: drawSurface.updateDrawSurfaceHover,
        clearDrawSurfaceHover: drawSurface.clearDrawSurfaceHover,
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
        selectRoofSurface: areaSelection.selectRoofSurface,
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
    clearSelectedSlice: () => {
      if (!options.selectedSliceIndex || options.selectedSliceIndex.value < 0) return false
      options.selectedSliceIndex.value = -1
      return true
    },
    undo: () => editor.undo(),
    redo: () => editor.redo(),
    syncPlanToParentAfterUndo,
    drawSurface,
    areaSelection,
    surfaceEdit,
    drawWall,
    drawRoom,
    drawLine,
    deactivateDrawTool,
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
    // Echte externe plan-vervanging: selectie wissen. Herfit als de nieuwe
    // geometrie buiten de huidige world valt (import/generate/stempel) — niet
    // bij elke lokale sync, die wordt hierboven al overgeslagen.
    clearSelection({ flush: false })
    hoveredOpeningId.value = null
    measure.clearMeasureLines()
    if (!viewport.contentLayout.value || viewport.worldOverflowsCurrentLayout()) {
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

  function ensureRidgeZDraft(): number {
    if (ridgeZCm.value == null) {
      ridgeZCm.value = Math.round(editor.floorHeightCm.value)
    }
    return ridgeZCm.value
  }

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
    const z = cm != null && Number.isFinite(cm) ? Math.max(0, Math.round(cm)) : null
    ridgeZCm.value = z ?? Math.round(editor.floorHeightCm.value)
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
  watch(drawWallMode, (on) => {
    if (on && drawWallKind.value === 'ridge') ensureRidgeZDraft()
  })

  watch(
    () => options.dakMode?.value === true,
    (on) => {
      if (on) {
        drawWallKind.value = 'ridge'
        ensureRidgeZDraft()
        const tool = activeFmlTool.value
        if (tool && tool !== 'draw_wall' && tool !== 'draw_surface') activeFmlTool.value = null
        return
      }
      drawWallKind.value = 'wall'
      deactivateDrawTool()
    },
    { immediate: true },
  )

  watch(editor.floorIndex, () => {
    if (options.dakMode?.value === true) return
    deactivateDrawTool()
  })

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

  function sanitizeWalls(): boolean {
    flushPendingFieldCommits()
    const changed = editor.applyWallsSanitize()
    if (!changed) return false
    clearSelection()
    syncPlanToParent()
    return true
  }

  async function generateRoofPlanes(): Promise<boolean> {
    flushPendingFieldCommits()
    const existing = countGeneratedRoofPlanesOnPlan(editor.localPlan.value)
    if (existing > 0) {
      const ok = await confirmFmlChrome({
        title: tGlobal('result.toolbar.generateRoofPlanesTitle'),
        message: tGlobal('result.toolbar.generateRoofPlanesConfirm'),
        confirmLabel: tGlobal('result.toolbar.generateRoofPlanes'),
      })
      if (!ok) return false
    }
    editor.pushUndo()
    editor.generateRoofPlanes()
    syncPlanToParent()
    if (countGeneratedRoofPlanesOnPlan(editor.localPlan.value) === 0) {
      await alertFmlChrome({
        title: tGlobal('result.toolbar.generateRoofPlanesEmptyTitle'),
        message: tGlobal('result.toolbar.generateRoofPlanesEmpty'),
      })
    }
    return true
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
    drawLineDrafting: computed(() => (selection.drawLinePoints.value?.length ?? 0) > 0),
    drawSurfaceDrafting: computed(() => (drawSurface.draftPoints.value?.length ?? 0) >= 3),
    drawSurfacePendingRole: drawSurface.pendingRole,
    drawLineThickness: drawLine.thickness,
    drawLineType: drawLine.lineType,
    drawLineColor: drawLine.color,
    drawLabelText: drawLabel.pendingText,
    drawLabelFontSize: drawLabel.fontSize,
    drawLabelFontColor: drawLabel.fontColor,
    drawLabelOutline: drawLabel.outline,
    drawLabelBold: drawLabel.bold,
    drawLabelItalic: drawLabel.italic,
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
    acceptDrawDraft,
    deactivateDrawTool,
    drawSurfacePoints: drawSurface.draftPoints,
    drawSurfaceHoverCm: drawSurface.hoverCm,
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
    drawWallKind,
    ridgeZCm,
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
    flushPendingFieldCommits,
    applySelectedWallKind,
    applyRidgeZInput,
    ridgeFloorDraft,
    ridgeFloorMixed,
    applyRidgeFloorInput,
    sanitizeWalls,
    generateRoofPlanes,
    applyStampToActiveFloor,
    canApplyStampOnActiveFloor,
    applyRoomTypeToSelection: areaSelection.applyRoomTypeToSelection,
    applyAreaCustomName: areaSelection.applyCustomName,
    onAreaCustomNameInput: areaSelection.onCustomNameInput,
    commitAreaCustomName: areaSelection.commitCustomName,
    customNameDraft: areaSelection.customNameDraft,
    applyAreaColor: areaSelection.applyColor,
    applyShowAreaLabel: areaSelection.applyShowAreaLabel,
    deleteSelectedTagged: areaSelection.deleteSelectedTagged,
    beginSurfacePolygonEdit: areaSelection.beginSurfacePolygonEdit,
    endSurfacePolygonEdit: () => {
      areaSelection.endSurfacePolygonEdit()
      surfaceEdit.cancelDrag()
      surfaceEdit.selectedVertexIndex.value = null
    },
    roofVertexIndex: surfaceEdit.selectedVertexIndex,
    setRoofVertexZ: surfaceEdit.setSelectedVertexZ,
    roomTypes: areaSelection.roomTypes,
    commitDrawSurface: drawSurface.commitDrawSurface,
    cancelDrawSurface: drawSurface.cancelDrawSurface,
    updateSelectedLabelText,
    onLabelTextInput,
    commitLabelText,
    labelTextDraft,
    deleteSelectedAnnotation,
    updateSelectedLabelFontSize,
    updateSelectedLabelFontColor,
    updateSelectedLabelOutline,
    updateSelectedLabelBold,
    updateSelectedLabelItalic,
    updateSelectedLineType,
    updateSelectedLineColor,
    updateSelectedLineThickness,
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
