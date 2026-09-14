<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, toRef, watch } from 'vue'
import type Konva from 'konva'
import { BOVENLICHT_GAP_CM, BOVENLICHT_HEIGHT_CM } from '@/core/fml/bovenlicht'
import {
  isRidgeWallId,
  listRidgeWallsOnFloor,
  ridgeDisplayWidthCm,
  dakThicknessCmForPlan,
} from '@/core/fml/ridge-walls'
import { DEFAULT_FLOOR_THICKNESS_CM, readFloorStack, slabThicknessCm } from '@/core/fml/floor-stack'
import {
  listParentRoofs,
  listRidgeSurfacesOnFloor,
  roofKindOf,
} from '@/core/fml/roof-planes'
import type { FloorPlan } from '@/core/fml/types'
import type { UnderlayOriginLayout } from '@/core/fml/translate-floor-plan'
import { useStage } from '@/platform/canvas'
import { usePlanEditor } from '@/ui/composables/usePlanEditor'
import { usePlanCanvasViewport } from '@/ui/composables/plan-canvas/usePlanCanvasViewport'
import { usePlanCanvasRenderModel } from '@/ui/composables/plan-canvas/usePlanCanvasRenderModel'
import { createPlanViewContext } from '@/ui/composables/plan-canvas/plan-view-context'
import { usePlanCanvasHitTest } from '@/ui/composables/plan-canvas/usePlanCanvasHitTest'
import {
  createPlanCanvasSelection,
  usePlanCanvasInteraction,
} from '@/ui/composables/plan-canvas/usePlanCanvasInteraction'
import { usePlanCanvasDrawPreviews } from '@/ui/composables/plan-canvas/usePlanCanvasDrawPreviews'
import { formatDrawTypeLabel } from '@/ui/composables/plan-canvas/plan-canvas-draw-measure'
import { inspectColorFor, type InspectHit } from '@/ui/composables/plan-canvas/plan-inspect'
import { PLAN_CANVAS_CHROME_SELECTOR } from '@/ui/composables/plan-canvas/plan-canvas-gestures'
import { usePlanCanvasTouch, usePlanTouchNav } from '@/ui/composables/plan-canvas/usePlanCanvasTouch'
import { resolveFixtureCatalog } from '@/core/fml/fixture-refid-catalog'
import { itemResizeHandleWorlds } from '@/ui/composables/plan-canvas/item-resize-handles'
import { itemRotateHandleWorlds } from '@/ui/composables/plan-canvas/item-rotate-handles'
import { PLAN_HANDLE_RADIUS_PX } from '@/ui/composables/plan-canvas/plan-canvas-vertex-hit'
import EditorTouchChrome from '@/ui/editor/EditorTouchChrome.vue'
import type { HScaleState } from '@/platform/calibration'
import { layoutTransform } from '@/ui/composables/plan-canvas/usePlanCanvasViewport'
import { underlayContentBoundsCm } from '@/ui/composables/plan-canvas/plan-canvas-underlay-layout'
import type { DimensionVis } from '@/core/fml/fml-dimension-vis'
import { defaultDimensionVis } from '@/core/fml/fml-dimension-vis'
import type { MeasureDrawMode } from '@/ui/composables/plan-canvas/usePlanCanvasMeasure'
import { buildSliceGuide } from '@/core/fml/slice-dimension-lines'
import { usePlanCanvasSlicer } from '@/ui/composables/plan-canvas/usePlanCanvasSlicer'
import {
  loadUserSettings,
  setShowCanvasGrid,
  setShowRoofOverlayOnPlan,
  DEFAULT_CLEAR_HEIGHT_FILL_COLOR,
  type CornerMarkerMode,
  type OpeningDisplayColors,
  type PlanDisplayStyleChoice,
} from '@/ui/composables/settings/user-settings'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import type { PlanCanvasHostProps } from '@/ui/composables/plan-canvas/plan-canvas-host-props'
import { resolvePlanCapabilities } from '@/ui/composables/plan-canvas/plan-capabilities'
import { tGlobal } from '@/ui/i18n'
import {
  clampLabelFontSize,
  DEFAULT_LABEL_FONT_COLOR,
  DEFAULT_LABEL_FONT_SIZE_PX,
  DEFAULT_LINE_THICKNESS_PX,
  lineDash,
  lineStrokeColor,
} from '@/ui/composables/plan-canvas/plan-canvas-render-annotations'
import { STAMP_FACADE_GROUP_ID } from '@/core/fml/facade-groups'
import PlanToolbar from './PlanToolbar.vue'
import PlanFixturePalette from './PlanFixturePalette.vue'
import PlanStage from './PlanStage.vue'
import PlanMeasureOverlay from './PlanMeasureOverlay.vue'
import PlanRescaleOverlay from './PlanRescaleOverlay.vue'

const props = withDefaults(defineProps<PlanCanvasHostProps>(), {
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
  thicknessPresetCms: () => [10, 20, 30],
  bovenlichtDefault: false,
  windowBovenlichtDefault: false,
  bovenlichtHeightCm: BOVENLICHT_HEIGHT_CM,
  bovenlichtGapCm: BOVENLICHT_GAP_CM,
  bovenlichtPacked: true,
  defaultDoorHeightCm: undefined,
  defaultWindowHeightCm: undefined,
  defaultWindowSillZCm: undefined,
  setPlanNulpuntImageCm: undefined,
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
})

const capabilities = computed(() =>
  props.kind != null ? resolvePlanCapabilities(props.kind) : null,
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
const includeRoofTool = computed(
  () => props.dakMode !== true && capabilities.value?.tools.draw_roof === true,
)
/** Editor + inspect: overlay-knop. Converter stap 4 niet. */
const showRoofOverlayChrome = computed(
  () => props.kind !== 'detection' && props.dakMode !== true,
)
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
  inspectSelect: [hit: InspectHit | null]
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
const thicknessPresetCmsRef = toRef(props, 'thicknessPresetCms')
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
const { useTouchNav, coarsePointer } = usePlanTouchNav(touchEditor)

const { shiftPressed, spacePressed, onKeyDown, onKeyUp } = useStage()
const ensureStampPreset = computed(() => props.kind === 'detection' || props.kind === 'editor')
const ensureDefaultFacades = computed(() => props.kind === 'editor')
const editor = usePlanEditor(toRef(props, 'plan'), toRef(props, 'floorIndex'), {
  ensureStampPreset,
  ensureDefaultFacades,
})
const selection = createPlanCanvasSelection()

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
const viewport = usePlanCanvasViewport(containerRef, editor.walls, floorItems, underlayFitBounds)

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

/**
 * View-as, één keer gebouwd en als object doorgegeven aan interaction en render.
 * De `dakMode`-computed hierboven blijft voor de template-bindingen; composables
 * krijgen de context, niet de losse ref.
 */
const viewContext = createPlanViewContext({
  isDak: () => props.dakMode === true,
  isRidgeWallId: (wallId) => isRidgeWallId(editor.localPlan.value, wallId),
})
const drawInputUnit = ref<ScaleInputUnit>(loadUserSettings().scaleInputUnit)
const planDisplayStyle = ref<PlanDisplayStyleChoice>(loadUserSettings().planDisplay.planDisplayStyle)
const showCanvasGrid = ref(loadUserSettings().planDisplay.showCanvasGrid !== false)
const showRoofOverlayOnPlan = ref(loadUserSettings().planDisplay.showRoofOverlayOnPlan !== false)
const showRoofPlanesOnPlan = ref(loadUserSettings().planDisplay.showRoofPlanesOnPlan !== false)
const showClearHeight150 = ref(loadUserSettings().planDisplay.showClearHeight150 !== false)
const showClearHeight200 = ref(loadUserSettings().planDisplay.showClearHeight200 === true)
const showClearHeightPlanFill = ref(loadUserSettings().planDisplay.showClearHeightPlanFill === true)
const clearHeightFillColor = ref(
  loadUserSettings().planDisplay.clearHeightFillColor ?? DEFAULT_CLEAR_HEIGHT_FILL_COLOR,
)
const showRidgeDisplay = ref(loadUserSettings().planDisplay.showRidgeDisplay !== false)

function onShowRoofOverlayOnPlan(next: boolean) {
  showRoofOverlayOnPlan.value = setShowRoofOverlayOnPlan(next)
}

function ensureRoofOverlayOn(): void {
  if (showRoofOverlayOnPlan.value) return
  showRoofOverlayOnPlan.value = setShowRoofOverlayOnPlan(true)
}

const planRoofOverlayOn = computed(
  () => showRoofOverlayChrome.value && showRoofOverlayOnPlan.value === true,
)

const render = usePlanCanvasRenderModel(
  viewport,
  editor,
  floor,
  underlayProps,
  selection,
  dimensionVis,
  viewContext,
  drawInputUnit,
  planDisplayStyle,
)

const hitTestWalls = computed(() => {
  const current = floor.value
  if (dakMode.value) return listRidgeWallsOnFloor(current)
  return editor.walls.value
})

const hitTest = usePlanCanvasHitTest(
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
  computed(() => ridgeDisplayWidthCm(editor.localPlan.value)),
)

const interaction = usePlanCanvasInteraction({
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
  thicknessPresetCms: thicknessPresetCmsRef,
  session: {
    bovenlichtDefault: bovenlichtDefaultRef,
    windowBovenlichtDefault: windowBovenlichtDefaultRef,
    bovenlichtHeightCm: bovenlichtHeightCmRef,
    bovenlichtGapCm: bovenlichtGapCmRef,
    bovenlichtPacked: bovenlichtPackedRef,
  },
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
  setPlanNulpuntImageCm: (point) => props.setPlanNulpuntImageCm?.(point),
  underlayMoveMode: underlayMoveModeRef,
  areaSurfaceEditEnabled,
  annotationEditEnabled,
  labelsVisible: toRef(props, 'labelsVisible'),
  inspectMode,
  touchEditor,
  touchNav: useTouchNav,
  coarsePointer,
  measureDrawMode,
  slicerEditMode,
  dimensionVis,
  selectedSliceIndex,
  view: viewContext,
  roofOverlayOnPlan: planRoofOverlayOn,
  ensureRoofOverlayOn,
  onInspectSelect: (hit) => emit('inspectSelect', hit),
  getInputUnit: () => drawInputUnit.value,
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
  dimensionHandleOverlay,
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
const moveDimensionId = computed(() => selection.moveDimensionId.value)
const hoveredDimensionId = computed(() => selection.hoveredDimensionId.value)
const selectedDimensionPanel = computed(() => {
  const id = moveDimensionId.value
  if (!id) return null
  const dim = editor.dimensions.value.find((item) => item.id === id)
  if (!dim) return null
  return {
    id: dim.id,
    lengthCm: Math.hypot(dim.b.x - dim.a.x, dim.b.y - dim.a.y),
  }
})
const dimensionHandles = computed(() => {
  const overlay = dimensionHandleOverlay.value
  if (!overlay) return null
  return {
    a: overlay.a,
    b: overlay.b,
    selected: overlay.selected,
    activeEnd: draggingDimensionEnd.value ?? overlay.activeEnd,
  }
})

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

/** Overlay: area-zijdematen; onafhankelijk van activePlanTool. */
const areaSideDimsVisible = ref(false)
const cornerMarkerMode = ref<CornerMarkerMode>(loadUserSettings().planDisplay.cornerMarkerMode)
const openingColors = ref<OpeningDisplayColors>({
  ...loadUserSettings().planDisplay.openingColors,
})

function applyCornerMarkerModeFromSettings(): void {
  const settings = loadUserSettings()
  cornerMarkerMode.value = settings.planDisplay.cornerMarkerMode
  openingColors.value = { ...settings.planDisplay.openingColors }
  planDisplayStyle.value = settings.planDisplay.planDisplayStyle
  showCanvasGrid.value = settings.planDisplay.showCanvasGrid !== false
  showRoofOverlayOnPlan.value = settings.planDisplay.showRoofOverlayOnPlan !== false
  showRoofPlanesOnPlan.value = settings.planDisplay.showRoofPlanesOnPlan !== false
  showClearHeight150.value = settings.planDisplay.showClearHeight150 !== false
  showClearHeight200.value = settings.planDisplay.showClearHeight200 === true
  showClearHeightPlanFill.value = settings.planDisplay.showClearHeightPlanFill === true
  clearHeightFillColor.value =
    settings.planDisplay.clearHeightFillColor ?? DEFAULT_CLEAR_HEIGHT_FILL_COLOR
  showRidgeDisplay.value = settings.planDisplay.showRidgeDisplay !== false
  drawInputUnit.value = settings.scaleInputUnit
}

function onShowCanvasGrid(next: boolean) {
  showCanvasGrid.value = setShowCanvasGrid(next)
}

const fmlToolbarRef = ref<{ hint: string } | null>(null)
const toolbarHint = computed(() => fmlToolbarRef.value?.hint ?? '')

const {
  activePlanTool,
  selectionBoxPreview,
  boxSelectKind,
  selectAllOfBoxKind,
  drawWallPreview,
  drawRoomPreview,
  drawWallDrafting,
  drawRoomDrafting,
  wallMoveDrafting,
  wallMoveMeasureLengthCm,
  wallMoveTypeText,
  wallMoveLabelCm,
  drawLineDrafting,
  drawSurfaceDrafting,
  drawSurfacePendingRole,
  drawSurfacePendingCutout,
  drawSurfacePendingRoofKind,
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
  drawWallTypeText,
  drawRoomTypeHText,
  drawRoomTypeVText,
  drawRoomTypeField,
  setDrawWallLengthOverrideCm,
  setDrawRoomHOverrideCm,
  setDrawRoomVOverrideCm,
  commitDrawWallFromMeasure,
  commitDrawRoomFromMeasure,
  acceptDrawDraft,
  deactivateDrawTool,
  isDrawDrafting,
  isWallMoveDrafting,
  isPreciseMoveDrafting,
  hitClickMoveAtClient,
  hitDrawDraftHandleAtClient,
  drawSurfacePoints,
  drawSurfaceHoverCm,
  drawLinePoints,
  drawLineHoverCm,
  measurePreview,
  measureLines,
  openingMoveMeasureLines,
  wallInternalMeasureLines,
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
  openingHandlesCm,
  drawWallKind,
  ridgeZCm,
  applySelectedWallKind,
  applyRidgeZInput,
  ridgeFloorDraft,
  ridgeFloorMixed,
  applyRidgeFloorInput,
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
  addDoorSillZCm,
  addWindowSubtype,
  addWindowWidthCm,
  addWindowSillZCm,
  addWindowHeightCm,
  canvasCursor,
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
  splitSelectedWall,
  deleteSelectedWalls,
  facadeGroupOptions,
  facadeGroupChecks,
  facadeMemberIdsOnActiveFloor,
  stampGroupDraft,
  stampGroupMixed,
  applyFacadeGroupSelection,
  removeFacadeGroupFromSelection,
  applyStampGroupSelection,
  selectFacadeGroupMembersById,
  selectStampGroupMembers,
  canSelectStampMembers,
  clearSelection,
  flushPendingFieldCommits,
  sanitizeWalls,
  bindWallsToRoof,
  applyStampToActiveFloor,
  canApplyStampOnActiveFloor,
  applyRoomTypeToSelection,
  applyAreaCustomName,
  onAreaCustomNameInput,
  customNameDraft,
  applyAreaColor,
  applyShowAreaLabel,
  applySurfaceCutout,
  applyAreaLiningCm,
  applyRoofKind,
  applyRoofParentId,
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
  deleteSelected,
  applySelectedDimensionLength,
  draggingDimensionEnd,
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

watch(activePlanTool, (tool, prev) => {
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
  const slices = editor.planSlices.value
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
const facadeGroupChecksForUi = computed(() => facadeGroupChecks.value)

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
  if (activePlanTool.value !== 'measure' || measureDrawMode.value !== 'slicer') return []
  const slices = editor.planSlices.value
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

const measureOverlayLines = computed(() => [
  ...(measureDrawMode.value === 'tape' ? measureLines.value : []),
  ...openingMoveMeasureLines.value,
  ...wallInternalMeasureLines.value,
])

const slicePreviewStage = computed(() => {
  if (activePlanTool.value !== 'measure' || measureDrawMode.value !== 'slicer') return null
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

const slicer = usePlanCanvasSlicer({
  getSlices: () => editor.planSlices.value,
  getWalls: () => editor.walls.value,
  getPlan: () => editor.localPlan.value,
  getFloorIndex: () => editor.floorIndex.value,
  selectedSliceIndex,
  clientToCm: (x, y) => hitTest.clientToCm(x, y),
  toStagePoint: (x, y) => renderTransform.value.toStagePoint(x, y),
  shiftPressed,
  pushUndo: () => editor.pushUndo(),
  updateSlice: (index, slice) => editor.updatePlanSlice(index, slice),
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
    activePlanTool.value === 'measure' &&
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
  if (target?.closest(PLAN_CANVAS_CHROME_SELECTOR)) return
  onWrapPointerMove(event)
}

function onCanvasDblClick(event: MouseEvent): void {
  if (props.rescaleMode) return
  onWrapDblClick(event)
}

function onCanvasWheel(event: WheelEvent): void {
  const target = event.target as HTMLElement | null
  if (target?.closest(PLAN_CANVAS_CHROME_SELECTOR)) return
  onWheel(event)
}

usePlanCanvasTouch({
  containerRef,
  enabled: useTouchNav,
  viewScale,
  viewPosition,
  getTool: () => activePlanTool.value,
  moveMod,
  blockEdit: () => Boolean(props.rescaleMode && !spacePressed.value),
  onEditPointerDown: onCanvasPointerDown,
  onEditPointerMove: onCanvasPointerMove,
  isDrawDrafting,
  hitDraftHandle: hitDrawDraftHandleAtClient,
  isWallMoveDrafting,
  isPreciseMoveDrafting,
  hitClickMove: hitClickMoveAtClient,
})

const selectedItemPanel = computed(() => {
  const guid = settingsItemId.value
  if (!guid) return null
  const item = editor.items.value.find((entry) => entry.id === guid)
  if (!item) return null
  const info = resolveFixtureCatalog(item.kind, { width: item.width, height: item.height })
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

function onItemWidthCm(cm: number): void {
  updateSelectedItem({
    width: Math.max(1, cm),
  })
}

function onItemHeightCm(cm: number): void {
  updateSelectedItem({
    height: Math.max(1, cm),
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
  const live = editor.areas.value.find((a) => a.id === id)
  return {
    kind: 'area' as const,
    id: area.id,
    role: area.role ?? null,
    name: area.name ?? null,
    customName: customNameDraft.value,
    color: area.color,
    showAreaLabel: area.showAreaLabel !== false,
    canEditPolygon: false,
    isCutout: false,
    liningCm: live?.liningCm ?? 0,
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
    isCutout: surface.isCutout === true,
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

const selectedRoofKind = computed(() => {
  const id = settingsSurfaceId.value
  if (!id) return 'plane' as const
  const surface = editor.surfaces.value.find((item) => item.id === id)
  return roofKindOf(surface)
})

const selectedRoofParentId = computed(() => {
  const id = settingsSurfaceId.value
  if (!id) return null
  const surface = editor.surfaces.value.find((item) => item.id === id)
  return surface?.roofParentId?.trim() || null
})

const parentRoofOptions = computed(() => {
  const floorSurfaces = listRidgeSurfacesOnFloor(floor.value)
  const selectedId = settingsSurfaceId.value
  return listParentRoofs(floorSurfaces)
    .filter((surface) => surface.id !== selectedId)
    .map((surface, index) => ({
      id: surface.id,
      label: (surface.customName || surface.name || `Hoofddak ${index + 1}`).trim(),
    }))
})

const editorDakThicknessCm = computed(() => dakThicknessCmForPlan(editor.localPlan.value))
const editorSlabThicknessCm = computed(() => {
  const plan = editor.localPlan.value
  const active = floor.value
  if (!plan || !active) return DEFAULT_FLOOR_THICKNESS_CM
  return slabThicknessCm(readFloorStack(plan), active.level)
})

const {
  drawWallPreviewScreen,
  drawRoomPreviewScreen,
  drawRoomPreviewPolygon,
  drawWallMeasureLabel,
  drawRoomMeasureLabels,
  drawSurfacePreviewScreen,
  drawSurfacePreviewPolyline,
  drawLinePreviewScreen,
  drawLinePreviewPolyline,
  cmToScreen,
} = usePlanCanvasDrawPreviews({
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

const drawWallMeasureLabelText = computed(() =>
  formatDrawTypeLabel(drawWallTypeText.value, drawWallMeasureLengthCm.value, drawInputUnit.value),
)
const drawRoomMeasureHLabelText = computed(() =>
  formatDrawTypeLabel(drawRoomTypeHText.value, drawRoomMeasureHCm.value, drawInputUnit.value),
)
const drawRoomMeasureVLabelText = computed(() =>
  formatDrawTypeLabel(drawRoomTypeVText.value, drawRoomMeasureVCm.value, drawInputUnit.value),
)
const wallMoveMeasureLabel = computed(() => {
  if (!wallMoveDrafting.value) return null
  const cm = wallMoveLabelCm.value
  if (!cm) return null
  return cmToScreen(cm.x, cm.y)
})
const wallMoveMeasureLabelText = computed(() =>
  formatDrawTypeLabel(wallMoveTypeText.value, wallMoveMeasureLengthCm.value, drawInputUnit.value),
)

const handleItemId = computed(() => settingsItemId.value ?? moveItemId.value)

const itemResizeHandles = computed(() => {
  const guid = handleItemId.value
  if (!guid || inspectMode.value || dakMode.value) return []
  const item = editor.items.value.find((entry) => entry.id === guid)
  if (!item) return []
  return itemResizeHandleWorlds(item).map((handle) => ({
    ...handle,
    ...cmToScreen(handle.x, handle.y),
  }))
})

const openingEditHandles = computed(() => {
  if (inspectMode.value) return []
  return openingHandlesCm.value.map((handle) => ({
    ...handle,
    ...cmToScreen(handle.x, handle.y),
  }))
})

const openingResizeHandles = computed(() =>
  openingEditHandles.value.filter((handle) => handle.kind === 'start' || handle.kind === 'end'),
)

const openingMoveHandle = computed(
  () => openingEditHandles.value.find((handle) => handle.kind === 'move') ?? null,
)

const itemRotateHandles = computed(() => {
  const guid = handleItemId.value
  if (!guid || inspectMode.value || dakMode.value) return []
  const item = editor.items.value.find((entry) => entry.id === guid)
  if (!item) return []
  return itemRotateHandleWorlds(item).map((handle) => ({
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
  bindWallsToRoof,
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
  convertOverlayToManual: (source: 'autogen' | 'slicer') => {
    editor.pushUndo()
    const ok = editor.convertOverlayToManual(source)
    const nextPlan = editor.localPlan.value
    if (ok && nextPlan) {
      editor.prepareParentSync()
      emit('planUpdate', nextPlan)
      dimensionVis.value = 'manual'
    }
    return ok
  },
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
    class="plan-canvas-wrap"
    :class="{ 'plan-canvas-wrap--touch': useTouchNav }"
    :style="{ cursor: canvasCursor }"
    @mousedown="onCanvasPointerDown"
    @mousemove="onCanvasPointerMove"
    @dblclick="onCanvasDblClick"
    @wheel="onCanvasWheel"
  >
    <EditorTouchChrome
      v-model:settings-mod="settingsMod"
      v-model:axis-lock-mod="axisLockMod"
      v-model:move-mod="moveMod"
      v-model:active-tool="activePlanTool"
      v-model:area-side-dims-visible="areaSideDimsVisible"
      :show-topbar="viewportChrome && !rescaleMode"
      :show-help="!inspectMode"
      :show-mod-rail="useTouchNav && !inspectMode && !rescaleMode"
      :can-undo="canUndoEdit && !inspectMode"
      :can-redo="canRedoEdit && !inspectMode"
      :hint="toolbarHint"
      :fullscreen="canvasFullscreen"
      :edge-chrome="canvasFullscreen"
      :show-canvas-grid="showCanvasGrid"
      :show-roof-overlay-toggle="showRoofOverlayChrome"
      :show-roof-overlay-on-plan="showRoofOverlayOnPlan"
      @undo="undoEdit"
      @redo="redoEdit"
      @fit="resetView"
      @zoom-in="zoomBy(1.1)"
      @zoom-out="zoomBy(1 / 1.1)"
      @toggle-fullscreen="emit('update:canvasFullscreen', !canvasFullscreen)"
      @update:show-canvas-grid="onShowCanvasGrid"
      @update:show-roof-overlay-on-plan="onShowRoofOverlayOnPlan"
    />
    <PlanToolbar
      v-if="!inspectMode && !rescaleMode"
      ref="fmlToolbarRef"
      v-model:active-tool="activePlanTool"
      v-model:area-side-dims-visible="areaSideDimsVisible"
      v-model:add-door-subtype="addDoorSubtype"
      v-model:add-door-width-cm="addDoorWidthCm"
      v-model:add-door-sill-z-cm="addDoorSillZCm"
      v-model:add-window-subtype="addWindowSubtype"
      v-model:add-window-width-cm="addWindowWidthCm"
      v-model:add-window-sill-z-cm="addWindowSillZCm"
      v-model:add-window-height-cm="addWindowHeightCm"
      v-model:measure-draw-mode="measureDrawMode"
      v-model:box-select-kind="boxSelectKind"
      v-model:slicer-edit-mode="slicerEditMode"
      v-model:draw-surface-role="drawSurfacePendingRole"
      v-model:draw-surface-cutout="drawSurfacePendingCutout"
      v-model:draw-roof-kind="drawSurfacePendingRoofKind"
      v-model:draw-line-thickness="drawLineThickness"
      v-model:draw-line-type="drawLineType"
      v-model:draw-line-color="drawLineColor"
      v-model:draw-label-text="drawLabelText"
      v-model:draw-label-font-size="drawLabelFontSize"
      v-model:draw-label-font-color="drawLabelFontColor"
      v-model:draw-label-outline="drawLabelOutline"
      v-model:draw-label-bold="drawLabelBold"
      v-model:draw-label-italic="drawLabelItalic"
      :hide-inline-hint="viewportChrome"
      :floating-dock="touchEditor"
      :hide-select-tools="useTouchNav || dakMode"
      :dak-mode="dakMode"
      :selected-wall-panel="selectedWallPanel"
      :selected-facade-group-panel="selectedFacadeGroupPanel"
      :selected-junction-panel="selectedJunctionPanel"
      :selected-opening-panel="selectedOpeningPanel"
      :selected-area-panel="taggedSettingsPanel"
      :selected-label-panel="selectedLabelPanel"
      :selected-line-panel="selectedLinePanel"
      :selected-dimension-panel="selectedDimensionPanel"
      :room-types="roomTypes"
      :surface-edit-active="surfaceEditActive"
      :roof-vertex-z-cm="roofVertexZCm"
      :roof-vertex-index="roofVertexIndex"
      :roof-poly-mutate="selection.roofPolyMutate.value"
      :roof-kind="selectedRoofKind"
      :roof-parent-id="selectedRoofParentId"
      :parent-roof-options="parentRoofOptions"
      :dak-thickness-cm="editorDakThicknessCm"
      :slab-thickness-cm="editorSlabThicknessCm"
      :include-surface-tool="includeSurfaceTool"
      :include-roof-tool="includeRoofTool"
      :include-annotation-tools="includeAnnotationTools && !dakMode"
      :include-fixture-tool="includeFixtureTool && !dakMode"
      :selected-item-panel="selectedItemPanel"
      :wall-thickness-draft="wallThicknessDraft"
      :wall-thickness-mixed="wallThicknessMixed"
      :wall-balance-draft="wallBalanceDraft"
      :wall-balance-mixed="wallBalanceMixed"
      :wall-height-draft="wallHeightDraft"
      :wall-height-mixed="wallHeightMixed"
      :wall-bottom-z-draft="wallBottomZDraft"
      :wall-bottom-z-mixed="wallBottomZMixed"
      :junction-height-draft="junctionHeightDraft"
      :junction-height-mixed="junctionHeightMixed"
      :junction-bottom-z-draft="junctionBottomZDraft"
      :junction-bottom-z-mixed="junctionBottomZMixed"
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
      :thickness-preset-cms="thicknessPresetCms"
      :measure-line-count="measureLines.length"
      :measure-persist-enabled="props.kind === 'editor'"
      :draw-wall-drafting="drawWallDrafting"
      :draw-wall-measure-length-cm="drawWallMeasureLengthCm"
      :wall-move-drafting="wallMoveDrafting"
      :draw-room-drafting="drawRoomDrafting"
      :draw-room-measure-h-cm="drawRoomMeasureHCm"
      :draw-room-measure-v-cm="drawRoomMeasureVCm"
      :draw-input-unit="drawInputUnit"
      :draw-line-drafting="drawLineDrafting"
      :draw-surface-drafting="drawSurfaceDrafting"
      :facade-groups-enabled="capabilities?.facadeGroups === true"
      :facade-group-options="facadeGroupOptionsForUi"
      :facade-group-checks="facadeGroupChecksForUi"
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
      @wall-thickness-cm="onWallThicknessCm"
      @commit-wall-thickness="commitWallThickness"
      @apply-wall-thickness="applyWallsThicknessCm"
      @wall-balance-input="onWallBalanceInput"
      @commit-wall-balance="commitWallBalance"
      @wall-height-cm="onWallHeightCm"
      @commit-wall-height="commitWallHeight"
      @wall-bottom-z-cm="onWallBottomZCm"
      @commit-wall-bottom-z="commitWallBottomZ"
      @junction-height-cm="onJunctionHeightCm"
      @commit-junction-height="commitJunctionHeight"
      @junction-bottom-z-cm="onJunctionBottomZCm"
      @commit-junction-bottom-z="commitJunctionBottomZ"
      @commit-opening-subtype="commitOpeningSubtype"
      @opening-width-cm="onOpeningWidthCm"
      @commit-opening-width="commitOpeningWidth"
      @opening-height-cm="onOpeningHeightCm"
      @commit-opening-height="commitOpeningHeight"
      @opening-sill-z-cm="onOpeningSillZCm"
      @commit-opening-sill-z="commitOpeningSillZ"
      @toggle-opening-hinge="toggleOpeningHingeAtStart"
      @toggle-opening-swing="toggleOpeningSwingRight"
      @opening-bovenlicht-change="onOpeningBovenlichtChange"
      @opening-bovenlicht-height-cm="onOpeningBovenlichtHeightCm"
      @commit-opening-bovenlicht-height="commitOpeningBovenlichtHeight"
      @opening-bovenlicht-gap-cm="onOpeningBovenlichtGapCm"
      @commit-opening-bovenlicht-gap="commitOpeningBovenlichtGap"
      @copy-opening="copySelectedOpening"
      @delete-openings="deleteSelectedOpenings"
      @split-wall="splitSelectedWall"
      @delete-walls="deleteSelectedWalls"
      @facade-group-change="applyFacadeGroupSelection"
      @facade-group-remove="removeFacadeGroupFromSelection"
      @select-facade-members="selectFacadeGroupMembersById"
      @stamp-group-change="applyStampGroupSelection"
      @select-stamp-members="selectStampGroupMembers"
      @wall-kind-change="applySelectedWallKind"
      @ridge-z-input="applyRidgeZInput"
      @ridge-floor-change="applyRidgeFloorInput"
      @clear-selection="clearSelection"
      @box-select-all="selectAllOfBoxKind"
      @clear-measures="clearMeasureLines"
      @apply-room-type="applyRoomTypeToSelection"
      @area-custom-name-input="onAreaCustomNameInput"
      @apply-area-custom-name="applyAreaCustomName"
      @apply-area-color="applyAreaColor"
      @apply-show-area-label="applyShowAreaLabel"
      @apply-surface-cutout="applySurfaceCutout"
      @apply-area-lining-cm="applyAreaLiningCm"
      @apply-roof-kind="applyRoofKind"
      @apply-roof-parent-id="applyRoofParentId"
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
      @item-width-cm="onItemWidthCm"
      @item-height-cm="onItemHeightCm"
      @item-rotation-input="onItemRotationInput"
      @toggle-item-mirror-x="toggleSelectedItemMirror(0)"
      @toggle-item-mirror-y="toggleSelectedItemMirror(1)"
      @copy-item="copySelectedItem"
      @delete-item="deleteSelectedItem"
      @dimension-length-cm="applySelectedDimensionLength"
      @delete-dimension="deleteSelected"
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
      v-if="itemResizeHandles.length > 0 || itemRotateHandles.length > 0"
      class="item-resize-overlay"
      :width="stageSize.width"
      :height="stageSize.height"
    >
      <g
        v-for="handle in itemRotateHandles"
        :key="`r-${handle.corner}`"
        class="item-rotate-handle"
        :transform="`translate(${handle.x} ${handle.y})`"
      >
        <title>{{ tGlobal('viewer.itemRotateHandle') }}</title>
        <circle class="item-rotate-handle__hit" :r="PLAN_HANDLE_RADIUS_PX" />
        <path class="item-rotate-handle__arc" d="M 1.4 -2.5 A 2.8 2.8 0 1 1 -1.4 -2.5" />
        <path class="item-rotate-handle__head" d="M 1.4 -2.5 L 0.2 -4.1 L 2.7 -3.9 Z" />
      </g>
      <circle
        v-for="handle in itemResizeHandles"
        :key="handle.side"
        class="item-resize-handle"
        :cx="handle.x"
        :cy="handle.y"
        :r="PLAN_HANDLE_RADIUS_PX"
      />
    </svg>
    <svg
      v-if="openingResizeHandles.length > 0 || openingMoveHandle"
      class="item-resize-overlay"
      :width="stageSize.width"
      :height="stageSize.height"
    >
      <circle
        v-if="openingMoveHandle"
        class="opening-move-handle"
        :cx="openingMoveHandle.x"
        :cy="openingMoveHandle.y"
        :r="PLAN_HANDLE_RADIUS_PX"
      />
      <circle
        v-for="handle in openingResizeHandles"
        :key="handle.kind"
        class="item-resize-handle"
        :cx="handle.x"
        :cy="handle.y"
        :r="PLAN_HANDLE_RADIUS_PX"
      />
    </svg>
    <PlanMeasureOverlay
      :width="stageSize.width"
      :height="stageSize.height"
      :lines="measureOverlayLines"
      :preview="measureDrawMode === 'slicer' ? null : measurePreview"
      :hover="measureHoverCm"
      :to-screen="cmToScreen"
      :dashed="true"
      :unit="drawInputUnit"
    />
    <PlanRescaleOverlay
      v-if="rescaleMode && rescaleState"
      :state="rescaleState"
      :walls="rescaleWalls"
      :width="stageSize.width"
      :height="stageSize.height"
      :to-screen="cmToScreen"
      :to-cm="screenToCm"
      :space-pressed="spacePressed"
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
      <circle
        class="draw-draft-handle"
        :cx="drawWallPreviewScreen.x1"
        :cy="drawWallPreviewScreen.y1"
        r="8"
      />
      <circle
        class="draw-draft-handle"
        :cx="drawWallPreviewScreen.x2"
        :cy="drawWallPreviewScreen.y2"
        r="8"
      />
    </svg>
    <svg
      v-if="drawRoomPreviewScreen"
      class="draw-room-preview"
      :width="stageSize.width"
      :height="stageSize.height"
    >
      <polygon :points="drawRoomPreviewPolygon" />
      <circle
        v-for="(pt, idx) in drawRoomPreviewScreen"
        :key="`room-h-${idx}`"
        class="draw-draft-handle"
        :cx="pt.x"
        :cy="pt.y"
        r="8"
      />
    </svg>
    <div
      v-if="drawWallMeasureLabel"
      class="draw-measure-label draw-measure-label--wall"
      :class="{ 'draw-measure-label--typing': !!drawWallTypeText }"
      :style="{ left: `${drawWallMeasureLabel.x}px`, top: `${drawWallMeasureLabel.y}px` }"
    >
      {{ drawWallMeasureLabelText
      }}<span class="draw-measure-label__unit">{{ drawInputUnit }}</span>
    </div>
    <div
      v-if="wallMoveMeasureLabel"
      class="draw-measure-label draw-measure-label--wall"
      :class="{ 'draw-measure-label--typing': !!wallMoveTypeText }"
      :style="{ left: `${wallMoveMeasureLabel.x}px`, top: `${wallMoveMeasureLabel.y}px` }"
    >
      {{ wallMoveMeasureLabelText
      }}<span class="draw-measure-label__unit">{{ drawInputUnit }}</span>
      <button
        type="button"
        class="draw-measure-label__accept"
        :title="tGlobal('result.toolbar.acceptDrawDraft')"
        :aria-label="tGlobal('result.toolbar.acceptDrawDraft')"
        @pointerdown.stop
        @click.stop="acceptDrawDraft"
      >
        ✓
      </button>
    </div>
    <div
      v-if="drawRoomMeasureLabels"
      class="draw-measure-label draw-measure-label--h"
      :class="{ 'draw-measure-label--typing': drawRoomTypeField === 'h' }"
      :style="{
        left: `${drawRoomMeasureLabels.h.x}px`,
        top: `${drawRoomMeasureLabels.h.y}px`,
      }"
    >
      {{ drawRoomMeasureHLabelText
      }}<span class="draw-measure-label__unit">{{ drawInputUnit }}</span>
    </div>
    <div
      v-if="drawRoomMeasureLabels"
      class="draw-measure-label draw-measure-label--v"
      :class="{ 'draw-measure-label--typing': drawRoomTypeField === 'v' }"
      :style="{
        left: `${drawRoomMeasureLabels.v.x}px`,
        top: `${drawRoomMeasureLabels.v.y}px`,
      }"
    >
      {{ drawRoomMeasureVLabelText
      }}<span class="draw-measure-label__unit">{{ drawInputUnit }}</span>
    </div>
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
    <PlanStage
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
      :show-guide-grid="showCanvasGrid"
      :show-clear-height150="dakMode || planRoofOverlayOn ? showClearHeight150 : false"
      :show-clear-height200="planRoofOverlayOn ? showClearHeight200 : false"
      :show-clear-height-plan-fill="dakMode || planRoofOverlayOn ? showClearHeightPlanFill : false"
      :clear-height-fill-color="clearHeightFillColor"
      :show-roof-planes="planRoofOverlayOn && showRoofPlanesOnPlan"
      :show-ridge-display="showRidgeDisplay"
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
      :plan-display-style="planDisplayStyle"
      :settings-area-id="settingsAreaId"
      :settings-surface-id="settingsSurfaceId"
      :settings-label-id="settingsLabelId"
      :settings-line-id="settingsLineId"
      :hovered-area-id="hoveredAreaId"
      :hovered-surface-id="hoveredSurfaceId"
      :hovered-label-id="hoveredLabelId"
      :hovered-line-id="hoveredLineId"
      :selected-dimension-id="moveDimensionId"
      :hovered-dimension-id="hoveredDimensionId"
      :dimension-handles="dimensionHandles"
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
      v-if="includeFixtureTool && !inspectMode && activePlanTool === 'add_fixture'"
      class="fixture-palette-dock"
    >
      <PlanFixturePalette v-model="pendingFixture" @close="deactivateDrawTool" />
    </div>
  </div>
</template>

<style scoped>
@import '../plan-canvas/plan-canvas-tokens.css';

.plan-canvas-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: var(--plan-canvas-min-height);
  border: 1px solid var(--plan-canvas-border);
  border-radius: var(--plan-canvas-radius);
  overflow: hidden;
  background: var(--plan-canvas-bg);
}

.plan-canvas-wrap--touch {
  touch-action: none;
  overscroll-behavior: none;
}

.plan-canvas-wrap--touch :deep(.plan-toolbelt__thickness-input),
.plan-canvas-wrap--touch :deep(.plan-toolbelt__input),
.plan-canvas-wrap--touch :deep(.plan-toolbelt__select) {
  font-size: var(--plan-touch-input-font-size);
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
  z-index: var(--plan-z-resize);
  pointer-events: none;
}

.item-resize-handle {
  fill: #fff;
  stroke: var(--plan-accent-warm);
  stroke-width: 2;
}

.opening-move-handle {
  fill: var(--plan-accent-warm);
  stroke: #fff;
  stroke-width: 2;
}

.item-rotate-handle__hit {
  fill: #fff;
  stroke: var(--plan-accent-warm);
  stroke-width: 2;
}

.item-rotate-handle__arc {
  fill: none;
  stroke: var(--plan-accent-warm);
  stroke-width: 1.5;
  stroke-linecap: round;
}

.item-rotate-handle__head {
  fill: var(--plan-accent-warm);
}

.empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--plan-muted);
}

.selection-box-preview {
  position: absolute;
  z-index: var(--plan-z-overlay);
  border: 1.5px dashed var(--plan-accent);
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

.draw-draft-handle {
  fill: #fff;
  stroke: #f97316;
  stroke-width: 2;
}

.draw-measure-label {
  position: absolute;
  z-index: 10;
  pointer-events: none;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgb(255 255 255 / 0.94);
  border: 1px solid #f97316;
  color: #9a3412;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
  white-space: nowrap;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.12);
}

.draw-measure-label--wall,
.draw-measure-label--h {
  transform: translate(-50%, calc(-100% - 8px));
}

.draw-measure-label--v {
  transform: translate(10px, -50%);
}

.draw-measure-label--typing {
  border-width: 2px;
  box-shadow: 0 0 0 2px rgb(249 115 22 / 0.28);
}

.draw-measure-label__unit {
  margin-left: 3px;
  color: #c2410c;
  font-size: 10px;
}

.draw-measure-label__accept {
  margin-left: 6px;
  padding: 0 4px;
  border: 0;
  border-radius: 3px;
  background: #f97316;
  color: #fff;
  font-size: 11px;
  line-height: 1.4;
  cursor: pointer;
  pointer-events: auto;
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
