<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FloorPlan, Opening, Point2D, Wall } from '@/core/fml/types'
import {
  BOVENLICHT_GAP_CM,
  BOVENLICHT_HEIGHT_CM,
  clampBovenlichtGapCm,
  clampBovenlichtHeightCm,
  maybeAddSiblingBovenlicht,
  resolveBovenlichtGapCm,
  resolveBovenlichtHeightCm,
  resolveDoorBovenlicht,
  resolveWindowBovenlicht,
} from '@/core/fml/bovenlicht'
import {
  DEFAULT_FML_DOOR_HEIGHT_CM,
  DEFAULT_FML_WINDOW_HEIGHT_CM,
  DEFAULT_FML_WINDOW_SILL_Z_CM,
} from '@/core/fml/extraction-to-plan-types'
import { listElevationFacadeGroups } from '@/core/fml/facade-groups'
import {
  elevationAxisPlanSides,
  projectFacadeElevation,
  type ElevationBovenlichtDefaults,
  type ElevationOpeningRect,
  type ElevationPlanSide,
  type ElevationRect,
  type ElevationWallRect,
  type FacadeElevation,
} from '@/core/fml/facade-elevation'
import {
  collectElevationRoofSnapYs,
  collectElevationSegmentSnapYs,
  collectElevationSplitSnapXs,
  collectElevationWallSnapXs,
  elevationSplitPreviewAt,
  ELEVATION_SEGMENT_SNAP_CM,
  hitElevationBand,
  hitElevationJunction,
  hitElevationOpening,
  hitElevationRoofPlane,
  hitElevationRoofVertex,
  hitElevationWall,
  nearestElevationRidgeJunction,
  openingPatchFromElevationRect,
  snapElevationY,
  type ElevationSplitPreview,
} from '@/core/fml/elevation-hit'
import {
  elevationWallFillPoints,
  elevationWallFillRings,
  elevationWallInnerStrokes,
  groupElevationPaintPlanes,
} from '@/core/fml/elevation-paint'
import {
  elevationOpeningHoleIsRect,
  elevationOpeningHolePoints,
  glyphFromElevationRect,
} from '@/core/fml/elevation-opening-symbol'
import { buildMirrored, resolveHingeAtStart, resolveSwingSign } from '@/core/fml/door-swing-symbol'
import { findRidgeSurface, setRidgeSurfaceVertexZ } from '@/core/fml/roof-planes'
import {
  listRidgeWallsOnFloor,
  ridgeEndpointZCm,
  setPlanRidgeJunctionZ,
} from '@/core/fml/ridge-walls'
import {
  applyElevationRidgeRect,
  collectElevationRidgeJunctionSnapXs,
  ELEVATION_RIDGE_MIN_SIZE_CM,
  elevationRidgeRectCenter,
  elevationRidgeRectOf,
  snapElevationRidgeCenter,
} from '@/core/fml/elevation-ridge-edit'
import {
  placeRidgeFromElevation,
  previewRidgeFromElevation,
  type ElevationRidgePlacePreview,
} from '@/core/fml/elevation-ridge-place'
import {
  beginRoofPlaceFromElevation,
  placeRoofFromElevation,
  previewRoofFromElevation,
  roofPlaceHoverElevPoint,
  type ElevationRoofPlaceDraft,
  type ElevationRoofPlacePreview,
} from '@/core/fml/elevation-roof-place'
import type { ElevTool } from '@/ui/composables/fml-preview/fml-elevation-tool'
import {
  isTriangleWindow,
  resolveDoorAddPreset,
  resolveDoorSubtypeFromRefid,
  resolveWindowAddPreset,
  resolveWindowSubtypeFromRefid,
  type DoorAddSubtype,
  type WindowAddSubtype,
} from '@/core/fml/opening-add-presets'
import type { OpeningSubtypeDraft } from '@/ui/composables/fml-preview/fml-preview-opening-draft'
import {
  clampElevationOpeningMove,
  clampElevationOpeningResize,
  clampOpeningPatchKeepOppositeEdge,
  type ElevationOpeningShapeHint,
  collectOpeningSnapTargets,
  elevationCollinearXBounds,
  elevationHandlePoints,
  elevationRectCenter,
  pickElevationWallForOpeningX,
  resizeElevationRect,
  snapElevationRect,
  translateElevationRect,
  type ElevResizeSide,
  type ElevationSnapGuide,
} from '@/core/fml/elevation-opening-edit'
import {
  floorWallBaseWorldZ,
  setSlabThicknessCm,
  slabThicknessCm,
  readFloorStack,
} from '@/core/fml/floor-stack'
import {
  addPlanOpening,
  findOpeningInPlan,
  movePlanOpening,
  removePlanOpening,
  setPlanJunctionBottomZ,
  setPlanJunctionElevationEdit,
  setPlanJunctionHeight,
  setPlanWallBottomZ,
  setPlanWallElevationEdit,
  setPlanWallHeight,
  splitPlanWallAtT,
  updatePlanOpening,
} from '@/core/fml/elevation-openings'
import {
  wallEndpoint3D,
  wallEndpointHeightCm,
  wallUniformBottomZCm,
  wallUniformHeightCm,
  type WallElevationEditMode,
} from '@/core/fml/wall-endpoint-height'
import {
  clampOpeningHeight,
  clampOpeningSillZ,
  clampOpeningWidth,
  clampWindowOpeningHeight,
  resolveOpeningHeight,
  resolveWindowSillZ,
} from '@/ui/components/fml-preview-openings'
import { loadImage } from '@/platform/image'
import { useStage } from '@/platform/canvas'
import type { HScaleState } from '@/platform/calibration'
import type { UnderlayOriginLayout } from '@/core/fml/translate-floor-plan'
import {
  buildUnderlayStageGeom,
  underlayContentBoundsCm,
} from '@/ui/composables/fml-preview/fml-preview-underlay-layout'
import { FML_PREVIEW_CHROME_SELECTOR } from '@/ui/composables/fml-preview/fml-preview-gestures'
import {
  OPENING_ARC_DASH_CM,
  OPENING_STROKE_CM,
  OPENING_STROKE_HEAVY_CM,
  SELECTION_HIGHLIGHT_PAD_PX,
  worldDashStage,
  worldStrokeStage,
} from '@/ui/composables/fml-preview/fml-preview-world-stroke'
import { useFmlPreviewUnderlayMove } from '@/ui/composables/fml-preview/useFmlPreviewUnderlayMove'
import {
  layoutTransform,
  useFmlPreviewViewport,
} from '@/ui/composables/fml-preview/useFmlPreviewViewport'
import { useFmlPreviewPanZoom } from '@/ui/composables/fml-preview/useFmlPreviewPanZoom'
import { buildElevationOpeningMeasureLines } from '@/ui/composables/fml-preview/fml-preview-elevation-opening-measure'
import {
  buildElevationJunctionHeightMeasureLines,
  buildElevationWallFaceMeasureLines,
} from '@/ui/composables/fml-preview/fml-preview-elevation-wall-measure'
import { useFmlElevationPointer } from '@/ui/composables/fml-preview/useFmlElevationPointer'
import { useFmlCanvasTouch, useFmlTouchNav } from '@/ui/composables/fml-preview/useFmlCanvasTouch'
import {
  elevationPreciseCommitMinCm,
  elevationPreciseHeightDelta,
  elevationPreciseOffset,
} from '@/ui/composables/fml-preview/fml-elevation-precise-move'
import {
  applyDrawTypeKey,
  isDrawTypeLengthKey,
  parseDrawLengthDraftToCm,
} from '@/ui/composables/fml-preview/fml-preview-draw-measure'
import {
  isSettingsMod,
  resolveRelocatePointerIntent,
} from '@/ui/composables/fml-preview/fml-preview-mods'
import { buildOpeningFromPreset } from '@/core/fml/opening-from-preset'
import { splitWallAtT } from '@/ui/components/fml-preview-wall-edit'
import { useChromeFitScale } from '@/ui/composables/useChromeFitScale'
import FmlEditorTopbar from './FmlEditorTopbar.vue'
import FmlEditorModifierRail from './FmlEditorModifierRail.vue'
import FmlElevationHeightOnlyFields from './FmlElevationHeightOnlyFields.vue'
import FmlElevationOpeningFields from './FmlElevationOpeningFields.vue'
import FmlElevationOpeningQuickFields from './FmlElevationOpeningQuickFields.vue'
import FmlOpeningAddToolFields from './FmlOpeningAddToolFields.vue'
import FmlPreviewMeasureOverlay from './FmlPreviewMeasureOverlay.vue'
import FmlRescaleOverlay from './FmlRescaleOverlay.vue'
import CanvasToolbelt from './canvas/CanvasToolbelt.vue'
import type { ToolbeltItem } from './canvas/canvas-toolbelt.types'
import ToolbeltIcon from './canvas/ToolbeltIcon.vue'
import { FACTORY_OPENING_COLORS } from '@/ui/composables/settings/opening-display-colors'
import {
  ARCHITECT_AREA_FILL,
  DEFAULT_PLAN_DISPLAY_STYLE,
  isArchitectPlanStyle,
  isLinePlanStyle,
  planLineStroke,
  type PlanDisplayStyleChoice,
} from '@/ui/composables/settings/plan-display-style'
import { loadUserSettings, setShowCanvasGrid } from '@/ui/composables/settings/user-settings'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import CanvasGuideGrid from './canvas/CanvasGuideGrid.vue'
import './canvas/canvas-toolbelt.css'

const props = withDefaults(
  defineProps<{
    plan: FloorPlan
    groupId: string
    underlaySrc?: string | null
    underlayWidthPx?: number
    underlayHeightPx?: number
    underlayOpacity?: number
    /** 0–1; FML-geometrie opacity (zelfde slider als plattegrond). */
    contentOpacity?: number
    cmOrigin?: { x: number; y: number } | null
    pxPerMmX?: number
    pxPerMmY?: number
    rotationDeg?: number
    flipX?: boolean
    underlayMoveMode?: boolean
    rescaleMode?: boolean
    rescaleState?: HScaleState | null
    canvasFullscreen?: boolean
    defaultDoorHeightCm?: number
    defaultWindowHeightCm?: number
    defaultWindowSillZCm?: number
    bovenlichtDefault?: boolean
    windowBovenlichtDefault?: boolean
    bovenlichtHeightCm?: number
    bovenlichtGapCm?: number
    /** true = flags+groen; false = losse ramen. Default true. */
    bovenlichtPacked?: boolean
    /** Per-floor lookup; valt terug op de props hierboven. */
    resolveBovenlichtDefaults?: (floorIndex: number) => ElevationBovenlichtDefaults
    unit?: ScaleInputUnit
  }>(),
  {
    underlaySrc: null,
    underlayOpacity: 0.45,
    contentOpacity: 0.8,
    underlayMoveMode: false,
    rescaleMode: false,
    rescaleState: null,
    canvasFullscreen: false,
    defaultDoorHeightCm: DEFAULT_FML_DOOR_HEIGHT_CM,
    defaultWindowHeightCm: DEFAULT_FML_WINDOW_HEIGHT_CM,
    defaultWindowSillZCm: DEFAULT_FML_WINDOW_SILL_Z_CM,
    bovenlichtDefault: false,
    windowBovenlichtDefault: false,
    bovenlichtHeightCm: BOVENLICHT_HEIGHT_CM,
    bovenlichtGapCm: BOVENLICHT_GAP_CM,
    bovenlichtPacked: true,
    unit: 'm',
  },
)

const emit = defineEmits<{
  planUpdate: [plan: FloorPlan]
  'update:groupId': [id: string]
  'update:canvasFullscreen': [value: boolean]
  'update:underlayMoveMode': [value: boolean]
  updateRescaleState: [state: HScaleState]
  cancelRescale: []
  'update:underlayLayout': [layout: UnderlayOriginLayout]
}>()

const { t } = useI18n()
const containerRef = ref<HTMLDivElement | null>(null)
const elevDockRef = ref<HTMLElement | null>(null)
useChromeFitScale(elevDockRef, { containerSelector: '.elev-host, .fml-preview-wrap, .canvas-wrap' })

const planDisplayStyle = ref<PlanDisplayStyleChoice>(
  loadUserSettings().fmlViewer.planDisplayStyle ?? DEFAULT_PLAN_DISPLAY_STYLE,
)
const showCanvasGrid = ref(loadUserSettings().fmlViewer.showCanvasGrid !== false)
function applyCornerMarkerModeFromSettings(): void {
  const settings = loadUserSettings()
  planDisplayStyle.value = settings.fmlViewer.planDisplayStyle
  showCanvasGrid.value = settings.fmlViewer.showCanvasGrid !== false
}

function onShowCanvasGrid(next: boolean) {
  showCanvasGrid.value = setShowCanvasGrid(next)
}
const architectStyle = computed(() => isArchitectPlanStyle(planDisplayStyle.value))
const lineStyle = computed(() => isLinePlanStyle(planDisplayStyle.value))
const elevLineColor = computed(() => planLineStroke(planDisplayStyle.value))

const elevLibraryTools = computed<ToolbeltItem[]>(() => [
  { id: 'add_door', icon: 'door', label: t('toolbelt.fml.addDoor') },
  { id: 'add_window', icon: 'window', label: t('toolbelt.fml.addWindow') },
  { id: 'add_ridge', icon: 'ridge', label: t('toolbelt.fml.addRidge') },
  { id: 'add_roof', icon: 'roof', label: t('toolbelt.fml.addRoof') },
  { id: 'split', icon: 'split', label: t('result.toolbar.splitWall') },
])
const isPanDragging = ref(false)
const activeTool = ref<ElevTool>('select')
const addDoorSubtype = ref<DoorAddSubtype>('standard')
const addDoorWidthCm = ref(resolveDoorAddPreset('standard').defaultWidthCm)
const addDoorHeightCm = ref(DEFAULT_FML_DOOR_HEIGHT_CM)
const addDoorSillZCm = ref(0)
const addWindowSubtype = ref<WindowAddSubtype>('single')
const addWindowWidthCm = ref(resolveWindowAddPreset('single').defaultWidthCm)
const addWindowSillZCm = ref(DEFAULT_FML_WINDOW_SILL_Z_CM)
const addWindowHeightCm = ref(DEFAULT_FML_WINDOW_HEIGHT_CM)

watch(addDoorSubtype, (subtype) => {
  addDoorWidthCm.value = resolveDoorAddPreset(subtype).defaultWidthCm
})
watch(addWindowSubtype, (subtype) => {
  addWindowWidthCm.value = resolveWindowAddPreset(subtype).defaultWidthCm
})

type ElevSettings =
  | { kind: 'opening'; id: string; mode: 'quick' | 'edit' }
  | { kind: 'wall'; wallId: string; floorIndex: number }
  | { kind: 'slab'; floorIndex: number }
  | { kind: 'junction'; id: string }
  | { kind: 'ridge'; wallId: string; floorIndex: number }
  | { kind: 'roof'; id: string; vertexIndex: number | null }

const selectedOpeningId = ref<string | null>(null)
const settingsTarget = ref<ElevSettings | null>(null)
const elevSettingsOpen = computed(
  () => settingsTarget.value != null || activeTool.value !== 'select',
)
const snapGuide = ref<ElevationSnapGuide | null>(null)
const splitDraft = ref<ElevationSplitPreview | null>(null)
const ridgePlacePreview = ref<ElevationRidgePlacePreview | null>(null)
const roofPlaceDraft = ref<ElevationRoofPlaceDraft | null>(null)
const roofPlacePreview = ref<ElevationRoofPlacePreview | null>(null)
const roofPlaceHover = ref<Point2D | null>(null)
const undoStack = ref<FloorPlan[]>([])
const redoStack = ref<FloorPlan[]>([])

const selectedOpening = computed(() => {
  const id = selectedOpeningId.value
  if (!id) return null
  return findOpeningInPlan(props.plan, id)
})

const selectedOpeningRect = computed(() => {
  const id = selectedOpeningId.value
  if (!id || !elevation.value) return null
  return elevation.value.openings.find((item) => item.openingId === id) ?? null
})

const openingHandles = computed(() => {
  const rect = selectedOpeningRect.value
  if (!rect || settingsTarget.value?.kind !== 'opening' || settingsTarget.value.mode !== 'edit') {
    return []
  }
  return elevationHandlePoints(rect)
})

const openingMoveHandle = computed(() => {
  const rect = selectedOpeningRect.value
  if (!rect || settingsTarget.value?.kind !== 'opening') return null
  return elevationRectCenter(rect)
})

/** Restmaten links/rechts + vloer/plafond bij selectie / verslepen. */
const openingMoveMeasureLines = computed(() => {
  if (settingsTarget.value?.kind !== 'opening') return []
  const rect = selectedOpeningRect.value
  const elev = elevation.value
  if (!rect || !elev) return []
  const wall = elev.walls.find(
    (item) => item.wallId === rect.wallId && item.floorIndex === rect.floorIndex && !item.ridge,
  )
  if (!wall) return []
  return buildElevationOpeningMeasureLines(wall, rect)
})

/** Volle vlakhoogte bij muur-/knoopselectie (niet rond ramen/deuren). */
const wallFaceMeasureLines = computed(() => {
  const kind = settingsTarget.value?.kind
  if (kind === 'wall') {
    const wall = selectedPlanWall.value
    return wall ? buildElevationWallFaceMeasureLines(wall) : []
  }
  if (kind === 'junction') {
    const junction = settingsJunction.value
    return junction ? buildElevationJunctionHeightMeasureLines(junction) : []
  }
  return []
})

const elevationMeasureLines = computed(() => {
  if (settingsTarget.value?.kind === 'opening') return openingMoveMeasureLines.value
  return wallFaceMeasureLines.value
})

const selectedRidgeWall = computed(() => {
  const target = settingsTarget.value
  if (target?.kind !== 'ridge' || !elevation.value) return null
  return (
    elevation.value.walls.find(
      (item) =>
        item.ridge && item.wallId === target.wallId && item.floorIndex === target.floorIndex,
    ) ?? null
  )
})

const settingsRidge = computed(() => {
  const target = settingsTarget.value
  if (target?.kind !== 'ridge') return null
  const floor = props.plan.floors[target.floorIndex]
  const wall = floor ? listRidgeWallsOnFloor(floor).find((item) => item.id === target.wallId) : null
  if (!floor || !wall) return null
  return {
    ...target,
    name: floor.name,
    heightCm: Math.round(ridgeEndpointZCm(wall, 'a', floor.height)),
  }
})

const ridgeHandles = computed(() => {
  const wall = selectedRidgeWall.value
  if (!wall?.endOn) return []
  return elevationHandlePoints(elevationRidgeRectOf(wall))
})

const ridgeCenter = computed(() => {
  const wall = selectedRidgeWall.value
  if (!wall?.endOn) return null
  return elevationRidgeRectCenter(elevationRidgeRectOf(wall))
})

const openingSubtype = computed((): OpeningSubtypeDraft => {
  const opening = selectedOpening.value?.opening
  if (!opening) return 'standard'
  return opening.type === 'window'
    ? resolveWindowSubtypeFromRefid(opening.refid)
    : resolveDoorSubtypeFromRefid(opening.refid)
})

const groups = computed(() => listElevationFacadeGroups(props.plan))

function floorBovenlichtDefaults(floorIndex: number): ElevationBovenlichtDefaults {
  if (props.resolveBovenlichtDefaults) return props.resolveBovenlichtDefaults(floorIndex)
  return {
    doorDefault: props.bovenlichtDefault === true,
    windowDefault: props.windowBovenlichtDefault === true,
    heightCm: props.bovenlichtHeightCm ?? BOVENLICHT_HEIGHT_CM,
    gapCm: props.bovenlichtGapCm ?? BOVENLICHT_GAP_CM,
  }
}

const elevation = computed(() =>
  projectFacadeElevation(props.plan, props.groupId, floorBovenlichtDefaults),
)

const planSideLabels = computed(() => {
  const axis = elevation.value?.axis
  return axis ? elevationAxisPlanSides(axis) : null
})

function planSideLetter(side: ElevationPlanSide): string {
  return t(`viewer.elevationPlanSide.${side}`)
}

const ELEVATION_PLAN_SIDE_GAP_CM = 56

function glyphOpacity(role: string, transom: boolean): number {
  if (role === 'glass') return transom ? 0.55 : 0.85
  if (transom) return 0.7
  return 0.95
}

function glyphFill(role: string, transom: boolean, type: 'door' | 'window'): string {
  if (transom) {
    if (role === 'glass') return '#86efac'
    if (role === 'frame') return '#15803d'
    return FACTORY_OPENING_COLORS.bovenlicht
  }
  if (type === 'door') {
    if (role === 'handle') return '#431407'
    if (role === 'glass') return '#fde68a'
    if (role === 'frame') return '#b45309'
    return '#f59e0b'
  }
  if (role === 'glass') return '#bae6fd'
  if (role === 'frame') return '#0369a1'
  if (role === 'leaf') return '#94a3b8'
  return '#38bdf8'
}

const selectedOpeningBovenlicht = computed(() => {
  const located = selectedOpening.value
  if (!located) return false
  const defaults = floorBovenlichtDefaults(located.floorIndex)
  return located.opening.type === 'window'
    ? resolveWindowBovenlicht(located.opening, defaults.windowDefault)
    : resolveDoorBovenlicht(located.opening, defaults.doorDefault)
})

const selectedOpeningBovenlichtHeightCm = computed(() => {
  const located = selectedOpening.value
  if (!located) return props.bovenlichtHeightCm ?? BOVENLICHT_HEIGHT_CM
  return resolveBovenlichtHeightCm(
    located.opening,
    floorBovenlichtDefaults(located.floorIndex).heightCm,
  )
})

const selectedOpeningBovenlichtGapCm = computed(() => {
  const located = selectedOpening.value
  if (!located) return props.bovenlichtGapCm ?? BOVENLICHT_GAP_CM
  return resolveBovenlichtGapCm(located.opening, floorBovenlichtDefaults(located.floorIndex).gapCm)
})

const selectedOpeningHingeAtStart = computed(() =>
  resolveHingeAtStart(selectedOpening.value?.opening.mirrored),
)
const selectedOpeningSwingRight = computed(
  () => resolveSwingSign(selectedOpening.value?.opening.mirrored) > 0,
)

const settingsWall = computed(() => {
  const target = settingsTarget.value
  if (target?.kind !== 'wall') return null
  const floor = props.plan.floors[target.floorIndex]
  const wall = floor?.walls.find((item) => item.id === target.wallId)
  if (!floor || !wall) return null
  const heightCm =
    wallUniformHeightCm(wall, floor.height) ??
    Math.round(
      Math.max(
        wallEndpointHeightCm(wall, 'a', floor.height),
        wallEndpointHeightCm(wall, 'b', floor.height),
      ),
    )
  const bottomZCm = wallUniformBottomZCm(wall, floor.height) ?? 0
  return { ...target, name: floor.name, heightCm, bottomZCm }
})

const selectedPlanWall = computed(() => {
  const target = settingsTarget.value
  if (target?.kind !== 'wall' || !elevation.value) return null
  return (
    elevation.value.walls.find(
      (item) =>
        !item.ridge && item.wallId === target.wallId && item.floorIndex === target.floorIndex,
    ) ?? null
  )
})

/** Boven / midden / onder grepen op geselecteerde muur (niet-nok). */
const wallElevationHandles = computed(() => {
  const wall = selectedPlanWall.value
  if (!wall) return []
  const mx = (wall.xa + wall.xb) / 2
  const topY = (wall.aTop.y + wall.bTop.y) / 2
  const botY = (wall.aBottom.y + wall.bBottom.y) / 2
  const midY = (topY + botY) / 2
  return [
    { mode: 'height' as const, x: mx, y: topY },
    { mode: 'shift' as const, x: mx, y: midY },
    { mode: 'lift' as const, x: mx, y: botY },
  ]
})

/** Mid + onder greep bij geselecteerde (niet-nok) knoop; top-cirkel blijft apart. */
const junctionElevationHandles = computed(() => {
  const junction = settingsJunction.value
  if (!junction || junction.ridge) return []
  const midY = (junction.yTop + junction.yBot) / 2
  return [
    { mode: 'shift' as const, x: junction.x, y: midY },
    { mode: 'lift' as const, x: junction.x, y: junction.yBot },
  ]
})

const settingsSlab = computed(() => {
  const target = settingsTarget.value
  if (target?.kind !== 'slab') return null
  const floor = props.plan.floors[target.floorIndex]
  if (!floor) return null
  return {
    ...target,
    name: floor.name,
    heightCm: slabThicknessCm(readFloorStack(props.plan), floor.level),
  }
})

const settingsJunction = computed(() => {
  const target = settingsTarget.value
  if (target?.kind !== 'junction' || !elevation.value) return null
  const junction = elevation.value.junctions.find((item) => item.id === target.id)
  if (!junction) return null
  const floor = props.plan.floors[junction.floorIndex]
  const floorH = floor?.height ?? 280
  const bottoms = junction.refs
    .map((ref) => {
      const wall = floor?.walls.find((item) => item.id === ref.wallId)
      if (!wall) return null
      return Math.round(wallEndpoint3D(wall, ref.end, floorH).z)
    })
    .filter((value): value is number => value != null)
  const firstBottom = bottoms[0] ?? 0
  return {
    ...junction,
    name: floor?.name ?? '',
    bottomZCm: firstBottom,
  }
})

const selectedRoofPlane = computed(() => {
  const target = settingsTarget.value
  if (target?.kind !== 'roof' || !elevation.value) return null
  return elevation.value.roofPlanes.find((plane) => plane.id === target.id) ?? null
})

const settingsRoof = computed(() => {
  const target = settingsTarget.value
  if (target?.kind !== 'roof') return null
  const surface = findRidgeSurface(props.plan, target.id)
  if (!surface) return null
  const plane = selectedRoofPlane.value
  const floor = plane ? props.plan.floors[plane.floorIndex] : null
  const z = target.vertexIndex != null ? surface.poly[target.vertexIndex]?.z : null
  return {
    id: target.id,
    name: floor?.name ?? '',
    vertexIndex: target.vertexIndex,
    heightCm: z != null ? Math.round(z) : null,
  }
})

const extraBounds = computed(() => {
  const bounds = elevation.value?.bounds
  const elev = bounds
    ? {
        minX: bounds.x0 - ELEVATION_PLAN_SIDE_GAP_CM,
        minY: bounds.y0,
        spanX: Math.max(1, bounds.x1 - bounds.x0) + ELEVATION_PLAN_SIDE_GAP_CM * 2,
        spanY: Math.max(1, bounds.y1 - bounds.y0),
      }
    : null
  const underlay =
    props.cmOrigin && (props.underlayOpacity ?? 0) > 0
      ? underlayContentBoundsCm({
          cmOrigin: props.cmOrigin,
          underlayWidthPx: props.underlayWidthPx ?? 0,
          underlayHeightPx: props.underlayHeightPx ?? 0,
          pxPerMmX: props.pxPerMmX ?? 1,
          pxPerMmY: props.pxPerMmY ?? 1,
          rotationDeg: props.rotationDeg,
          flipX: props.flipX,
        })
      : null
  if (!elev) return underlay
  if (!underlay) return elev
  const minX = Math.min(elev.minX, underlay.minX)
  const minY = Math.min(elev.minY, underlay.minY)
  const maxX = Math.max(elev.minX + elev.spanX, underlay.minX + underlay.spanX)
  const maxY = Math.max(elev.minY + elev.spanY, underlay.minY + underlay.spanY)
  return { minX, minY, spanX: Math.max(1, maxX - minX), spanY: Math.max(1, maxY - minY) }
})

const emptyWalls = ref<Wall[]>([])
const viewport = useFmlPreviewViewport(containerRef, emptyWalls, undefined, extraBounds)
const {
  stageSize,
  viewScale,
  viewPosition,
  contentLayout,
  resetView,
  mountResizeObserver,
  unmountResizeObserver,
} = viewport

const layoutXform = computed(() => {
  const layout = contentLayout.value
  if (!layout) {
    return layoutTransform({
      minX: 0,
      minY: 0,
      spanX: 1,
      spanY: 1,
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    })
  }
  return layoutTransform(layout)
})

const planSideLabelMarks = computed(() => {
  const elev = elevation.value
  const sides = planSideLabels.value
  if (!elev || !sides) return []
  const inv = 1 / Math.max(1e-6, viewScale.value)
  const font = 14 * inv
  const width = 36 * inv
  const midY = (elev.bounds.y0 + elev.bounds.y1) / 2
  const xform = layoutXform.value
  const left = xform.toStagePoint(elev.bounds.x0 - ELEVATION_PLAN_SIDE_GAP_CM, midY)
  const right = xform.toStagePoint(elev.bounds.x1 + ELEVATION_PLAN_SIDE_GAP_CM, midY)
  const base = {
    fontSize: font,
    fontStyle: 'bold' as const,
    fill: '#334155',
    align: 'center' as const,
    width,
    offsetX: width / 2,
    offsetY: font / 2,
    listening: false,
    perfectDrawEnabled: false,
  }
  return [
    { key: 'left', config: { ...base, x: left.x, y: left.y, text: planSideLetter(sides.left) } },
    {
      key: 'right',
      config: { ...base, x: right.x, y: right.y, text: planSideLetter(sides.right) },
    },
  ]
})

const { clientToCm, pointerCm } = useFmlElevationPointer({
  containerRef,
  viewScale,
  viewPosition,
  contentLayout,
  toCmPoint: (x, y) => layoutXform.value.toCmPoint(x, y),
})

const openingGlyphs = computed(() => {
  const elev = elevation.value
  if (!elev) return []
  const xform = layoutXform.value
  const toStage = (x: number, y: number) => xform.toStagePoint(x, y)
  const toPoints = (flat: number[]) => {
    const out: number[] = []
    for (let i = 0; i < flat.length; i += 2) {
      const px = flat[i]
      const py = flat[i + 1]
      if (px == null || py == null) continue
      const point = toStage(px, py)
      out.push(point.x, point.y)
    }
    return out
  }
  const mapRect = (rect: ElevationOpeningRect, transom: boolean, index: number) => {
    const symbol = glyphFromElevationRect(rect)
    return {
      id: `${transom ? 't' : 'o'}-${rect.openingId}-${index}`,
      wallId: rect.wallId,
      floorIndex: rect.floorIndex,
      transom,
      type: rect.type,
      polys: symbol.polys.map((poly, i) => ({
        key: `${i}-${poly.role}`,
        points: toPoints(poly.points),
        closed: poly.closed !== false,
        fill: poly.fill === true,
        role: poly.role,
      })),
      circles: symbol.circles.map((circle, i) => {
        const center = toStage(circle.cx, circle.cy)
        const rim = toStage(circle.cx + circle.radius, circle.cy)
        return {
          key: `c-${i}-${circle.role}`,
          x: center.x,
          y: center.y,
          radius: Math.hypot(rim.x - center.x, rim.y - center.y),
          fill: circle.fill === true,
          role: circle.role,
        }
      }),
    }
  }
  return [
    ...elev.openings.map((rect, index) => mapRect(rect, false, index)),
    ...elev.transoms.map((rect, index) => mapRect(rect, true, index)),
  ]
})

const layoutScale = computed(() => contentLayout.value?.scale ?? 1)
const elevStroke = computed(() => worldStrokeStage(OPENING_STROKE_CM, layoutScale.value))
const elevStrokeHeavy = computed(() => worldStrokeStage(OPENING_STROKE_HEAVY_CM, layoutScale.value))
const elevHighlightStroke = computed(() => {
  const pad = SELECTION_HIGHLIGHT_PAD_PX / Math.max(viewScale.value, 0.01)
  return elevStroke.value + pad
})
const elevDash = computed(() => worldDashStage(OPENING_ARC_DASH_CM, layoutScale.value))

function wallOrRidgeSelected(wall: ElevationWallRect): boolean {
  const target = settingsTarget.value
  if (
    (target?.kind === 'wall' || target?.kind === 'ridge') &&
    target.wallId === wall.wallId &&
    target.floorIndex === wall.floorIndex
  ) {
    return true
  }
  const draft = splitDraft.value
  return Boolean(draft && draft.wallId === wall.wallId && draft.floorIndex === wall.floorIndex)
}

function slabSelected(floorIndex: number): boolean {
  const target = settingsTarget.value
  return target?.kind === 'slab' && target.floorIndex === floorIndex
}

function roofSelected(id: string): boolean {
  const target = settingsTarget.value
  return target?.kind === 'roof' && target.id === id
}

function junctionSelected(id: string): boolean {
  const target = settingsTarget.value
  return target?.kind === 'junction' && target.id === id
}

const panZoom = useFmlPreviewPanZoom({
  viewport,
  containerRef,
  isPanDragging,
  onBeforePan: () => undefined,
})

onMounted(() => {
  mountResizeObserver()
  window.addEventListener('keydown', onSpaceKeyDown)
  window.addEventListener('keyup', onSpaceKeyUp)
})
onBeforeUnmount(() => {
  unmountResizeObserver()
  window.removeEventListener('keydown', onSpaceKeyDown)
  window.removeEventListener('keyup', onSpaceKeyUp)
  cancelOpeningMovePending()
  clearPreciseDraftUi()
  window.removeEventListener('pointermove', onRoofVertexMove)
  window.removeEventListener('pointerup', onRoofVertexUp)
  window.removeEventListener('pointermove', onJunctionMove)
  window.removeEventListener('pointermove', onSplitMove)
  window.removeEventListener('pointermove', onRidgeRectMove)
})

watch(
  () => props.groupId,
  () => {
    if (preciseDraft) clearPreciseDraftUi()
    selectedOpeningId.value = null
    settingsTarget.value = null
    clearSplitDraft()
    resetView()
  },
)

const underlayImage = ref<HTMLImageElement | null>(null)
watch(
  () => props.underlaySrc,
  async (src) => {
    if (!src) {
      underlayImage.value = null
      return
    }
    try {
      underlayImage.value = await loadImage(src)
    } catch {
      underlayImage.value = null
    }
  },
  { immediate: true },
)

const underlayConfig = computed(() => {
  const img = underlayImage.value
  const elev = elevation.value
  if (!img || !elev || !props.underlaySrc || (props.underlayOpacity ?? 0) <= 0) return null
  const layout = props.cmOrigin
    ? {
        origin: props.cmOrigin,
        pxPerMmX: props.pxPerMmX ?? 1,
        pxPerMmY: props.pxPerMmY ?? 1,
      }
    : null
  const widthCm =
    layout && layout.pxPerMmX > 0 && (props.underlayWidthPx ?? 0) > 0
      ? (props.underlayWidthPx ?? 0) / layout.pxPerMmX / 10
      : elev.bounds.x1 - elev.bounds.x0
  const heightCm =
    layout && layout.pxPerMmY > 0 && (props.underlayHeightPx ?? 0) > 0
      ? (props.underlayHeightPx ?? 0) / layout.pxPerMmY / 10
      : elev.bounds.y1 - elev.bounds.y0
  const origin = layout?.origin ?? { x: 0, y: 0 }
  const topLeft = layoutXform.value.toStagePoint(-origin.x, -origin.y)
  const br = layoutXform.value.toStagePoint(-origin.x + widthCm, -origin.y + heightCm)
  const geom = buildUnderlayStageGeom({
    topLeftStage: topLeft,
    widthStage: br.x - topLeft.x,
    heightStage: br.y - topLeft.y,
    rotationDeg: props.rotationDeg,
    flipX: props.flipX,
  })
  return {
    flip: { ...geom.flip, listening: false },
    rotate: { ...geom.rotate, listening: false },
    image: {
      image: img,
      ...geom.image,
      opacity: props.underlayOpacity ?? 0.45,
      listening: false,
    },
  }
})

function stageRect(rect: ElevationRect) {
  const a = layoutXform.value.toStagePoint(rect.x0, rect.y0)
  const b = layoutXform.value.toStagePoint(rect.x1, rect.y1)
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.max(1, Math.abs(b.x - a.x)),
    height: Math.max(1, Math.abs(b.y - a.y)),
  }
}

function stageWallPoly(wall: ElevationWallRect): number[] {
  return elevationWallFillPoints(wall).flatMap((point) => {
    const stage = layoutXform.value.toStagePoint(point.x, point.y)
    return [stage.x, stage.y]
  })
}

function stageWallFillPath(wall: ElevationWallRect, holes: readonly ElevationRect[]): string {
  return elevationWallFillRings(wall, wall.ridge ? [] : holes)
    .map((ring) => {
      const pts = ring.map((point) => layoutXform.value.toStagePoint(point.x, point.y))
      const first = pts[0]
      if (!first || pts.length < 3) return ''
      return `M${first.x} ${first.y}${pts
        .slice(1)
        .map((point) => `L${point.x} ${point.y}`)
        .join('')}Z`
    })
    .join('')
}

function stagePoly(points: ReadonlyArray<{ x: number; y: number }>): number[] {
  return points.flatMap((point) => {
    const stage = layoutXform.value.toStagePoint(point.x, point.y)
    return [stage.x, stage.y]
  })
}

function openingGhostStage(rect: ElevationOpeningRect) {
  const x0 = Math.min(rect.x0, rect.x1)
  const x1 = Math.max(rect.x0, rect.x1)
  const y0 = Math.min(rect.y0, rect.y1)
  const y1 = Math.max(rect.y0, rect.y1)
  const shaped = !elevationOpeningHoleIsRect(rect.type, rect.refid)
  return {
    shaped,
    points: shaped
      ? stagePoly(
          elevationOpeningHolePoints({ x0, y0, x1, y1 }, rect.type, rect.refid, {
            mirrored: rect.mirrored,
            startOnLeft: rect.startOnLeft,
          }),
        )
      : [],
  }
}

function stagePoints(a: { x: number; y: number }, b: { x: number; y: number }): number[] {
  const sa = layoutXform.value.toStagePoint(a.x, a.y)
  const sb = layoutXform.value.toStagePoint(b.x, b.y)
  return [sa.x, sa.y, sb.x, sb.y]
}

const innerStrokes = computed(() => {
  const elev = elevation.value
  if (!elev) return []
  return elev.walls.flatMap((wall) =>
    elevationWallInnerStrokes(wall).map((stroke, index) => ({
      key: `inner-${wall.floorIndex}-${wall.wallId}-${index}`,
      wallId: wall.wallId,
      floorIndex: wall.floorIndex,
      a: stroke.a,
      b: stroke.b,
    })),
  )
})

const elevationPlanes = computed(() => {
  const elev = elevation.value
  if (!elev) return []
  const glyphs = openingGlyphs.value
  const strokes = innerStrokes.value
  return groupElevationPaintPlanes(elev).map((plane, planeIndex) => ({
    key: `plane-${planeIndex}`,
    layers: plane.walls.map((wall) => ({
      wall,
      fillPath: stageWallFillPath(wall, [...plane.openings, ...plane.transoms]),
      innerStrokes: strokes.filter(
        (item) => item.wallId === wall.wallId && item.floorIndex === wall.floorIndex,
      ),
    })),
    endOnRidges: plane.endOnRidges.map((wall) => ({
      wall,
      fillPath: stageWallFillPath(wall, []),
    })),
    openings: plane.openings.map((opening) => ({ ...opening, ghost: openingGhostStage(opening) })),
    transoms: plane.transoms.map((transom) => ({ ...transom, ghost: openingGhostStage(transom) })),
    glyphs: glyphs.filter((item) =>
      plane.walls.some(
        (wall) => wall.wallId === item.wallId && wall.floorIndex === item.floorIndex,
      ),
    ),
  }))
})

function wallBodyFill(): string {
  return architectStyle.value ? ARCHITECT_AREA_FILL : '#94a3b8'
}

function ridgeEndFill(): string {
  return architectStyle.value ? ARCHITECT_AREA_FILL : '#7b8ea6'
}

function bandBodyFill(kind: 'slab' | 'nok'): string {
  if (architectStyle.value) return ARCHITECT_AREA_FILL
  return kind === 'nok' ? '#cbd5e1' : '#e2e8f0'
}

function roofBodyFill(color: string): string {
  return architectStyle.value ? ARCHITECT_AREA_FILL : color
}

function wallOuterStroke(): string {
  return lineStyle.value ? elevLineColor.value : '#334155'
}

function wallInnerStroke(): string {
  return lineStyle.value ? elevLineColor.value : '#0f172a'
}

function roofOuterStroke(): string {
  return lineStyle.value ? elevLineColor.value : '#4b5563'
}

function openingGhostFill(openingId: string, type: 'door' | 'window'): string | undefined {
  if (architectStyle.value) return ARCHITECT_AREA_FILL
  if (selectedOpeningId.value === openingId) return '#f97316'
  return type === 'door' ? '#f59e0b' : '#38bdf8'
}

function openingGhostOpacity(openingId: string): number {
  if (architectStyle.value) return 1
  return selectedOpeningId.value === openingId ? 0.55 : 0.08
}

function glyphStrokeColor(transom: boolean): string {
  if (architectStyle.value) return elevLineColor.value
  return transom ? '#14532d' : '#0c4a6e'
}

function glyphPolyFill(
  role: string,
  transom: boolean,
  type: 'door' | 'window',
  filled: boolean,
): string | undefined {
  if (!filled) return undefined
  if (architectStyle.value) return ARCHITECT_AREA_FILL
  return glyphFill(role, transom, type)
}

function pushUndo(): void {
  undoStack.value = [...undoStack.value, props.plan].slice(-40)
  redoStack.value = []
}

function commitPlan(next: FloorPlan): void {
  emit('planUpdate', next)
}

function undoEdit(): void {
  const prev = undoStack.value[undoStack.value.length - 1]
  if (!prev) return
  undoStack.value = undoStack.value.slice(0, -1)
  redoStack.value = [...redoStack.value, props.plan]
  emit('planUpdate', prev)
}

function redoEdit(): void {
  const next = redoStack.value[redoStack.value.length - 1]
  if (!next) return
  redoStack.value = redoStack.value.slice(0, -1)
  undoStack.value = [...undoStack.value, props.plan]
  emit('planUpdate', next)
}

function clearRoofPlaceDraft(): void {
  roofPlaceDraft.value = null
  roofPlacePreview.value = null
  roofPlaceHover.value = null
  snapGuide.value = null
}

function toggleOpeningTool(
  tool: 'add_door' | 'add_window' | 'add_ridge' | 'add_roof' | 'split',
): void {
  if (preciseDraft) cancelPreciseDraft()
  clearSplitDraft()
  ridgePlacePreview.value = null
  clearRoofPlaceDraft()
  if (activeTool.value === tool) {
    activeTool.value = 'select'
    return
  }
  selectOpening(null)
  activeTool.value = tool
}

function onElevToolChange(id: string | null): void {
  if (
    id === 'add_door' ||
    id === 'add_window' ||
    id === 'add_ridge' ||
    id === 'add_roof' ||
    id === 'split'
  ) {
    toggleOpeningTool(id)
    return
  }
  clearSplitDraft()
  ridgePlacePreview.value = null
  clearRoofPlaceDraft()
  activeTool.value = 'select'
}

function placeOpening(elev: FacadeElevation, cm: Point2D, type: 'door' | 'window'): void {
  const hit = hitElevationWall(elev, cm)
  if (!hit || hit.ridge) return
  const floorWalls = props.plan.floors[hit.floorIndex]?.walls ?? []
  const wall = pickElevationWallForOpeningX(elev.walls, hit, cm.x, floorWalls)
  const width = clampOpeningWidth(type === 'door' ? addDoorWidthCm.value : addWindowWidthCm.value)
  if (type === 'door') addDoorWidthCm.value = width
  else addWindowWidthCm.value = width
  const height =
    type === 'door'
      ? Math.max(1, Math.round(addDoorHeightCm.value || props.defaultDoorHeightCm))
      : clampWindowOpeningHeight(addWindowHeightCm.value)
  const z =
    type === 'door'
      ? clampOpeningSillZ(addDoorSillZCm.value)
      : clampOpeningSillZ(addWindowSillZCm.value)
  if (type === 'window') {
    addWindowSillZCm.value = z
    addWindowHeightCm.value = height
  } else {
    addDoorSillZCm.value = z
    addDoorHeightCm.value = height
  }
  const xSpan = wall.xb - wall.xa
  const t = Math.abs(xSpan) < 1e-6 ? 0.5 : (cm.x - wall.xa) / xSpan
  const opening: Opening = buildOpeningFromPreset({
    type,
    doorSubtype: addDoorSubtype.value,
    windowSubtype: addWindowSubtype.value,
    widthCm: width,
    heightCm: height,
    sillZCm: z,
    t,
  })
  pushUndo()
  const result = addPlanOpening(props.plan, wall.wallId, opening, wall.floorIndex)
  let nextPlan = result.plan
  if (props.bovenlichtPacked === false) {
    const host = nextPlan.floors[wall.floorIndex]?.walls.find((w) => w.id === wall.wallId)
    const floorHeight = props.plan.floors[wall.floorIndex]?.height ?? 280
    const defaults = floorBovenlichtDefaults(wall.floorIndex)
    if (host) {
      const sibling = maybeAddSiblingBovenlicht(host, opening, floorHeight, defaults)
      if (sibling) {
        nextPlan = addPlanOpening(nextPlan, wall.wallId, sibling, wall.floorIndex).plan
      }
    }
  }
  if (result.openingId) selectOpening(result.openingId)
  commitPlan(nextPlan)
  activeTool.value = 'select'
}

type OpeningDrag = {
  openingId: string
  mode: 'move' | ElevResizeSide
  startCm: Point2D
  startRect: ElevationRect
  startOpening: Opening
  wallId: string
  floorIndex: number
}

let drag: OpeningDrag | null = null

function applyOpeningRect(
  openingId: string,
  wall: ElevationWallRect,
  rect: ElevationRect,
  snapOff: boolean,
): void {
  const elev = elevation.value
  const openingTargets = elev
    ? collectOpeningSnapTargets([...elev.openings, ...elev.transoms], openingId)
    : { xs: [], ys: [] }
  const floorWalls = props.plan.floors[wall.floorIndex]?.walls ?? []
  const xBounds = elevationCollinearXBounds(elev?.walls ?? [wall], wall, floorWalls)
  const moving = !drag || drag.mode === 'move'
  const shapeOpening = drag?.startOpening ?? findOpeningInPlan(props.plan, openingId)?.opening
  const shapeFor = (startOnLeft: boolean): ElevationOpeningShapeHint | undefined =>
    shapeOpening
      ? {
          type: shapeOpening.type,
          refid: shapeOpening.refid,
          mirrored: shapeOpening.mirrored,
          startOnLeft,
        }
      : undefined
  const snapShape = shapeFor(wall.xa <= wall.xb)
  const raw =
    snapOff || !elev
      ? { rect, guide: {} as ElevationSnapGuide }
      : snapElevationRect(
          rect,
          drag?.mode === 'move' || !drag ? 'move' : drag.mode,
          {
            xs: [...openingTargets.xs, ...collectElevationWallSnapXs(elev.walls)],
            ys: openingTargets.ys,
          },
          undefined,
          snapShape,
        )
  snapGuide.value = raw.guide.x != null || raw.guide.y != null ? raw.guide : null
  let nextRect = raw.rect
  if (drag && drag.mode !== 'move') {
    nextRect = clampElevationOpeningResize(
      wall,
      nextRect,
      drag.mode,
      undefined,
      undefined,
      xBounds,
      shapeFor(wall.xa <= wall.xb),
    )
  }
  let hostElev = moving
    ? pickElevationWallForOpeningX(
        elev?.walls ?? [wall],
        wall,
        (nextRect.x0 + nextRect.x1) / 2,
        floorWalls,
      )
    : wall
  if (moving) {
    const hostBounds = elevationCollinearXBounds(elev?.walls ?? [hostElev], hostElev, floorWalls)
    nextRect = clampElevationOpeningMove(
      hostElev,
      nextRect,
      hostBounds,
      shapeFor(hostElev.xa <= hostElev.xb),
    )
    const nextHost = pickElevationWallForOpeningX(
      elev?.walls ?? [hostElev],
      hostElev,
      (nextRect.x0 + nextRect.x1) / 2,
      floorWalls,
    )
    if (nextHost.wallId !== hostElev.wallId || nextHost.floorIndex !== hostElev.floorIndex) {
      hostElev = nextHost
      const nextBounds = elevationCollinearXBounds(elev?.walls ?? [hostElev], hostElev, floorWalls)
      nextRect = clampElevationOpeningMove(
        hostElev,
        nextRect,
        nextBounds,
        shapeFor(hostElev.xa <= hostElev.xb),
      )
    }
  }
  let nextId = openingId
  let nextPlan = props.plan
  if (moving && hostElev.wallId !== wall.wallId) {
    const patchT = openingPatchFromElevationRect(
      hostElev,
      nextRect,
      floorWallBaseWorldZ(props.plan, hostElev.floorIndex),
    )
    const moved = movePlanOpening(props.plan, openingId, hostElev.wallId, patchT.t)
    nextId = moved.openingId
    nextPlan = moved.plan
    if (drag) {
      drag.openingId = nextId
      drag.wallId = hostElev.wallId
      drag.floorIndex = hostElev.floorIndex
    }
    if (selectedOpeningId.value === openingId) selectedOpeningId.value = nextId
    if (settingsTarget.value?.kind === 'opening' && settingsTarget.value.id === openingId) {
      settingsTarget.value = { ...settingsTarget.value, id: nextId }
    }
  }
  const patch = openingPatchFromElevationRect(
    hostElev,
    nextRect,
    floorWallBaseWorldZ(nextPlan, hostElev.floorIndex),
  )
  if (!drag || drag.mode === 'move') {
    commitPlan(
      updatePlanOpening(
        nextPlan,
        nextId,
        { t: patch.t, z: patch.z },
        { startOnLeft: hostElev.xa <= hostElev.xb },
      ),
    )
    return
  }
  const floor = nextPlan.floors[hostElev.floorIndex]
  const host = findOpeningInPlan(nextPlan, nextId)?.wall
  const resized =
    floor && host
      ? clampOpeningPatchKeepOppositeEdge(
          host,
          drag.startOpening,
          patch,
          drag.mode,
          floor.height,
          floor.walls,
          hostElev.xa <= hostElev.xb,
        )
      : patch
  commitPlan(updatePlanOpening(nextPlan, nextId, resized))
}

function clearSettings(): void {
  settingsTarget.value = null
}

function selectOpening(openingId: string | null, mode: 'quick' | 'edit' | null = null): void {
  selectedOpeningId.value = openingId
  settingsTarget.value = mode && openingId != null ? { kind: 'opening', id: openingId, mode } : null
}

function closeElevToolbelt(): void {
  if (preciseDraft) cancelPreciseDraft()
  activeTool.value = 'select'
  ridgePlacePreview.value = null
  clearRoofPlaceDraft()
  selectOpening(null)
  clearSettings()
}

function placeRidge(elev: FacadeElevation, cm: Point2D, snapOff = false): void {
  const result = placeRidgeFromElevation(props.plan, elev, cm, { snapOff })
  if (!result) return
  pushUndo()
  commitPlan(result.plan)
  selectRidge(result.wallId, result.floorIndex)
  ridgePlacePreview.value = null
  activeTool.value = 'select'
}

function updateRidgePlacePreview(elev: FacadeElevation, cm: Point2D, snapOff = false): void {
  ridgePlacePreview.value = previewRidgeFromElevation(props.plan, elev, cm, { snapOff })
  const midX =
    ridgePlacePreview.value != null
      ? (ridgePlacePreview.value.rect.x0 + ridgePlacePreview.value.rect.x1) / 2
      : null
  snapGuide.value = midX != null && Math.abs(midX - cm.x) > 1e-6 ? { x: midX } : null
}

function onRoofPlaceClick(
  elev: FacadeElevation,
  cm: Point2D,
  snapOff = false,
  freeZ = false,
): void {
  if (!roofPlaceDraft.value) {
    const draft = beginRoofPlaceFromElevation(props.plan, elev, cm, { snapOff })
    if (!draft) return
    roofPlaceDraft.value = draft
    roofPlacePreview.value = null
    // Hover blijft zichtbaar tot de volgende move (nok-preview).
    roofPlaceHover.value = draft.eaveElev
    return
  }
  const result = placeRoofFromElevation(props.plan, elev, roofPlaceDraft.value, cm, {
    snapOff,
    freeZ,
  })
  if (!result) return
  pushUndo()
  commitPlan(result.plan)
  selectRoof(result.surfaceId, null)
  clearRoofPlaceDraft()
  activeTool.value = 'select'
}

function updateRoofPlacePreview(
  elev: FacadeElevation,
  cm: Point2D,
  snapOff = false,
  freeZ = false,
): void {
  const draft = roofPlaceDraft.value
  if (!draft) {
    // Eerste punt: al snap-preview (buitenhoek/goot) vóór de klik.
    roofPlacePreview.value = null
    const preview = beginRoofPlaceFromElevation(props.plan, elev, cm, { snapOff })
    roofPlaceHover.value = preview?.eaveElev ?? null
    snapGuide.value =
      preview != null && Math.abs(preview.eaveElev.x - cm.x) > 1e-6
        ? { x: preview.eaveElev.x }
        : null
    return
  }
  roofPlaceHover.value = roofPlaceHoverElevPoint(props.plan, elev, draft, cm, { snapOff, freeZ })
  roofPlacePreview.value = previewRoofFromElevation(props.plan, elev, draft, cm, {
    snapOff,
    freeZ,
  })
  const hoverX = roofPlaceHover.value?.x
  snapGuide.value = hoverX != null && Math.abs(hoverX - cm.x) > 1e-6 ? { x: hoverX } : null
}

function commitOpeningSubtype(subtype: OpeningSubtypeDraft): void {
  const id = selectedOpeningId.value
  const located = selectedOpening.value
  if (!id || !located) return
  const refid =
    located.opening.type === 'window'
      ? resolveWindowAddPreset(subtype as WindowAddSubtype).refid
      : resolveDoorAddPreset(subtype as DoorAddSubtype).refid
  pushUndo()
  commitPlan(updatePlanOpening(props.plan, id, { refid }))
}

function copySelectedOpening(): void {
  const located = selectedOpening.value
  if (!located) return
  if (located.opening.type === 'window') {
    const subtype = resolveWindowSubtypeFromRefid(located.opening.refid)
    const width = clampOpeningWidth(located.opening.width)
    const sillZ = resolveWindowSillZ(located.opening)
    const height = resolveOpeningHeight(located.opening)
    addWindowSubtype.value = subtype
    queueMicrotask(() => {
      addWindowWidthCm.value = width
      addWindowSillZCm.value = sillZ
      addWindowHeightCm.value = height
    })
    activeTool.value = 'add_window'
  } else {
    const subtype = resolveDoorSubtypeFromRefid(located.opening.refid)
    const width = clampOpeningWidth(located.opening.width)
    const doorHeight = Math.round(located.opening.z_height ?? props.defaultDoorHeightCm)
    const doorSill = Math.round(located.opening.z ?? 0)
    addDoorSubtype.value = subtype
    queueMicrotask(() => {
      addDoorWidthCm.value = width
      addDoorHeightCm.value = doorHeight
      addDoorSillZCm.value = doorSill
    })
    activeTool.value = 'add_door'
  }
  selectedOpeningId.value = null
  settingsTarget.value = null
}

function selectWallSettings(wallId: string, floorIndex: number): void {
  selectedOpeningId.value = null
  settingsTarget.value = { kind: 'wall', wallId, floorIndex }
}

function selectJunction(id: string | null): void {
  selectedOpeningId.value = null
  settingsTarget.value = id ? { kind: 'junction', id } : null
}

function selectRidge(wallId: string, floorIndex: number): void {
  selectedOpeningId.value = null
  settingsTarget.value = { kind: 'ridge', wallId, floorIndex }
}

function selectRoof(id: string | null, vertexIndex: number | null = null): void {
  selectedOpeningId.value = null
  settingsTarget.value = id ? { kind: 'roof', id, vertexIndex } : null
}

function selectSlabSettings(floorIndex: number): void {
  selectedOpeningId.value = null
  settingsTarget.value = { kind: 'slab', floorIndex }
}

function deleteSelectedOpening(): void {
  const id = selectedOpeningId.value
  if (!id) return
  pushUndo()
  commitPlan(removePlanOpening(props.plan, id))
  selectOpening(null)
}

function commitSelectedField(kind: 'width' | 'height' | 'sill', cm: number): void {
  const id = selectedOpeningId.value
  const located = selectedOpening.value
  if (!id || !located) return
  pushUndo()
  if (kind === 'width') {
    commitPlan(updatePlanOpening(props.plan, id, { width: clampOpeningWidth(cm) }))
    return
  }
  if (kind === 'height') {
    commitPlan(
      updatePlanOpening(props.plan, id, {
        z_height: clampOpeningHeight(cm, located.opening.type),
      }),
    )
    return
  }
  commitPlan(updatePlanOpening(props.plan, id, { z: clampOpeningSillZ(cm) }))
}

function commitSelectedBovenlicht(on: boolean): void {
  const id = selectedOpeningId.value
  if (!id) return
  pushUndo()
  commitPlan(updatePlanOpening(props.plan, id, { bovenlicht: on }))
}

function commitSelectedBovenlichtHeight(cm: number): void {
  const id = selectedOpeningId.value
  if (!id) return
  pushUndo()
  commitPlan(
    updatePlanOpening(props.plan, id, {
      bovenlicht: true,
      bovenlichtHeightCm: clampBovenlichtHeightCm(cm),
    }),
  )
}

function commitSelectedBovenlichtGap(cm: number): void {
  const id = selectedOpeningId.value
  if (!id) return
  pushUndo()
  commitPlan(
    updatePlanOpening(props.plan, id, {
      bovenlicht: true,
      bovenlichtGapCm: clampBovenlichtGapCm(cm),
    }),
  )
}

function toggleSelectedOpeningHinge(): void {
  const id = selectedOpeningId.value
  const located = selectedOpening.value
  if (!id || !located) return
  const canMirror =
    located.opening.type === 'door' || isTriangleWindow(located.opening.type, located.opening.refid)
  if (!canMirror) return
  const nextHinge = !resolveHingeAtStart(located.opening.mirrored)
  const swingRight =
    located.opening.type === 'door' ? resolveSwingSign(located.opening.mirrored) > 0 : false
  pushUndo()
  commitPlan(updatePlanOpening(props.plan, id, { mirrored: buildMirrored(nextHinge, swingRight) }))
}

function toggleSelectedOpeningSwing(): void {
  const id = selectedOpeningId.value
  const located = selectedOpening.value
  if (!id || !located || located.opening.type !== 'door') return
  const hingeAtStart = resolveHingeAtStart(located.opening.mirrored)
  const nextSwing = !(resolveSwingSign(located.opening.mirrored) > 0)
  pushUndo()
  commitPlan(
    updatePlanOpening(props.plan, id, { mirrored: buildMirrored(hingeAtStart, nextSwing) }),
  )
}

function commitWallHeight(cm: number): void {
  const target = settingsTarget.value
  if (target?.kind !== 'wall') return
  pushUndo()
  commitPlan(setPlanWallHeight(props.plan, target.wallId, target.floorIndex, cm))
}

function commitWallBottomZ(cm: number): void {
  const target = settingsTarget.value
  if (target?.kind !== 'wall') return
  pushUndo()
  commitPlan(setPlanWallBottomZ(props.plan, target.wallId, target.floorIndex, cm))
}

function commitJunctionHeight(cm: number): void {
  const junction = settingsJunction.value
  if (!junction) return
  pushUndo()
  commitPlan(
    junction.ridge
      ? setPlanRidgeJunctionZ(props.plan, junction.floorIndex, junction.refs, cm)
      : setPlanJunctionHeight(props.plan, junction.floorIndex, junction.refs, cm),
  )
}

function commitJunctionBottomZ(cm: number): void {
  const junction = settingsJunction.value
  if (!junction || junction.ridge) return
  pushUndo()
  commitPlan(setPlanJunctionBottomZ(props.plan, junction.floorIndex, junction.refs, cm))
}

function commitRidgeHeight(cm: number): void {
  const target = settingsTarget.value
  if (target?.kind !== 'ridge') return
  pushUndo()
  commitPlan(
    setPlanRidgeJunctionZ(
      props.plan,
      target.floorIndex,
      [
        { wallId: target.wallId, end: 'a' },
        { wallId: target.wallId, end: 'b' },
      ],
      cm,
    ),
  )
}

function commitRoofVertexHeight(cm: number): void {
  const target = settingsTarget.value
  if (target?.kind !== 'roof' || target.vertexIndex == null) return
  pushUndo()
  commitPlan(setRidgeSurfaceVertexZ(props.plan, target.id, target.vertexIndex, cm))
}

function splitPreviewForWall(
  elev: FacadeElevation,
  wall: ElevationWallRect,
  x: number,
): ElevationSplitPreview {
  return elevationSplitPreviewAt(wall, x, collectElevationSplitSnapXs(elev, wall.wallId))
}

function updateSplitDraft(elev: FacadeElevation, x: number): void {
  const draft = splitDraft.value
  if (!draft) return
  const wall = elev.walls.find(
    (item) => item.wallId === draft.wallId && item.floorIndex === draft.floorIndex,
  )
  if (!wall || wall.ridge) return
  const next = splitPreviewForWall(elev, wall, x)
  splitDraft.value = next
  snapGuide.value = next.snapped ? { x: next.x } : null
}

function beginSplitDraft(elev: FacadeElevation, wall: ElevationWallRect, x: number): void {
  window.removeEventListener('pointermove', onSplitMove)
  splitDraft.value = splitPreviewForWall(elev, wall, x)
  snapGuide.value = splitDraft.value.snapped ? { x: splitDraft.value.x } : null
  window.addEventListener('pointermove', onSplitMove)
}

function clearSplitDraft(): void {
  window.removeEventListener('pointermove', onSplitMove)
  splitDraft.value = null
  snapGuide.value = null
}

function onSplitMove(event: PointerEvent): void {
  if (!splitDraft.value || activeTool.value !== 'split') return
  const elev = elevation.value
  const cm = clientToCm(event.clientX, event.clientY)
  if (!elev || !cm) return
  updateSplitDraft(elev, cm.x)
}

function commitSplitDraft(): void {
  const draft = splitDraft.value
  if (!draft) return
  const result = splitPlanWallAtT(props.plan, draft.wallId, draft.t, splitWallAtT)
  if (!result) return
  pushUndo()
  commitPlan(result.plan)
  const nextElev = projectFacadeElevation(result.plan, props.groupId, floorBovenlichtDefaults)
  const junction = nextElev?.junctions.find(
    (item) =>
      !item.ridge && item.floorIndex === result.floorIndex && Math.abs(item.x - draft.x) < 8,
  )
  clearSplitDraft()
  selectJunction(junction?.id ?? null)
  activeTool.value = 'select'
}

function onSplitClick(elev: FacadeElevation, cm: { x: number; y: number }): void {
  const wall = hitElevationWall(elev, cm)
  if (!splitDraft.value) {
    if (!wall || wall.ridge) return
    beginSplitDraft(elev, wall, cm.x)
    return
  }
  if (wall && !wall.ridge && wall.wallId !== splitDraft.value.wallId) {
    beginSplitDraft(elev, wall, cm.x)
    return
  }
  updateSplitDraft(elev, cm.x)
  commitSplitDraft()
}

function commitSlabHeight(cm: number): void {
  const target = settingsTarget.value
  if (target?.kind !== 'slab') return
  const floor = props.plan.floors[target.floorIndex]
  if (!floor) return
  pushUndo()
  commitPlan(setSlabThicknessCm(props.plan, floor.level, cm))
}

/** Opening-mousedown stopt niet de latere group-@click — die zou het andere overlappinge raam pakken. */
let ignoreContentClickUntil = 0

function markOpeningPointerHandled(): void {
  ignoreContentClickUntil = Date.now() + 400
}

function onContentClick(event: {
  evt: MouseEvent
  target?: {
    getStage?: () => { getPointerPosition?: () => { x: number; y: number } | null } | null
  }
}): void {
  if (Date.now() < ignoreContentClickUntil) return
  if (isPanDragging.value || canvasLocked.value) return
  if (preciseDraft) {
    if (!preciseIgnoreClick) commitPreciseDraft()
    return
  }
  const elev = elevation.value
  if (!elev) return
  const cm =
    pointerCm(event) ?? (event.evt ? clientToCm(event.evt.clientX, event.evt.clientY) : null)
  if (!cm) return
  if (activeTool.value === 'add_door') {
    placeOpening(elev, cm, 'door')
    return
  }
  if (activeTool.value === 'add_window') {
    placeOpening(elev, cm, 'window')
    return
  }
  if (activeTool.value === 'add_ridge') {
    placeRidge(elev, cm, event.evt.ctrlKey || event.evt.metaKey)
    return
  }
  if (activeTool.value === 'add_roof') {
    onRoofPlaceClick(
      elev,
      cm,
      event.evt.ctrlKey || event.evt.metaKey,
      event.evt.ctrlKey || event.evt.metaKey,
    )
    return
  }
  if (activeTool.value === 'split') {
    onSplitClick(elev, cm)
    return
  }
  const selectedRoof = settingsTarget.value?.kind === 'roof' ? selectedRoofPlane.value : null
  if (selectedRoof) {
    const vertexIndex = hitElevationRoofVertex(selectedRoof, cm)
    if (vertexIndex != null) {
      selectRoof(selectedRoof.id, vertexIndex)
      return
    }
    if (hitElevationRoofPlane(elev, cm)?.id === selectedRoof.id) return
  }
  const hit = hitElevationOpening(elev, cm, selectedOpeningId.value)
  if (hit) {
    const wantEdit = event.evt.ctrlKey || event.evt.metaKey
    if (
      !wantEdit &&
      selectedOpeningId.value === hit.openingId &&
      settingsTarget.value?.kind === 'opening' &&
      settingsTarget.value.mode === 'edit'
    ) {
      return
    }
    selectOpening(hit.openingId, wantEdit ? 'edit' : 'quick')
    return
  }
  const junction = hitElevationJunction(elev, cm)
  if (junction) {
    selectJunction(junction.id)
    return
  }
  const ridgeWall = hitElevationWall(elev, cm)
  if (ridgeWall?.ridge) {
    if (ridgeWall.endOn) {
      selectRidge(ridgeWall.wallId, ridgeWall.floorIndex)
      return
    }
    const ridgeJunction = nearestElevationRidgeJunction(elev, ridgeWall, cm)
    if (ridgeJunction) {
      selectJunction(ridgeJunction.id)
      return
    }
  }
  if (event.evt.ctrlKey || event.evt.metaKey) {
    const roof = hitElevationRoofPlane(elev, cm)
    if (roof) {
      selectRoof(roof.id, null)
      return
    }
    const wall = hitElevationWall(elev, cm)
    if (wall) {
      selectWallSettings(wall.wallId, wall.floorIndex)
      return
    }
    const slab = hitElevationBand(elev, cm, 'slab')
    if (slab && slab.floorIndex != null) {
      selectSlabSettings(slab.floorIndex)
      return
    }
  }
  selectOpening(null)
  clearSettings()
}

function onContentMove(event: { evt: MouseEvent }): void {
  if (canvasLocked.value) {
    if (ridgePlacePreview.value) {
      ridgePlacePreview.value = null
      snapGuide.value = null
    }
    if (roofPlaceDraft.value || roofPlacePreview.value) clearRoofPlaceDraft()
    return
  }
  const elev = elevation.value
  if (!elev) return
  const cm = clientToCm(event.evt.clientX, event.evt.clientY)
  if (!cm) {
    if (activeTool.value === 'add_ridge') {
      ridgePlacePreview.value = null
      snapGuide.value = null
    }
    return
  }
  const snapOff = event.evt.ctrlKey || event.evt.metaKey
  if (activeTool.value === 'add_ridge') {
    updateRidgePlacePreview(elev, cm, snapOff)
    return
  }
  if (activeTool.value === 'add_roof') {
    updateRoofPlacePreview(elev, cm, snapOff, snapOff)
    return
  }
  if (ridgePlacePreview.value) {
    ridgePlacePreview.value = null
    snapGuide.value = null
  }
  if (roofPlaceHover.value || roofPlacePreview.value) {
    roofPlaceHover.value = null
    roofPlacePreview.value = null
  }
}

const OPENING_MOVE_PENDING_PX = 4

let openingMovePending: {
  onMove: (event: PointerEvent) => void
  onUp: () => void
} | null = null

function cancelOpeningMovePending(): void {
  if (!openingMovePending) return
  window.removeEventListener('pointermove', openingMovePending.onMove)
  window.removeEventListener('pointerup', openingMovePending.onUp)
  openingMovePending = null
}

function startOpeningMovePending(
  openingId: string,
  rect: ElevationOpeningRect,
  cm: Point2D,
  event: { evt: MouseEvent },
): void {
  cancelOpeningMovePending()
  const startX = event.evt.clientX
  const startY = event.evt.clientY
  const onMove = (moveEvent: PointerEvent) => {
    if (
      Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < OPENING_MOVE_PENDING_PX
    ) {
      return
    }
    cancelOpeningMovePending()
    const nextCm = clientToCm(moveEvent.clientX, moveEvent.clientY) ?? cm
    beginOpeningDrag(openingId, 'move', nextCm, rect, rect.wallId, rect.floorIndex)
  }
  const onUp = () => cancelOpeningMovePending()
  openingMovePending = { onMove, onUp }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp, { once: true })
}

function beginOpeningDrag(
  openingId: string,
  mode: OpeningDrag['mode'],
  cm: Point2D,
  rect: ElevationRect,
  wallId: string,
  floorIndex: number,
): void {
  cancelOpeningMovePending()
  const located = findOpeningInPlan(props.plan, openingId)
  if (!located) return
  drag = {
    openingId,
    mode,
    startCm: cm,
    startRect: { x0: rect.x0, y0: rect.y0, x1: rect.x1, y1: rect.y1 },
    startOpening: { ...located.opening },
    wallId,
    floorIndex,
  }
  pushUndo()
  window.addEventListener('pointermove', onOpeningMove)
  window.addEventListener('pointerup', onOpeningUp, { once: true })
}

/** Vue `.stop` calls `e.stopPropagation()`; Konva events only have `cancelBubble` + `evt`. */
function stopKonvaBubble(event: { cancelBubble?: boolean; evt?: Event | null }): void {
  event.cancelBubble = true
  const native = event.evt
  if (native && typeof native.stopPropagation === 'function') native.stopPropagation()
}

function onOpeningDown(openingId: string, event: { evt: MouseEvent }): void {
  stopKonvaBubble(event)
  markOpeningPointerHandled()
  if (activeTool.value !== 'select' || canvasLocked.value) return
  const elev = elevation.value
  const cm = pointerCm(event)
  const wantEdit = isSettingsMod(event.evt, elevSettingsMod.value)
  let id = openingId
  if (elev && cm && selectedOpeningId.value) {
    const preferred = hitElevationOpening(elev, cm, selectedOpeningId.value)
    if (preferred && (wantEdit || preferred.openingId === selectedOpeningId.value)) {
      id = preferred.openingId
    }
  }
  const rect = elev?.openings.find((item) => item.openingId === id)
  if (!elev || !rect || !cm) return
  if (preciseDraft) {
    commitPreciseDraft()
    return
  }
  if (preciseIntent(event.evt)) {
    selectOpening(id, 'quick')
    beginPreciseOpening(id, cm, rect, rect.wallId, rect.floorIndex)
    return
  }
  const alreadyEdit =
    selectedOpeningId.value === id &&
    settingsTarget.value?.kind === 'opening' &&
    settingsTarget.value.mode === 'edit'
  if (!wantEdit && !alreadyEdit) {
    selectOpening(id, 'quick')
    return
  }
  selectOpening(id, 'edit')
  if (alreadyEdit) {
    beginOpeningDrag(id, 'move', cm, rect, rect.wallId, rect.floorIndex)
    return
  }
  startOpeningMovePending(id, rect, cm, event)
}

function onMoveHandleDown(event: { evt: MouseEvent }): void {
  event.evt.stopPropagation()
  if (activeTool.value !== 'select' || canvasLocked.value) return
  const rect = selectedOpeningRect.value
  const cm = pointerCm(event)
  if (!rect || !cm) return
  if (preciseDraft) {
    commitPreciseDraft()
    return
  }
  if (preciseIntent(event.evt)) {
    beginPreciseOpening(rect.openingId, cm, rect, rect.wallId, rect.floorIndex)
    return
  }
  beginOpeningDrag(rect.openingId, 'move', cm, rect, rect.wallId, rect.floorIndex)
}

function onHandleDown(side: ElevResizeSide, event: { evt: MouseEvent }): void {
  event.evt.stopPropagation()
  if (activeTool.value !== 'select' || canvasLocked.value) return
  if (settingsTarget.value?.kind !== 'opening' || settingsTarget.value.mode !== 'edit') return
  const rect = selectedOpeningRect.value
  const cm = pointerCm(event)
  if (!rect || !cm) return
  beginOpeningDrag(rect.openingId, side, cm, rect, rect.wallId, rect.floorIndex)
}

function cmToScreen(x: number, y: number): Point2D {
  const stage = layoutXform.value.toStagePoint(x, y)
  return {
    x: viewPosition.value.x + stage.x * viewScale.value,
    y: viewPosition.value.y + stage.y * viewScale.value,
  }
}

function screenToCm(screenX: number, screenY: number): Point2D {
  const local = {
    x: (screenX - viewPosition.value.x) / viewScale.value,
    y: (screenY - viewPosition.value.y) / viewScale.value,
  }
  return layoutXform.value.toCmPoint(local.x, local.y)
}

function elevationUnderlayLayoutFromProps(): UnderlayOriginLayout | null {
  if (!props.cmOrigin) return null
  if (!(props.pxPerMmX && props.pxPerMmX > 0) || !(props.pxPerMmY && props.pxPerMmY > 0)) {
    return null
  }
  const layout: UnderlayOriginLayout = {
    origin: { ...props.cmOrigin },
    pxPerMmX: props.pxPerMmX,
    pxPerMmY: props.pxPerMmY,
  }
  if (props.rotationDeg) layout.rotationDeg = props.rotationDeg
  if (props.flipX) layout.flipX = true
  return layout
}

const underlayMoveMode = computed({
  get: () => props.underlayMoveMode === true,
  set: (on: boolean) => emit('update:underlayMoveMode', on),
})

const underlayMove = useFmlPreviewUnderlayMove({
  hitTest: { clientToCm },
  underlayMoveMode,
  getUnderlayLayout: elevationUnderlayLayoutFromProps,
  setFmlNulpuntImageCm: () => undefined,
  syncLayoutToParent: (layout) => emit('update:underlayLayout', layout),
  beforeBegin: () => undefined,
})

const canvasLocked = computed(() => underlayMoveMode.value || props.rescaleMode === true)
const { spacePressed, onKeyDown: onSpaceKeyDown, onKeyUp: onSpaceKeyUp } = useStage()
const elevTouchEditor = computed(() => true)
const { useTouchNav } = useFmlTouchNav(elevTouchEditor)
const elevMoveMod = ref(false)
const elevSettingsMod = ref(false)
const elevAxisLockMod = ref(false)
const preciseTypeText = ref('')
const precisePreview = ref<{ a: Point2D; b: Point2D } | null>(null)

type PreciseDraft =
  | {
      kind: 'opening'
      startCm: Point2D
      hoverCm: Point2D
      startRect: ElevationRect
      openingId: string
      wallId: string
      floorIndex: number
    }
  | {
      kind: 'ridge'
      startCm: Point2D
      hoverCm: Point2D
      startRect: ElevationRect
      wallId: string
      floorIndex: number
      startWall: Wall
    }
  | {
      kind: 'junction'
      startCm: Point2D
      hoverCm: Point2D
      startHeightCm: number
      id: string
      floorIndex: number
      refs: Array<{ wallId: string; end: 'a' | 'b' }>
      ridge?: boolean
    }

let preciseDraft: PreciseDraft | null = null
let preciseIgnoreClick = false
let preciseOverrideCm: number | null = null

function preciseIntent(event: { shiftKey?: boolean }): boolean {
  return (
    resolveRelocatePointerIntent({
      touchNav: useTouchNav.value,
      moveMod: elevMoveMod.value,
      shiftKey: event.shiftKey === true,
    }) === 'precise'
  )
}

function clearPreciseDraftUi(): void {
  window.removeEventListener('pointermove', onPreciseMove)
  preciseDraft = null
  preciseOverrideCm = null
  preciseTypeText.value = ''
  precisePreview.value = null
}

function cancelPreciseDraft(): void {
  if (preciseDraft) undoEdit()
  clearPreciseDraftUi()
}

function markPreciseIgnoreClick(): void {
  preciseIgnoreClick = true
  window.addEventListener(
    'pointerup',
    () => {
      preciseIgnoreClick = false
    },
    { once: true },
  )
}

function beginPreciseListen(): void {
  markPreciseIgnoreClick()
  window.addEventListener('pointermove', onPreciseMove)
}
useFmlCanvasTouch({
  containerRef,
  enabled: useTouchNav,
  viewScale,
  viewPosition,
  getTool: () => activeTool.value,
  moveMod: elevMoveMod,
  blockEdit: () => canvasLocked.value,
  onEditPointerDown: (event) => {
    onContentClick({ evt: event, target: {} })
  },
  onEditPointerMove: (event) => {
    if (activeTool.value === 'add_ridge') {
      const elev = elevation.value
      const cm = clientToCm(event.clientX, event.clientY)
      if (elev && cm) updateRidgePlacePreview(elev, cm, event.ctrlKey || event.metaKey)
      return
    }
    if (activeTool.value === 'add_roof') {
      const elev = elevation.value
      const cm = clientToCm(event.clientX, event.clientY)
      const snapOff = event.ctrlKey || event.metaKey
      if (elev && cm) updateRoofPlacePreview(elev, cm, snapOff, snapOff)
      return
    }
    if (activeTool.value !== 'split') return
    const elev = elevation.value
    const cm = clientToCm(event.clientX, event.clientY)
    if (elev && cm) updateSplitDraft(elev, cm.x)
  },
})

watch(underlayMoveMode, (on) => {
  if (!on) return
  clearSplitDraft()
  ridgePlacePreview.value = null
  clearRoofPlaceDraft()
  activeTool.value = 'select'
})

function onHostPointerDown(event: PointerEvent): void {
  if (event.button !== 0) return
  const target = event.target as HTMLElement | null
  if (target?.closest(`${FML_PREVIEW_CHROME_SELECTOR}, .elev-groups`)) return
  if (spacePressed.value) {
    event.preventDefault()
    panZoom.beginPanDrag(event)
    return
  }
  if (props.rescaleMode || !underlayMoveMode.value) return
  event.preventDefault()
  underlayMove.beginUnderlayMoveDrag(event)
}

function onOpeningMove(event: PointerEvent): void {
  if (!drag) return
  const elev = elevation.value
  const wall = elev?.walls.find(
    (item) => item.wallId === drag!.wallId && item.floorIndex === drag!.floorIndex,
  )
  if (!elev || !wall) return
  const cm = clientToCm(event.clientX, event.clientY)
  if (!cm) return
  const next =
    drag.mode === 'move'
      ? translateElevationRect(drag.startRect, cm.x - drag.startCm.x, cm.y - drag.startCm.y)
      : resizeElevationRect(drag.startRect, drag.mode, cm)
  applyOpeningRect(drag.openingId, wall, next, event.ctrlKey || event.metaKey)
}

function onOpeningUp(): void {
  window.removeEventListener('pointermove', onOpeningMove)
  cancelOpeningMovePending()
  drag = null
  snapGuide.value = null
}

function applyPreciseOpening(draft: Extract<PreciseDraft, { kind: 'opening' }>): void {
  const elev = elevation.value
  const wall = elev?.walls.find(
    (item) => item.wallId === draft.wallId && item.floorIndex === draft.floorIndex,
  )
  if (!elev || !wall) return
  const offset = elevationPreciseOffset(
    draft.startCm,
    draft.hoverCm,
    preciseOverrideCm,
    elevAxisLockMod.value,
  )
  const next = translateElevationRect(draft.startRect, offset.x, offset.y)
  applyOpeningRect(draft.openingId, wall, next, false)
  const center = elevationRectCenter(next)
  precisePreview.value = {
    a: elevationRectCenter(draft.startRect),
    b: center,
  }
}

function applyPreciseRidge(draft: Extract<PreciseDraft, { kind: 'ridge' }>): void {
  const elev = elevation.value
  if (!elev) return
  const offset = elevationPreciseOffset(
    draft.startCm,
    draft.hoverCm,
    preciseOverrideCm,
    elevAxisLockMod.value,
  )
  const raw = translateElevationRect(draft.startRect, offset.x, offset.y)
  const snapped = snapElevationRidgeCenter(raw, collectElevationRidgeJunctionSnapXs(elev))
  snapGuide.value = snapped.guide.x != null ? snapped.guide : null
  commitPlan(
    applyElevationRidgeRect({
      plan: props.plan,
      axis: elev.axis,
      floorIndex: draft.floorIndex,
      wallId: draft.wallId,
      startWall: draft.startWall,
      startRect: draft.startRect,
      nextRect: snapped.rect,
    }),
  )
  precisePreview.value = {
    a: elevationRectCenter(draft.startRect),
    b: elevationRectCenter(snapped.rect),
  }
}

function applyPreciseJunction(draft: Extract<PreciseDraft, { kind: 'junction' }>): void {
  const delta = elevationPreciseHeightDelta(draft.startCm.y, draft.hoverCm.y, preciseOverrideCm)
  const min = draft.ridge ? 0 : 1
  const heightCm = Math.max(min, Math.min(800, Math.round(draft.startHeightCm + delta)))
  commitPlan(
    draft.ridge
      ? setPlanRidgeJunctionZ(props.plan, draft.floorIndex, draft.refs, heightCm)
      : setPlanJunctionHeight(props.plan, draft.floorIndex, draft.refs, heightCm),
  )
  precisePreview.value = {
    a: draft.startCm,
    b: { x: draft.startCm.x, y: draft.startCm.y - (heightCm - draft.startHeightCm) },
  }
}

function applyPreciseDraft(): void {
  if (!preciseDraft) return
  if (preciseDraft.kind === 'opening') applyPreciseOpening(preciseDraft)
  else if (preciseDraft.kind === 'ridge') applyPreciseRidge(preciseDraft)
  else applyPreciseJunction(preciseDraft)
}

function onPreciseMove(event: PointerEvent): void {
  if (!preciseDraft || preciseTypeText.value) return
  const cm = clientToCm(event.clientX, event.clientY)
  if (!cm) return
  preciseDraft.hoverCm = cm
  applyPreciseDraft()
}

function commitPreciseDraft(): boolean {
  if (!preciseDraft) return false
  const typed = preciseOverrideCm != null
  const minCm = elevationPreciseCommitMinCm(typed)
  const delta =
    preciseDraft.kind === 'junction'
      ? Math.abs(
          elevationPreciseHeightDelta(
            preciseDraft.startCm.y,
            preciseDraft.hoverCm.y,
            preciseOverrideCm,
          ),
        )
      : Math.hypot(
          elevationPreciseOffset(
            preciseDraft.startCm,
            preciseDraft.hoverCm,
            preciseOverrideCm,
            elevAxisLockMod.value,
          ).x,
          elevationPreciseOffset(
            preciseDraft.startCm,
            preciseDraft.hoverCm,
            preciseOverrideCm,
            elevAxisLockMod.value,
          ).y,
        )
  if (delta < minCm) {
    cancelPreciseDraft()
    return false
  }
  clearPreciseDraftUi()
  return true
}

function beginPreciseOpening(
  openingId: string,
  cm: Point2D,
  rect: ElevationRect,
  wallId: string,
  floorIndex: number,
): void {
  if (preciseDraft) {
    commitPreciseDraft()
    return
  }
  cancelOpeningMovePending()
  const located = findOpeningInPlan(props.plan, openingId)
  if (!located) return
  pushUndo()
  preciseDraft = {
    kind: 'opening',
    startCm: cm,
    hoverCm: cm,
    startRect: { x0: rect.x0, y0: rect.y0, x1: rect.x1, y1: rect.y1 },
    openingId,
    wallId,
    floorIndex,
  }
  beginPreciseListen()
}

function beginPreciseRidge(wall: ElevationWallRect, cm: Point2D): void {
  if (preciseDraft) {
    commitPreciseDraft()
    return
  }
  const floor = props.plan.floors[wall.floorIndex]
  const startWall = floor
    ? listRidgeWallsOnFloor(floor).find((item) => item.id === wall.wallId)
    : undefined
  if (!startWall) return
  selectRidge(wall.wallId, wall.floorIndex)
  pushUndo()
  const startRect = elevationRidgeRectOf(wall)
  preciseDraft = {
    kind: 'ridge',
    startCm: cm,
    hoverCm: cm,
    startRect,
    wallId: wall.wallId,
    floorIndex: wall.floorIndex,
    startWall,
  }
  beginPreciseListen()
}

function beginPreciseJunction(
  junction: { id: string; heightCm: number; floorIndex: number; ridge?: boolean },
  refs: Array<{ wallId: string; end: 'a' | 'b' }>,
  cm: Point2D,
): void {
  if (preciseDraft) {
    commitPreciseDraft()
    return
  }
  selectJunction(junction.id)
  pushUndo()
  preciseDraft = {
    kind: 'junction',
    startCm: cm,
    hoverCm: cm,
    startHeightCm: junction.heightCm,
    id: junction.id,
    floorIndex: junction.floorIndex,
    refs,
    ridge: junction.ridge,
  }
  beginPreciseListen()
}

type JunctionDrag = {
  id: string
  startY: number
  startHeightCm: number
  startBottomZ: number
  mode: WallElevationEditMode
  floorIndex: number
  refs: Array<{ wallId: string; end: 'a' | 'b' }>
  ridge?: boolean
}

let junctionDrag: JunctionDrag | null = null

function junctionBottomZOf(junction: {
  floorIndex: number
  refs: Array<{ wallId: string; end: 'a' | 'b' }>
}): number {
  const floor = props.plan.floors[junction.floorIndex]
  const floorH = floor?.height ?? 280
  const bottoms = junction.refs
    .map((ref) => {
      const wall = floor?.walls.find((item) => item.id === ref.wallId)
      if (!wall) return null
      return Math.round(wallEndpoint3D(wall, ref.end, floorH).z)
    })
    .filter((value): value is number => value != null)
  return bottoms[0] ?? 0
}

function beginJunctionDrag(
  junction: { id: string; heightCm: number; floorIndex: number; ridge?: boolean },
  refs: Array<{ wallId: string; end: 'a' | 'b' }>,
  startY: number,
  mode: WallElevationEditMode = 'height',
): void {
  selectJunction(junction.id)
  junctionDrag = {
    id: junction.id,
    startY,
    startHeightCm: junction.heightCm,
    startBottomZ: junction.ridge ? 0 : junctionBottomZOf({ floorIndex: junction.floorIndex, refs }),
    mode: junction.ridge ? 'height' : mode,
    floorIndex: junction.floorIndex,
    refs,
    ridge: junction.ridge,
  }
  pushUndo()
  window.addEventListener('pointermove', onJunctionMove)
  window.addEventListener('pointerup', onJunctionUp, { once: true })
}

function onJunctionDown(junctionId: string, event: { evt: MouseEvent }): void {
  event.evt.stopPropagation()
  if (activeTool.value !== 'select' || canvasLocked.value) return
  const elev = elevation.value
  const junction = elev?.junctions.find((item) => item.id === junctionId)
  const cm = pointerCm(event)
  if (!junction || !cm) return
  if (preciseDraft) {
    commitPreciseDraft()
    return
  }
  if (preciseIntent(event.evt)) {
    beginPreciseJunction(junction, junction.refs, cm)
    return
  }
  beginJunctionDrag(junction, junction.refs, cm.y, 'height')
}

function onJunctionElevHandleDown(mode: WallElevationEditMode, event: { evt: MouseEvent }): void {
  event.evt.stopPropagation()
  if (activeTool.value !== 'select' || canvasLocked.value) return
  const junction = settingsJunction.value
  const cm = pointerCm(event)
  if (!junction || junction.ridge || !cm) return
  beginJunctionDrag(junction, junction.refs, cm.y, mode)
}

function onRidgeWallDown(wall: ElevationWallRect, event: { evt: MouseEvent }): void {
  if (!wall.ridge || activeTool.value !== 'select' || canvasLocked.value) return
  const elev = elevation.value
  const cm = pointerCm(event)
  if (!elev || !cm) return
  if (wall.endOn) {
    event.evt.stopPropagation()
    if (preciseDraft) {
      commitPreciseDraft()
      return
    }
    if (preciseIntent(event.evt)) {
      beginPreciseRidge(wall, cm)
      return
    }
    beginRidgeRectDrag(wall, 'move', cm)
    return
  }
  const junction = nearestElevationRidgeJunction(elev, wall, cm)
  if (!junction) return
  event.evt.stopPropagation()
  if (preciseDraft) {
    commitPreciseDraft()
    return
  }
  if (preciseIntent(event.evt)) {
    beginPreciseJunction(
      junction,
      [
        { wallId: wall.wallId, end: 'a' },
        { wallId: wall.wallId, end: 'b' },
      ],
      cm,
    )
    return
  }
  beginJunctionDrag(
    junction,
    [
      { wallId: wall.wallId, end: 'a' },
      { wallId: wall.wallId, end: 'b' },
    ],
    cm.y,
  )
}

function onRidgeMoveHandleDown(event: { evt: MouseEvent }): void {
  event.evt.stopPropagation()
  if (activeTool.value !== 'select' || canvasLocked.value) return
  const wall = selectedRidgeWall.value
  const cm = pointerCm(event)
  if (!wall?.endOn || !cm) return
  if (preciseDraft) {
    commitPreciseDraft()
    return
  }
  if (preciseIntent(event.evt)) {
    beginPreciseRidge(wall, cm)
    return
  }
  beginRidgeRectDrag(wall, 'move', cm)
}

type RidgeRectDrag = {
  wallId: string
  floorIndex: number
  mode: 'move' | ElevResizeSide
  startCm: Point2D
  startRect: ElevationRect
  startWall: Wall
}

let ridgeRectDrag: RidgeRectDrag | null = null

function beginRidgeRectDrag(
  wall: ElevationWallRect,
  mode: RidgeRectDrag['mode'],
  cm: Point2D,
): void {
  const floor = props.plan.floors[wall.floorIndex]
  const startWall = floor
    ? listRidgeWallsOnFloor(floor).find((item) => item.id === wall.wallId)
    : undefined
  if (!startWall) return
  selectRidge(wall.wallId, wall.floorIndex)
  ridgeRectDrag = {
    wallId: wall.wallId,
    floorIndex: wall.floorIndex,
    mode,
    startCm: cm,
    startRect: elevationRidgeRectOf(wall),
    startWall,
  }
  pushUndo()
  window.addEventListener('pointermove', onRidgeRectMove)
  window.addEventListener('pointerup', onRidgeRectUp, { once: true })
}

function onRidgeHandleDown(side: ElevResizeSide, event: { evt: MouseEvent }): void {
  event.evt.stopPropagation()
  if (activeTool.value !== 'select' || canvasLocked.value) return
  const wall = selectedRidgeWall.value
  const cm = pointerCm(event)
  if (!wall || !cm) return
  beginRidgeRectDrag(wall, side, cm)
}

type WallElevHandleDrag = {
  wallId: string
  floorIndex: number
  mode: WallElevationEditMode
  startBottomZ: number
}

let wallElevDrag: WallElevHandleDrag | null = null
let wallElevDragStarted = false

function elevCmToLocalZ(floorIndex: number, elevY: number): number {
  const base = floorWallBaseWorldZ(props.plan, floorIndex)
  return -elevY - base
}

function onWallElevHandleDown(mode: WallElevationEditMode, event: { evt: MouseEvent }): void {
  event.evt.stopPropagation()
  if (activeTool.value !== 'select' || canvasLocked.value) return
  const target = settingsTarget.value
  if (target?.kind !== 'wall') return
  const floor = props.plan.floors[target.floorIndex]
  const wall = floor?.walls.find((item) => item.id === target.wallId)
  if (!floor || !wall) return
  const startBottomZ = wallUniformBottomZCm(wall, floor.height) ?? 0
  wallElevDrag = {
    wallId: target.wallId,
    floorIndex: target.floorIndex,
    mode,
    startBottomZ,
  }
  wallElevDragStarted = false
  window.addEventListener('pointermove', onWallElevHandleMove)
  window.addEventListener('pointerup', onWallElevHandleUp, { once: true })
}

function onWallElevHandleMove(event: PointerEvent): void {
  if (!wallElevDrag) return
  const elev = elevation.value
  const cm = clientToCm(event.clientX, event.clientY)
  if (!cm) return
  let y = cm.y
  if (elev && !(event.ctrlKey || event.metaKey)) {
    y = snapElevationY(
      y,
      collectElevationSegmentSnapYs(elev, { wallId: wallElevDrag.wallId }),
      ELEVATION_SEGMENT_SNAP_CM,
    )
    snapGuide.value = Math.abs(y - cm.y) < 1e-6 ? null : { y }
  } else {
    snapGuide.value = null
  }
  const localZ = Math.max(0, Math.round(elevCmToLocalZ(wallElevDrag.floorIndex, y)))
  let targetCm: number
  if (wallElevDrag.mode === 'height') {
    targetCm = Math.max(1, localZ - wallElevDrag.startBottomZ)
  } else {
    // lift + shift: pointer Y = nieuwe onderkant
    targetCm = localZ
  }
  if (!wallElevDragStarted) {
    pushUndo()
    wallElevDragStarted = true
  }
  commitPlan(
    setPlanWallElevationEdit(
      props.plan,
      wallElevDrag.wallId,
      wallElevDrag.floorIndex,
      wallElevDrag.mode,
      targetCm,
    ),
  )
}

function onWallElevHandleUp(): void {
  window.removeEventListener('pointermove', onWallElevHandleMove)
  wallElevDrag = null
  wallElevDragStarted = false
  snapGuide.value = null
}

function onRidgeRectMove(event: PointerEvent): void {
  if (!ridgeRectDrag) return
  const elev = elevation.value
  const cm = clientToCm(event.clientX, event.clientY)
  if (!elev || !cm) return
  const raw =
    ridgeRectDrag.mode === 'move'
      ? translateElevationRect(
          ridgeRectDrag.startRect,
          cm.x - ridgeRectDrag.startCm.x,
          cm.y - ridgeRectDrag.startCm.y,
        )
      : resizeElevationRect(
          ridgeRectDrag.startRect,
          ridgeRectDrag.mode,
          cm,
          ELEVATION_RIDGE_MIN_SIZE_CM,
          ELEVATION_RIDGE_MIN_SIZE_CM,
        )
  const snapOff = event.ctrlKey || event.metaKey
  const snapped =
    ridgeRectDrag.mode === 'move' && !snapOff
      ? snapElevationRidgeCenter(raw, collectElevationRidgeJunctionSnapXs(elev))
      : { rect: raw, guide: {} as ElevationSnapGuide }
  snapGuide.value = snapped.guide.x != null ? snapped.guide : null
  commitPlan(
    applyElevationRidgeRect({
      plan: props.plan,
      axis: elev.axis,
      floorIndex: ridgeRectDrag.floorIndex,
      wallId: ridgeRectDrag.wallId,
      startWall: ridgeRectDrag.startWall,
      startRect: ridgeRectDrag.startRect,
      nextRect: snapped.rect,
    }),
  )
}

function onRidgeRectUp(): void {
  window.removeEventListener('pointermove', onRidgeRectMove)
  ridgeRectDrag = null
  snapGuide.value = null
}

function onJunctionMove(event: PointerEvent): void {
  if (!junctionDrag) return
  const elev = elevation.value
  const cm = clientToCm(event.clientX, event.clientY)
  if (!cm) return
  let y = cm.y
  if (elev && !(event.ctrlKey || event.metaKey)) {
    y = snapElevationY(
      y,
      collectElevationSegmentSnapYs(elev, {
        junctionId: junctionDrag.id,
        wallIds: junctionDrag.refs.map((ref) => ref.wallId),
      }),
      ELEVATION_SEGMENT_SNAP_CM,
    )
    snapGuide.value = Math.abs(y - cm.y) < 1e-6 ? null : { y }
  } else {
    snapGuide.value = null
  }
  if (junctionDrag.ridge) {
    const min = 0
    const heightCm = Math.max(
      min,
      Math.min(800, Math.round(junctionDrag.startHeightCm - (y - junctionDrag.startY))),
    )
    commitPlan(
      setPlanRidgeJunctionZ(props.plan, junctionDrag.floorIndex, junctionDrag.refs, heightCm),
    )
    return
  }
  const localZ = Math.max(0, Math.round(elevCmToLocalZ(junctionDrag.floorIndex, y)))
  let targetCm: number
  if (junctionDrag.mode === 'height') {
    targetCm = Math.max(1, localZ - junctionDrag.startBottomZ)
  } else {
    targetCm = localZ
  }
  commitPlan(
    setPlanJunctionElevationEdit(
      props.plan,
      junctionDrag.floorIndex,
      junctionDrag.refs,
      junctionDrag.mode,
      targetCm,
    ),
  )
}

function onJunctionUp(): void {
  window.removeEventListener('pointermove', onJunctionMove)
  junctionDrag = null
  snapGuide.value = null
}

type RoofVertexDrag = {
  surfaceId: string
  vertexIndex: number
  floorIndex: number
}

let roofVertexDrag: RoofVertexDrag | null = null

function onRoofVertexDown(vertexIndex: number, event: { evt: MouseEvent }): void {
  event.evt.stopPropagation()
  if (activeTool.value !== 'select' || canvasLocked.value) return
  const plane = selectedRoofPlane.value
  const cm = pointerCm(event)
  if (!plane || !cm || !plane.points[vertexIndex]) return
  selectRoof(plane.id, vertexIndex)
  roofVertexDrag = {
    surfaceId: plane.id,
    vertexIndex,
    floorIndex: plane.floorIndex,
  }
  pushUndo()
  window.addEventListener('pointermove', onRoofVertexMove)
  window.addEventListener('pointerup', onRoofVertexUp, { once: true })
}

function onRoofVertexMove(event: PointerEvent): void {
  if (!roofVertexDrag) return
  const elev = elevation.value
  const cm = clientToCm(event.clientX, event.clientY)
  if (!elev || !cm) return
  let y = cm.y
  if (!(event.ctrlKey || event.metaKey)) {
    y = snapElevationY(
      y,
      collectElevationRoofSnapYs(elev, {
        planeId: roofVertexDrag.surfaceId,
        vertexIndex: roofVertexDrag.vertexIndex,
      }),
    )
    snapGuide.value = Math.abs(y - cm.y) < 1e-6 ? null : { y }
  } else {
    snapGuide.value = null
  }
  const z = -y - floorWallBaseWorldZ(props.plan, roofVertexDrag.floorIndex)
  commitPlan(
    setRidgeSurfaceVertexZ(props.plan, roofVertexDrag.surfaceId, roofVertexDrag.vertexIndex, z),
  )
}

function onRoofVertexUp(): void {
  window.removeEventListener('pointermove', onRoofVertexMove)
  roofVertexDrag = null
  snapGuide.value = null
}

function onKeydown(event: KeyboardEvent): void {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
    return
  if (preciseDraft) {
    if (event.key === 'Escape') {
      event.preventDefault()
      cancelPreciseDraft()
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      commitPreciseDraft()
      return
    }
    if (isDrawTypeLengthKey(event)) {
      event.preventDefault()
      const next = applyDrawTypeKey(preciseTypeText.value, event.key)
      if (next == null) return
      preciseTypeText.value = next
      preciseOverrideCm = parseDrawLengthDraftToCm(next, props.unit)
      applyPreciseDraft()
      return
    }
  }
  if (event.key === 'Escape') {
    if (props.rescaleMode) {
      emit('cancelRescale')
      return
    }
    if (underlayMoveMode.value) {
      underlayMoveMode.value = false
      return
    }
    if (splitDraft.value) {
      clearSplitDraft()
      return
    }
    if (ridgePlacePreview.value) {
      ridgePlacePreview.value = null
      snapGuide.value = null
    }
    if (roofPlaceDraft.value) {
      clearRoofPlaceDraft()
      return
    }
    activeTool.value = 'select'
    selectOpening(null)
    clearSettings()
  }
  if ((event.key === 'Delete' || event.key === 'Backspace') && selectedOpeningId.value) {
    event.preventDefault()
    deleteSelectedOpening()
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    if (event.shiftKey) redoEdit()
    else undoEdit()
  }
}

defineExpose({
  resetView,
  undoEdit,
  redoEdit,
  applyCornerMarkerModeFromSettings,
  pushUndo,
})
</script>

<template>
  <div
    ref="containerRef"
    class="elev-host"
    :class="{
      'elev-host--move-underlay': underlayMoveMode && !rescaleMode && !spacePressed,
      'elev-host--pan': spacePressed,
      'elev-host--split':
        (activeTool === 'split' || activeTool === 'add_ridge' || activeTool === 'add_roof') &&
        !canvasLocked,
      'elev-host--touch': useTouchNav,
    }"
    tabindex="0"
    @keydown="onKeydown"
    @pointerdown="onHostPointerDown"
    @wheel.prevent="panZoom.onWheel"
  >
    <FmlEditorTopbar
      :can-undo="undoStack.length > 0"
      :can-redo="redoStack.length > 0"
      :hint="t('viewer.elevationHint')"
      :fullscreen="canvasFullscreen"
      :show-canvas-grid="showCanvasGrid"
      :help-keys="[
        'viewer.elevationHint',
        'viewer.elevationOpeningHint',
        'viewer.elevationWallHint',
        'viewer.elevationRoofHint',
        'viewer.elevationSplitHint',
        'viewer.elevationJunctionHint',
        'viewer.elevationRidgeHint',
        'viewer.elevationPlanSidesHint',
        'result.toolbar.hintAddDoor',
        'result.toolbar.hintAddWindow',
        'toolbelt.fml.addRidge',
        'toolbelt.fml.addRoof',
      ]"
      @undo="undoEdit"
      @redo="redoEdit"
      @fit="resetView"
      @zoom-in="panZoom.zoomBy(1.15)"
      @zoom-out="panZoom.zoomBy(1 / 1.15)"
      @toggle-fullscreen="emit('update:canvasFullscreen', !canvasFullscreen)"
      @update:show-canvas-grid="onShowCanvasGrid"
    />
    <FmlEditorModifierRail
      v-if="useTouchNav && !canvasLocked"
      v-model:settings-mod="elevSettingsMod"
      v-model:axis-lock-mod="elevAxisLockMod"
      v-model:move-mod="elevMoveMod"
      hide-select-tools
    />
    <div class="elev-groups" role="tablist">
      <button
        v-for="group in groups"
        :key="group.id"
        type="button"
        class="elev-group-chip"
        :class="{ active: group.id === groupId }"
        @click="emit('update:groupId', group.id)"
      >
        {{ group.name }}
      </button>
    </div>
    <v-stage :config="{ width: stageSize.width, height: stageSize.height }">
      <v-layer>
        <v-group
          :config="{
            x: viewPosition.x,
            y: viewPosition.y,
            scaleX: viewScale,
            scaleY: viewScale,
            draggable: activeTool === 'select' && !settingsTarget && !canvasLocked && !spacePressed,
          }"
          @dragstart="panZoom.onGroupDragStart"
          @dragmove="panZoom.onGroupDragMove"
          @dragend="panZoom.onGroupDragEnd"
          @click="onContentClick"
          @mousemove="onContentMove"
        >
          <v-rect
            :config="{
              x: -20000,
              y: -20000,
              width: 40000,
              height: 40000,
              fill: '#ffffff',
              listening: true,
            }"
          />
          <v-group v-if="underlayConfig" :config="underlayConfig.flip">
            <v-group :config="underlayConfig.rotate">
              <v-image :config="underlayConfig.image" />
            </v-group>
          </v-group>
          <CanvasGuideGrid
            :visible="showCanvasGrid"
            :parent-transform="{ x: viewPosition.x, y: viewPosition.y, scale: viewScale }"
            :viewport-width="stageSize.width"
            :viewport-height="stageSize.height"
          />
          <v-group :config="{ opacity: contentOpacity, listening: true }">
            <template v-if="elevation">
              <v-group v-for="(band, index) in elevation.bands" :key="`band-${band.kind}-${index}`">
                <v-rect
                  :config="{
                    ...stageRect(band),
                    fill: bandBodyFill(band.kind),
                    stroke: architectStyle ? elevLineColor : undefined,
                    strokeWidth: architectStyle ? elevStroke : 0,
                    listening: false,
                  }"
                />
                <v-rect
                  v-if="
                    band.kind === 'slab' && band.floorIndex != null && slabSelected(band.floorIndex)
                  "
                  :config="{
                    ...stageRect(band),
                    fillEnabled: false,
                    stroke: '#f97316',
                    strokeWidth: elevHighlightStroke,
                    listening: false,
                    perfectDrawEnabled: false,
                  }"
                />
              </v-group>
              <v-group v-for="plane in elevation.roofPlanes" :key="`roof-${plane.id}`">
                <v-line
                  :config="{
                    points: stagePoly(
                      plane.fillPoints.length >= 3 ? plane.fillPoints : plane.points,
                    ),
                    closed: true,
                    fill: roofBodyFill(plane.color),
                    stroke: roofOuterStroke(),
                    strokeWidth: elevStroke,
                    perfectDrawEnabled: false,
                    opacity: roofSelected(plane.id) ? 1 : architectStyle ? 1 : 0.92,
                    listening: false,
                  }"
                />
                <v-line
                  v-if="roofSelected(plane.id)"
                  :config="{
                    points: stagePoly(
                      plane.fillPoints.length >= 3 ? plane.fillPoints : plane.points,
                    ),
                    closed: true,
                    fillEnabled: false,
                    stroke: '#f97316',
                    strokeWidth: elevHighlightStroke,
                    listening: false,
                    perfectDrawEnabled: false,
                  }"
                />
              </v-group>
              <v-group
                v-for="plane in elevationPlanes"
                :key="plane.key"
                :config="{ listening: true }"
              >
                <v-group
                  v-for="layer in plane.layers"
                  :key="`layer-${layer.wall.floorIndex}-${layer.wall.wallId}`"
                  :config="{ listening: true }"
                >
                  <v-path
                    :config="{
                      data: layer.fillPath,
                      fill: wallBodyFill(),
                      fillRule: 'evenodd',
                      strokeEnabled: false,
                      perfectDrawEnabled: false,
                      listening: true,
                    }"
                    @mousedown="onRidgeWallDown(layer.wall, $event)"
                  />
                  <v-line
                    :config="{
                      points: stageWallPoly(layer.wall),
                      closed: true,
                      fillEnabled: false,
                      stroke: wallOuterStroke(),
                      strokeWidth: elevStroke,
                      perfectDrawEnabled: false,
                      listening: false,
                    }"
                  />
                  <v-line
                    v-if="wallOrRidgeSelected(layer.wall)"
                    :config="{
                      points: stageWallPoly(layer.wall),
                      closed: true,
                      fillEnabled: false,
                      stroke: '#f97316',
                      strokeWidth: elevHighlightStroke,
                      listening: false,
                      perfectDrawEnabled: false,
                    }"
                  />
                  <v-line
                    v-for="stroke in layer.innerStrokes"
                    :key="stroke.key"
                    :config="{
                      points: stagePoints(stroke.a, stroke.b),
                      stroke: wallInnerStroke(),
                      dash: elevDash,
                      strokeWidth: elevStroke,
                      perfectDrawEnabled: false,
                      listening: false,
                    }"
                  />
                </v-group>
                <v-group
                  v-for="opening in plane.openings"
                  :key="opening.openingId"
                  :config="{ listening: true }"
                >
                  <v-line
                    v-if="opening.ghost.shaped"
                    :config="{
                      points: opening.ghost.points,
                      closed: true,
                      fill: openingGhostFill(opening.openingId, opening.type) ?? 'rgba(0,0,0,0)',
                      opacity: openingGhostOpacity(opening.openingId) || 1,
                      stroke:
                        selectedOpeningId === opening.openingId
                          ? '#ea580c'
                          : architectStyle
                            ? 'transparent'
                            : '#0c4a6e',
                      strokeWidth: elevStroke,
                      perfectDrawEnabled: false,
                      listening: true,
                    }"
                    @mousedown="onOpeningDown(opening.openingId, $event)"
                    @click="stopKonvaBubble"
                  />
                  <v-rect
                    v-else
                    :config="{
                      ...stageRect(opening),
                      fill: openingGhostFill(opening.openingId, opening.type) ?? 'rgba(0,0,0,0)',
                      opacity: openingGhostOpacity(opening.openingId) || 1,
                      stroke:
                        selectedOpeningId === opening.openingId
                          ? '#ea580c'
                          : architectStyle
                            ? 'transparent'
                            : '#0c4a6e',
                      strokeWidth: elevStroke,
                      perfectDrawEnabled: false,
                      listening: true,
                    }"
                    @mousedown="onOpeningDown(opening.openingId, $event)"
                    @click="stopKonvaBubble"
                  />
                  <v-line
                    v-if="selectedOpeningId === opening.openingId && opening.ghost.shaped"
                    :config="{
                      points: opening.ghost.points,
                      closed: true,
                      fillEnabled: false,
                      stroke: '#f97316',
                      strokeWidth: elevHighlightStroke,
                      listening: false,
                      perfectDrawEnabled: false,
                    }"
                  />
                  <v-rect
                    v-else-if="selectedOpeningId === opening.openingId"
                    :config="{
                      ...stageRect(opening),
                      fillEnabled: false,
                      stroke: '#f97316',
                      strokeWidth: elevHighlightStroke,
                      listening: false,
                      perfectDrawEnabled: false,
                    }"
                  />
                </v-group>
                <v-group
                  v-for="(transom, index) in plane.transoms"
                  :key="`transom-${transom.openingId}-${index}`"
                >
                  <v-rect
                    v-if="architectStyle"
                    :config="{
                      ...stageRect(transom),
                      fill: ARCHITECT_AREA_FILL,
                      strokeEnabled: false,
                      listening: true,
                      perfectDrawEnabled: false,
                    }"
                    @mousedown="onOpeningDown(transom.openingId, $event)"
                  />
                  <v-rect
                    v-else
                    :config="{
                      ...stageRect(transom),
                      fill: FACTORY_OPENING_COLORS.bovenlicht,
                      stroke: '#14532d',
                      strokeWidth: elevStroke,
                      opacity: 0.22,
                      perfectDrawEnabled: false,
                      listening: false,
                    }"
                  />
                  <v-rect
                    v-if="selectedOpeningId === transom.openingId"
                    :config="{
                      ...stageRect(transom),
                      fillEnabled: false,
                      stroke: '#f97316',
                      strokeWidth: elevHighlightStroke,
                      listening: false,
                      perfectDrawEnabled: false,
                    }"
                  />
                </v-group>
                <v-group
                  v-for="glyph in plane.glyphs"
                  :key="glyph.id"
                  :config="{ listening: false }"
                >
                  <v-line
                    v-for="poly in glyph.polys"
                    :key="`${glyph.id}-${poly.key}`"
                    :config="{
                      points: poly.points,
                      closed: poly.closed,
                      fill: glyphPolyFill(poly.role, glyph.transom, glyph.type, poly.fill),
                      stroke: glyphStrokeColor(glyph.transom),
                      strokeWidth: poly.role === 'handle' ? elevStrokeHeavy : elevStroke,
                      opacity: architectStyle ? 1 : glyphOpacity(poly.role, glyph.transom),
                      perfectDrawEnabled: false,
                      listening: false,
                    }"
                  />
                  <v-circle
                    v-for="circle in glyph.circles"
                    :key="`${glyph.id}-${circle.key}`"
                    :config="{
                      x: circle.x,
                      y: circle.y,
                      radius: circle.radius,
                      fill: glyphPolyFill(circle.role, glyph.transom, glyph.type, circle.fill),
                      stroke: glyphStrokeColor(glyph.transom),
                      strokeWidth: circle.role === 'handle' ? elevStrokeHeavy : elevStroke,
                      opacity: architectStyle ? 1 : glyphOpacity(circle.role, glyph.transom),
                      perfectDrawEnabled: false,
                      listening: false,
                    }"
                  />
                </v-group>
                <v-group
                  v-for="layer in plane.endOnRidges"
                  :key="`ridge-end-${layer.wall.floorIndex}-${layer.wall.wallId}`"
                  :config="{ listening: true }"
                >
                  <v-path
                    :config="{
                      data: layer.fillPath,
                      fill: ridgeEndFill(),
                      fillRule: 'evenodd',
                      strokeEnabled: false,
                      perfectDrawEnabled: false,
                      listening: true,
                    }"
                    @mousedown="onRidgeWallDown(layer.wall, $event)"
                  />
                  <v-line
                    :config="{
                      points: stageWallPoly(layer.wall),
                      closed: true,
                      fillEnabled: false,
                      stroke: wallOuterStroke(),
                      strokeWidth: elevStroke,
                      perfectDrawEnabled: false,
                      listening: false,
                    }"
                  />
                  <v-line
                    v-if="wallOrRidgeSelected(layer.wall)"
                    :config="{
                      points: stageWallPoly(layer.wall),
                      closed: true,
                      fillEnabled: false,
                      stroke: '#f97316',
                      strokeWidth: elevHighlightStroke,
                      listening: false,
                      perfectDrawEnabled: false,
                    }"
                  />
                </v-group>
              </v-group>
              <v-group v-for="junction in elevation.junctions" :key="junction.id">
                <v-line
                  v-if="junctionSelected(junction.id)"
                  :config="{
                    points: stagePoints(
                      { x: junction.x, y: junction.yBot },
                      { x: junction.x, y: junction.yTop },
                    ),
                    stroke: '#f97316',
                    strokeWidth: elevHighlightStroke,
                    listening: false,
                    perfectDrawEnabled: false,
                  }"
                />
                <v-line
                  :config="{
                    points: stagePoints(
                      { x: junction.x, y: junction.yBot },
                      { x: junction.x, y: junction.yTop },
                    ),
                    stroke: junctionSelected(junction.id) ? '#f97316' : '#334155',
                    dash: elevDash,
                    strokeWidth: elevStroke,
                    perfectDrawEnabled: false,
                    listening: true,
                  }"
                  @mousedown="onJunctionDown(junction.id, $event)"
                />
              </v-group>
              <v-circle
                v-for="junction in elevation.junctions"
                :key="`jh-${junction.id}`"
                :config="{
                  ...(() => {
                    const stage = layoutXform.toStagePoint(junction.x, junction.yTop)
                    return { x: stage.x, y: stage.y }
                  })(),
                  radius: (junctionSelected(junction.id) ? 6 : 4) / viewScale,
                  fill: '#fff',
                  stroke: junctionSelected(junction.id) ? '#f97316' : '#334155',
                  strokeWidth: elevStroke,
                  listening: true,
                }"
                @mousedown="onJunctionDown(junction.id, $event)"
              />
              <v-circle
                v-for="handle in junctionElevationHandles"
                :key="`junc-elev-${handle.mode}`"
                :config="{
                  ...(() => {
                    const stage = layoutXform.toStagePoint(handle.x, handle.y)
                    return { x: stage.x, y: stage.y }
                  })(),
                  radius: (handle.mode === 'shift' ? 6 : 5) / viewScale,
                  fill: '#fff',
                  stroke: '#f97316',
                  strokeWidth: 2 / viewScale,
                  listening: true,
                }"
                @mousedown="onJunctionElevHandleDown(handle.mode, $event)"
              />
              <v-line
                v-if="snapGuide?.y != null"
                :config="{
                  points: (() => {
                    const a = layoutXform.toStagePoint(elevation.bounds.x0, snapGuide.y)
                    const b = layoutXform.toStagePoint(elevation.bounds.x1, snapGuide.y)
                    return [a.x, a.y, b.x, b.y]
                  })(),
                  stroke: '#2563eb',
                  dash: [6 / viewScale, 4 / viewScale],
                  strokeWidth: 1 / viewScale,
                  listening: false,
                }"
              />
              <v-line
                v-if="snapGuide?.x != null"
                :config="{
                  points: (() => {
                    const a = layoutXform.toStagePoint(snapGuide.x, elevation.bounds.y0)
                    const b = layoutXform.toStagePoint(snapGuide.x, elevation.bounds.y1)
                    return [a.x, a.y, b.x, b.y]
                  })(),
                  stroke: '#2563eb',
                  dash: [6 / viewScale, 4 / viewScale],
                  strokeWidth: 1 / viewScale,
                  listening: false,
                }"
              />
              <v-line
                v-if="splitDraft"
                :config="{
                  points: stagePoints(
                    { x: splitDraft.x, y: splitDraft.y0 },
                    { x: splitDraft.x, y: splitDraft.y1 },
                  ),
                  stroke: '#f97316',
                  strokeWidth: elevStrokeHeavy,
                  listening: false,
                }"
              />
              <v-rect
                v-if="ridgePlacePreview"
                :config="{
                  ...stageRect(ridgePlacePreview.rect),
                  fill: 'rgba(123, 142, 166, 0.35)',
                  stroke: '#f97316',
                  strokeWidth: elevStrokeHeavy,
                  dash: elevDash,
                  listening: false,
                  perfectDrawEnabled: false,
                }"
              />
              <v-line
                v-if="roofPlaceDraft && roofPlaceHover"
                :config="{
                  points: stagePoints(roofPlaceDraft.eaveElev, roofPlaceHover),
                  stroke: '#f97316',
                  strokeWidth: elevStroke,
                  dash: elevDash,
                  listening: false,
                  perfectDrawEnabled: false,
                }"
              />
              <v-circle
                v-if="roofPlaceDraft"
                :config="{
                  ...(() => {
                    const stage = layoutXform.toStagePoint(
                      roofPlaceDraft.eaveElev.x,
                      roofPlaceDraft.eaveElev.y,
                    )
                    return { x: stage.x, y: stage.y }
                  })(),
                  radius: 5 / viewScale,
                  fill: '#f97316',
                  stroke: '#fff',
                  strokeWidth: 1.5 / viewScale,
                  listening: false,
                }"
              />
              <v-circle
                v-else-if="activeTool === 'add_roof' && roofPlaceHover"
                :config="{
                  ...(() => {
                    const stage = layoutXform.toStagePoint(roofPlaceHover.x, roofPlaceHover.y)
                    return { x: stage.x, y: stage.y }
                  })(),
                  radius: 5 / viewScale,
                  fill: 'rgba(249, 115, 22, 0.85)',
                  stroke: '#fff',
                  strokeWidth: 1.5 / viewScale,
                  listening: false,
                }"
              />
              <v-line
                v-if="roofPlacePreview"
                :config="{
                  points: stagePoly(roofPlacePreview.elevPoints),
                  closed: true,
                  fill: 'rgba(100, 116, 139, 0.35)',
                  stroke: '#f97316',
                  strokeWidth: elevStrokeHeavy,
                  dash: elevDash,
                  listening: false,
                  perfectDrawEnabled: false,
                }"
              />
              <v-circle
                v-for="(point, index) in selectedRoofPlane?.points ?? []"
                :key="`roof-v-${selectedRoofPlane?.id}-${index}`"
                :config="{
                  ...(() => {
                    const stage = layoutXform.toStagePoint(point.x, point.y)
                    return { x: stage.x, y: stage.y }
                  })(),
                  radius:
                    (settingsTarget?.kind === 'roof' && settingsTarget.vertexIndex === index
                      ? 6
                      : 4.5) / viewScale,
                  fill:
                    settingsTarget?.kind === 'roof' && settingsTarget.vertexIndex === index
                      ? '#b45309'
                      : '#f97316',
                  stroke: '#fff',
                  strokeWidth: 1.5 / viewScale,
                  listening: true,
                }"
                @mousedown="onRoofVertexDown(index, $event)"
              />
              <v-circle
                v-for="handle in wallElevationHandles"
                :key="`wall-elev-${handle.mode}`"
                :config="{
                  ...(() => {
                    const stage = layoutXform.toStagePoint(handle.x, handle.y)
                    return { x: stage.x, y: stage.y }
                  })(),
                  radius: (handle.mode === 'shift' ? 6 : 5) / viewScale,
                  fill: '#fff',
                  stroke: '#f97316',
                  strokeWidth: 2 / viewScale,
                  listening: true,
                }"
                @mousedown="onWallElevHandleDown(handle.mode, $event)"
              />
              <v-circle
                v-if="ridgeCenter"
                :config="{
                  ...(() => {
                    const stage = layoutXform.toStagePoint(ridgeCenter.x, ridgeCenter.y)
                    return { x: stage.x, y: stage.y }
                  })(),
                  radius: 6 / viewScale,
                  fill: '#f97316',
                  stroke: '#fff',
                  strokeWidth: 2 / viewScale,
                  listening: true,
                }"
                @mousedown="onRidgeMoveHandleDown"
              />
              <v-circle
                v-for="handle in ridgeHandles"
                :key="`ridge-handle-${handle.side}`"
                :config="{
                  ...(() => {
                    const stage = layoutXform.toStagePoint(handle.x, handle.y)
                    return { x: stage.x, y: stage.y }
                  })(),
                  radius: 6 / viewScale,
                  fill: '#fff',
                  stroke: '#f97316',
                  strokeWidth: 2 / viewScale,
                  listening: true,
                }"
                @mousedown="onRidgeHandleDown(handle.side, $event)"
              />
              <v-circle
                v-if="openingMoveHandle"
                :config="{
                  ...(() => {
                    const stage = layoutXform.toStagePoint(openingMoveHandle.x, openingMoveHandle.y)
                    return { x: stage.x, y: stage.y }
                  })(),
                  radius: 6 / viewScale,
                  fill: '#f97316',
                  stroke: '#fff',
                  strokeWidth: 2 / viewScale,
                  listening: true,
                }"
                @mousedown="onMoveHandleDown"
              />
              <v-circle
                v-for="handle in openingHandles"
                :key="`handle-${handle.side}`"
                :config="{
                  ...(() => {
                    const stage = layoutXform.toStagePoint(handle.x, handle.y)
                    return { x: stage.x, y: stage.y }
                  })(),
                  radius: 6 / viewScale,
                  fill: '#fff',
                  stroke: '#f97316',
                  strokeWidth: 2 / viewScale,
                  listening: true,
                }"
                @mousedown="onHandleDown(handle.side, $event)"
              />
              <v-text
                v-for="mark in planSideLabelMarks"
                :key="`plan-side-${mark.key}`"
                :config="mark.config"
              />
            </template>
          </v-group>
        </v-group>
      </v-layer>
    </v-stage>
    <FmlPreviewMeasureOverlay
      :width="stageSize.width"
      :height="stageSize.height"
      :lines="elevationMeasureLines"
      :preview="precisePreview"
      :hover="null"
      :to-screen="cmToScreen"
      :unit="unit"
    />
    <FmlRescaleOverlay
      v-if="rescaleMode && rescaleState"
      :state="rescaleState"
      :walls="[]"
      :width="stageSize.width"
      :height="stageSize.height"
      :to-screen="cmToScreen"
      :to-cm="screenToCm"
      :space-pressed="spacePressed"
      @update-state="emit('updateRescaleState', $event)"
    />
    <div
      ref="elevDockRef"
      class="canvas-toolbelt-dock"
      data-fit-chrome="bottom"
      @pointerdown.stop
      @mousedown.stop
      @mousemove.stop
      @click.stop
    >
      <div class="canvas-toolbelt-dock__row">
        <div
          v-show="!elevSettingsOpen"
          class="canvas-toolbelt-dock__section canvas-toolbelt-dock__section--face"
        >
          <CanvasToolbelt
            embedded
            :tools="elevLibraryTools"
            :active-tool="activeTool === 'select' ? null : activeTool"
            :show-undo="false"
            @update:active-tool="onElevToolChange"
          />
        </div>
        <template v-if="elevSettingsOpen">
          <div class="canvas-toolbelt-dock__sep" aria-hidden="true" />
          <div class="canvas-toolbelt-dock__section canvas-toolbelt-dock__section--fml">
            <span v-if="settingsRoof && settingsRoof.heightCm == null" class="fml-toolbelt__meta">
              {{ t('viewer.elevationRoof', { name: settingsRoof.name }) }}
            </span>
            <FmlElevationHeightOnlyFields
              v-else-if="settingsRoof && settingsRoof.heightCm != null"
              :unit="unit"
              :title="t('viewer.elevationRoof', { name: settingsRoof.name })"
              :height-cm="settingsRoof.heightCm"
              :min="0"
              :max="800"
              @height="commitRoofVertexHeight"
            />
            <FmlElevationHeightOnlyFields
              v-else-if="settingsRidge"
              :unit="unit"
              :title="t('viewer.elevationRidgeZ', { name: settingsRidge.name })"
              :height-cm="settingsRidge.heightCm"
              :min="0"
              :max="800"
              @height="commitRidgeHeight"
            />
            <FmlElevationHeightOnlyFields
              v-else-if="settingsJunction"
              :unit="unit"
              :title="
                settingsJunction.ridge
                  ? t('viewer.elevationRidgeZ', { name: settingsJunction.name })
                  : t('viewer.elevationJunction', { name: settingsJunction.name })
              "
              :height-cm="settingsJunction.heightCm"
              :bottom-z-cm="settingsJunction.bottomZCm"
              :show-bottom-z="!settingsJunction.ridge"
              :min="settingsJunction.ridge ? 0 : 1"
              :max="800"
              @height="commitJunctionHeight"
              @bottom-z="commitJunctionBottomZ"
            />
            <FmlElevationHeightOnlyFields
              v-else-if="settingsWall"
              :unit="unit"
              :title="t('viewer.elevationWall', { name: settingsWall.name })"
              :height-cm="settingsWall.heightCm"
              :bottom-z-cm="settingsWall.bottomZCm"
              show-bottom-z
              :min="1"
              :max="800"
              @height="commitWallHeight"
              @bottom-z="commitWallBottomZ"
            />
            <FmlElevationHeightOnlyFields
              v-else-if="settingsSlab"
              :unit="unit"
              :title="t('viewer.elevationSlab', { name: settingsSlab.name })"
              :height-cm="settingsSlab.heightCm"
              :min="0"
              :max="200"
              @height="commitSlabHeight"
            />
            <FmlElevationOpeningQuickFields
              v-else-if="settingsTarget?.kind === 'opening' && selectedOpening"
              :type="selectedOpening.opening.type"
              :subtype="openingSubtype"
              :hinge-at-start="selectedOpeningHingeAtStart"
              :swing-right="selectedOpeningSwingRight"
              :show-door-buttons="settingsTarget.mode !== 'edit'"
              @subtype="commitOpeningSubtype"
              @copy="copySelectedOpening"
              @toggle-hinge="toggleSelectedOpeningHinge"
              @toggle-swing="toggleSelectedOpeningSwing"
            />
            <FmlElevationOpeningFields
              v-if="
                settingsTarget?.kind === 'opening' &&
                settingsTarget.mode === 'edit' &&
                selectedOpening
              "
              :unit="unit"
              :type="selectedOpening.opening.type"
              :width-cm="selectedOpening.opening.width"
              :height-cm="resolveOpeningHeight(selectedOpening.opening)"
              :sill-z-cm="
                selectedOpening.opening.type === 'window'
                  ? resolveWindowSillZ(selectedOpening.opening)
                  : Math.round(selectedOpening.opening.z ?? 0)
              "
              :bovenlicht="selectedOpeningBovenlicht"
              :bovenlicht-height-cm="selectedOpeningBovenlichtHeightCm"
              :bovenlicht-gap-cm="selectedOpeningBovenlichtGapCm"
              :bovenlicht-packed="bovenlichtPacked"
              :hinge-at-start="selectedOpeningHingeAtStart"
              :swing-right="selectedOpeningSwingRight"
              :show-mirror-button="openingSubtype === 'triangle'"
              @width="(cm) => commitSelectedField('width', cm)"
              @height="(cm) => commitSelectedField('height', cm)"
              @sill="(cm) => commitSelectedField('sill', cm)"
              @bovenlicht="commitSelectedBovenlicht"
              @bovenlicht-height="commitSelectedBovenlichtHeight"
              @bovenlicht-gap="commitSelectedBovenlichtGap"
              @toggle-hinge="toggleSelectedOpeningHinge"
              @toggle-swing="toggleSelectedOpeningSwing"
              @remove="deleteSelectedOpening"
            />
            <FmlOpeningAddToolFields
              v-else-if="activeTool === 'add_door' || activeTool === 'add_window'"
              v-model:add-door-subtype="addDoorSubtype"
              v-model:add-door-width-cm="addDoorWidthCm"
              v-model:add-door-sill-z-cm="addDoorSillZCm"
              v-model:add-window-subtype="addWindowSubtype"
              v-model:add-window-width-cm="addWindowWidthCm"
              v-model:add-window-sill-z-cm="addWindowSillZCm"
              v-model:add-window-height-cm="addWindowHeightCm"
              :unit="unit"
              :active-tool="activeTool"
            />
            <button
              type="button"
              class="canvas-toolbelt__btn"
              :title="t('result.toolbar.deactivateDrawTool')"
              :aria-label="t('result.toolbar.deactivateDrawTool')"
              @click="closeElevToolbelt()"
            >
              <ToolbeltIcon name="clear" />
            </button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.elev-host {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  background: #fff;
  outline: none;
}

.elev-host--move-underlay,
.elev-host--pan {
  cursor: grab;
}

.elev-host--split {
  cursor: crosshair;
}

.elev-host--touch {
  touch-action: none;
}

.elev-host--move-underlay:active,
.elev-host--pan:active {
  cursor: grabbing;
}

.elev-groups {
  position: absolute;
  top: 48px;
  left: 12px;
  z-index: 12;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.elev-group-chip {
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}

.elev-group-chip.active {
  background: #0f172a;
  color: #fff;
  border-color: #0f172a;
}
</style>
