<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FloorPlan } from '@/core/fml/types'
import { BOVENLICHT_GAP_CM, BOVENLICHT_HEIGHT_CM } from '@/core/fml/bovenlicht'
import {
  DEFAULT_FML_DOOR_HEIGHT_CM,
  DEFAULT_FML_WINDOW_HEIGHT_CM,
  DEFAULT_FML_WINDOW_SILL_Z_CM,
} from '@/core/fml/extraction-to-plan-types'
import type { ElevationBovenlichtDefaults } from '@/core/fml/facade-elevation'
import type { HScaleState } from '@/platform/calibration'
import type { UnderlayOriginLayout } from '@/core/fml/translate-floor-plan'
import { FML_PREVIEW_CHROME_SELECTOR } from '@/ui/composables/fml-preview/fml-preview-gestures'
import { useFmlPreviewUnderlayMove } from '@/ui/composables/fml-preview/useFmlPreviewUnderlayMove'
import { useFmlPreviewPanZoom } from '@/ui/composables/fml-preview/useFmlPreviewPanZoom'
import { useFmlElevationPointer } from '@/ui/composables/fml-preview/useFmlElevationPointer'
import { useFmlCanvasTouch, useFmlTouchNav } from '@/ui/composables/fml-preview/useFmlCanvasTouch'
import { useStage } from '@/platform/canvas'
import { useChromeFitScale } from '@/ui/composables/useChromeFitScale'
import { useFmlElevationRenderModel } from '@/ui/composables/fml-preview/useFmlElevationRenderModel'
import { useFmlElevationInteraction } from '@/ui/composables/fml-preview/useFmlElevationInteraction'
import { resolveOpeningHeight, resolveWindowSillZ } from '@/ui/components/fml-preview-openings'
import {
  DEFAULT_PLAN_DISPLAY_STYLE,
  type PlanDisplayStyleChoice,
} from '@/ui/composables/settings/plan-display-style'
import { loadUserSettings, setShowCanvasGrid } from '@/ui/composables/settings/user-settings'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import type { ToolbeltItem } from './canvas/canvas-toolbelt.types'
import { TOOLBELT_HOTKEY_PRIORITY } from '@/ui/composables/canvas/useToolbeltHotkey'
import FmlEditorTopbar from './FmlEditorTopbar.vue'
import FmlEditorModifierRail from './FmlEditorModifierRail.vue'
import FmlElevationHeightOnlyFields from './FmlElevationHeightOnlyFields.vue'
import FmlElevationOpeningFields from './FmlElevationOpeningFields.vue'
import FmlElevationOpeningQuickFields from './FmlElevationOpeningQuickFields.vue'
import FmlOpeningAddToolFields from './FmlOpeningAddToolFields.vue'
import FmlPreviewMeasureOverlay from './FmlPreviewMeasureOverlay.vue'
import FmlRescaleOverlay from './FmlRescaleOverlay.vue'
import CanvasToolbelt from './canvas/CanvasToolbelt.vue'
import ToolbeltActionButton from './canvas/ToolbeltActionButton.vue'
import CanvasGuideGrid from './canvas/CanvasGuideGrid.vue'
import FmlElevationStagePlanes from './FmlElevationStagePlanes.vue'
import FmlElevationStageGuides from './FmlElevationStageGuides.vue'
import FmlElevationStageHandles from './FmlElevationStageHandles.vue'
import './canvas/canvas-toolbelt.css'
import { facadeGroupDisplayName } from '@/ui/composables/fml-preview/facade-group-label'

const props = withDefaults(
  defineProps<{
    plan: FloorPlan
    groupId: string
    underlaySrc?: string | null
    underlayWidthPx?: number
    underlayHeightPx?: number
    underlayOpacity?: number
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
    bovenlichtPacked?: boolean
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

// --- Settings state ---
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

// --- Bovenlicht defaults resolver ---
function floorBovenlichtDefaults(floorIndex: number): ElevationBovenlichtDefaults {
  if (props.resolveBovenlichtDefaults) return props.resolveBovenlichtDefaults(floorIndex)
  return {
    doorDefault: props.bovenlichtDefault === true,
    windowDefault: props.windowBovenlichtDefault === true,
    heightCm: props.bovenlichtHeightCm ?? BOVENLICHT_HEIGHT_CM,
    gapCm: props.bovenlichtGapCm ?? BOVENLICHT_GAP_CM,
  }
}

// --- Pan/zoom + stage ---
const isPanDragging = ref(false)
const { spacePressed, onKeyDown: onSpaceKeyDown, onKeyUp: onSpaceKeyUp } = useStage()

// --- Underlay move ---
const underlayMoveMode = computed({
  get: () => props.underlayMoveMode === true,
  set: (on: boolean) => emit('update:underlayMoveMode', on),
})

// --- Touch ---
const elevTouchEditor = computed(() => true)
const { useTouchNav } = useFmlTouchNav(elevTouchEditor)

const canvasLocked = computed(() => underlayMoveMode.value || props.rescaleMode === true)

// --- Interaction composable (created first — owns selection/tool state) ---
import type { FacadeElevation } from '@/core/fml/facade-elevation'
import type { ContentLayout } from '@/ui/composables/fml-preview/useFmlPreviewViewport'
const _elevation = shallowRef<FacadeElevation | null>(null)

// Pointer needs viewport from render model, but render model needs interaction refs.
// Solution: create a minimal viewport first for pointer, then feed both composables.
// Actually simpler: create interaction with a lazy elevation getter via computed.
// We'll assign _elevation from the render model's output after creation.

// Pointer stub — will be populated after render model.
const _containerForPointer = containerRef
const _viewScaleStub = ref(1)
const _viewPositionStub = ref({ x: 0, y: 0 })
const _contentLayoutStub = ref(null) as Ref<ContentLayout | null>

const { clientToCm: _clientToCmStub, pointerCm: _pointerCmStub } = useFmlElevationPointer({
  containerRef: _containerForPointer,
  viewScale: _viewScaleStub,
  viewPosition: _viewPositionStub,
  contentLayout: _contentLayoutStub,
  toCmPoint: (x, y) => {
    const xform = render?.layoutXform?.value
    return xform ? xform.toCmPoint(x, y) : { x, y }
  },
})

const interaction = useFmlElevationInteraction({
  props,
  emit: {
    planUpdate: (plan) => emit('planUpdate', plan),
    cancelRescale: () => emit('cancelRescale'),
  },
  elevation: _elevation,
  clientToCm: (cx, cy) => _clientToCmStub(cx, cy),
  pointerCm: (event) => _pointerCmStub(event),
  viewScale: _viewScaleStub,
  contentLayout: _contentLayoutStub,
  canvasLocked,
  underlayMoveMode,
  useTouchNav,
  floorBovenlichtDefaults,
})

// --- Render model composable ---
const render = useFmlElevationRenderModel({
  props,
  containerRef,
  settingsTarget: interaction.settingsTarget,
  selectedOpeningId: interaction.selectedOpeningId,
  splitDraft: interaction.splitDraft,
  planDisplayStyle,
  floorBovenlichtDefaults,
  t,
})

const {
  elevation,
  groups,
  viewport,
  stageSize,
  viewScale,
  viewPosition,
  contentLayout,
  resetView,
  mountResizeObserver,
  unmountResizeObserver,
  layoutXform,
  underlayConfig,
  cmToScreen,
  screenToCm,
} = render

// Wire the render model outputs back to the stubs used by interaction/pointer.
watch(
  elevation,
  (v) => {
    _elevation.value = v
  },
  { immediate: true },
)
watch(
  viewScale,
  (v) => {
    _viewScaleStub.value = v
  },
  { immediate: true },
)
watch(
  viewPosition,
  (v) => {
    _viewPositionStub.value = v
  },
  { immediate: true },
)
watch(
  contentLayout,
  (v) => {
    _contentLayoutStub.value = v
  },
  { immediate: true },
)

// --- Pointer (real, for host use) ---
const { clientToCm } = useFmlElevationPointer({
  containerRef,
  viewScale,
  viewPosition,
  contentLayout,
  toCmPoint: (x, y) => layoutXform.value.toCmPoint(x, y),
})

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

const underlayMove = useFmlPreviewUnderlayMove({
  hitTest: { clientToCm },
  underlayMoveMode,
  getUnderlayLayout: elevationUnderlayLayoutFromProps,
  setFmlNulpuntImageCm: () => undefined,
  syncLayoutToParent: (layout) => emit('update:underlayLayout', layout),
  beforeBegin: () => undefined,
})

const {
  activeTool,
  addDoorSubtype,
  addDoorWidthCm,
  addDoorSillZCm,
  addWindowSubtype,
  addWindowWidthCm,
  addWindowSillZCm,
  addWindowHeightCm,
  settingsTarget,
  elevSettingsOpen,
  selectedOpening,
  openingSubtype,
  selectedOpeningBovenlicht,
  selectedOpeningBovenlichtHeightCm,
  selectedOpeningBovenlichtGapCm,
  selectedOpeningHingeAtStart,
  selectedOpeningSwingRight,
  settingsWall,
  settingsSlab,
  settingsJunction,
  settingsRidge,
  settingsRoof,
  undoStack,
  redoStack,
  elevMoveMod,
  elevSettingsMod,
  elevAxisLockMod,
  precisePreview,
  elevationMeasureLines,
  onContentClick,
  onContentMove,
  onElevToolChange,
  closeElevToolbelt,
  commitOpeningSubtype,
  copySelectedOpening,
  deleteSelectedOpening,
  deleteSelectedRidge,
  deleteSelectedRoof,
  commitSelectedField,
  commitSelectedBovenlicht,
  commitSelectedBovenlichtHeight,
  commitSelectedBovenlichtGap,
  toggleSelectedOpeningHinge,
  toggleSelectedOpeningSwing,
  commitWallHeight,
  commitWallBottomZ,
  commitJunctionHeight,
  commitJunctionBottomZ,
  commitRidgeHeight,
  commitRoofVertexHeight,
  commitSlabHeight,
  undoEdit,
  redoEdit,
  pushUndo,
  cleanupListeners,
  onGroupChange,
  onKeydown,
  onTouchEditPointerDown,
  onTouchEditPointerMove,
} = interaction

// --- Pan/zoom composable ---
const panZoom = useFmlPreviewPanZoom({
  viewport,
  containerRef,
  isPanDragging,
  onBeforePan: () => undefined,
})

// --- Toolbelt items ---
const elevLibraryTools = computed<ToolbeltItem[]>(() => [
  { id: 'add_door', icon: 'door', label: t('toolbelt.fml.addDoor') },
  { id: 'add_window', icon: 'window', label: t('toolbelt.fml.addWindow') },
  { id: 'add_ridge', icon: 'ridge', label: t('toolbelt.fml.addRidge') },
  { id: 'add_roof', icon: 'roof', label: t('toolbelt.fml.addRoof') },
  { id: 'split', icon: 'split', label: t('result.toolbar.splitWall') },
])

// --- Touch canvas ---
useFmlCanvasTouch({
  containerRef,
  enabled: useTouchNav,
  viewScale,
  viewPosition,
  getTool: () => activeTool.value,
  moveMod: elevMoveMod,
  blockEdit: () => canvasLocked.value,
  onEditPointerDown: onTouchEditPointerDown,
  onEditPointerMove: onTouchEditPointerMove,
})

// --- Lifecycle ---
onMounted(() => {
  mountResizeObserver()
  window.addEventListener('keydown', onSpaceKeyDown)
  window.addEventListener('keyup', onSpaceKeyUp)
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  unmountResizeObserver()
  window.removeEventListener('keydown', onSpaceKeyDown)
  window.removeEventListener('keyup', onSpaceKeyUp)
  window.removeEventListener('keydown', onKeydown)
  cleanupListeners()
})

// --- Watchers ---
watch(
  () => props.groupId,
  () => {
    onGroupChange()
    resetView()
  },
)

watch(underlayMoveMode, (on) => {
  if (!on) return
  interaction.splitDraft.value = null
  interaction.ridgePlacePreview.value = null
  interaction.roofPlaceDraft.value = null
  interaction.roofPlacePreview.value = null
  interaction.roofPlaceHover.value = null
  interaction.snapGuide.value = null
  activeTool.value = 'select'
})

// --- Host pointer-down ---
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
        {{ facadeGroupDisplayName(group, t) }}
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
          <FmlElevationStagePlanes
            :elevation="elevation"
            :render="render"
            :interaction="interaction"
            :content-opacity="contentOpacity"
          />
          <FmlElevationStageGuides
            :elevation="elevation"
            :render="render"
            :interaction="interaction"
          />
          <FmlElevationStageHandles
            :elevation="elevation"
            :render="render"
            :interaction="interaction"
          />
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
            <template v-if="settingsRoof">
              <span v-if="settingsRoof.heightCm == null" class="fml-toolbelt__meta">
                {{ t('viewer.elevationRoof', { name: settingsRoof.name }) }}
              </span>
              <FmlElevationHeightOnlyFields
                v-else
                :key="`roof-${settingsRoof.id}-${settingsRoof.vertexIndex}`"
                :unit="unit"
                :title="t('viewer.elevationRoof', { name: settingsRoof.name })"
                :height-cm="settingsRoof.heightCm"
                :min="settingsRoof.minCm"
                :max="800"
                @height="commitRoofVertexHeight"
              />
              <ToolbeltActionButton
                icon="delete"
                :title="t('result.toolbar.deleteRoof')"
                :aria-label="t('result.toolbar.deleteRoof')"
                hotkey="Delete"
                :hotkey-priority="TOOLBELT_HOTKEY_PRIORITY.object"
                @click="deleteSelectedRoof"
              />
            </template>
            <template v-else-if="settingsRidge">
              <FmlElevationHeightOnlyFields
                :key="`ridge-${settingsRidge.wallId}-${settingsRidge.floorIndex}-${settingsRidge.end ?? 'both'}`"
                :unit="unit"
                :title="t('viewer.elevationRidgeZ', { name: settingsRidge.name })"
                :height-cm="settingsRidge.heightCm"
                :min="0"
                :max="800"
                @height="commitRidgeHeight"
              />
              <ToolbeltActionButton
                icon="delete"
                :title="t('result.toolbar.deleteRidge')"
                :aria-label="t('result.toolbar.deleteRidge')"
                hotkey="Delete"
                :hotkey-priority="TOOLBELT_HOTKEY_PRIORITY.object"
                @click="deleteSelectedRidge"
              />
            </template>
            <template v-else-if="settingsJunction">
              <FmlElevationHeightOnlyFields
                :key="`junc-${settingsJunction.id}`"
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
              <ToolbeltActionButton
                v-if="settingsJunction.ridge"
                icon="delete"
                :title="t('result.toolbar.deleteRidge')"
                :aria-label="t('result.toolbar.deleteRidge')"
                hotkey="Delete"
                :hotkey-priority="TOOLBELT_HOTKEY_PRIORITY.object"
                @click="deleteSelectedRidge"
              />
            </template>
            <FmlElevationHeightOnlyFields
              v-else-if="settingsWall"
              :key="`wall-${settingsWall.wallId}-${settingsWall.floorIndex}`"
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
              :key="`slab-${settingsSlab.floorIndex}`"
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
            <ToolbeltActionButton
              icon="clear"
              :title="t('result.toolbar.deactivateDrawTool')"
              :aria-label="t('result.toolbar.deactivateDrawTool')"
              hotkey="Escape"
              :hotkey-priority="TOOLBELT_HOTKEY_PRIORITY.tool"
              @click="closeElevToolbelt()"
            />
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
