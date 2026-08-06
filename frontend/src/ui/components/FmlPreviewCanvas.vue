<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, toRef, watch } from 'vue'
import type Konva from 'konva'
import type { FloorPlan } from '@/core/fml/types'
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
import FmlPreviewToolbar from './FmlPreviewToolbar.vue'
import FmlPreviewStage from './FmlPreviewStage.vue'
import FmlPreviewMeasureOverlay from './FmlPreviewMeasureOverlay.vue'

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
    thicknessPickTier?: FmlThicknessBand | null
    thicknessMinCm?: number
    thicknessMidCm?: number
    thicknessMaxCm?: number
    bovenlichtDefault?: boolean
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
    thicknessPickTier: null,
    thicknessMinCm: 10,
    thicknessMidCm: 20,
    thicknessMaxCm: 30,
    bovenlichtDefault: false,
  },
)

const emit = defineEmits<{
  planUpdate: [plan: FloorPlan]
  thicknessWallPick: [wallId: string]
  cancelThicknessPick: []
}>()

function interactionEmit(
  event: 'planUpdate' | 'thicknessWallPick' | 'cancelThicknessPick',
  payload?: FloorPlan | string,
): void {
  if (event === 'planUpdate') {
    emit('planUpdate', payload as FloorPlan)
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

const containerRef = ref<HTMLDivElement | null>(null)
const stageRef = ref<{ getNode: () => Konva.Stage } | null>(null)
const contentGroupRef = ref<{ getNode: () => Konva.Group } | null>(null)

const { shiftPressed, spacePressed, onKeyDown, onKeyUp } = useStage()
const editor = useFmlPreviewEditor(toRef(props, 'plan'), toRef(props, 'floorIndex'))
const selection = createFmlPreviewSelection()
const floor = computed(
  () =>
    editor.localPlan.value?.floors[props.floorIndex] ?? editor.localPlan.value?.floors[0] ?? null,
)
const floorItems = computed(() => floor.value?.items ?? [])
const viewport = useFmlPreviewViewport(containerRef, editor.walls, floorItems)

const underlayProps = computed(() => ({
  underlaySrc: props.underlaySrc ?? null,
  underlayWidthPx: props.underlayWidthPx ?? 0,
  underlayHeightPx: props.underlayHeightPx ?? 0,
  opacity: props.underlayOpacity ?? 0,
  cmOrigin: props.cmOrigin ?? null,
  pxPerMmX: props.pxPerMmX ?? 1,
  pxPerMmY: props.pxPerMmY ?? 1,
}))

const render = useFmlPreviewRenderModel(viewport, editor, floor, underlayProps, selection)

const hitTest = useFmlPreviewHitTest(
  viewport,
  editor.walls,
  render.renderJunctions,
  computed(() => render.renderModel.value?.doorGroups ?? []),
  containerRef,
  stageRef,
  computed(() => render.renderModel.value?.windows ?? []),
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
  onKeyDown,
  onKeyUp,
})

const {
  stageSize,
  viewPosition,
  viewScale,
  contentLayout,
  mountResizeObserver,
  unmountResizeObserver,
} = viewport

const {
  renderModel,
  underlayConfig,
  settingsWallPolygons,
  moveWallPolygon,
  groupDraggable,
  visibleJunctions,
  junctionOverlayGroup,
  junctionHitRadius,
  junctionMarkerRadius,
  junctionMarkerStroke,
  activeJunctionId,
  selectedWallPanel,
  selectedOpeningPanel,
} = render

const {
  activeFmlTool,
  selectionBoxPreview,
  drawWallPreview,
  drawRoomPreview,
  measurePreview,
  measureLines,
  settingsWallIds,
  moveWallId,
  settingsOpeningIds,
  moveOpeningId,
  wallThicknessDraft,
  wallThicknessMixed,
  wallBalanceDraft,
  wallBalanceMixed,
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
  onOpeningWidthInput,
  commitOpeningWidth,
  onOpeningHeightInput,
  commitOpeningHeight,
  onOpeningSillZInput,
  commitOpeningSillZ,
  toggleOpeningHingeAtStart,
  toggleOpeningSwingRight,
  onOpeningBovenlichtChange,
  copySelectedOpening,
  deleteSelectedOpenings,
  splitSelectedWall,
  deleteSelectedWalls,
  clearSelection,
  clearMeasureLines,
  onWrapPointerDown,
  onWrapPointerMove,
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

const { drawWallPreviewScreen, drawRoomPreviewScreen, drawRoomPreviewPolygon, cmToScreen } =
  useFmlPreviewDrawPreviews({
    drawWallPreview,
    drawRoomPreview,
    contentLayout,
    viewPosition,
    viewScale,
  })

onMounted(() => {
  mountResizeObserver()
  mountKeyboardListeners()
})

onUnmounted(() => {
  unmountResizeObserver()
  unmountInteraction()
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
    clearSelection()
    clearMeasureLines()
    resetView()
  },
)
</script>

<template>
  <div
    ref="containerRef"
    class="fml-preview-wrap"
    :style="{ cursor: canvasCursor }"
    @mousedown="onWrapPointerDown"
    @mousemove="onWrapPointerMove"
    @wheel="onWheel"
  >
    <FmlPreviewToolbar
      v-model:active-tool="activeFmlTool"
      v-model:add-door-subtype="addDoorSubtype"
      v-model:add-door-width-cm="addDoorWidthCm"
      v-model:add-window-subtype="addWindowSubtype"
      v-model:add-window-width-cm="addWindowWidthCm"
      v-model:add-window-sill-z-cm="addWindowSillZCm"
      v-model:add-window-height-cm="addWindowHeightCm"
      :selected-wall-panel="selectedWallPanel"
      :selected-opening-panel="selectedOpeningPanel"
      :wall-thickness-draft="wallThicknessDraft"
      :wall-thickness-mixed="wallThicknessMixed"
      :wall-balance-draft="wallBalanceDraft"
      :wall-balance-mixed="wallBalanceMixed"
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
      :thickness-min-cm="thicknessMinCm"
      :thickness-mid-cm="thicknessMidCm"
      :thickness-max-cm="thicknessMaxCm"
      :measure-line-count="measureLines.length"
      @wall-thickness-input="onWallThicknessInput"
      @commit-wall-thickness="commitWallThickness"
      @apply-wall-thickness="applyWallsThicknessCm"
      @wall-balance-input="onWallBalanceInput"
      @commit-wall-balance="commitWallBalance"
      @opening-width-input="onOpeningWidthInput"
      @commit-opening-width="commitOpeningWidth"
      @opening-height-input="onOpeningHeightInput"
      @commit-opening-height="commitOpeningHeight"
      @opening-sill-z-input="onOpeningSillZInput"
      @commit-opening-sill-z="commitOpeningSillZ"
      @toggle-opening-hinge="toggleOpeningHingeAtStart"
      @toggle-opening-swing="toggleOpeningSwingRight"
      @opening-bovenlicht-change="onOpeningBovenlichtChange"
      @copy-opening="copySelectedOpening"
      @delete-openings="deleteSelectedOpenings"
      @split-wall="splitSelectedWall"
      @delete-walls="deleteSelectedWalls"
      @clear-selection="clearSelection"
      @clear-measures="clearMeasureLines"
    />
    <FmlPreviewMeasureOverlay
      :width="stageSize.width"
      :height="stageSize.height"
      :lines="measureLines"
      :preview="measurePreview"
      :to-screen="cmToScreen"
      :dashed="true"
    />
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
      :render-model="renderModel"
      :underlay-config="underlayConfig"
      :content-opacity="contentOpacity"
      :move-wall-polygon="moveWallPolygon"
      :settings-wall-polygons="settingsWallPolygons"
      :settings-wall-ids="settingsWallIds"
      :move-wall-id="moveWallId"
      :settings-opening-ids="settingsOpeningIds"
      :move-opening-id="moveOpeningId"
      :group-draggable="groupDraggable"
      :visible-junctions="visibleJunctions"
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
  </div>
</template>

<style scoped>
.fml-preview-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 320px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  overflow: hidden;
  background: #f8fafc;
}

.empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: #64748b;
}

.selection-box-preview {
  position: absolute;
  z-index: 9;
  border: 1.5px dashed #2563eb;
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
</style>
