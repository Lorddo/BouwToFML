<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, toRef, watch } from 'vue'
import type Konva from 'konva'
import { BOVENLICHT_GAP_CM, BOVENLICHT_HEIGHT_CM } from '@/core/fml/bovenlicht'
import { listRidgeWallsOnFloor } from '@/core/fml/ridge-walls'
import type { FloorPlan } from '@/core/fml/types'
import type { UnderlayOriginLayout } from '@/core/fml/translate-floor-plan'
import type { FmlThicknessBand } from '@/core/fml/fml-wall-thickness-tiers'
import { useStage } from '@/platform/canvas'
import { useFmlPreviewEditor } from '@/ui/composables/useFmlPreviewEditor'
import { useFmlPreviewViewport } from '@/ui/composables/fml-preview/useFmlPreviewViewport'
import { useFmlPreviewRenderModel } from '@/ui/composables/fml-preview/useFmlPreviewRenderModel'
import { useFmlPreviewHitTest } from '@/ui/composables/fml-preview/useFmlPreviewHitTest'
import {
  createFmlPreviewSelection,
  useFmlPreviewInteraction,
} from '@/ui/composables/fml-preview/useFmlPreviewInteraction'
import { useFmlPreviewDrawPreviews } from '@/ui/composables/fml-preview/useFmlPreviewDrawPreviews'
import { inspectColorFor, type FmlInspectHit } from '@/ui/composables/fml-preview/fml-inspect'
import { FML_PREVIEW_CHROME_SELECTOR } from '@/ui/composables/fml-preview/fml-preview-gestures'
import { useFmlCanvasTouch, useFmlTouchNav } from '@/ui/composables/fml-preview/useFmlCanvasTouch'
import { resolveFixtureCatalog } from '@/core/fml/fixture-refid-catalog'
import { itemResizeHandleWorlds } from '@/ui/composables/fml-preview/item-resize-handles'
import FmlEditorTouchChrome from '@/ui/fml-editor/FmlEditorTouchChrome.vue'
import type { HScaleState } from '@/platform/calibration'
import { layoutTransform } from '@/ui/composables/fml-preview/useFmlPreviewViewport'
import { underlayContentBoundsCm } from '@/ui/composables/fml-preview/fml-preview-underlay-layout'
import type { DimensionVis } from '@/core/fml/fml-dimension-vis'
import { defaultDimensionVis } from '@/core/fml/fml-dimension-vis'
import type { MeasureDrawMode } from '@/ui/composables/fml-preview/useFmlPreviewMeasure'
import { buildSliceGuide } from '@/core/fml/slice-dimension-lines'
import { useFmlPreviewSlicer } from '@/ui/composables/fml-preview/useFmlPreviewSlicer'
import {
  loadUserSettings,
  type CornerMarkerMode,
  type OpeningDisplayColors,
} from '@/ui/composables/settings/user-settings'
import { resolveFmlCapabilities, type FmlKind } from '@/ui/composables/fml-preview/fml-capabilities'
import {
  clampLabelFontSize,
  DEFAULT_LABEL_FONT_COLOR,
  DEFAULT_LABEL_FONT_SIZE_PX,
  DEFAULT_LINE_THICKNESS_PX,
  lineDash,
  lineStrokeColor,
} from '@/ui/composables/fml-preview/fml-preview-render-annotations'
import { STAMP_FACADE_GROUP_ID } from '@/core/fml/facade-groups'
import FmlPreviewToolbar from './FmlPreviewToolbar.vue'
import FmlFixturePalette from './FmlFixturePalette.vue'
import FmlPreviewStage from './FmlPreviewStage.vue'
import FmlPreviewMeasureOverlay from './FmlPreviewMeasureOverlay.vue'
import FmlRescaleOverlay from './FmlRescaleOverlay.vue'

const props = withDefaults(
  defineProps<{
    plan: FloorPlan | null
    floorIndex?: number
    underlaySrc?: string | null
    underlayWidthPx?: number
    underlayHeightPx?: number
    /** 0–1; 0 = uit. */
    underlayOpacity?: number
    /** 0–1; FML-geometrie opacity. */
    contentOpacity?: number
    cmOrigin?: { x: number; y: number } | null
    pxPerMmX?: number
    pxPerMmY?: number
    /** Onderlegger-rotatie in graden (FML drawing); default 0. */
    rotationDeg?: number
    /** Display-only X-flip van de onderlegger. */
    flipX?: boolean
    /** Sidebar: onderlegger verslepen. */
    underlayMoveMode?: boolean
    thicknessPickTier?: FmlThicknessBand | null
    thicknessMinCm?: number
    thicknessMidCm?: number
    thicknessMaxCm?: number
    bovenlichtDefault?: boolean
    windowBovenlichtDefault?: boolean
    bovenlichtHeightCm?: number
    bovenlichtGapCm?: number
    /** true = flags+groen; false = losse ramen. Default true. */
    bovenlichtPacked?: boolean
    /** Sessie-default voor nieuwe deuren (viewer). */
    defaultDoorHeightCm?: number
    defaultWindowHeightCm?: number
    defaultWindowSillZCm?: number
    setFmlNulpuntImageCm?: (point: { x: number; y: number } | null) => void
    /**
     * Capability preset. When set, derives area/annotation/inspect/touch flags.
     * Prefer this over the legacy boolean props below.
     */
    kind?: FmlKind
    /**
     * Area/surface Ctrl+klik + draw_surface. Default **false** (product-safe).
     * Ignored when `kind` is set (use detection/editor preset).
     */
    areaSurfaceEditEnabled?: boolean
    /**
     * Labels/lijnen plaatsen (Ctrl+klik selecteren). Default **false**.
     * Ignored when `kind` is set.
     */
    annotationEditEnabled?: boolean
    /** Read-only inspect. Ignored when `kind` is set. */
    inspectMode?: boolean
    /** FML-id → #RRGGBB statusfill. */
    inspectColors?: Record<string, string>
    /** Kamer-/surface-benaming + FML draw_label. Default true.
     * false = geen Konva.Text (maatlijnen blijven).
     */
    labelsVisible?: boolean
    /** Workspace: Herschalen-modus (H/V-linialen). Viewer uit. */
    rescaleMode?: boolean
    rescaleState?: HScaleState | null
    /** Fixture tool + coarse-pointer rail. Ignored when `kind` is set. */
    touchEditor?: boolean
    /** Viewer: chrome (header/floor-rail) verborgen. */
    canvasFullscreen?: boolean
    /** Exclusieve maatlijn-weergave (session). Alleen editor toont slicer/manual mutate. */
    dimensionVis?: DimensionVis
    /** Dak-tab: uitslag van de actieve floor (nok + dakvlakken). */
    dakMode?: boolean
  }>(),
  {
    floorIndex: 0,
    underlaySrc: null,
    underlayWidthPx: 0,
    underlayHeightPx: 0,
    underlayOpacity: 0,
    contentOpacity: 0.8,
    cmOrigin: null,
    pxPerMmX: 1,
    pxPerMmY: 1,
    rotationDeg: 0,
    flipX: false,
    underlayMoveMode: false,
    thicknessPickTier: null,
    thicknessMinCm: 10,
    thicknessMidCm: 20,
    thicknessMaxCm: 30,
    bovenlichtDefault: false,
    windowBovenlichtDefault: false,
    bovenlichtHeightCm: BOVENLICHT_HEIGHT_CM,
    bovenlichtGapCm: BOVENLICHT_GAP_CM,
    bovenlichtPacked: true,
    defaultDoorHeightCm: undefined,
    defaultWindowHeightCm: undefined,
    defaultWindowSillZCm: undefined,
    setFmlNulpuntImageCm: undefined,
    kind: undefined,
    areaSurfaceEditEnabled: undefined,
    annotationEditEnabled: undefined,
    inspectMode: undefined,
    inspectColors: undefined,
    labelsVisible: true,
    rescaleMode: false,
    rescaleState: null,
    touchEditor: undefined,
    canvasFullscreen: false,
    dimensionVis: undefined,
    dakMode: false,
  },
)

const capabilities = computed(() =>
  props.kind != null ? resolveFmlCapabilities(props.kind) : null,
)

/** Explicit prop wins; else kind preset; else false. */
function flagFromPropOrKind(prop: boolean | undefined, fromKind: boolean | undefined): boolean {
  if (prop != null) return prop === true
  if (fromKind != null) return fromKind
  return false
}

const areaSurfaceEditEnabled = computed(
  () =>
    props.dakMode === true ||
    flagFromPropOrKind(props.areaSurfaceEditEnabled, capabilities.value?.areaSurfaceEdit),
)
const annotationEditEnabled = computed(() =>
  flagFromPropOrKind(props.annotationEditEnabled, capabilities.value?.annotationEdit),
)
const inspectMode = computed(() =>
  flagFromPropOrKind(props.inspectMode, capabilities.value?.inspect),
)
const touchEditor = computed(() =>
  flagFromPropOrKind(props.touchEditor, capabilities.value?.touchChrome),
)
const viewportChrome = computed(
  () => capabilities.value?.viewportChrome === true || touchEditor.value,
)
const includeSurfaceTool = computed(() => areaSurfaceEditEnabled.value)
const includeAnnotationTools = computed(() => annotationEditEnabled.value)
const includeFixtureTool = computed(
  () =>
    touchEditor.value &&
    (capabilities.value == null || capabilities.value.fixtureLibrary !== false),
)

const emit = defineEmits<{
  planUpdate: [plan: FloorPlan, layout?: UnderlayOriginLayout | null]
  thicknessWallPick: [wallId: string]
  cancelThicknessPick: []
  'update:underlayMoveMode': [value: boolean]
  inspectSelect: [hit: FmlInspectHit | null]
  updateRescaleState: [state: HScaleState]
  cancelRescale: []
  'update:canvasFullscreen': [value: boolean]
  'update:dimensionVis': [value: DimensionVis]
}>()

const measureDrawMode = ref<MeasureDrawMode>('tape')
/** Slicer: true = handles bewerken, false = nieuwe P→M plaatsen. */
const slicerEditMode = ref(false)
const selectedSliceIndex = ref(-1)
const internalDimensionVis = ref<DimensionVis>(
  defaultDimensionVis(props.plan, props.floorIndex ?? 0),
)
const dimensionVis = computed({
  get: () => props.dimensionVis ?? internalDimensionVis.value,
  set: (value: DimensionVis) => {
    internalDimensionVis.value = value
    emit('update:dimensionVis', value)
  },
})

watch(
  () => [props.plan, props.floorIndex] as const,
  () => {
    if (props.dimensionVis != null) return
    internalDimensionVis.value = defaultDimensionVis(props.plan, props.floorIndex ?? 0)
  },
)

function interactionEmit(
  event: 'planUpdate' | 'thicknessWallPick' | 'cancelThicknessPick',
  payload?: FloorPlan | string,
  layout?: UnderlayOriginLayout | null,
): void {
  if (event === 'planUpdate') {
    emit('planUpdate', payload as FloorPlan, layout)
    return
  }
  if (event === 'thicknessWallPick') {
    emit('thicknessWallPick', payload as string)
    return
  }
  emit('cancelThicknessPick')
}

const thicknessPickTierRef = toRef(props, 'thicknessPickTier')
const bovenlichtDefaultRef = toRef(props, 'bovenlichtDefault')
const windowBovenlichtDefaultRef = toRef(props, 'windowBovenlichtDefault')
const bovenlichtHeightCmRef = toRef(props, 'bovenlichtHeightCm')
const bovenlichtGapCmRef = toRef(props, 'bovenlichtGapCm')
const bovenlichtPackedRef = toRef(props, 'bovenlichtPacked')
const underlayMoveModeRef = ref(props.underlayMoveMode ?? false)
watch(
  () => props.underlayMoveMode,
  (on) => {
    underlayMoveModeRef.value = on ?? false
  },
)
watch(underlayMoveModeRef, (on) => {
  if (on !== props.underlayMoveMode) emit('update:underlayMoveMode', on)
})

const containerRef = ref<HTMLDivElement | null>(null)
const stageRef = ref<{ getNode: () => Konva.Stage } | null>(null)
const contentGroupRef = ref<{ getNode: () => Konva.Group } | null>(null)
const { useTouchNav } = useFmlTouchNav(touchEditor)

const { shiftPressed, spacePressed, onKeyDown, onKeyUp } = useStage()
const ensureStampPreset = computed(() => props.kind === 'detection' || props.kind === 'editor')
const editor = useFmlPreviewEditor(toRef(props, 'plan'), toRef(props, 'floorIndex'), {
  ensureStampPreset,
})
const selection = createFmlPreviewSelection()

watch(
  () => props.defaultDoorHeightCm,
  (value) => {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      selection.addDoorHeightCm.value = Math.round(value)
    }
  },
  { immediate: true },
)
watch(
  () => props.defaultWindowHeightCm,
  (value) => {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      selection.addWindowHeightCm.value = Math.round(value)
    }
  },
  { immediate: true },
)
watch(
  () => props.defaultWindowSillZCm,
  (value) => {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      selection.addWindowSillZCm.value = Math.round(value)
    }
  },
  { immediate: true },
)

const floor = computed(
  () =>
    editor.localPlan.value?.floors[props.floorIndex] ?? editor.localPlan.value?.floors[0] ?? null,
)
const floorItems = computed(() => floor.value?.items ?? [])
const rescaleWalls = computed(() => editor.walls.value)
const underlayFitBounds = computed(() =>
  underlayContentBoundsCm({
    cmOrigin: props.cmOrigin ?? null,
    underlayWidthPx: props.underlayWidthPx ?? 0,
    underlayHeightPx: props.underlayHeightPx ?? 0,
    pxPerMmX: props.pxPerMmX ?? 1,
    pxPerMmY: props.pxPerMmY ?? 1,
    rotationDeg: props.rotationDeg ?? 0,
    flipX: props.flipX === true,
  }),
)
const viewport = useFmlPreviewViewport(containerRef, editor.walls, floorItems, underlayFitBounds)

const underlayProps = computed(() => ({
  underlaySrc: props.underlaySrc ?? null,
  underlayWidthPx: props.underlayWidthPx ?? 0,
  underlayHeightPx: props.underlayHeightPx ?? 0,
  opacity: props.underlayOpacity ?? 0,
  cmOrigin: props.cmOrigin ?? null,
  pxPerMmX: props.pxPerMmX ?? 1,
  pxPerMmY: props.pxPerMmY ?? 1,
  rotationDeg: props.rotationDeg ?? 0,
  flipX: props.flipX === true,
}))

const dakMode = computed(() => props.dakMode === true)

const render = useFmlPreviewRenderModel(
  viewport,
  editor,
  floor,
  underlayProps,
  selection,
  dimensionVis,
  dakMode,
)

const hitTestWalls = computed(() => {
  const current = floor.value
  if (dakMode.value) return listRidgeWallsOnFloor(current)
  return [...editor.walls.value, ...listRidgeWallsOnFloor(current)]
})

const hitTest = useFmlPreviewHitTest(
  viewport,
  hitTestWalls,
  render.renderJunctions,
  computed(() => render.renderModel.value?.doorGroups ?? []),
  containerRef,
  stageRef,
  computed(() => render.renderModel.value?.windows ?? []),
  computed(() => render.renderModel.value?.areas ?? []),
  computed(() => render.renderModel.value?.surfaces ?? []),
  computed(() => render.renderModel.value?.labels ?? []),
  computed(() => render.renderModel.value?.lines ?? []),
  editor.items,
  useTouchNav,
  computed(() => render.renderModel.value?.fixtures ?? []),
)

const interaction = useFmlPreviewInteraction({
  viewport,
  hitTest,
  selection,
  editor,
  emit: interactionEmit,
  containerRef,
  contentGroupRef,
  shiftPressed,
  spacePressed,
  thicknessPickTier: thicknessPickTierRef,
  bovenlichtDefault: bovenlichtDefaultRef,
  windowBovenlichtDefault: windowBovenlichtDefaultRef,
  bovenlichtHeightCm: bovenlichtHeightCmRef,
  bovenlichtGapCm: bovenlichtGapCmRef,
  bovenlichtPacked: bovenlichtPackedRef,
  getUnderlayLayout: () => {
    // Origin mag (0,0) zijn — object is altijd truthy; alleen null/undefined blokkeert.
    if (props.cmOrigin == null) {
      // Fallback zodat nulpunt niet stil faalt zonder underlay-layout prop.
      return {
        origin: { x: 0, y: 0 },
        pxPerMmX: props.pxPerMmX ?? 1,
        pxPerMmY: props.pxPerMmY ?? 1,
        ...(props.rotationDeg != null && Math.abs(props.rotationDeg) >= 0.001
          ? { rotationDeg: props.rotationDeg }
          : {}),
        ...(props.flipX ? { flipX: true } : {}),
      }
    }
    return {
      origin: { x: props.cmOrigin.x, y: props.cmOrigin.y },
      pxPerMmX: props.pxPerMmX ?? 1,
      pxPerMmY: props.pxPerMmY ?? 1,
      ...(props.rotationDeg != null && Math.abs(props.rotationDeg) >= 0.001
        ? { rotationDeg: props.rotationDeg }
        : {}),
      ...(props.flipX ? { flipX: true } : {}),
    }
  },
  setFmlNulpuntImageCm: (point) => props.setFmlNulpuntImageCm?.(point),
  underlayMoveMode: underlayMoveModeRef,
  areaSurfaceEditEnabled,
  annotationEditEnabled,
  labelsVisible: toRef(props, 'labelsVisible'),
  inspectMode,
  touchEditor,
  touchNav: useTouchNav,
  measureDrawMode,
  slicerEditMode,
  dimensionVis,
  selectedSliceIndex,
  dakMode,
  onInspectSelect: (hit) => emit('inspectSelect', hit),
  onKeyDown,
  onKeyUp,
})

const {
  stageSize,
  viewPosition,
  viewScale,
  contentLayout,
  renderTransform,
  mountResizeObserver,
  unmountResizeObserver,
} = viewport

const layoutScale = computed(() => contentLayout.value?.scale ?? 1)

const {
  renderModel,
  underlayConfig,
  settingsWallPolygons,
  moveWallPolygon,
  groupDraggable,
  visibleJunctions,
  renderCornerMarkers,
  junctionOverlayGroup,
  junctionHitRadius,
  junctionMarkerRadius,
  junctionMarkerStroke,
  activeJunctionId,
  selectedWallPanel,
  selectedJunctionPanel,
  selectedOpeningPanel,
} = render

const settingsAreaId = computed(() => selection.settingsAreaId.value)
const settingsSurfaceId = computed(() => selection.settingsSurfaceId.value)
const settingsLabelId = computed(() => selection.settingsLabelId.value)
const settingsLineId = computed(() => selection.settingsLineId.value)
const surfaceEditId = computed(() => selection.surfaceEditId.value)
const hoveredAreaId = computed(() => selection.hoveredAreaId.value)
const hoveredSurfaceId = computed(() => selection.hoveredSurfaceId.value)
const hoveredLabelId = computed(() => selection.hoveredLabelId.value)
const hoveredLineId = computed(() => selection.hoveredLineId.value)

const inspectWallPolygons = computed(() => {
  if (!inspectMode.value || !renderModel.value) return []
  const colors = props.inspectColors
  if (!colors) return []
  return renderModel.value.wallPolygons.flatMap((item) => {
    const fill = inspectColorFor(item.id, colors)
    if (!fill) return []
    return [{ ...item, fill }]
  })
})

/** Overlay: area-zijdematen; onafhankelijk van activeFmlTool. */
const areaSideDimsVisible = ref(false)
const cornerMarkerMode = ref<CornerMarkerMode>(loadUserSettings().fmlViewer.cornerMarkerMode)
const openingColors = ref<OpeningDisplayColors>({
  ...loadUserSettings().fmlViewer.openingColors,
})

function applyCornerMarkerModeFromSettings(): void {
  const viewer = loadUserSettings().fmlViewer
  cornerMarkerMode.value = viewer.cornerMarkerMode
  openingColors.value = { ...viewer.openingColors }
}
const fmlToolbarRef = ref<{ hint: string } | null>(null)
const toolbarHint = computed(() => fmlToolbarRef.value?.hint ?? '')

const {
  activeFmlTool,
  selectionBoxPreview,
  drawWallPreview,
  drawRoomPreview,
  drawWallDrafting,
  drawRoomDrafting,
  drawLineDrafting,
  drawSurfaceDrafting,
  drawSurfacePendingRole,
  drawLineThickness,
  drawLineType,
  drawLineColor,
  drawLabelText,
  drawLabelFontSize,
  drawLabelFontColor,
  drawLabelOutline,
  drawLabelBold,
  drawLabelItalic,
  drawWallMeasureLengthCm,
  drawRoomMeasureHCm,
  drawRoomMeasureVCm,
  setDrawWallLengthOverrideCm,
  setDrawRoomHOverrideCm,
  setDrawRoomVOverrideCm,
  commitDrawWallFromMeasure,
  commitDrawRoomFromMeasure,
  acceptDrawDraft,
  deactivateDrawTool,
  drawSurfacePoints,
  drawSurfaceHoverCm,
  drawLinePoints,
  drawLineHoverCm,
  measurePreview,
  measureLines,
  measureHoverCm,
  nulpuntMode,
  nulpuntDisplayCm,
  nulpuntHasPending,
  nulpuntShowBakeActions,
  confirmNulpuntBake,
  cancelNulpuntPending,
  settingsWallIds,
  moveWallId,
  settingsOpeningIds,
  moveOpeningId,
  drawWallKind,
  ridgeZCm,
  applySelectedWallKind,
  applyRidgeZInput,
  ridgeFloorDraft,
  ridgeFloorMixed,
  applyRidgeFloorInput,
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
  addWindowSubtype,
  addWindowWidthCm,
  addWindowSillZCm,
  addWindowHeightCm,
  canvasCursor,
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
  applyFacadeGroupSelection,
  applyStampGroupSelection,
  renameSelectedFacadeGroup,
  selectFacadeGroupMembers,
  selectStampGroupMembers,
  canSelectFacadeMembers,
  canSelectStampMembers,
  clearSelection,
  flushPendingFieldCommits,
  sanitizeWalls,
  generateRoofPlanes,
  applyStampToActiveFloor,
  canApplyStampOnActiveFloor,
  applyRoomTypeToSelection,
  applyAreaCustomName,
  onAreaCustomNameInput,
  customNameDraft,
  applyAreaColor,
  applyShowAreaLabel,
  deleteSelectedTagged,
  beginSurfacePolygonEdit,
  endSurfacePolygonEdit,
  roofVertexIndex,
  setRoofVertexZ,
  roomTypes,
  updateSelectedLabelText,
  onLabelTextInput,
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
  clearMeasureLines,
  canUndoEdit,
  canRedoEdit,
  undoEdit,
  redoEdit,
  zoomBy,
  settingsMod,
  axisLockMod,
  moveMod,
  pendingFixture,
  settingsItemId,
  moveItemId,
  itemDragPreview,
  updateSelectedItem,
  deleteSelectedItem,
  copySelectedItem,
  toggleSelectedItemMirror,
  onWrapPointerDown,
  onWrapPointerMove,
  onWrapDblClick,
  onWheel,
  onGroupDragStart,
  onGroupDragMove,
  onGroupDragEnd,
  onJunctionHover,
  onJunctionHoverEnd,
  handleExternalPlanChange,
  mountKeyboardListeners,
  unmountInteraction,
  resetView,
} = interaction

watch(activeFmlTool, (tool, prev) => {
  if (prev === 'measure' && tool !== 'measure') {
    selectedSliceIndex.value = -1
  }
})

watch(measureDrawMode, (mode) => {
  if (mode !== 'slicer') slicerEditMode.value = false
})

watch(slicerEditMode, (edit) => {
  if (!edit) {
    selectedSliceIndex.value = -1
    return
  }
  if (measureDrawMode.value !== 'slicer') return
  const slices = editor.btfSlices.value
  if (slices.length === 0) return
  if (selectedSliceIndex.value < 0 || selectedSliceIndex.value >= slices.length) {
    selectedSliceIndex.value = slices.length - 1
  }
})

/** Workspace-detectie: alleen Stempel (geen gevel-UI). */
const facadeGroupsStampPreset = computed(() => capabilities.value?.settingsVariant === 'workspace')
/** Editor + detectie: Stempel-checkbox. Inspect: uit. */
const stampGroupUiEnabled = computed(() => {
  const caps = capabilities.value
  if (!caps?.facadeGroups) return false
  return caps.settingsVariant === 'viewer' || caps.settingsVariant === 'workspace'
})
/** Editor: gevelgroepen zonder stamp. Detectie: gevel-UI verborgen. */
const facadeGroupOptionsForUi = computed(() => {
  const all = facadeGroupOptions.value
  if (facadeGroupsStampPreset.value) return []
  return all.filter((group) => group.id !== STAMP_FACADE_GROUP_ID)
})
const facadeGroupDraftForUi = computed((): string | null => facadeGroupDraft.value)
const facadeGroupMixedForUi = computed(() => facadeGroupMixed.value)
const canSelectFacadeMembersForUi = computed(() => canSelectFacadeMembers.value)

/** Gevelgroep-leden op deze floor (excl. al geselecteerde muren). */
const facadeWallPolygons = computed(() => {
  const model = renderModel.value
  if (!model) return []
  const selected = new Set(settingsWallIds.value)
  const memberIds = facadeMemberIdsOnActiveFloor.value.filter((id) => !selected.has(id))
  if (memberIds.length === 0) return []
  const idSet = new Set(memberIds)
  return model.wallPolygons.filter((item) => idSet.has(item.id))
})

/** Move-rail: alle knopen tonen (touch heeft geen hover). */
const inspectVisibleJunctions = computed(() => {
  if (inspectMode.value) return []
  if (moveMod.value) return render.renderJunctions.value
  return visibleJunctions.value
})

const itemDragPreviewStage = computed(() => {
  const preview = itemDragPreview.value
  if (!preview) return null
  const stage = renderTransform.value.toStagePoint(preview.x, preview.y)
  return { id: preview.guid, x: stage.x, y: stage.y }
})

const sliceGuidesStage = computed(() => {
  // Linialen alleen tijdens actieve slicer-meettool; maten blijven via sliceDimensions.
  if (activeFmlTool.value !== 'measure' || measureDrawMode.value !== 'slicer') return []
  const slices = editor.btfSlices.value
  if (slices.length === 0) return []
  const toStage = renderTransform.value.toStagePoint
  const walls = editor.walls.value
  const selected = selectedSliceIndex.value
  const out: Array<{
    index: number
    selected: boolean
    measure: number[]
    place: number[]
    link: number[]
    m: { x: number; y: number }
    p: { x: number; y: number }
  }> = []
  for (let i = 0; i < slices.length; i += 1) {
    const guide = buildSliceGuide(slices[i], walls)
    if (!guide) continue
    const m = toStage(guide.m.x, guide.m.y)
    const p = toStage(guide.p.x, guide.p.y)
    const mA = toStage(guide.measureA.x, guide.measureA.y)
    const mB = toStage(guide.measureB.x, guide.measureB.y)
    const pA = toStage(guide.placeA.x, guide.placeA.y)
    const pB = toStage(guide.placeB.x, guide.placeB.y)
    out.push({
      index: i,
      selected: i === selected,
      measure: [mA.x, mA.y, mB.x, mB.y],
      place: [pA.x, pA.y, pB.x, pB.y],
      link: [m.x, m.y, p.x, p.y],
      m,
      p,
    })
  }
  return out
})

const slicePreviewStage = computed(() => {
  if (activeFmlTool.value !== 'measure' || measureDrawMode.value !== 'slicer') return null
  if (slicerEditMode.value) return null
  const preview = measurePreview.value
  if (!preview) return null
  if (Math.hypot(preview.b.x - preview.a.x, preview.b.y - preview.a.y) < 1) return null
  // Sleep: a = P, b = M
  const guide = buildSliceGuide({ p: preview.a, m: preview.b }, editor.walls.value)
  if (!guide) return null
  const toStage = renderTransform.value.toStagePoint
  const m = toStage(guide.m.x, guide.m.y)
  const p = toStage(guide.p.x, guide.p.y)
  const mA = toStage(guide.measureA.x, guide.measureA.y)
  const mB = toStage(guide.measureB.x, guide.measureB.y)
  const pA = toStage(guide.placeA.x, guide.placeA.y)
  const pB = toStage(guide.placeB.x, guide.placeB.y)
  return {
    measure: [mA.x, mA.y, mB.x, mB.y],
    place: [pA.x, pA.y, pB.x, pB.y],
    link: [m.x, m.y, p.x, p.y],
    m,
    p,
  }
})

const slicer = useFmlPreviewSlicer({
  getSlices: () => editor.btfSlices.value,
  getWalls: () => editor.walls.value,
  getPlan: () => editor.localPlan.value,
  getFloorIndex: () => editor.floorIndex.value,
  selectedSliceIndex,
  clientToCm: (x, y) => hitTest.clientToCm(x, y),
  toStagePoint: (x, y) => renderTransform.value.toStagePoint(x, y),
  shiftPressed,
  pushUndo: () => editor.pushUndo(),
  updateSlice: (index, slice) => editor.updateBtfSlice(index, slice),
  syncPlan: () => {
    const plan = editor.localPlan.value
    if (plan) {
      editor.prepareParentSync()
      emit('planUpdate', plan)
    }
  },
})

function onCanvasPointerDown(event: MouseEvent): void {
  // Herschalen: alleen space+drag pan doorlaten (geen edit/select).
  if (props.rescaleMode && !spacePressed.value) return

  if (
    props.kind === 'editor' &&
    activeFmlTool.value === 'measure' &&
    measureDrawMode.value === 'slicer' &&
    slicerEditMode.value &&
    !spacePressed.value &&
    slicer.tryPointerDown(event)
  ) {
    return
  }

  onWrapPointerDown(event)
}

function onCanvasPointerMove(event: MouseEvent): void {
  if (props.rescaleMode && !spacePressed.value) return
  const target = event.target as HTMLElement | null
  if (target?.closest(FML_PREVIEW_CHROME_SELECTOR)) return
  onWrapPointerMove(event)
}

function onCanvasDblClick(event: MouseEvent): void {
  if (props.rescaleMode) return
  onWrapDblClick(event)
}

function onCanvasWheel(event: WheelEvent): void {
  const target = event.target as HTMLElement | null
  if (target?.closest(FML_PREVIEW_CHROME_SELECTOR)) return
  onWheel(event)
}

useFmlCanvasTouch({
  containerRef,
  enabled: useTouchNav,
  viewScale,
  viewPosition,
  getTool: () => activeFmlTool.value,
  moveMod,
  blockEdit: () => Boolean(props.rescaleMode && !spacePressed.value),
  onEditPointerDown: onCanvasPointerDown,
  onEditPointerMove: onCanvasPointerMove,
})

const selectedItemPanel = computed(() => {
  const guid = settingsItemId.value
  if (!guid) return null
  const item = editor.items.value.find((entry) => entry.guid === guid)
  if (!item) return null
  const info = resolveFixtureCatalog(item.refid, { width: item.width, height: item.height })
  return {
    id: guid,
    label: item.name ?? info.label,
    widthCm: item.width,
    heightCm: item.height,
    rotationDeg: item.rotation ?? 0,
    mirroredX: item.mirrored?.[0] === 1,
    mirroredY: item.mirrored?.[1] === 1,
  }
})

function onItemWidthInput(event: Event): void {
  updateSelectedItem({
    width: Math.max(1, Number((event.target as HTMLInputElement).value) || 1),
  })
}

function onItemHeightInput(event: Event): void {
  updateSelectedItem({
    height: Math.max(1, Number((event.target as HTMLInputElement).value) || 1),
  })
}

function onItemRotationInput(event: Event): void {
  const raw = Number((event.target as HTMLInputElement).value) || 0
  updateSelectedItem({
    rotation: ((raw % 360) + 360) % 360,
  })
}

const selectedAreaPanel = computed(() => {
  const id = settingsAreaId.value
  if (!id || !renderModel.value) return null
  const area = renderModel.value.areas.find((a) => a.id === id)
  if (!area) return null
  return {
    kind: 'area' as const,
    id: area.id,
    role: area.role ?? null,
    name: area.name ?? null,
    customName: customNameDraft.value,
    color: area.color,
    showAreaLabel: area.showAreaLabel !== false,
    canEditPolygon: false,
  }
})

const selectedSurfacePanel = computed(() => {
  const id = settingsSurfaceId.value
  if (!id || !renderModel.value) return null
  const surface = renderModel.value.surfaces.find((s) => s.id === id)
  if (!surface) return null
  return {
    kind: 'surface' as const,
    id: surface.id,
    role: surface.role ?? null,
    name: surface.name ?? null,
    customName: customNameDraft.value,
    color: surface.color,
    showAreaLabel: surface.showAreaLabel !== false,
    canEditPolygon: true,
  }
})

const selectedLabelPanel = computed(() => {
  const id = settingsLabelId.value
  if (!id) return null
  const label = floor.value?.labels?.find((item) => item.id === id)
  if (!label && !labelTextDraft.value) return null
  return {
    id,
    text: labelTextDraft.value,
    fontSize: clampLabelFontSize(label?.fontSize ?? DEFAULT_LABEL_FONT_SIZE_PX),
    fontColor: label?.fontColor || DEFAULT_LABEL_FONT_COLOR,
    outline: label?.outline === true,
    bold: label?.bold === true,
    italic: label?.italic === true,
  }
})

const selectedLinePanel = computed(() => {
  const id = settingsLineId.value
  if (!id) return null
  const line = floor.value?.lines?.find((item) => item.id === id)
  if (!line) return null
  return {
    id: line.id,
    type: line.type,
    color: lineStrokeColor(line.color),
    thickness:
      Number.isFinite(line.thickness) && line.thickness > 0
        ? line.thickness
        : DEFAULT_LINE_THICKNESS_PX,
  }
})

const drawLinePreviewDash = computed(() => {
  const dash = lineDash(drawLineType.value)
  return dash ? dash.join(' ') : undefined
})

const drawLinePreviewStroke = computed(() => lineStrokeColor(drawLineColor.value))

const surfaceEditVerticesStage = computed(() => {
  const id = surfaceEditId.value
  if (!id || !renderModel.value) return null
  const surface = renderModel.value.surfaces.find((s) => s.id === id)
  if (!surface) return null
  const pts: { x: number; y: number }[] = []
  for (let i = 0; i + 1 < surface.points.length; i += 2) {
    pts.push({ x: surface.points[i], y: surface.points[i + 1] })
  }
  return pts
})

const taggedSettingsPanel = computed(() => {
  if (!areaSurfaceEditEnabled.value) return null
  return selectedAreaPanel.value ?? selectedSurfacePanel.value
})

const ridgeFloorOptions = computed(() =>
  (editor.localPlan.value?.floors ?? []).map((entry, index) => ({
    index,
    name: entry.name,
  })),
)

const surfaceEditActive = computed(
  () => areaSurfaceEditEnabled.value && surfaceEditId.value != null,
)

const roofVertexZCm = computed(() => {
  const idx = roofVertexIndex.value
  if (idx == null) return null
  const id = surfaceEditId.value ?? selection.settingsSurfaceId.value
  const surface = editor.surfaces.value.find((item) => item.id === id)
  const z = surface?.poly[idx]?.z
  return typeof z === 'number' && Number.isFinite(z) ? Math.round(z) : null
})

const {
  drawWallPreviewScreen,
  drawRoomPreviewScreen,
  drawRoomPreviewPolygon,
  drawSurfacePreviewScreen,
  drawSurfacePreviewPolyline,
  drawLinePreviewScreen,
  drawLinePreviewPolyline,
  cmToScreen,
} = useFmlPreviewDrawPreviews({
  drawWallPreview,
  drawRoomPreview,
  drawSurfacePoints,
  drawSurfaceHoverCm,
  drawLinePoints,
  drawLineHoverCm,
  contentLayout,
  viewPosition,
  viewScale,
})

const itemResizeHandles = computed(() => {
  const guid = settingsItemId.value
  if (!guid || inspectMode.value) return []
  const item = editor.items.value.find((entry) => entry.guid === guid)
  if (!item) return []
  return itemResizeHandleWorlds(item).map((handle) => ({
    ...handle,
    ...cmToScreen(handle.x, handle.y),
  }))
})

const nulpuntScreen = computed(() => {
  if (!nulpuntMode.value) return null
  const p = nulpuntDisplayCm.value
  return cmToScreen(p.x, p.y)
})

function screenToCm(screenX: number, screenY: number): { x: number; y: number } {
  const layout = contentLayout.value
  if (!layout) return { x: 0, y: 0 }
  const stageX = (screenX - viewPosition.value.x) / viewScale.value
  const stageY = (screenY - viewPosition.value.y) / viewScale.value
  return layoutTransform(layout).toCmPoint(stageX, stageY)
}

function onRescaleKeyDown(event: KeyboardEvent): void {
  if (!props.rescaleMode) return
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('cancelRescale')
  }
}

onMounted(() => {
  mountResizeObserver()
  mountKeyboardListeners()
  window.addEventListener('keydown', onRescaleKeyDown)
})

onUnmounted(() => {
  unmountResizeObserver()
  unmountInteraction()
  window.removeEventListener('keydown', onRescaleKeyDown)
})

defineExpose({
  flushPendingFieldCommits,
  sanitizeWalls,
  generateRoofPlanes,
  applyStampToActiveFloor,
  canApplyStampOnActiveFloor,
  applyCornerMarkerModeFromSettings,
  undoEdit,
  redoEdit,
  resetView,
  zoomBy,
  canUndoEdit,
  canRedoEdit,
  settingsMod,
  axisLockMod,
  moveMod,
  pushUndo: () => editor.pushUndo(),
})

watch(
  () => props.plan,
  () => {
    handleExternalPlanChange()
  },
)

watch(
  () => props.floorIndex,
  () => {
    // Parent must flush before changing floorIndex; here drop stale timers only.
    clearSelection({ flush: false })
    clearMeasureLines()
    resetView()
  },
)
</script>

<template>
  <div
    ref="containerRef"
    class="fml-preview-wrap"
    :class="{ 'fml-preview-wrap--touch': useTouchNav }"
    :style="{ cursor: canvasCursor }"
    @mousedown="onCanvasPointerDown"
    @mousemove="onCanvasPointerMove"
    @dblclick="onCanvasDblClick"
    @wheel="onCanvasWheel"
  >
    <FmlEditorTouchChrome
      v-model:settings-mod="settingsMod"
      v-model:axis-lock-mod="axisLockMod"
      v-model:move-mod="moveMod"
      v-model:active-tool="activeFmlTool"
      v-model:area-side-dims-visible="areaSideDimsVisible"
      :show-topbar="viewportChrome && !rescaleMode"
      :show-help="!inspectMode"
      :show-mod-rail="useTouchNav && !inspectMode && !rescaleMode"
      :can-undo="canUndoEdit && !inspectMode"
      :can-redo="canRedoEdit && !inspectMode"
      :hint="toolbarHint"
      :fullscreen="canvasFullscreen"
      :edge-chrome="canvasFullscreen"
      @undo="undoEdit"
      @redo="redoEdit"
      @fit="resetView"
      @zoom-in="zoomBy(1.1)"
      @zoom-out="zoomBy(1 / 1.1)"
      @toggle-fullscreen="emit('update:canvasFullscreen', !canvasFullscreen)"
    />
    <FmlPreviewToolbar
      v-if="!inspectMode && !rescaleMode"
      ref="fmlToolbarRef"
      v-model:active-tool="activeFmlTool"
      v-model:area-side-dims-visible="areaSideDimsVisible"
      v-model:add-door-subtype="addDoorSubtype"
      v-model:add-door-width-cm="addDoorWidthCm"
      v-model:add-window-subtype="addWindowSubtype"
      v-model:add-window-width-cm="addWindowWidthCm"
      v-model:add-window-sill-z-cm="addWindowSillZCm"
      v-model:add-window-height-cm="addWindowHeightCm"
      :hide-inline-hint="viewportChrome"
      :floating-dock="touchEditor"
      :hide-select-tools="useTouchNav || dakMode"
      :dak-mode="dakMode"
      :selected-wall-panel="selectedWallPanel"
      :selected-junction-panel="selectedJunctionPanel"
      :selected-opening-panel="selectedOpeningPanel"
      :selected-area-panel="taggedSettingsPanel"
      :selected-label-panel="selectedLabelPanel"
      v-model:measure-draw-mode="measureDrawMode"
      :selected-line-panel="selectedLinePanel"
      v-model:slicer-edit-mode="slicerEditMode"
      :room-types="roomTypes"
      v-model:draw-surface-role="drawSurfacePendingRole"
      :surface-edit-active="surfaceEditActive"
      v-model:draw-line-thickness="drawLineThickness"
      :roof-vertex-z-cm="roofVertexZCm"
      v-model:draw-line-type="drawLineType"
      :roof-poly-mutate="selection.roofPolyMutate.value"
      v-model:draw-line-color="drawLineColor"
      :include-surface-tool="includeSurfaceTool"
      v-model:draw-label-text="drawLabelText"
      :include-annotation-tools="includeAnnotationTools && !dakMode"
      v-model:draw-label-font-size="drawLabelFontSize"
      :include-fixture-tool="includeFixtureTool && !dakMode"
      v-model:draw-label-font-color="drawLabelFontColor"
      :selected-item-panel="selectedItemPanel"
      v-model:draw-label-outline="drawLabelOutline"
      :wall-thickness-draft="wallThicknessDraft"
      v-model:draw-label-bold="drawLabelBold"
      :wall-thickness-mixed="wallThicknessMixed"
      v-model:draw-label-italic="drawLabelItalic"
      :wall-balance-draft="wallBalanceDraft"
      :wall-balance-mixed="wallBalanceMixed"
      :wall-height-draft="wallHeightDraft"
      :wall-height-mixed="wallHeightMixed"
      :junction-height-draft="junctionHeightDraft"
      :junction-height-mixed="junctionHeightMixed"
      :opening-subtype-draft="openingSubtypeDraft"
      :opening-subtype-mixed="openingSubtypeMixed"
      :opening-width-draft="openingWidthDraft"
      :opening-width-mixed="openingWidthMixed"
      :opening-height-draft="openingHeightDraft"
      :opening-height-mixed="openingHeightMixed"
      :opening-sill-z-draft="openingSillZDraft"
      :opening-sill-z-mixed="openingSillZMixed"
      :opening-hinge-at-start-draft="openingHingeAtStartDraft"
      :opening-hinge-mixed="openingHingeMixed"
      :opening-swing-right-draft="openingSwingRightDraft"
      :opening-swing-mixed="openingSwingMixed"
      :opening-bovenlicht-draft="openingBovenlichtDraft"
      :opening-bovenlicht-mixed="openingBovenlichtMixed"
      :opening-bovenlicht-height-draft="openingBovenlichtHeightDraft"
      :opening-bovenlicht-height-mixed="openingBovenlichtHeightMixed"
      :opening-bovenlicht-gap-draft="openingBovenlichtGapDraft"
      :opening-bovenlicht-gap-mixed="openingBovenlichtGapMixed"
      :bovenlicht-packed="bovenlichtPacked"
      :thickness-min-cm="thicknessMinCm"
      :thickness-mid-cm="thicknessMidCm"
      :thickness-max-cm="thicknessMaxCm"
      :measure-line-count="measureLines.length"
      :measure-persist-enabled="props.kind === 'editor'"
      :draw-wall-drafting="drawWallDrafting"
      :draw-wall-measure-length-cm="drawWallMeasureLengthCm"
      :draw-room-drafting="drawRoomDrafting"
      :draw-room-measure-h-cm="drawRoomMeasureHCm"
      :draw-room-measure-v-cm="drawRoomMeasureVCm"
      :draw-line-drafting="drawLineDrafting"
      :draw-surface-drafting="drawSurfaceDrafting"
      :facade-groups-enabled="capabilities?.facadeGroups === true"
      :facade-group-options="facadeGroupOptionsForUi"
      :facade-group-draft="facadeGroupDraftForUi"
      :facade-group-mixed="facadeGroupMixedForUi"
      :can-select-facade-members="canSelectFacadeMembersForUi"
      :facade-groups-stamp-preset="facadeGroupsStampPreset"
      :stamp-group-enabled="stampGroupUiEnabled"
      :stamp-group-draft="stampGroupDraft"
      :stamp-group-mixed="stampGroupMixed"
      :can-select-stamp-members="canSelectStampMembers"
      :draw-wall-kind="drawWallKind"
      :ridge-z-cm="ridgeZCm"
      :ridge-floor-draft="ridgeFloorDraft"
      :ridge-floor-mixed="ridgeFloorMixed"
      :ridge-floor-options="ridgeFloorOptions"
      @wall-thickness-input="onWallThicknessInput"
      @commit-wall-thickness="commitWallThickness"
      @apply-wall-thickness="applyWallsThicknessCm"
      @wall-balance-input="onWallBalanceInput"
      @commit-wall-balance="commitWallBalance"
      @wall-height-input="onWallHeightInput"
      @commit-wall-height="commitWallHeight"
      @junction-height-input="onJunctionHeightInput"
      @commit-junction-height="commitJunctionHeight"
      @commit-opening-subtype="commitOpeningSubtype"
      @opening-width-input="onOpeningWidthInput"
      @commit-opening-width="commitOpeningWidth"
      @opening-height-input="onOpeningHeightInput"
      @commit-opening-height="commitOpeningHeight"
      @opening-sill-z-input="onOpeningSillZInput"
      @commit-opening-sill-z="commitOpeningSillZ"
      @toggle-opening-hinge="toggleOpeningHingeAtStart"
      @toggle-opening-swing="toggleOpeningSwingRight"
      @opening-bovenlicht-change="onOpeningBovenlichtChange"
      @opening-bovenlicht-height-input="onOpeningBovenlichtHeightInput"
      @commit-opening-bovenlicht-height="commitOpeningBovenlichtHeight"
      @opening-bovenlicht-gap-input="onOpeningBovenlichtGapInput"
      @commit-opening-bovenlicht-gap="commitOpeningBovenlichtGap"
      @copy-opening="copySelectedOpening"
      @delete-openings="deleteSelectedOpenings"
      @split-wall="splitSelectedWall"
      @delete-walls="deleteSelectedWalls"
      @facade-group-change="applyFacadeGroupSelection"
      @facade-group-rename="renameSelectedFacadeGroup"
      @select-facade-members="selectFacadeGroupMembers"
      @stamp-group-change="applyStampGroupSelection"
      @select-stamp-members="selectStampGroupMembers"
      @wall-kind-change="applySelectedWallKind"
      @ridge-z-input="applyRidgeZInput"
      @ridge-floor-change="applyRidgeFloorInput"
      @clear-selection="clearSelection"
      @clear-measures="clearMeasureLines"
      @apply-room-type="applyRoomTypeToSelection"
      @area-custom-name-input="onAreaCustomNameInput"
      @apply-area-custom-name="applyAreaCustomName"
      @apply-area-color="applyAreaColor"
      @apply-show-area-label="applyShowAreaLabel"
      @delete-tagged="deleteSelectedTagged"
      @label-text-input="onLabelTextInput"
      @update-label-text="updateSelectedLabelText"
      @update-label-font-size="updateSelectedLabelFontSize"
      @update-label-font-color="updateSelectedLabelFontColor"
      @update-label-outline="updateSelectedLabelOutline"
      @update-label-bold="updateSelectedLabelBold"
      @update-label-italic="updateSelectedLabelItalic"
      @delete-annotation="deleteSelectedAnnotation"
      @update-line-type="updateSelectedLineType"
      @update-line-color="updateSelectedLineColor"
      @update-line-thickness="updateSelectedLineThickness"
      @begin-surface-polygon-edit="beginSurfacePolygonEdit"
      @end-surface-polygon-edit="endSurfacePolygonEdit"
      @roof-vertex-z-input="setRoofVertexZ"
      @item-width-input="onItemWidthInput"
      @item-height-input="onItemHeightInput"
      @item-rotation-input="onItemRotationInput"
      @toggle-item-mirror-x="toggleSelectedItemMirror(0)"
      @toggle-item-mirror-y="toggleSelectedItemMirror(1)"
      @copy-item="copySelectedItem"
      @delete-item="deleteSelectedItem"
      @draw-wall-length-input="setDrawWallLengthOverrideCm"
      @commit-draw-wall-measure="commitDrawWallFromMeasure"
      @cancel-draw-wall-draft="deactivateDrawTool"
      @draw-room-h-input="setDrawRoomHOverrideCm"
      @draw-room-v-input="setDrawRoomVOverrideCm"
      @commit-draw-room-measure="commitDrawRoomFromMeasure"
      @cancel-draw-room-draft="deactivateDrawTool"
      @accept-draw-draft="acceptDrawDraft"
      @deactivate-draw-tool="deactivateDrawTool"
    />
    <svg
      v-if="itemResizeHandles.length > 0"
      class="item-resize-overlay"
      :width="stageSize.width"
      :height="stageSize.height"
    >
      <circle
        v-for="handle in itemResizeHandles"
        :key="handle.side"
        class="item-resize-handle"
        :cx="handle.x"
        :cy="handle.y"
        r="7"
      />
    </svg>
    <FmlPreviewMeasureOverlay
      :width="stageSize.width"
      :height="stageSize.height"
      :lines="measureDrawMode === 'tape' ? measureLines : []"
      :preview="measureDrawMode === 'slicer' ? null : measurePreview"
      :hover="measureHoverCm"
      :to-screen="cmToScreen"
      :dashed="true"
    />
    <FmlRescaleOverlay
      v-if="rescaleMode && rescaleState"
      :state="rescaleState"
      :walls="rescaleWalls"
      :width="stageSize.width"
      :height="stageSize.height"
      :to-screen="cmToScreen"
      :to-cm="screenToCm"
      @update-state="emit('updateRescaleState', $event)"
    />
    <svg
      v-if="nulpuntScreen && !inspectMode && !rescaleMode"
      class="nulpunt-overlay"
      :class="{ 'nulpunt-overlay--pending': nulpuntHasPending }"
      :width="stageSize.width"
      :height="stageSize.height"
    >
      <line
        class="nulpunt-axis"
        :x1="0"
        :y1="nulpuntScreen.y"
        :x2="stageSize.width"
        :y2="nulpuntScreen.y"
      />
      <line
        class="nulpunt-axis"
        :x1="nulpuntScreen.x"
        :y1="0"
        :x2="nulpuntScreen.x"
        :y2="stageSize.height"
      />
      <g class="nulpunt-cross" :transform="`translate(${nulpuntScreen.x} ${nulpuntScreen.y})`">
        <circle class="nulpunt-hit" r="14" />
        <line x1="-18" y1="0" x2="18" y2="0" />
        <line x1="0" y1="-18" x2="0" y2="18" />
        <circle r="4" />
      </g>
    </svg>
    <div
      v-if="nulpuntScreen && nulpuntShowBakeActions && !inspectMode"
      class="nulpunt-actions"
      :style="{
        left: `${nulpuntScreen.x + 22}px`,
        top: `${nulpuntScreen.y - 18}px`,
      }"
    >
      <button
        type="button"
        class="nulpunt-action nulpunt-action--confirm"
        :title="$t('result.toolbar.nulpuntConfirm')"
        @pointerdown.stop
        @click.stop.prevent="confirmNulpuntBake"
      >
        ✓
      </button>
      <button
        type="button"
        class="nulpunt-action nulpunt-action--cancel"
        :title="$t('result.toolbar.nulpuntCancel')"
        @pointerdown.stop
        @click.stop.prevent="cancelNulpuntPending"
      >
        ✕
      </button>
    </div>
    <svg
      v-if="drawWallPreviewScreen"
      class="draw-wall-preview"
      :width="stageSize.width"
      :height="stageSize.height"
    >
      <line
        :x1="drawWallPreviewScreen.x1"
        :y1="drawWallPreviewScreen.y1"
        :x2="drawWallPreviewScreen.x2"
        :y2="drawWallPreviewScreen.y2"
      />
    </svg>
    <svg
      v-if="drawRoomPreviewScreen"
      class="draw-room-preview"
      :width="stageSize.width"
      :height="stageSize.height"
    >
      <polygon :points="drawRoomPreviewPolygon" />
    </svg>
    <svg
      v-if="drawSurfacePreviewScreen"
      class="draw-surface-preview"
      :width="stageSize.width"
      :height="stageSize.height"
    >
      <polygon v-if="drawSurfacePreviewScreen.length >= 3" :points="drawSurfacePreviewPolyline" />
      <polyline
        v-else-if="drawSurfacePreviewScreen.length >= 2"
        :points="drawSurfacePreviewPolyline"
        fill="none"
      />
      <circle
        v-for="(pt, idx) in drawSurfacePreviewScreen"
        :key="`ds-${idx}`"
        :cx="pt.x"
        :cy="pt.y"
        :r="idx === 0 ? 3.5 : 3"
        :class="{ 'draw-surface-preview__first': idx === 0 }"
      />
    </svg>
    <svg
      v-if="drawLinePreviewScreen"
      class="draw-line-preview"
      :width="stageSize.width"
      :height="stageSize.height"
    >
      <polyline
        v-if="drawLinePreviewPolyline"
        :points="drawLinePreviewPolyline"
        fill="none"
        :stroke="drawLinePreviewStroke"
        :stroke-width="Math.max(1, drawLineThickness)"
        :stroke-dasharray="drawLinePreviewDash"
      />
      <circle
        v-for="(pt, idx) in drawLinePreviewScreen.placed"
        :key="`dl-${idx}`"
        :cx="pt.x"
        :cy="pt.y"
        :r="idx === 0 ? 6 : 5"
        :class="{ 'draw-line-preview__first': idx === 0 }"
      />
      <circle
        v-if="drawLinePreviewScreen.hover"
        :cx="drawLinePreviewScreen.hover.x"
        :cy="drawLinePreviewScreen.hover.y"
        r="4"
        class="draw-line-preview__hover"
      />
    </svg>
    <div
      v-if="selectionBoxPreview"
      class="selection-box-preview"
      :style="{
        left: `${selectionBoxPreview.width < 0 ? selectionBoxPreview.x + selectionBoxPreview.width : selectionBoxPreview.x}px`,
        top: `${selectionBoxPreview.height < 0 ? selectionBoxPreview.y + selectionBoxPreview.height : selectionBoxPreview.y}px`,
        width: `${Math.abs(selectionBoxPreview.width)}px`,
        height: `${Math.abs(selectionBoxPreview.height)}px`,
      }"
    />
    <div v-if="!renderModel" class="empty">Geen FML-plan beschikbaar voor preview.</div>
    <FmlPreviewStage
      v-else
      v-model:stage-ref="stageRef"
      v-model:content-group-ref="contentGroupRef"
      :stage-size="stageSize"
      :view-position="viewPosition"
      :view-scale="viewScale"
      :layout-scale="layoutScale"
      :labels-visible="labelsVisible"
      :area-side-dims-visible="areaSideDimsVisible"
      :corner-marker-mode="dakMode ? 'off' : cornerMarkerMode"
      :corner-markers="renderCornerMarkers"
      :render-model="renderModel"
      :slice-guides-stage="sliceGuidesStage"
      :slice-preview-stage="slicePreviewStage"
      :underlay-config="underlayConfig"
      :content-opacity="contentOpacity"
      :move-wall-polygon="moveWallPolygon"
      :settings-wall-polygons="settingsWallPolygons"
      :facade-wall-polygons="facadeWallPolygons"
      :inspect-wall-polygons="inspectWallPolygons"
      :settings-wall-ids="settingsWallIds"
      :move-wall-id="moveWallId"
      :settings-opening-ids="settingsOpeningIds"
      :move-opening-id="moveOpeningId"
      :settings-item-id="settingsItemId"
      :move-item-id="moveItemId"
      :item-drag-preview="itemDragPreviewStage"
      :door-bovenlicht-default="bovenlichtPacked !== false && bovenlichtDefault"
      :window-bovenlicht-default="bovenlichtPacked !== false && windowBovenlichtDefault"
      :opening-colors="openingColors"
      :settings-area-id="settingsAreaId"
      :settings-surface-id="settingsSurfaceId"
      :settings-label-id="settingsLabelId"
      :settings-line-id="settingsLineId"
      :hovered-area-id="hoveredAreaId"
      :hovered-surface-id="hoveredSurfaceId"
      :hovered-label-id="hoveredLabelId"
      :hovered-line-id="hoveredLineId"
      :inspect-colors="inspectColors"
      :dak-mode="dakMode"
      :surface-edit-id="surfaceEditId"
      :surface-edit-vertices="surfaceEditVerticesStage"
      :selected-vertex-index="roofVertexIndex"
      :group-draggable="groupDraggable"
      :visible-junctions="inspectVisibleJunctions"
      :junction-overlay-group="junctionOverlayGroup"
      :junction-hit-radius="junctionHitRadius"
      :junction-marker-radius="junctionMarkerRadius"
      :junction-marker-stroke="junctionMarkerStroke"
      :active-junction-id="activeJunctionId"
      @group-drag-start="onGroupDragStart"
      @group-drag-move="onGroupDragMove"
      @group-drag-end="onGroupDragEnd"
      @junction-hover="onJunctionHover"
      @junction-hover-end="onJunctionHoverEnd"
    />
    <div
      v-if="includeFixtureTool && !inspectMode && activeFmlTool === 'add_fixture'"
      class="fixture-palette-dock"
    >
      <FmlFixturePalette v-model="pendingFixture" @close="deactivateDrawTool" />
    </div>
  </div>
</template>

<style scoped>
@import '../fml-preview/fml-canvas-tokens.css';

.fml-preview-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: var(--fml-canvas-min-height);
  border: 1px solid var(--fml-canvas-border);
  border-radius: var(--fml-canvas-radius);
  overflow: hidden;
  background: var(--fml-canvas-bg);
}

.fml-preview-wrap--touch {
  touch-action: none;
  overscroll-behavior: none;
}

.fml-preview-wrap--touch :deep(.fml-toolbelt__thickness-input),
.fml-preview-wrap--touch :deep(.fml-toolbelt__input),
.fml-preview-wrap--touch :deep(.fml-toolbelt__select) {
  font-size: var(--fml-touch-input-font-size);
  touch-action: manipulation;
}

/* Hardcoded — scoped @import of :root tokens never matches, so var() here
   made left/bottom/z-index invalid and the Konva stage hid the library. */
.fixture-palette-dock {
  position: absolute;
  left: max(8px, env(safe-area-inset-left, 0px));
  bottom: calc(max(8px, env(safe-area-inset-bottom, 0px)) + 56px);
  z-index: 24;
  pointer-events: auto;
}

.item-resize-overlay {
  position: absolute;
  inset: 0;
  z-index: var(--fml-z-resize);
  pointer-events: none;
}

.item-resize-handle {
  fill: #fff;
  stroke: var(--fml-accent-warm);
  stroke-width: 2;
}

.empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--fml-muted);
}

.selection-box-preview {
  position: absolute;
  z-index: var(--fml-z-overlay);
  border: 1.5px dashed var(--fml-accent);
  background: rgb(37 99 235 / 0.12);
  pointer-events: none;
}

.draw-wall-preview {
  position: absolute;
  inset: 0;
  z-index: 9;
  pointer-events: none;
}

.draw-wall-preview line {
  stroke: #f97316;
  stroke-width: 3;
  stroke-dasharray: 6 4;
  stroke-linecap: round;
}

.draw-room-preview {
  position: absolute;
  inset: 0;
  z-index: 9;
  pointer-events: none;
}

.draw-room-preview polygon {
  fill: rgb(249 115 22 / 0.15);
  stroke: #f97316;
  stroke-width: 2;
  stroke-dasharray: 6 4;
}

.draw-surface-preview {
  position: absolute;
  inset: 0;
  z-index: 9;
  pointer-events: none;
}

.draw-surface-preview polygon {
  fill: rgb(196 163 106 / 0.38);
  stroke: #b45309;
  stroke-width: 2;
  stroke-dasharray: 6 4;
}

.draw-surface-preview polyline {
  stroke: #f97316;
  stroke-width: 2;
  stroke-dasharray: 6 4;
  fill: none;
}

.draw-surface-preview circle {
  fill: #7c3aed;
  stroke: #fff;
  stroke-width: 1.5;
}

.draw-surface-preview__first {
  fill: #c084fc;
  stroke-width: 2;
}

.draw-line-preview {
  position: absolute;
  inset: 0;
  z-index: 9;
  pointer-events: none;
}

.draw-line-preview polyline {
  fill: none;
}

.draw-line-preview circle {
  fill: #f97316;
  stroke: #fff;
  stroke-width: 1.5;
}

.draw-line-preview__first {
  fill: #ea580c;
  stroke-width: 2;
}

.draw-line-preview__hover {
  fill: #fdba74;
  fill-opacity: 0.7;
}

.nulpunt-overlay {
  position: absolute;
  inset: 0;
  z-index: 9;
  pointer-events: none;
}

.nulpunt-overlay--pending .nulpunt-cross line {
  stroke: #ea580c;
}

.nulpunt-overlay--pending .nulpunt-cross circle:not(.nulpunt-hit) {
  fill: #ea580c;
}

.nulpunt-axis {
  stroke: #0ea5e9;
  stroke-width: 1;
  stroke-dasharray: 4 4;
  opacity: 0.7;
}

.nulpunt-overlay--pending .nulpunt-axis {
  stroke: #ea580c;
}

.nulpunt-cross line {
  stroke: #0284c7;
  stroke-width: 2;
  stroke-linecap: round;
}

.nulpunt-cross circle:not(.nulpunt-hit) {
  fill: #0284c7;
  stroke: #fff;
  stroke-width: 1.5;
}

.nulpunt-hit {
  fill: transparent;
  stroke: transparent;
  pointer-events: none;
}

.nulpunt-actions {
  position: absolute;
  z-index: 10;
  display: flex;
  gap: 4px;
  pointer-events: auto;
}

.nulpunt-action {
  width: 28px;
  height: 28px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 1px 3px rgb(15 23 42 / 0.18);
}

.nulpunt-action--confirm {
  color: #15803d;
  border-color: #86efac;
  background: #f0fdf4;
}

.nulpunt-action--confirm:hover {
  background: #dcfce7;
}

.nulpunt-action--cancel {
  color: #b91c1c;
  border-color: #fca5a5;
  background: #fef2f2;
}

.nulpunt-action--cancel:hover {
  background: #fee2e2;
}
</style>
