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
  projectFacadeElevation,
  type ElevationBovenlichtDefaults,
  type ElevationOpeningRect,
  type ElevationRect,
  type ElevationWallRect,
  type FacadeElevation,
} from '@/core/fml/facade-elevation'
import {
  collectElevationRoofSnapYs,
  collectElevationSplitSnapXs,
  collectElevationWallSnapXs,
  elevationSplitPreviewAt,
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
import { glyphFromElevationRect } from '@/core/fml/elevation-opening-symbol'
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
  clampElevationOpeningResize,
  clampOpeningPatchKeepOppositeEdge,
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
  setPlanJunctionHeight,
  setPlanWallHeight,
  splitPlanWallAtT,
  updatePlanOpening,
} from '@/core/fml/elevation-openings'
import { wallEndpointHeightCm, wallUniformHeightCm } from '@/core/fml/wall-endpoint-height'
import {
  clampOpeningHeight,
  clampOpeningSillZ,
  clampOpeningWidth,
  clampWindowOpeningHeight,
  resolveOpeningHeight,
  resolveWindowSillZ,
} from '@/ui/components/fml-preview-openings'
import { loadImage } from '@/platform/image'
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
import { useFmlElevationPointer } from '@/ui/composables/fml-preview/useFmlElevationPointer'
import { useFmlCanvasTouch, useFmlTouchNav } from '@/ui/composables/fml-preview/useFmlCanvasTouch'
import { buildOpeningFromPreset } from '@/core/fml/opening-from-preset'
import { splitWallAtT } from '@/ui/components/fml-preview-wall-edit'
import { useChromeFitScale } from '@/ui/composables/useChromeFitScale'
import FmlEditorTopbar from './FmlEditorTopbar.vue'
import FmlElevationHeightOnlyFields from './FmlElevationHeightOnlyFields.vue'
import FmlElevationOpeningFields from './FmlElevationOpeningFields.vue'
import FmlElevationOpeningQuickFields from './FmlElevationOpeningQuickFields.vue'
import FmlOpeningAddToolFields from './FmlOpeningAddToolFields.vue'
import FmlRescaleOverlay from './FmlRescaleOverlay.vue'
import CanvasToolbelt from './canvas/CanvasToolbelt.vue'
import type { ToolbeltItem } from './canvas/canvas-toolbelt.types'
import ToolbeltIcon from './canvas/ToolbeltIcon.vue'
import { FACTORY_OPENING_COLORS } from '@/ui/composables/settings/opening-display-colors'
import './canvas/canvas-toolbelt.css'

type ElevTool = 'select' | 'add_door' | 'add_window' | 'split'

const props = withDefaults(
  defineProps<{
    plan: FloorPlan
    groupId: string
    underlaySrc?: string | null
    underlayWidthPx?: number
    underlayHeightPx?: number
    underlayOpacity?: number
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
  }>(),
  {
    underlaySrc: null,
    underlayOpacity: 0.45,
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

const elevLibraryTools = computed<ToolbeltItem[]>(() => [
  { id: 'add_door', icon: 'door', label: t('toolbelt.fml.addDoor') },
  { id: 'add_window', icon: 'window', label: t('toolbelt.fml.addWindow') },
  { id: 'split', icon: 'split', label: t('result.toolbar.splitWall') },
])
const isPanDragging = ref(false)
const activeTool = ref<ElevTool>('select')
const addDoorSubtype = ref<DoorAddSubtype>('standard')
const addDoorWidthCm = ref(resolveDoorAddPreset('standard').defaultWidthCm)
const addDoorHeightCm = ref(DEFAULT_FML_DOOR_HEIGHT_CM)
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
  if (!rect || settingsTarget.value?.kind !== 'opening' || settingsTarget.value.mode !== 'edit') {
    return null
  }
  return elevationRectCenter(rect)
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
  return { ...target, name: floor.name, heightCm }
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
  return {
    ...junction,
    name: floor?.name ?? '',
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
        minX: bounds.x0,
        minY: bounds.y0,
        spanX: Math.max(1, bounds.x1 - bounds.x0),
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

onMounted(() => mountResizeObserver())
onBeforeUnmount(() => {
  unmountResizeObserver()
  cancelOpeningMovePending()
  window.removeEventListener('pointermove', onRoofVertexMove)
  window.removeEventListener('pointerup', onRoofVertexUp)
  window.removeEventListener('pointermove', onJunctionMove)
  window.removeEventListener('pointermove', onSplitMove)
  window.removeEventListener('pointermove', onRidgeRectMove)
})

watch(
  () => props.groupId,
  () => {
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
    openings: plane.openings,
    transoms: plane.transoms,
    glyphs: glyphs.filter((item) =>
      plane.walls.some(
        (wall) => wall.wallId === item.wallId && wall.floorIndex === item.floorIndex,
      ),
    ),
  }))
})

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

function toggleOpeningTool(tool: 'add_door' | 'add_window' | 'split'): void {
  clearSplitDraft()
  if (activeTool.value === tool) {
    activeTool.value = 'select'
    return
  }
  selectOpening(null)
  activeTool.value = tool
}

function onElevToolChange(id: string | null): void {
  if (id === 'add_door' || id === 'add_window' || id === 'split') {
    toggleOpeningTool(id)
    return
  }
  clearSplitDraft()
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
  const z = type === 'door' ? 0 : clampOpeningSillZ(addWindowSillZCm.value)
  if (type === 'window') {
    addWindowSillZCm.value = z
    addWindowHeightCm.value = height
  } else {
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
  const raw =
    snapOff || !elev
      ? { rect, guide: {} as ElevationSnapGuide }
      : snapElevationRect(rect, drag?.mode === 'move' || !drag ? 'move' : drag.mode, {
          xs: [...openingTargets.xs, ...collectElevationWallSnapXs(elev.walls)],
          ys: openingTargets.ys,
        })
  snapGuide.value = raw.guide.x != null || raw.guide.y != null ? raw.guide : null
  let nextRect = raw.rect
  const floorWalls = props.plan.floors[wall.floorIndex]?.walls ?? []
  const xBounds = elevationCollinearXBounds(elev?.walls ?? [wall], wall, floorWalls)
  if (drag && drag.mode !== 'move') {
    nextRect = clampElevationOpeningResize(wall, nextRect, drag.mode, undefined, undefined, xBounds)
  }
  const hostElev = pickElevationWallForOpeningX(
    elev?.walls ?? [wall],
    wall,
    (nextRect.x0 + nextRect.x1) / 2,
    floorWalls,
  )
  let nextId = openingId
  let nextPlan = props.plan
  if (hostElev.wallId !== wall.wallId) {
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
  let patch = openingPatchFromElevationRect(
    hostElev,
    nextRect,
    floorWallBaseWorldZ(nextPlan, hostElev.floorIndex),
  )
  if (drag && drag.mode !== 'move') {
    const floor = nextPlan.floors[hostElev.floorIndex]
    const host = findOpeningInPlan(nextPlan, nextId)?.wall
    if (floor && host) {
      patch = clampOpeningPatchKeepOppositeEdge(
        host,
        drag.startOpening,
        patch,
        drag.mode,
        floor.height,
        floor.walls,
      )
    }
  }
  commitPlan(updatePlanOpening(nextPlan, nextId, patch))
}

function clearSettings(): void {
  settingsTarget.value = null
}

function selectOpening(openingId: string | null, mode: 'quick' | 'edit' | null = null): void {
  selectedOpeningId.value = openingId
  settingsTarget.value = mode && openingId != null ? { kind: 'opening', id: openingId, mode } : null
}

function closeElevToolbelt(): void {
  activeTool.value = 'select'
  selectOpening(null)
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
    addDoorSubtype.value = subtype
    queueMicrotask(() => {
      addDoorWidthCm.value = width
      addDoorHeightCm.value = doorHeight
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

function onContentClick(event: {
  evt: MouseEvent
  target?: {
    getStage?: () => { getPointerPosition?: () => { x: number; y: number } | null } | null
  }
}): void {
  if (isPanDragging.value || canvasLocked.value) return
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
  const hit = hitElevationOpening(elev, cm)
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

function onOpeningDown(openingId: string, event: { evt: MouseEvent }): void {
  event.evt.stopPropagation()
  if (activeTool.value !== 'select' || canvasLocked.value) return
  const elev = elevation.value
  const rect = elev?.openings.find((item) => item.openingId === openingId)
  const cm = pointerCm(event)
  if (!elev || !rect || !cm) return
  const wantEdit = event.evt.ctrlKey || event.evt.metaKey
  const alreadyEdit =
    selectedOpeningId.value === openingId &&
    settingsTarget.value?.kind === 'opening' &&
    settingsTarget.value.mode === 'edit'
  if (!wantEdit && !alreadyEdit) {
    selectOpening(openingId, 'quick')
    return
  }
  selectOpening(openingId, 'edit')
  if (alreadyEdit) {
    beginOpeningDrag(openingId, 'move', cm, rect, rect.wallId, rect.floorIndex)
    return
  }
  startOpeningMovePending(openingId, rect, cm, event)
}

function onMoveHandleDown(event: { evt: MouseEvent }): void {
  event.evt.stopPropagation()
  if (activeTool.value !== 'select' || canvasLocked.value) return
  const rect = selectedOpeningRect.value
  const cm = pointerCm(event)
  if (!rect || !cm) return
  selectOpening(rect.openingId, 'edit')
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
const elevTouchEditor = computed(() => true)
const { useTouchNav } = useFmlTouchNav(elevTouchEditor)
const elevMoveMod = ref(false)
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
    if (activeTool.value !== 'split') return
    const elev = elevation.value
    const cm = clientToCm(event.clientX, event.clientY)
    if (elev && cm) updateSplitDraft(elev, cm.x)
  },
})

watch(underlayMoveMode, (on) => {
  if (!on) return
  clearSplitDraft()
  activeTool.value = 'select'
})

function onHostPointerDown(event: PointerEvent): void {
  if (event.button !== 0 || props.rescaleMode || !underlayMoveMode.value) return
  const target = event.target as HTMLElement | null
  if (target?.closest(`${FML_PREVIEW_CHROME_SELECTOR}, .elev-groups`)) return
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

type JunctionDrag = {
  id: string
  startY: number
  startHeightCm: number
  floorIndex: number
  refs: Array<{ wallId: string; end: 'a' | 'b' }>
  ridge?: boolean
}

let junctionDrag: JunctionDrag | null = null

function beginJunctionDrag(
  junction: { id: string; heightCm: number; floorIndex: number; ridge?: boolean },
  refs: Array<{ wallId: string; end: 'a' | 'b' }>,
  startY: number,
): void {
  selectJunction(junction.id)
  junctionDrag = {
    id: junction.id,
    startY,
    startHeightCm: junction.heightCm,
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
  beginJunctionDrag(junction, junction.refs, cm.y)
}

function onRidgeWallDown(wall: ElevationWallRect, event: { evt: MouseEvent }): void {
  if (!wall.ridge || activeTool.value !== 'select' || canvasLocked.value) return
  const elev = elevation.value
  const cm = pointerCm(event)
  if (!elev || !cm) return
  if (wall.endOn) {
    event.evt.stopPropagation()
    beginRidgeRectDrag(wall, 'move', cm)
    return
  }
  const junction = nearestElevationRidgeJunction(elev, wall, cm)
  if (!junction) return
  event.evt.stopPropagation()
  beginJunctionDrag(
    junction,
    [
      { wallId: wall.wallId, end: 'a' },
      { wallId: wall.wallId, end: 'b' },
    ],
    cm.y,
  )
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
  const cm = clientToCm(event.clientX, event.clientY)
  if (!cm) return
  const min = junctionDrag.ridge ? 0 : 1
  const heightCm = Math.max(
    min,
    Math.min(800, Math.round(junctionDrag.startHeightCm - (cm.y - junctionDrag.startY))),
  )
  commitPlan(
    junctionDrag.ridge
      ? setPlanRidgeJunctionZ(props.plan, junctionDrag.floorIndex, junctionDrag.refs, heightCm)
      : setPlanJunctionHeight(props.plan, junctionDrag.floorIndex, junctionDrag.refs, heightCm),
  )
}

function onJunctionUp(): void {
  window.removeEventListener('pointermove', onJunctionMove)
  junctionDrag = null
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
})
</script>

<template>
  <div
    ref="containerRef"
    class="elev-host"
    :class="{
      'elev-host--move-underlay': underlayMoveMode && !rescaleMode,
      'elev-host--split': activeTool === 'split' && !canvasLocked,
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
      :help-keys="[
        'viewer.elevationHint',
        'viewer.elevationOpeningHint',
        'viewer.elevationWallHint',
        'viewer.elevationRoofHint',
        'viewer.elevationSplitHint',
        'viewer.elevationJunctionHint',
        'viewer.elevationRidgeHint',
        'result.toolbar.hintAddDoor',
        'result.toolbar.hintAddWindow',
      ]"
      @undo="undoEdit"
      @redo="redoEdit"
      @fit="resetView"
      @zoom-in="panZoom.zoomBy(1.15)"
      @zoom-out="panZoom.zoomBy(1 / 1.15)"
      @toggle-fullscreen="emit('update:canvasFullscreen', !canvasFullscreen)"
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
            draggable: activeTool === 'select' && !settingsTarget && !canvasLocked,
          }"
          @dragstart="panZoom.onGroupDragStart"
          @dragmove="panZoom.onGroupDragMove"
          @dragend="panZoom.onGroupDragEnd"
          @click="onContentClick"
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
          <template v-if="elevation">
            <v-group v-for="(band, index) in elevation.bands" :key="`band-${band.kind}-${index}`">
              <v-rect
                :config="{
                  ...stageRect(band),
                  fill: band.kind === 'nok' ? '#cbd5e1' : '#e2e8f0',
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
                  points: stagePoly(plane.fillPoints.length >= 3 ? plane.fillPoints : plane.points),
                  closed: true,
                  fill: plane.color,
                  stroke: '#4b5563',
                  strokeWidth: elevStroke,
                  perfectDrawEnabled: false,
                  opacity: roofSelected(plane.id) ? 1 : 0.92,
                  listening: false,
                }"
              />
              <v-line
                v-if="roofSelected(plane.id)"
                :config="{
                  points: stagePoly(plane.fillPoints.length >= 3 ? plane.fillPoints : plane.points),
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
                    fill: '#94a3b8',
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
                    stroke: '#334155',
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
                    stroke: '#0f172a',
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
                <v-rect
                  :config="{
                    ...stageRect(opening),
                    fill:
                      selectedOpeningId === opening.openingId
                        ? '#f97316'
                        : opening.type === 'door'
                          ? '#f59e0b'
                          : '#38bdf8',
                    opacity: selectedOpeningId === opening.openingId ? 0.55 : 0.08,
                    stroke: selectedOpeningId === opening.openingId ? '#ea580c' : '#0c4a6e',
                    strokeWidth: elevStroke,
                    perfectDrawEnabled: false,
                    listening: true,
                  }"
                  @mousedown="onOpeningDown(opening.openingId, $event)"
                />
                <v-rect
                  v-if="selectedOpeningId === opening.openingId"
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
              <v-group v-for="glyph in plane.glyphs" :key="glyph.id" :config="{ listening: false }">
                <v-line
                  v-for="poly in glyph.polys"
                  :key="`${glyph.id}-${poly.key}`"
                  :config="{
                    points: poly.points,
                    closed: poly.closed,
                    fill: poly.fill ? glyphFill(poly.role, glyph.transom, glyph.type) : undefined,
                    stroke: glyph.transom ? '#14532d' : '#0c4a6e',
                    strokeWidth: poly.role === 'handle' ? elevStrokeHeavy : elevStroke,
                    opacity: glyphOpacity(poly.role, glyph.transom),
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
                    fill: circle.fill
                      ? glyphFill(circle.role, glyph.transom, glyph.type)
                      : undefined,
                    stroke: glyph.transom ? '#14532d' : '#0c4a6e',
                    strokeWidth: circle.role === 'handle' ? elevStrokeHeavy : elevStroke,
                    opacity: glyphOpacity(circle.role, glyph.transom),
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
                    fill: '#7b8ea6',
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
                    stroke: '#334155',
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
              v-if="ridgeCenter"
              :config="{
                ...(() => {
                  const stage = layoutXform.toStagePoint(ridgeCenter.x, ridgeCenter.y)
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
          </template>
        </v-group>
      </v-layer>
    </v-stage>
    <FmlRescaleOverlay
      v-if="rescaleMode && rescaleState"
      :state="rescaleState"
      :walls="[]"
      :width="stageSize.width"
      :height="stageSize.height"
      :to-screen="cmToScreen"
      :to-cm="screenToCm"
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
        <div class="canvas-toolbelt-dock__section canvas-toolbelt-dock__section--face">
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
              :title="t('viewer.elevationRoof', { name: settingsRoof.name })"
              :height-cm="settingsRoof.heightCm"
              :min="0"
              :max="800"
              @height="commitRoofVertexHeight"
            />
            <FmlElevationHeightOnlyFields
              v-else-if="settingsRidge"
              :title="t('viewer.elevationRidgeZ', { name: settingsRidge.name })"
              :height-cm="settingsRidge.heightCm"
              :min="0"
              :max="800"
              @height="commitRidgeHeight"
            />
            <FmlElevationHeightOnlyFields
              v-else-if="settingsJunction"
              :title="
                settingsJunction.ridge
                  ? t('viewer.elevationRidgeZ', { name: settingsJunction.name })
                  : t('viewer.elevationJunction', { name: settingsJunction.name })
              "
              :height-cm="settingsJunction.heightCm"
              :min="settingsJunction.ridge ? 0 : 1"
              :max="800"
              @height="commitJunctionHeight"
            />
            <FmlElevationHeightOnlyFields
              v-else-if="settingsWall"
              :title="t('viewer.elevationWall', { name: settingsWall.name })"
              :height-cm="settingsWall.heightCm"
              :min="1"
              :max="800"
              @height="commitWallHeight"
            />
            <FmlElevationHeightOnlyFields
              v-else-if="settingsSlab"
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
              v-model:add-window-subtype="addWindowSubtype"
              v-model:add-window-width-cm="addWindowWidthCm"
              v-model:add-window-sill-z-cm="addWindowSillZCm"
              v-model:add-window-height-cm="addWindowHeightCm"
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

.elev-host--move-underlay {
  cursor: grab;
}

.elev-host--split {
  cursor: crosshair;
}

.elev-host--touch {
  touch-action: none;
}

.elev-host--move-underlay:active {
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
