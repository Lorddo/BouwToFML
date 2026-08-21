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
  hitElevationBand,
  hitElevationOpening,
  hitElevationWall,
  openingPatchFromElevationRect,
  projectFacadeElevation,
  type ElevationRect,
  type ElevationWallRect,
  type FacadeElevation,
} from '@/core/fml/facade-elevation'
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
  setPlanWallHeight,
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
import { buildUnderlayStageGeom } from '@/ui/composables/fml-preview/fml-preview-underlay-layout'
import {
  layoutTransform,
  useFmlPreviewViewport,
} from '@/ui/composables/fml-preview/useFmlPreviewViewport'
import { useFmlPreviewPanZoom } from '@/ui/composables/fml-preview/useFmlPreviewPanZoom'
import FmlEditorTopbar from './FmlEditorTopbar.vue'
import FmlElevationHeightOnlyFields from './FmlElevationHeightOnlyFields.vue'
import FmlElevationOpeningFields from './FmlElevationOpeningFields.vue'
import FmlElevationOpeningQuickFields from './FmlElevationOpeningQuickFields.vue'
import ToolbeltIcon from './canvas/ToolbeltIcon.vue'
import './canvas/canvas-toolbelt.css'

type ElevTool = 'select' | 'add_door' | 'add_window'

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
    canvasFullscreen?: boolean
    defaultDoorHeightCm?: number
    defaultWindowHeightCm?: number
    defaultWindowSillZCm?: number
  }>(),
  {
    underlaySrc: null,
    underlayOpacity: 0.45,
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
}>()

const { t } = useI18n()
const containerRef = ref<HTMLDivElement | null>(null)
const isPanDragging = ref(false)
const activeTool = ref<ElevTool>('select')
type ElevSettings =
  | { kind: 'opening'; id: string; mode: 'quick' | 'edit' }
  | { kind: 'wall'; wallId: string; floorIndex: number }
  | { kind: 'slab'; floorIndex: number }

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

const extraBounds = computed(() => {
  const bounds = elevation.value?.bounds
  if (!bounds) return null
  return {
    minX: bounds.x0,
    minY: bounds.y0,
    spanX: Math.max(1, bounds.x1 - bounds.x0),
    spanY: Math.max(1, bounds.y1 - bounds.y0),
  }
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
onBeforeUnmount(() => unmountResizeObserver())

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
  return [wall.aTop, wall.bTop, wall.bBottom, wall.aBottom].flatMap((point) => {
    const stage = layoutXform.value.toStagePoint(point.x, point.y)
    return [stage.x, stage.y]
  })
}

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

function toggleOpeningTool(tool: 'add_door' | 'add_window'): void {
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
  const raw =
    snapOff || !elev
      ? { rect, guide: {} as ElevationSnapGuide }
      : snapElevationRect(
          rect,
          drag?.mode === 'move' || !drag ? 'move' : drag.mode,
          collectOpeningSnapTargets(elev.openings, openingId),
        )
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

function commitSlabHeight(cm: number): void {
  const target = settingsTarget.value
  if (target?.kind !== 'slab') return
  const floor = props.plan.floors[target.floorIndex]
  if (!floor) return
  pushUndo()
  commitPlan(setSlabThicknessCm(props.plan, floor.level, cm))
}

function onContentClick(event: { evt: MouseEvent; target?: { getStage?: () => unknown } }): void {
  if (isPanDragging.value) return
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
  const hit = hitElevationOpening(elev, cm)
  if (hit) {
    const mode = event.evt.ctrlKey || event.evt.metaKey ? 'edit' : 'quick'
    selectOpening(hit.openingId, mode)
    return
  }
  if (event.evt.ctrlKey || event.evt.metaKey) {
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
  if (activeTool.value !== 'select') return
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
  if (activeTool.value !== 'select') return
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

function onKeydown(event: KeyboardEvent): void {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
    return
  if (event.key === 'Escape') {
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
    tabindex="0"
    @keydown="onKeydown"
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
            draggable: activeTool === 'select' && !settingsTarget,
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
    <div class="canvas-toolbelt-dock" data-fit-chrome="bottom">
      <div v-if="settingsTarget" class="canvas-toolbelt-dock__row elev-settings-row">
        <FmlElevationHeightOnlyFields
          v-if="settingsWall"
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
