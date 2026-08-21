<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FloorPlan, Opening, Point2D, Wall } from '@/core/fml/types'
import { CONCEPT_DOOR_REFID, CONCEPT_WINDOW_REFID } from '@/core/fml/types'
import {
  DEFAULT_FML_DOOR_HEIGHT_CM,
  DEFAULT_FML_WINDOW_HEIGHT_CM,
  DEFAULT_FML_WINDOW_SILL_Z_CM,
} from '@/core/fml/extraction-to-plan-types'
import { listElevationFacadeGroups } from '@/core/fml/facade-groups'
import {
  collectElevationRoofSnapYs,
  collectElevationWallSnapXs,
  elevationWallFillPoints,
  elevationWallInnerStrokes,
  hitElevationBand,
  hitElevationJunction,
  hitElevationOpening,
  hitElevationRoofPlane,
  hitElevationRoofVertex,
  hitElevationWall,
  openingPatchFromElevationRect,
  projectFacadeElevation,
  snapElevationY,
  type ElevationRect,
  type ElevationWallRect,
  type FacadeElevation,
} from '@/core/fml/facade-elevation'
import { findRidgeSurface, setRidgeSurfaceVertexZ } from '@/core/fml/roof-planes'
import {
  resolveDoorAddPreset,
  resolveDoorSubtypeFromRefid,
  resolveWindowAddPreset,
  resolveWindowSubtypeFromRefid,
  type DoorAddSubtype,
  type WindowAddSubtype,
} from '@/core/fml/opening-add-presets'
import type { OpeningSubtypeDraft } from '@/ui/composables/fml-preview/fml-preview-opening-draft'
import {
  collectOpeningSnapTargets,
  elevationHandlePoints,
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
import { useFmlPreviewUnderlayMove } from '@/ui/composables/fml-preview/useFmlPreviewUnderlayMove'
import {
  layoutTransform,
  useFmlPreviewViewport,
} from '@/ui/composables/fml-preview/useFmlPreviewViewport'
import { useFmlPreviewPanZoom } from '@/ui/composables/fml-preview/useFmlPreviewPanZoom'
import FmlEditorTopbar from './FmlEditorTopbar.vue'
import FmlElevationHeightOnlyFields from './FmlElevationHeightOnlyFields.vue'
import FmlElevationOpeningFields from './FmlElevationOpeningFields.vue'
import FmlElevationOpeningQuickFields from './FmlElevationOpeningQuickFields.vue'
import FmlRescaleOverlay from './FmlRescaleOverlay.vue'
import ToolbeltIcon from './canvas/ToolbeltIcon.vue'
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
const isPanDragging = ref(false)
const activeTool = ref<ElevTool>('select')
type ElevSettings =
  | { kind: 'opening'; id: string; mode: 'quick' | 'edit' }
  | { kind: 'wall'; wallId: string; floorIndex: number }
  | { kind: 'slab'; floorIndex: number }
  | { kind: 'junction'; id: string }
  | { kind: 'roof'; id: string; vertexIndex: number | null }

const selectedOpeningId = ref<string | null>(null)
const settingsTarget = ref<ElevSettings | null>(null)
const stampOpening = ref<Opening | null>(null)
const snapGuide = ref<ElevationSnapGuide | null>(null)
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

const openingSubtype = computed((): OpeningSubtypeDraft => {
  const opening = selectedOpening.value?.opening
  if (!opening) return 'standard'
  return opening.type === 'window'
    ? resolveWindowSubtypeFromRefid(opening.refid)
    : resolveDoorSubtypeFromRefid(opening.refid)
})

const groups = computed(() => listElevationFacadeGroups(props.plan))
const elevation = computed(() => projectFacadeElevation(props.plan, props.groupId))

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

const panZoom = useFmlPreviewPanZoom({
  viewport,
  containerRef,
  isPanDragging,
  onBeforePan: () => undefined,
})

onMounted(() => mountResizeObserver())
onBeforeUnmount(() => {
  unmountResizeObserver()
  window.removeEventListener('pointermove', onRoofVertexMove)
  window.removeEventListener('pointerup', onRoofVertexUp)
})

watch(
  () => props.groupId,
  () => {
    selectedOpeningId.value = null
    settingsTarget.value = null
    stampOpening.value = null
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
      a: stroke.a,
      b: stroke.b,
    })),
  )
})

function pointerCm(event: {
  evt?: MouseEvent
  target?: {
    getStage?: () => { getPointerPosition?: () => { x: number; y: number } | null } | null
  }
}): Point2D | null {
  const stage = event.target?.getStage?.()
  const pos = stage?.getPointerPosition?.()
  if (!pos) return null
  const local = {
    x: (pos.x - viewPosition.value.x) / viewScale.value,
    y: (pos.y - viewPosition.value.y) / viewScale.value,
  }
  return layoutXform.value.toCmPoint(local.x, local.y)
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

function toggleOpeningTool(tool: 'add_door' | 'add_window' | 'split'): void {
  stampOpening.value = null
  activeTool.value = activeTool.value === tool ? 'select' : tool
}

function placeOpening(elev: FacadeElevation, cm: Point2D, type: 'door' | 'window'): void {
  const wall = hitElevationWall(elev, cm)
  if (!wall) return
  const stamp = stampOpening.value?.type === type ? stampOpening.value : null
  const width = stamp?.width ?? (type === 'door' ? 90 : 100)
  const height =
    stamp?.z_height ?? (type === 'door' ? props.defaultDoorHeightCm : props.defaultWindowHeightCm)
  const z = stamp?.z ?? (type === 'door' ? 0 : props.defaultWindowSillZCm)
  const xSpan = wall.xb - wall.xa
  const t = Math.abs(xSpan) < 1e-6 ? 0.5 : (cm.x - wall.xa) / xSpan
  const opening: Opening = {
    type,
    refid: stamp?.refid ?? (type === 'door' ? CONCEPT_DOOR_REFID : CONCEPT_WINDOW_REFID),
    t: Math.max(0, Math.min(1, t)),
    width,
    z,
    z_height: height,
    guid: crypto.randomUUID(),
  }
  stampOpening.value = null
  pushUndo()
  const result = addPlanOpening(props.plan, wall.wallId, opening)
  if (result.openingId) selectOpening(result.openingId)
  commitPlan(result.plan)
  activeTool.value = 'select'
}

type OpeningDrag = {
  openingId: string
  mode: 'move' | ElevResizeSide
  startCm: Point2D
  startRect: ElevationRect
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
    ? collectOpeningSnapTargets(elev.openings, openingId)
    : { xs: [], ys: [] }
  const raw =
    snapOff || !elev
      ? { rect, guide: {} as ElevationSnapGuide }
      : snapElevationRect(rect, drag?.mode === 'move' || !drag ? 'move' : drag.mode, {
          xs: [...openingTargets.xs, ...collectElevationWallSnapXs(elev.walls)],
          ys: openingTargets.ys,
        })
  snapGuide.value = raw.guide.x != null || raw.guide.y != null ? raw.guide : null
  const patch = openingPatchFromElevationRect(
    wall,
    raw.rect,
    floorWallBaseWorldZ(props.plan, wall.floorIndex),
  )
  commitPlan(updatePlanOpening(props.plan, openingId, patch))
}

function clearSettings(): void {
  settingsTarget.value = null
}

function selectOpening(openingId: string | null, mode: 'quick' | 'edit' | null = null): void {
  selectedOpeningId.value = openingId
  settingsTarget.value = mode && openingId != null ? { kind: 'opening', id: openingId, mode } : null
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
  stampOpening.value = { ...located.opening }
  activeTool.value = located.opening.type === 'door' ? 'add_door' : 'add_window'
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
  commitPlan(setPlanJunctionHeight(props.plan, junction.floorIndex, junction.refs, cm))
}

function commitRoofVertexHeight(cm: number): void {
  const target = settingsTarget.value
  if (target?.kind !== 'roof' || target.vertexIndex == null) return
  pushUndo()
  commitPlan(setRidgeSurfaceVertexZ(props.plan, target.id, target.vertexIndex, cm))
}

function splitWallAtClick(elev: FacadeElevation, cm: { x: number; y: number }): void {
  const wall = hitElevationWall(elev, cm)
  if (!wall || wall.ridge) return
  const xSpan = wall.xb - wall.xa
  const t = Math.abs(xSpan) < 1e-6 ? 0.5 : (cm.x - wall.xa) / xSpan
  const result = splitPlanWallAtT(props.plan, wall.wallId, t)
  if (!result) return
  pushUndo()
  commitPlan(result.plan)
  const splitX = wall.xa + (wall.xb - wall.xa) * Math.max(0, Math.min(1, t))
  const nextElev = projectFacadeElevation(result.plan, props.groupId)
  const junction = nextElev?.junctions.find(
    (item) => item.floorIndex === result.floorIndex && Math.abs(item.x - splitX) < 8,
  )
  selectJunction(junction?.id ?? null)
  activeTool.value = 'select'
}

function commitSlabHeight(cm: number): void {
  const target = settingsTarget.value
  if (target?.kind !== 'slab') return
  const floor = props.plan.floors[target.floorIndex]
  if (!floor) return
  pushUndo()
  commitPlan(setSlabThicknessCm(props.plan, floor.level, cm))
}

function onContentClick(event: { evt: MouseEvent; target?: { getStage?: () => unknown } }): void {
  if (isPanDragging.value || canvasLocked.value) return
  const elev = elevation.value
  if (!elev) return
  const cm = pointerCm(event)
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
    splitWallAtClick(elev, cm)
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
    const mode = event.evt.ctrlKey || event.evt.metaKey ? 'edit' : 'quick'
    selectOpening(hit.openingId, mode)
    return
  }
  const junction = hitElevationJunction(elev, cm)
  if (junction) {
    selectJunction(junction.id)
    return
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

function beginOpeningDrag(
  openingId: string,
  mode: OpeningDrag['mode'],
  cm: Point2D,
  rect: ElevationRect,
  wallId: string,
  floorIndex: number,
): void {
  drag = {
    openingId,
    mode,
    startCm: cm,
    startRect: { x0: rect.x0, y0: rect.y0, x1: rect.x1, y1: rect.y1 },
    wallId,
    floorIndex,
  }
  pushUndo()
  window.addEventListener('pointermove', onOpeningMove)
  window.addEventListener('pointerup', onOpeningUp, { once: true })
}

function onOpeningDown(openingId: string, event: { evt: MouseEvent }): void {
  if (activeTool.value !== 'select' || canvasLocked.value) return
  const elev = elevation.value
  const rect = elev?.openings.find((item) => item.openingId === openingId)
  const cm = pointerCm(event)
  if (!elev || !rect || !cm) return
  const mode = event.evt.ctrlKey || event.evt.metaKey ? 'edit' : 'quick'
  selectedOpeningId.value = openingId
  if (
    settingsTarget.value?.kind === 'opening' &&
    settingsTarget.value.mode === 'edit' &&
    mode === 'edit'
  ) {
    settingsTarget.value = { kind: 'opening', id: openingId, mode: 'edit' }
    beginOpeningDrag(openingId, 'move', cm, rect, rect.wallId, rect.floorIndex)
    return
  }
  settingsTarget.value = { kind: 'opening', id: openingId, mode }
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

function clientToCm(clientX: number, clientY: number): Point2D | null {
  if (!containerRef.value) return null
  const bounds = containerRef.value.getBoundingClientRect()
  const local = {
    x: (clientX - bounds.left - viewPosition.value.x) / viewScale.value,
    y: (clientY - bounds.top - viewPosition.value.y) / viewScale.value,
  }
  return layoutXform.value.toCmPoint(local.x, local.y)
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

watch(underlayMoveMode, (on) => {
  if (!on) return
  stampOpening.value = null
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
  drag = null
  snapGuide.value = null
}

type JunctionDrag = {
  id: string
  startY: number
  startHeightCm: number
  floorIndex: number
  refs: Array<{ wallId: string; end: 'a' | 'b' }>
}

let junctionDrag: JunctionDrag | null = null

function onJunctionDown(junctionId: string, event: { evt: MouseEvent }): void {
  event.evt.stopPropagation()
  if (activeTool.value !== 'select' || canvasLocked.value) return
  const elev = elevation.value
  const junction = elev?.junctions.find((item) => item.id === junctionId)
  const cm = pointerCm(event)
  if (!junction || !cm) return
  selectJunction(junction.id)
  junctionDrag = {
    id: junction.id,
    startY: cm.y,
    startHeightCm: junction.heightCm,
    floorIndex: junction.floorIndex,
    refs: junction.refs,
  }
  pushUndo()
  window.addEventListener('pointermove', onJunctionMove)
  window.addEventListener('pointerup', onJunctionUp, { once: true })
}

function onJunctionMove(event: PointerEvent): void {
  if (!junctionDrag) return
  const cm = clientToCm(event.clientX, event.clientY)
  if (!cm) return
  const heightCm = Math.max(
    1,
    Math.min(800, Math.round(junctionDrag.startHeightCm - (cm.y - junctionDrag.startY))),
  )
  commitPlan(
    setPlanJunctionHeight(props.plan, junctionDrag.floorIndex, junctionDrag.refs, heightCm),
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
    stampOpening.value = null
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
    :class="{ 'elev-host--move-underlay': underlayMoveMode && !rescaleMode }"
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
            <v-rect
              v-for="(band, index) in elevation.bands"
              :key="`band-${band.kind}-${index}`"
              :config="{
                ...stageRect(band),
                fill: band.kind === 'nok' ? '#cbd5e1' : '#e2e8f0',
                stroke:
                  band.kind === 'slab' &&
                  settingsTarget?.kind === 'slab' &&
                  settingsTarget.floorIndex === band.floorIndex
                    ? '#0f172a'
                    : undefined,
                strokeWidth:
                  band.kind === 'slab' &&
                  settingsTarget?.kind === 'slab' &&
                  settingsTarget.floorIndex === band.floorIndex
                    ? 2 / viewScale
                    : 0,
                listening: false,
              }"
            />
            <v-line
              v-for="plane in elevation.roofPlanes"
              :key="`roof-${plane.id}`"
              :config="{
                points: stagePoly(plane.fillPoints.length >= 3 ? plane.fillPoints : plane.points),
                closed: true,
                fill: plane.color,
                stroke:
                  settingsTarget?.kind === 'roof' && settingsTarget.id === plane.id
                    ? '#f97316'
                    : '#4b5563',
                strokeWidth:
                  (settingsTarget?.kind === 'roof' && settingsTarget.id === plane.id ? 2.5 : 1) /
                  viewScale,
                opacity:
                  settingsTarget?.kind === 'roof' && settingsTarget.id === plane.id ? 1 : 0.92,
                listening: false,
              }"
            />
            <v-line
              v-for="wall in elevation.walls"
              :key="`wall-${wall.floorIndex}-${wall.wallId}`"
              :config="{
                points: stageWallPoly(wall),
                closed: true,
                fill: '#94a3b8',
                stroke:
                  settingsTarget?.kind === 'wall' &&
                  settingsTarget.wallId === wall.wallId &&
                  settingsTarget.floorIndex === wall.floorIndex
                    ? '#0f172a'
                    : '#334155',
                strokeWidth:
                  (settingsTarget?.kind === 'wall' &&
                  settingsTarget.wallId === wall.wallId &&
                  settingsTarget.floorIndex === wall.floorIndex
                    ? 2
                    : 1) / viewScale,
                listening: true,
              }"
            />
            <v-line
              v-for="stroke in innerStrokes"
              :key="stroke.key"
              :config="{
                points: stagePoints(stroke.a, stroke.b),
                stroke: '#0f172a',
                dash: [8 / viewScale, 5 / viewScale],
                strokeWidth: 1.25 / viewScale,
                listening: false,
              }"
            />
            <v-line
              v-for="junction in elevation.junctions"
              :key="junction.id"
              :config="{
                points: stagePoints(
                  { x: junction.x, y: junction.yBot },
                  { x: junction.x, y: junction.yTop },
                ),
                stroke:
                  settingsTarget?.kind === 'junction' && settingsTarget.id === junction.id
                    ? '#f97316'
                    : '#334155',
                dash: [6 / viewScale, 4 / viewScale],
                strokeWidth:
                  (settingsTarget?.kind === 'junction' && settingsTarget.id === junction.id
                    ? 2.5
                    : 1.25) / viewScale,
                listening: true,
              }"
              @mousedown="onJunctionDown(junction.id, $event)"
            />
            <v-circle
              v-for="junction in elevation.junctions"
              :key="`jh-${junction.id}`"
              :config="{
                ...(() => {
                  const stage = layoutXform.toStagePoint(junction.x, junction.yTop)
                  return { x: stage.x, y: stage.y }
                })(),
                radius:
                  (settingsTarget?.kind === 'junction' && settingsTarget.id === junction.id
                    ? 6
                    : 4) / viewScale,
                fill: '#fff',
                stroke:
                  settingsTarget?.kind === 'junction' && settingsTarget.id === junction.id
                    ? '#f97316'
                    : '#334155',
                strokeWidth: 1.5 / viewScale,
                listening: true,
              }"
              @mousedown="onJunctionDown(junction.id, $event)"
            />
            <v-rect
              v-for="opening in elevation.openings"
              :key="opening.openingId"
              :config="{
                ...stageRect(opening),
                fill: opening.type === 'door' ? '#f59e0b' : '#38bdf8',
                stroke: selectedOpeningId === opening.openingId ? '#0f172a' : '#0c4a6e',
                strokeWidth: (selectedOpeningId === opening.openingId ? 2 : 1) / viewScale,
                listening: true,
              }"
              @mousedown="onOpeningDown(opening.openingId, $event)"
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
    <div class="canvas-toolbelt-dock" data-fit-chrome="bottom">
      <div v-if="settingsTarget" class="canvas-toolbelt-dock__row elev-settings-row">
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
          v-else-if="settingsJunction"
          :title="t('viewer.elevationJunction', { name: settingsJunction.name })"
          :height-cm="settingsJunction.heightCm"
          :min="1"
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
          v-else-if="
            settingsTarget.kind === 'opening' && settingsTarget.mode === 'quick' && selectedOpening
          "
          :type="selectedOpening.opening.type"
          :subtype="openingSubtype"
          @subtype="commitOpeningSubtype"
          @copy="copySelectedOpening"
        />
        <FmlElevationOpeningFields
          v-else-if="
            settingsTarget.kind === 'opening' && settingsTarget.mode === 'edit' && selectedOpening
          "
          :type="selectedOpening.opening.type"
          :width-cm="selectedOpening.opening.width"
          :height-cm="resolveOpeningHeight(selectedOpening.opening)"
          :sill-z-cm="
            selectedOpening.opening.type === 'window'
              ? resolveWindowSillZ(selectedOpening.opening)
              : Math.round(selectedOpening.opening.z ?? 0)
          "
          @width="(cm) => commitSelectedField('width', cm)"
          @height="(cm) => commitSelectedField('height', cm)"
          @sill="(cm) => commitSelectedField('sill', cm)"
          @remove="deleteSelectedOpening"
        />
        <button
          type="button"
          class="canvas-toolbelt__btn"
          :title="t('viewer.closeMenu')"
          :aria-label="t('viewer.closeMenu')"
          @click="clearSettings()"
        >
          <ToolbeltIcon name="close_menu" />
        </button>
      </div>
      <div v-else class="canvas-toolbelt-dock__row">
        <button
          type="button"
          class="canvas-toolbelt__btn"
          :class="{ 'is-active': activeTool === 'add_door' }"
          :title="t('toolbelt.fml.addDoor')"
          @click="toggleOpeningTool('add_door')"
        >
          <ToolbeltIcon name="door" />
        </button>
        <button
          type="button"
          class="canvas-toolbelt__btn"
          :class="{ 'is-active': activeTool === 'add_window' }"
          :title="t('toolbelt.fml.addWindow')"
          @click="toggleOpeningTool('add_window')"
        >
          <ToolbeltIcon name="window" />
        </button>
        <button
          type="button"
          class="canvas-toolbelt__btn"
          :class="{ 'is-active': activeTool === 'split' }"
          :title="t('result.toolbar.splitWall')"
          @click="toggleOpeningTool('split')"
        >
          <ToolbeltIcon name="split" />
        </button>
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

.elev-settings-row {
  align-items: center;
  padding: 2px 4px;
  background: rgb(255 255 255 / 0.96);
}
</style>
