<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Editor from '@/ui/editor/Editor.vue'
import Inspect from '@/ui/inspect/Inspect.vue'
import ElevationHost from '../components/ElevationHost.vue'
import ElevationHeightFields from '../components/ElevationHeightFields.vue'
import PlanOpeningOverflowNotice from '../components/PlanOpeningOverflowNotice.vue'
import EditorDefaultsFields from '../components/EditorDefaultsFields.vue'
import EditorDimensionFields from '../components/EditorDimensionFields.vue'
import EditorInspectPanel from '../components/EditorInspectPanel.vue'
import ThicknessCatalogFields from '../components/ThicknessCatalogFields.vue'
import PlanRescalePanel from '../components/PlanRescalePanel.vue'
import ScaleConfirmBar from '../components/ScaleConfirmBar.vue'
import ToolbeltIcon from '../components/canvas/ToolbeltIcon.vue'
import { hasToolbeltHotkey } from '@/ui/composables/canvas/useToolbeltHotkey'
import '../components/plan-panel-fields.css'
import {
  findOpeningHeightOverflows,
  summarizeOpeningHeightOverflows,
} from '@/core/plan/opening-height-overflow'
import { cloneUnderlayOriginLayout } from '@/core/plan/drawing-to-underlay-layout'
import {
  countExpandableBovenlicht,
  countFoldableBovenlicht,
  expandBovenlichtOnPlan,
  foldBovenlichtOnPlan,
  readBovenlichtPacked,
  writeBovenlichtPacked,
} from '@/core/plan/bovenlicht'
import { canApplyStampToFloor } from '@/core/plan/apply-stamp-to-floor'
import { useEditorDak } from '@/ui/composables/editor/useEditorDak'
import { useEditorDimensions } from '@/ui/composables/editor/useEditorDimensions'
import { useEditorGevels } from '@/ui/composables/editor/useEditorGevels'
import { useEditorUnderlay } from '@/ui/composables/editor/useEditorUnderlay'
import type { RebasePlanToItemRefidResult } from '@/core/plan/rebase-plan-to-item-refid'
import type { FloorPlan, ImportWarning } from '@/core/plan/types'
import { useEditorBindRoof } from '@/ui/composables/editor/useEditorBindRoof'
import { useEditorDownload } from '@/ui/composables/editor/useEditorDownload'
import { useEditorFacadeGroups } from '@/ui/composables/editor/useEditorFacadeGroups'
import { useEditorInspect } from '@/ui/composables/editor/useEditorInspect'
import { useEditorOrient } from '@/ui/composables/editor/useEditorOrient'
import { EDITOR_PLAN_FILE_ACCEPT } from '@/ui/composables/editor/parse-editor-plan-file'
import { useEditorLoad } from '@/ui/composables/editor/useEditorLoad'
import { useEditorSessionDefaults } from '@/ui/composables/editor/useEditorSessionDefaults'
import { cancelPlanChromeDialog, confirmPlanChrome } from '@/ui/composables/plan-chrome-dialog'
import type { PreviewUnderlayLayout } from '@/ui/composables/project/types'
import { loadUserSettings } from '@/ui/composables/settings/user-settings'
import type { ScaleInputUnit, UnitSystem } from '@/ui/composables/settings/scale-input-unit'
import { normalizeThicknessCatalog } from '@/core/plan/wall-thickness-catalog'

const { t } = useI18n()

const plan = ref<FloorPlan | null>(null)
const warnings = ref<ImportWarning[]>([])
const error = ref<string | null>(null)
const fileName = ref<string | null>(null)
const activeFloorIndex = ref(0)
const previewCanvasRef = ref<{
  flushPendingFieldCommits?: () => void
  sanitizeWalls?: () => boolean
  bindWallsToRoof?: (floorIndex: number) => {
    boundJunctions: number
    skippedBlocked: number
    skippedUncovered: number
    splits: number
    flushedEdges?: number
    boundSkylights?: number
    skippedSkylights?: number
  } | null
  applyStampToActiveFloor?: () => boolean
  canApplyStampOnActiveFloor?: () => boolean
  applyCornerMarkerModeFromSettings?: () => void
  resetView?: () => void
  pushUndo?: () => void
  convertOverlayToManual?: (source: 'autogen' | 'slicer') => boolean
} | null>(null)

const emit = defineEmits<{
  'update:canvasFullscreen': [value: boolean]
}>()

const sidebarOpen = ref(true)
const sidebarOpenBeforeFullscreen = ref(true)
const coarsePointer = ref(false)
const canvasFullscreen = ref(false)

watch(canvasFullscreen, (on) => {
  emit('update:canvasFullscreen', on)
  if (on) {
    sidebarOpenBeforeFullscreen.value = sidebarOpen.value
    sidebarOpen.value = false
    return
  }
  sidebarOpen.value = sidebarOpenBeforeFullscreen.value
})

const coarseMq = window.matchMedia('(pointer: coarse)')
const narrowMq = window.matchMedia('(max-width: 900px)')

function syncCoarsePointer(): void {
  coarsePointer.value = coarseMq.matches || narrowMq.matches
  if (coarsePointer.value) sidebarOpen.value = false
}

const reuseUnderlayWrapRef = ref<HTMLElement | null>(null)

const {
  viewerMode,
  inspectColors,
  lastInspectHit,
  inspectMode,
  onInspectSelect,
  resetInspectState,
} = useEditorInspect()

const /** FML-geometrie opacity 0–1; 0 = uit. */ contentOpacity = ref(0.8)
const /** Sesssie-only: kamer-/FML-labels verbergen. */ hidePlanText = ref(false)
const pendingAlignRebase = ref<RebasePlanToItemRefidResult | null>(null)
const userSettings = loadUserSettings()
const scaleInputUnit = ref<ScaleInputUnit>(userSettings.scaleInputUnit)
const unitSystem = ref<UnitSystem>(userSettings.unitSystem)
const thicknessPresetCms = ref<number[]>(
  normalizeThicknessCatalog(userSettings.defaults.thicknessCms),
)

function applyThicknessCatalog(cms: readonly number[]): void {
  thicknessPresetCms.value = normalizeThicknessCatalog(cms)
}

const floors = computed(() => plan.value?.floors ?? [])
const activeFloor = computed(() => floors.value[activeFloorIndex.value] ?? floors.value[0] ?? null)

let selectFloorLater: (index: number) => void | Promise<void> = () => {}
let leaveGevelsLater = (): void => {}

const underlayBox: { api: ReturnType<typeof useEditorUnderlay> | null } = { api: null }

const dak = useEditorDak({
  plan,
  activeFloorIndex,
  inspectMode,
  selectFloor: (index) => selectFloorLater(index),
  leaveGevelsMode: () => leaveGevelsLater(),
})
const gevels = useEditorGevels({
  plan,
  inspectMode,
  planUnderlayLayout: computed(() => underlayBox.api?.underlayLayout.value ?? null),
  planUnderlayWidthPx: computed(() => underlayBox.api?.underlayWidthPx.value ?? 0),
  planUnderlayHeightPx: computed(() => underlayBox.api?.underlayHeightPx.value ?? 0),
  scaleInputUnit,
  t,
  leaveDakMode: () => dak.leaveDakMode(),
  onLeaveGevels: (wasOn) => {
    const u = underlayBox.api
    if (!u) return
    if (wasOn) u.persistElevationUnderlayDrawing()
    u.cancelUnderlayScale()
    u.underlayMoveMode.value = false
  },
  onEnterGevels: () => {
    const u = underlayBox.api
    if (!u) return
    u.cancelUnderlayScale()
    u.underlayMoveMode.value = false
  },
})

const { dakMode, showDakChip, dakDesignTabs, leaveDakMode, enterDakMode } = dak
const {
  gevelsMode,
  elevationGroupId,
  elevationUnderlaySrc,
  elevationUnderlayWidthPx,
  elevationUnderlayHeightPx,
  elevationUnderlayLayout,
  showGevelsChip,
  elevationDakThicknessCm,
  elevationFloorGroups,
  elevationProjection,
  activeUnderlayLayout,
  activeUnderlayWidthPx,
  activeUnderlayHeightPx,
  leaveGevelsMode,
  enterGevelsMode,
  syncElevationUnderlayFromPlan,
  onElevationStoryHeight,
  onElevationNok,
  onElevationProjection,
  onElevationSlab,
} = gevels
leaveGevelsLater = leaveGevelsMode

const underlay = useEditorUnderlay({
  plan,
  activeFloorIndex,
  activeFloor,
  floors,
  inspectMode,
  gevelsMode,
  elevationGroupId,
  elevationUnderlaySrc,
  elevationUnderlayWidthPx,
  elevationUnderlayHeightPx,
  elevationUnderlayLayout,
  activeUnderlayLayout,
  activeUnderlayWidthPx,
  activeUnderlayHeightPx,
  syncElevationUnderlayFromPlan,
  previewCanvasRef,
  t,
})
underlayBox.api = underlay

const {
  underlaySrc,
  underlayWidthPx,
  underlayHeightPx,
  underlayLayout,
  underlayOpacity,
  underlayHint,
  underlayMoveMode,
  reuseUnderlayOpen,
  underlayFoldOpen,
  underlayReuseDonors,
  needsUnderlayReuse,
  underlayAvailable,
  underlayRotationDeg,
  canStartRescale,
  canStartUnderlayScale,
  rescaleOverlayActive,
  rescaleOverlayState,
  rescaleActive,
  rescaleState,
  rescaleDistanceMmX,
  rescaleDistanceMmY,
  underlayScaleActive,
  underlayScaleState,
  underlayScaleMmX,
  underlayScaleMmY,
  underlayScalePxX,
  underlayScalePxY,
  underlayScaleCanConfirm,
  underlayScaleMismatchPct,
  reuseDonorLabel,
  onReuseUnderlayFromDonor,
  clearUnderlayState,
  onUnderlayOpacityInput,
  onUnderlayFileInput,
  persistElevationUnderlayDrawing,
  persistActiveUnderlayDrawing,
  cancelPlanRescale,
  beginPlanRescale,
  setPlanRescaleDistanceMmX,
  setPlanRescaleDistanceMmY,
  confirmPlanRescale,
  cancelUnderlayScale,
  beginUnderlayScale,
  confirmUnderlayScale,
  onRescaleStateUpdate,
  syncUnderlayForActiveFloor,
  applyViewerUnderlayOrient,
  setUnderlayRotationDeg,
  onElevationUnderlayLayout,
} = underlay

function onViewerKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && reuseUnderlayOpen.value) {
    reuseUnderlayOpen.value = false
    return
  }
  if (event.key !== 'Escape' || !canvasFullscreen.value) return
  if (event.defaultPrevented) return
  if (hasToolbeltHotkey('Escape')) return
  canvasFullscreen.value = false
}

function onReuseUnderlayPointerDown(event: PointerEvent): void {
  if (!reuseUnderlayOpen.value) return
  const el = reuseUnderlayWrapRef.value
  if (el && event.target instanceof Node && el.contains(event.target)) return
  reuseUnderlayOpen.value = false
}

onMounted(() => {
  syncCoarsePointer()
  coarseMq.addEventListener('change', syncCoarsePointer)
  narrowMq.addEventListener('change', syncCoarsePointer)
  window.addEventListener('keydown', onViewerKeydown)
  document.addEventListener('pointerdown', onReuseUnderlayPointerDown, true)
})

onBeforeUnmount(() => {
  coarseMq.removeEventListener('change', syncCoarsePointer)
  narrowMq.removeEventListener('change', syncCoarsePointer)
  window.removeEventListener('keydown', onViewerKeydown)
  document.removeEventListener('pointerdown', onReuseUnderlayPointerDown, true)
  clearUnderlayState()
})

function flushPreviewFieldCommits(): void {
  previewCanvasRef.value?.flushPendingFieldCommits?.()
}

watch(elevationGroupId, (_next, prev) => {
  if (!gevelsMode.value) return
  if (prev) persistElevationUnderlayDrawing(prev)
  cancelUnderlayScale()
  underlayMoveMode.value = false
  void syncElevationUnderlayFromPlan()
})

function onAddFloorChip(): void {
  leaveGevelsMode()
  leaveDakMode()
  void addFloor()
}

watch(floors, (list) => {
  if (list.length === 0) {
    activeFloorIndex.value = 0
    return
  }
  if (activeFloorIndex.value >= list.length) {
    activeFloorIndex.value = list.length - 1
  }
})

watch(activeFloorIndex, () => {
  underlayMoveMode.value = false
  lastInspectHit.value = null
  void syncUnderlayForActiveFloor()
})

watch(viewerMode, (mode) => {
  if (mode === 'inspect') underlayMoveMode.value = false
})

// --- Inspect facade logic ---

const {
  memberFacadeGroups: inspectMemberFacadeGroups,
  addableFacadeGroups: inspectAddableFacadeGroups,
  onFacadeChange: onInspectFacadeChange,
  onFacadeSelectMembers: onInspectFacadeSelectMembers,
  onFacadeRemove: onInspectFacadeRemove,
} = useEditorFacadeGroups({ plan, lastInspectHit })

// --- Session defaults ---

const {
  sessionDefaults,
  activeFloorDefaults,
  defaultsForFloor,
  onFloorDefaultCm,
  onFloorDefaultBool,
  hydrateFloorDefaultsFromPlan,
  addFloorDefaultsSlot,
  removeFloorDefaultsSlot,
} = useEditorSessionDefaults({ plan, activeFloorIndex, t })

const bovenlichtPacked = computed(() => readBovenlichtPacked(plan.value))

async function onBovenlichtPackedChange(nextPacked: boolean): Promise<void> {
  if (!plan.value) return
  if (nextPacked === readBovenlichtPacked(plan.value)) return

  const defaultsResolver = (floorIndex: number) => {
    const d = defaultsForFloor(floorIndex)
    return {
      doorDefault: d.bovenlichtDefault,
      windowDefault: d.windowBovenlichtDefault,
      heightCm: d.bovenlichtHeightCm,
      gapCm: d.bovenlichtGapCm,
    }
  }
  const count = nextPacked
    ? countFoldableBovenlicht(plan.value)
    : countExpandableBovenlicht(plan.value, defaultsResolver)
  const ok = await confirmPlanChrome({
    title: t('viewer.bovenlichtPackedTitle'),
    message: nextPacked
      ? t('viewer.bovenlichtPackedFold', { count })
      : t('viewer.bovenlichtPackedExpand', { count }),
    confirmLabel: t('common.apply'),
    cancelLabel: t('common.cancel'),
  })
  if (!ok || !plan.value) return

  previewCanvasRef.value?.pushUndo?.()
  let next = plan.value
  next = nextPacked ? foldBovenlichtOnPlan(next) : expandBovenlichtOnPlan(next, defaultsResolver)
  plan.value = writeBovenlichtPacked(next, nextPacked)
}

// --- Dimensions ---

const {
  dimensionVis,
  dimensionSettings,
  canClearActiveDimensions,
  canConvertActiveDimensions,
  patchDimensionSettings,
  clearActiveDimensionType,
} = useEditorDimensions({ plan, activeFloorIndex })

function convertActiveDimensionsToManual(): void {
  const vis = dimensionVis.value
  if (vis !== 'autogen' && vis !== 'slicer') return
  const ok = previewCanvasRef.value?.convertOverlayToManual?.(vis) === true
  if (ok) dimensionVis.value = 'manual'
}

// --- Opacity / text ---

function onContentOpacityInput(event: Event): void {
  contentOpacity.value = Number((event.target as HTMLInputElement).value) / 100
}

// --- Opening overflow ---

const openingOverflow = computed(() => {
  const floor = activeFloor.value
  if (!floor) return null
  return summarizeOpeningHeightOverflows(
    findOpeningHeightOverflows(floor, {
      doorBovenlichtDefault: activeFloorDefaults.value.bovenlichtDefault,
      windowBovenlichtDefault: activeFloorDefaults.value.windowBovenlichtDefault,
      bovenlichtHeightCm: activeFloorDefaults.value.bovenlichtHeightCm,
      bovenlichtGapCm: activeFloorDefaults.value.bovenlichtGapCm,
    }),
  )
})

// --- Download ---

const { downloadCurrentExport } = useEditorDownload({
  plan,
  fileName,
  scaleInputUnit,
  thicknessPresetCms,
  activeFloorDefaults,
  defaultsForFloor,
  flushPendingFieldCommits: flushPreviewFieldCommits,
  persistActiveUnderlayDrawing,
})

// --- Orient ---

const {
  orientByFloor,
  activeFloorOrient,
  projectOrientFlipX,
  applyFloorOrient,
  applyProjectOrient,
} = useEditorOrient({ plan, activeFloorIndex, floors, underlayMoveMode })

// --- Stamp ---

const canApplyStamp = computed(
  () =>
    !inspectMode.value && !!plan.value && canApplyStampToFloor(plan.value, activeFloorIndex.value),
)

function applyStampFromSidebar(): void {
  previewCanvasRef.value?.applyStampToActiveFloor?.()
}

// --- Bind walls to roof ---
const { bindRoofHint, canBindWallsToRoof, bindWallsToRoof } = useEditorBindRoof({
  plan,
  activeFloorIndex,
  dakMode,
  gevelsMode,
  canvas: previewCanvasRef,
  t,
})

// --- Align fixture rebase ---

function applyAlignFixtureRebase(): void {
  const pending = pendingAlignRebase.value
  if (!pending) return
  plan.value = pending.plan
  pendingAlignRebase.value = null
  void syncUnderlayForActiveFloor()
}

function dismissAlignFixtureRebase(): void {
  pendingAlignRebase.value = null
}

watch(pendingAlignRebase, async (preview) => {
  if (!preview) {
    cancelPlanChromeDialog()
    return
  }
  const ok = await confirmPlanChrome({
    title: t('viewer.alignFixtureTitle'),
    message: t('viewer.alignFixtureBody'),
    detail:
      preview.missing.length > 0
        ? t('viewer.alignFixtureBodyPartial', {
            moved: preview.moved.length,
            total: floors.value.length,
          })
        : undefined,
    confirmLabel: t('common.apply'),
    cancelLabel: t('common.cancel'),
  })
  if (pendingAlignRebase.value !== preview) return
  if (ok) applyAlignFixtureRebase()
  else dismissAlignFixtureRebase()
})

function onPlanUpdate(next: FloorPlan, layout?: PreviewUnderlayLayout | null): void {
  plan.value = next
  if (layout !== undefined) {
    underlayLayout.value = layout ? cloneUnderlayOriginLayout(layout) : null
  }
}

watch(inspectMode, (on) => {
  if (on) {
    cancelPlanRescale()
    cancelUnderlayScale()
  }
})

// --- Load ---

const {
  loadFileName,
  isLoadingPlan,
  loadStatusLabel,
  floorLabel,
  selectFloor,
  setPlanName,
  renameFloor,
  addFloor,
  removeFloor,
  startNewPlan,
  loadPlan,
  hasOpenContent,
  onFileInput,
} = useEditorLoad({
  plan,
  warnings,
  error,
  fileName,
  activeFloorIndex,
  sessionDefaults,
  orientByFloor,
  pendingAlignRebase,
  contentOpacity,
  hidePlanText,
  floors,
  t,
  flushPreviewFieldCommits,
  cancelPlanRescale,
  cancelUnderlayScale,
  persistActiveUnderlayDrawing,
  clearUnderlayState,
  syncUnderlayForActiveFloor,
  resetInspectState,
  hydrateFloorDefaultsFromPlan,
  addFloorDefaultsSlot,
  removeFloorDefaultsSlot,
  applyThicknessCatalog,
})
selectFloorLater = selectFloor

function onSelectFloorChip(index: number): void {
  leaveGevelsMode()
  leaveDakMode()
  void selectFloor(index)
}

function onSelectDakDesign(floorIndex: number): void {
  if (!dakMode.value) enterDakMode()
  if (floorIndex !== activeFloorIndex.value) void selectFloor(floorIndex)
}

// --- Settings ---

function applyViewerSettings(): void {
  const settings = loadUserSettings()
  scaleInputUnit.value = settings.scaleInputUnit
  unitSystem.value = settings.unitSystem
  previewCanvasRef.value?.applyCornerMarkerModeFromSettings?.()
}

defineExpose({
  startNewPlan,
  loadPlan,
  hasOpenContent,
  applyViewerSettings,
  applyCornerMarkerModeFromSettings: () => applyViewerSettings(),
})
</script>

<template>
  <div
    class="editor-layout"
    :class="{
      'editor-layout--coarse': coarsePointer,
      'editor-layout--fullscreen': canvasFullscreen,
    }"
  >
    <div
      v-if="sidebarOpen && coarsePointer"
      class="sidebar-backdrop"
      @click="sidebarOpen = false"
    />
    <div
      v-show="sidebarOpen"
      class="sidebar-wrap"
      :class="{ 'sidebar-wrap--drawer': coarsePointer }"
    >
      <aside class="sidebar" :class="{ 'sidebar--drawer': coarsePointer }">
        <div v-if="coarsePointer" class="sidebar-handle" aria-hidden="true" />
        <div class="panel">
          <div class="viewer-header">
            <h3>FML viewer</h3>
          </div>
          <div v-if="plan" class="mode-tabs" role="tablist" aria-label="Viewer-modus">
            <button
              type="button"
              role="tab"
              class="mode-tab"
              :class="{ 'mode-tab--active': viewerMode === 'edit' }"
              :aria-selected="viewerMode === 'edit'"
              title="Bewerken"
              @click="viewerMode = 'edit'"
            >
              <ToolbeltIcon name="edit" />
              <span>Bewerken</span>
            </button>
            <button
              type="button"
              role="tab"
              class="mode-tab"
              :class="{ 'mode-tab--active': viewerMode === 'inspect' }"
              :aria-selected="viewerMode === 'inspect'"
              title="Inspectie"
              @click="viewerMode = 'inspect'"
            >
              <ToolbeltIcon name="inspect" />
              <span>Inspectie</span>
            </button>
          </div>
          <p class="hint">
            {{
              inspectMode
                ? t('viewer.inspectHint')
                : plan
                  ? t('viewer.editHint')
                  : t('viewer.emptyHint')
            }}
          </p>
          <div class="sidebar-icon-row">
            <button
              v-if="plan"
              type="button"
              class="sidebar-icon-btn"
              :title="t('result.downloadProject')"
              :aria-label="t('result.downloadProject')"
              @click="downloadCurrentExport"
            >
              <ToolbeltIcon name="download" />
              <span>{{ t('result.downloadProject') }}</span>
            </button>
            <button
              v-if="!plan"
              type="button"
              class="sidebar-icon-btn sidebar-icon-btn--primary"
              :title="t('viewer.newPlan')"
              :aria-label="t('viewer.newPlan')"
              :disabled="isLoadingPlan"
              @click="startNewPlan"
            >
              <ToolbeltIcon name="edit" />
              <span>{{ t('viewer.newPlan') }}</span>
            </button>
          </div>
          <p v-if="isLoadingPlan" class="load-status-inline" role="status" aria-live="polite">
            {{ loadStatusLabel }}
            <template v-if="loadFileName"> · {{ loadFileName }}</template>
          </p>
        </div>

        <div v-if="error" class="panel error-panel">{{ error }}</div>

        <div v-if="plan" class="panel">
          <div class="orient-block opacity-block">
            <div v-if="underlayAvailable" class="opacity-row">
              <div class="opacity-row__label">
                <span>{{ t('result.underlayOpacity') }}</span>
                <span>{{ Math.round(underlayOpacity * 100) }}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                :value="Math.round(underlayOpacity * 100)"
                :aria-label="t('result.underlayOpacityAria')"
                @input="onUnderlayOpacityInput"
              />
            </div>
            <div class="opacity-row">
              <div class="opacity-row__label">
                <span>{{ t('result.contentOpacity') }}</span>
                <span>{{ Math.round(contentOpacity * 100) }}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                :value="Math.round(contentOpacity * 100)"
                :aria-label="t('result.contentOpacityAria')"
                @input="onContentOpacityInput"
              />
            </div>
            <label class="hide-plan-text">
              <input
                type="checkbox"
                :checked="hidePlanText"
                :aria-label="t('result.hidePlanTextAria')"
                @change="hidePlanText = ($event.target as HTMLInputElement).checked"
              />
              <span>{{ t('result.hidePlanText') }}</span>
            </label>
          </div>

          <details v-if="!inspectMode" class="plan-fold defaults-fold">
            <summary>{{ t('project.title') }}</summary>
            <div class="project-block">
              <label class="defaults-field">
                <span>{{ t('project.name') }}</span>
                <input
                  type="text"
                  :value="plan.name"
                  :placeholder="t('project.namePlaceholder')"
                  @input="setPlanName(($event.target as HTMLInputElement).value)"
                />
              </label>
              <div class="sidebar-icon-row sidebar-plan-actions">
                <label
                  class="sidebar-icon-btn"
                  :class="{ 'is-disabled': isLoadingPlan }"
                  :title="t('viewer.chooseFml')"
                  :aria-label="t('viewer.chooseFml')"
                >
                  <ToolbeltIcon name="upload" />
                  <span>{{ t('viewer.chooseFml') }}</span>
                  <input
                    type="file"
                    :accept="EDITOR_PLAN_FILE_ACCEPT"
                    :disabled="isLoadingPlan"
                    @change="onFileInput"
                  />
                </label>
                <button
                  type="button"
                  class="sidebar-icon-btn"
                  :class="{ 'is-on': projectOrientFlipX }"
                  :disabled="!plan || floors.length === 0"
                  :title="t('result.mirrorProjectHint')"
                  :aria-label="t('result.mirrorProject')"
                  :aria-pressed="projectOrientFlipX"
                  @click="applyProjectOrient('flipX')"
                >
                  <ToolbeltIcon name="mirror_plan" />
                  <span>{{ t('result.mirrorProject') }}</span>
                </button>
              </div>
              <div class="floor-edit-list">
                <div
                  v-for="(floor, index) in floors"
                  :key="`${floor.level}-${index}`"
                  class="floor-edit-row"
                >
                  <input
                    type="text"
                    class="floor-edit-name"
                    :class="{ 'is-active': index === activeFloorIndex }"
                    :value="floor.name"
                    :placeholder="t('project.floorNamePlaceholder')"
                    :aria-label="t('project.selectFloor', { name: floorLabel(index) })"
                    @focus="selectFloor(index)"
                    @input="renameFloor(index, ($event.target as HTMLInputElement).value)"
                  />
                  <button
                    v-if="floors.length > 1"
                    type="button"
                    class="floor-edit-remove"
                    :title="t('project.removeFloor')"
                    :aria-label="t('project.removeFloor')"
                    @click="removeFloor(index)"
                  >
                    ×
                  </button>
                </div>
                <button type="button" class="sidebar-icon-btn floor-add-btn" @click="addFloor">
                  <ToolbeltIcon name="add" />
                  <span>{{ t('project.addFloor') }}</span>
                </button>
              </div>
              <div class="project-catalog">
                <span class="defaults-field">{{ t('viewer.thicknessCatalogTitle') }}</span>
                <p class="defaults-hint">{{ t('viewer.thicknessCatalogHint') }}</p>
                <ThicknessCatalogFields
                  :cms="thicknessPresetCms"
                  :unit="scaleInputUnit"
                  :unit-system="unitSystem"
                  hide-suffix
                  block
                  @update:cms="applyThicknessCatalog"
                />
              </div>
            </div>
          </details>

          <details
            v-if="!inspectMode"
            class="plan-fold defaults-fold"
            :class="{ 'is-reuse-needed': needsUnderlayReuse }"
            :open="underlayFoldOpen"
            @toggle="underlayFoldOpen = ($event.target as HTMLDetailsElement).open"
          >
            <summary>{{ t('viewer.underlayFold') }}</summary>
            <p v-if="needsUnderlayReuse" class="underlay-hint">
              {{ t('viewer.reuseUnderlayHintEmpty') }}
            </p>
            <p v-else-if="underlayHint" class="underlay-hint">{{ underlayHint }}</p>
            <div class="sidebar-icon-row sidebar-plan-actions">
              <div
                ref="reuseUnderlayWrapRef"
                class="underlay-reuse"
                :class="{ 'is-needed': needsUnderlayReuse }"
              >
                <button
                  type="button"
                  class="sidebar-icon-btn"
                  :class="{ 'is-on': reuseUnderlayOpen }"
                  :disabled="underlayReuseDonors.length === 0 || isLoadingPlan"
                  :title="
                    needsUnderlayReuse
                      ? t('viewer.reuseUnderlayHintEmpty')
                      : underlayReuseDonors.length > 0
                        ? t('viewer.reuseUnderlayHint')
                        : t('viewer.reuseUnderlayHintBlocked')
                  "
                  :aria-label="t('viewer.reuseUnderlay')"
                  :aria-expanded="reuseUnderlayOpen"
                  :aria-haspopup="true"
                  @click="reuseUnderlayOpen = !reuseUnderlayOpen"
                >
                  <ToolbeltIcon name="copy" />
                  <span>{{ t('viewer.reuseUnderlay') }}</span>
                </button>
                <div v-if="reuseUnderlayOpen" class="underlay-reuse-menu" role="listbox">
                  <button
                    v-for="opt in underlayReuseDonors"
                    :key="opt.id"
                    type="button"
                    role="option"
                    class="sidebar-icon-btn"
                    @click="onReuseUnderlayFromDonor(opt.id)"
                  >
                    {{ reuseDonorLabel(opt) }}
                  </button>
                </div>
              </div>
              <label
                class="sidebar-icon-btn"
                :title="t('viewer.uploadUnderlayHint')"
                :aria-label="t('viewer.uploadUnderlay')"
              >
                <ToolbeltIcon name="upload" />
                <span>{{ t('viewer.uploadUnderlay') }}</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                  :disabled="isLoadingPlan"
                  @change="onUnderlayFileInput"
                />
              </label>
              <button
                type="button"
                class="sidebar-icon-btn"
                :class="{ 'is-on': underlayScaleActive }"
                :disabled="!canStartUnderlayScale"
                :title="t('viewer.scaleUnderlayHint')"
                :aria-label="t('viewer.scaleUnderlay')"
                :aria-pressed="underlayScaleActive"
                @click="underlayScaleActive ? cancelUnderlayScale() : beginUnderlayScale()"
              >
                <ToolbeltIcon name="ruler" />
                <span>{{ t('viewer.scaleUnderlay') }}</span>
              </button>
            </div>
            <ScaleConfirmBar
              v-if="underlayScaleActive"
              :mm-x="underlayScaleMmX"
              :mm-y="underlayScaleMmY"
              :px-x="underlayScalePxX"
              :px-y="underlayScalePxY"
              :can-confirm="underlayScaleCanConfirm"
              :confirmed="false"
              :open="true"
              :unit="scaleInputUnit"
              :axis-mismatch-pct="underlayScaleMismatchPct"
              @update-mm-x="underlayScaleMmX = $event"
              @update-mm-y="underlayScaleMmY = $event"
              @confirm="confirmUnderlayScale()"
              @cancel="cancelUnderlayScale()"
            />
            <div v-if="underlayAvailable" class="orient-block">
              <p class="orient-label">{{ t('result.underlayOrientLabel') }}</p>
              <label class="defaults-field underlay-rotation-field">
                <span>{{ t('viewer.underlayRotation') }}</span>
                <div class="underlay-rotation-row">
                  <input
                    type="range"
                    min="-180"
                    max="180"
                    step="0.5"
                    :value="underlayRotationDeg"
                    :disabled="underlayOpacity <= 0"
                    :aria-label="t('viewer.underlayRotation')"
                    @input="
                      setUnderlayRotationDeg(Number(($event.target as HTMLInputElement).value))
                    "
                  />
                  <input
                    type="number"
                    step="0.5"
                    :value="underlayRotationDeg"
                    :disabled="underlayOpacity <= 0"
                    @change="
                      setUnderlayRotationDeg(Number(($event.target as HTMLInputElement).value))
                    "
                  />
                  <span class="underlay-rotation-unit">°</span>
                </div>
              </label>
              <div class="orient-actions">
                <button
                  type="button"
                  class="sidebar-icon-btn"
                  :class="{
                    'is-on': activeUnderlayLayout?.flipX === true,
                  }"
                  :disabled="underlayOpacity <= 0"
                  :title="t('result.underlayMirrorVerticalHint')"
                  :aria-label="t('result.underlayMirrorVertical')"
                  :aria-pressed="activeUnderlayLayout?.flipX === true"
                  @click="applyViewerUnderlayOrient()"
                >
                  <ToolbeltIcon name="mirror_underlay" />
                  <span>{{ t('result.underlayMirrorVertical') }}</span>
                </button>
                <button
                  type="button"
                  class="sidebar-icon-btn"
                  :class="{ 'is-on': underlayMoveMode }"
                  :disabled="underlayOpacity <= 0"
                  :title="t('result.underlayMoveHint')"
                  :aria-label="t('result.underlayMove')"
                  :aria-pressed="underlayMoveMode"
                  @click="underlayMoveMode = !underlayMoveMode"
                >
                  <ToolbeltIcon name="underlay_move" />
                  <span>{{ t('result.underlayMove') }}</span>
                </button>
              </div>
            </div>
          </details>

          <details v-if="gevelsMode && !inspectMode" class="plan-fold defaults-fold" open>
            <summary>{{ t('viewer.elevationHeightsFold') }}</summary>
            <ElevationHeightFields
              :unit="scaleInputUnit"
              :dak-thickness-cm="elevationDakThicknessCm"
              :floors="elevationFloorGroups"
              :projection="elevationProjection"
              @nok="onElevationNok"
              @story="onElevationStoryHeight"
              @slab="onElevationSlab"
              @projection="onElevationProjection"
            />
            <div class="sidebar-icon-row sidebar-plan-actions bind-roof-row">
              <button
                type="button"
                class="sidebar-icon-btn"
                :disabled="!canBindWallsToRoof"
                :title="t('viewer.bindWallsToRoofHint')"
                :aria-label="t('viewer.bindWallsToRoof')"
                @click="bindWallsToRoof"
              >
                <ToolbeltIcon name="roof" />
                <span>{{ t('viewer.bindWallsToRoof') }}</span>
              </button>
            </div>
            <p v-if="bindRoofHint" class="bind-roof-hint">{{ bindRoofHint }}</p>
          </details>

          <details v-if="!inspectMode && !gevelsMode" class="plan-fold defaults-fold">
            <summary>{{ t('viewer.planFold') }}</summary>
            <div class="sidebar-icon-row sidebar-plan-actions">
              <button
                type="button"
                class="sidebar-icon-btn"
                :class="{ 'is-on': rescaleActive }"
                :disabled="!canStartRescale"
                :title="t('result.rescaleHint')"
                :aria-label="t('result.rescale')"
                :aria-pressed="rescaleActive"
                @click="rescaleActive ? cancelPlanRescale() : beginPlanRescale()"
              >
                <ToolbeltIcon name="rescale" />
                <span>{{ t('result.rescale') }}</span>
              </button>
              <button
                type="button"
                class="sidebar-icon-btn"
                :disabled="!canStartRescale"
                :title="t('result.sanitizeHint')"
                :aria-label="t('result.sanitize')"
                @click="previewCanvasRef?.sanitizeWalls?.()"
              >
                <ToolbeltIcon name="sanitize" />
                <span>{{ t('result.sanitize') }}</span>
              </button>
              <button
                type="button"
                class="sidebar-icon-btn"
                :disabled="!canApplyStamp"
                :title="t('viewer.applyStampHint')"
                :aria-label="t('viewer.applyStamp')"
                @click="applyStampFromSidebar"
              >
                <ToolbeltIcon name="edit" />
                <span>{{ t('viewer.applyStamp') }}</span>
              </button>
              <button
                v-if="dakMode"
                type="button"
                class="sidebar-icon-btn"
                :disabled="!canBindWallsToRoof"
                :title="t('viewer.bindWallsToRoofHint')"
                :aria-label="t('viewer.bindWallsToRoof')"
                @click="bindWallsToRoof"
              >
                <ToolbeltIcon name="roof" />
                <span>{{ t('viewer.bindWallsToRoof') }}</span>
              </button>
            </div>
            <p v-if="dakMode && bindRoofHint" class="bind-roof-hint">{{ bindRoofHint }}</p>
            <PlanRescalePanel
              v-if="!underlayScaleActive"
              hide-start
              :active="rescaleActive"
              :can-start="canStartRescale"
              :state="rescaleState"
              :mm-x="rescaleDistanceMmX"
              :mm-y="rescaleDistanceMmY"
              :unit="scaleInputUnit"
              @begin="beginPlanRescale()"
              @cancel="cancelPlanRescale()"
              @confirm="confirmPlanRescale()"
              @update-mm-x="setPlanRescaleDistanceMmX"
              @update-mm-y="setPlanRescaleDistanceMmY"
            />
            <div class="orient-block">
              <p class="orient-label">{{ t('result.floorOrientLabel') }}</p>
              <div class="orient-actions">
                <button
                  type="button"
                  class="sidebar-icon-btn"
                  :class="{ 'is-on': activeFloorOrient.flipX }"
                  :title="t('result.mirrorVerticalHint')"
                  :aria-label="t('result.mirrorVertical')"
                  :aria-pressed="activeFloorOrient.flipX"
                  @click="applyFloorOrient('flipX')"
                >
                  <ToolbeltIcon name="mirror_plan" />
                  <span>{{ t('result.mirrorVertical') }}</span>
                </button>
                <button
                  type="button"
                  class="sidebar-icon-btn"
                  :title="t('result.rotate90CcwHint')"
                  :aria-label="t('result.rotate90Ccw')"
                  @click="applyFloorOrient('rotCcw')"
                >
                  <ToolbeltIcon name="rotate_plan_ccw" />
                  <span>{{ t('result.rotate90Ccw') }}</span>
                </button>
                <button
                  type="button"
                  class="sidebar-icon-btn"
                  :title="t('result.rotate90CwHint')"
                  :aria-label="t('result.rotate90Cw')"
                  @click="applyFloorOrient('rotCw')"
                >
                  <ToolbeltIcon name="rotate_plan_cw" />
                  <span>{{ t('result.rotate90Cw') }}</span>
                </button>
              </div>
            </div>
            <EditorDefaultsFields
              :defaults="activeFloorDefaults"
              :unit="scaleInputUnit"
              :bovenlicht-packed="bovenlichtPacked"
              :hint="t('viewer.defaultsHintFloor')"
              @cm="onFloorDefaultCm"
              @bool="onFloorDefaultBool"
              @packed="onBovenlichtPackedChange"
            />
          </details>

          <details v-if="!inspectMode && !gevelsMode && !dakMode" class="plan-fold defaults-fold">
            <summary>{{ t('viewer.dimensionsFold') }}</summary>
            <EditorDimensionFields
              :settings="dimensionSettings"
              :vis="dimensionVis"
              :can-clear="canClearActiveDimensions"
              :can-convert="canConvertActiveDimensions"
              @update:vis="dimensionVis = $event"
              @auto="patchDimensionSettings({ engineAutoDims: $event })"
              @mode="patchDimensionSettings({ dimensionMode: $event })"
              @outer="patchDimensionSettings({ generateOuterDimension: $event })"
              @convert-active="convertActiveDimensionsToManual"
              @clear-active="clearActiveDimensionType"
            />
          </details>

          <EditorInspectPanel
            v-if="inspectMode"
            :last-inspect-hit="lastInspectHit"
            :inspect-colors="inspectColors"
            :member-facade-groups="inspectMemberFacadeGroups"
            :addable-facade-groups="inspectAddableFacadeGroups"
            @facade-change="onInspectFacadeChange"
            @facade-remove="onInspectFacadeRemove"
            @facade-select-members="onInspectFacadeSelectMembers"
          />

          <div v-if="openingOverflow || warnings.length > 0" class="download-warnings">
            <PlanOpeningOverflowNotice
              v-if="openingOverflow"
              :summary="openingOverflow"
              :unit="scaleInputUnit"
            />
            <div v-if="warnings.length > 0" class="warnings">
              <p v-for="(warning, index) in warnings" :key="index">{{ warning.message }}</p>
            </div>
          </div>
          <div class="actions sidebar-download-row">
            <button
              type="button"
              class="upload-btn primary download-export"
              @click="downloadCurrentExport"
            >
              {{ t('result.downloadProject') }}
            </button>
          </div>
        </div>
      </aside>
      <button
        type="button"
        class="sidebar-edge-close"
        :aria-label="t('viewer.closeMenu')"
        :title="t('viewer.closeMenu')"
        @click="sidebarOpen = false"
      >
        <ToolbeltIcon name="close_menu" />
      </button>
    </div>

    <main class="viewer-main">
      <div
        v-if="isLoadingPlan"
        class="plan-load-overlay"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div class="plan-load-card">
          <div class="plan-load-spinner" aria-hidden="true" />
          <p class="plan-load-title">{{ loadStatusLabel }}</p>
          <p v-if="loadFileName" class="plan-load-file">{{ loadFileName }}</p>
          <p class="plan-load-hint">{{ t('viewer.loadHint') }}</p>
        </div>
      </div>
      <template v-if="plan">
        <div
          v-if="floors.length > 0 && !canvasFullscreen"
          class="floor-rail"
          role="tablist"
          :aria-label="t('project.railLabel')"
        >
          <span class="rail-label">{{ t('project.railLabel') }}</span>
          <div class="rail-floors">
            <button
              v-for="(floor, index) in floors"
              :key="`${floor.level}-${index}`"
              type="button"
              role="tab"
              class="floor-chip"
              :class="{ active: !gevelsMode && !dakMode && index === activeFloorIndex }"
              :aria-selected="!gevelsMode && !dakMode && index === activeFloorIndex"
              :disabled="isLoadingPlan"
              :title="floorLabel(index)"
              @click="onSelectFloorChip(index)"
            >
              {{ floorLabel(index) }}
            </button>
            <button
              type="button"
              class="floor-chip add"
              :disabled="isLoadingPlan"
              :title="t('project.addFloor')"
              :aria-label="t('project.addFloor')"
              @click="onAddFloorChip"
            >
              +
            </button>
            <button
              v-if="showGevelsChip"
              type="button"
              role="tab"
              class="floor-chip floor-chip--gevels"
              :class="{ active: gevelsMode }"
              :aria-selected="gevelsMode"
              :disabled="isLoadingPlan"
              :title="t('viewer.elevationTab')"
              @click="enterGevelsMode()"
            >
              {{ t('viewer.elevationTab') }}
            </button>
            <button
              v-if="showDakChip"
              type="button"
              role="tab"
              class="floor-chip floor-chip--dak"
              :class="{ active: dakMode }"
              :aria-selected="dakMode"
              :disabled="isLoadingPlan"
              :title="t('viewer.dakHint')"
              @click="enterDakMode()"
            >
              {{ t('viewer.dakTab') }}
            </button>
          </div>
        </div>
        <div class="viewer-canvas-host">
          <div
            v-if="dakMode && !inspectMode && !gevelsMode"
            class="dak-groups"
            role="tablist"
            :aria-label="t('viewer.dakTab')"
          >
            <button
              v-for="tab in dakDesignTabs"
              :key="`dak-${tab.floorIndex}`"
              type="button"
              role="tab"
              class="dak-group-chip"
              :class="{ active: tab.floorIndex === activeFloorIndex }"
              :aria-selected="tab.floorIndex === activeFloorIndex"
              @click="onSelectDakDesign(tab.floorIndex)"
            >
              {{ tab.name }}
            </button>
          </div>
          <button
            v-if="!sidebarOpen"
            type="button"
            class="sidebar-fab"
            :aria-label="t('viewer.menu')"
            :title="t('viewer.menu')"
            @click="sidebarOpen = true"
          >
            <ToolbeltIcon name="menu" />
          </button>
          <ElevationHost
            v-if="gevelsMode && !inspectMode && plan"
            ref="previewCanvasRef"
            :plan="plan"
            :group-id="elevationGroupId"
            :unit="scaleInputUnit"
            :underlay-src="elevationUnderlaySrc"
            :underlay-width-px="elevationUnderlayWidthPx"
            :underlay-height-px="elevationUnderlayHeightPx"
            :underlay-opacity="elevationUnderlaySrc ? underlayOpacity : 0"
            :content-opacity="contentOpacity"
            :cm-origin="elevationUnderlayLayout?.origin ?? null"
            :px-per-mm-x="elevationUnderlayLayout?.pxPerMmX ?? 1"
            :px-per-mm-y="elevationUnderlayLayout?.pxPerMmY ?? 1"
            :rotation-deg="elevationUnderlayLayout?.rotationDeg ?? 0"
            :flip-x="elevationUnderlayLayout?.flipX === true"
            :underlay-move-mode="underlayMoveMode && underlayOpacity > 0"
            :rescale-mode="underlayScaleActive"
            :rescale-state="underlayScaleState"
            :canvas-fullscreen="canvasFullscreen"
            :default-door-height-cm="activeFloorDefaults.doorHeightCm"
            :default-window-height-cm="activeFloorDefaults.windowHeightCm"
            :default-window-sill-z-cm="activeFloorDefaults.windowSillZCm"
            :bovenlicht-default="activeFloorDefaults.bovenlichtDefault"
            :window-bovenlicht-default="activeFloorDefaults.windowBovenlichtDefault"
            :bovenlicht-height-cm="activeFloorDefaults.bovenlichtHeightCm"
            :bovenlicht-gap-cm="activeFloorDefaults.bovenlichtGapCm"
            :bovenlicht-packed="bovenlichtPacked"
            :resolve-bovenlicht-defaults="
              (floorIndex) => {
                const d = defaultsForFloor(floorIndex)
                return {
                  doorDefault: d.bovenlichtDefault,
                  windowDefault: d.windowBovenlichtDefault,
                  heightCm: d.bovenlichtHeightCm,
                  gapCm: d.bovenlichtGapCm,
                }
              }
            "
            @plan-update="onPlanUpdate"
            @update:group-id="elevationGroupId = $event"
            @update:underlay-move-mode="underlayMoveMode = $event"
            @update-rescale-state="onRescaleStateUpdate"
            @cancel-rescale="cancelUnderlayScale()"
            @update:underlay-layout="onElevationUnderlayLayout"
            @update:canvas-fullscreen="canvasFullscreen = $event"
          />
          <Inspect
            v-else-if="inspectMode"
            ref="previewCanvasRef"
            :plan="plan"
            :floor-index="activeFloorIndex"
            :underlay-src="underlaySrc"
            :underlay-width-px="underlayWidthPx"
            :underlay-height-px="underlayHeightPx"
            :underlay-opacity="underlaySrc ? underlayOpacity : 0"
            :content-opacity="contentOpacity"
            :labels-visible="!hidePlanText"
            :cm-origin="underlayLayout?.origin ?? null"
            :px-per-mm-x="underlayLayout?.pxPerMmX ?? 1"
            :px-per-mm-y="underlayLayout?.pxPerMmY ?? 1"
            :rotation-deg="underlayLayout?.rotationDeg ?? 0"
            :flip-x="underlayLayout?.flipX === true"
            :inspect-colors="inspectColors"
            :canvas-fullscreen="canvasFullscreen"
            @inspect-select="onInspectSelect"
            @update:canvas-fullscreen="canvasFullscreen = $event"
          />
          <Editor
            v-else
            ref="previewCanvasRef"
            :plan="plan"
            :floor-index="activeFloorIndex"
            :underlay-src="underlaySrc"
            :underlay-width-px="underlayWidthPx"
            :underlay-height-px="underlayHeightPx"
            :underlay-opacity="underlaySrc ? underlayOpacity : 0"
            :content-opacity="contentOpacity"
            :labels-visible="!hidePlanText"
            :cm-origin="underlayLayout?.origin ?? null"
            :px-per-mm-x="underlayLayout?.pxPerMmX ?? 1"
            :px-per-mm-y="underlayLayout?.pxPerMmY ?? 1"
            :rotation-deg="underlayLayout?.rotationDeg ?? 0"
            :flip-x="underlayLayout?.flipX === true"
            :underlay-move-mode="underlayMoveMode && underlayOpacity > 0"
            :canvas-fullscreen="canvasFullscreen"
            :dimension-vis="dimensionVis"
            :dak-mode="dakMode"
            :thickness-preset-cms="thicknessPresetCms"
            :rescale-mode="rescaleOverlayActive"
            :rescale-state="rescaleOverlayState"
            :bovenlicht-default="activeFloorDefaults.bovenlichtDefault"
            :window-bovenlicht-default="activeFloorDefaults.windowBovenlichtDefault"
            :bovenlicht-height-cm="activeFloorDefaults.bovenlichtHeightCm"
            :bovenlicht-gap-cm="activeFloorDefaults.bovenlichtGapCm"
            :bovenlicht-packed="bovenlichtPacked"
            :default-door-height-cm="activeFloorDefaults.doorHeightCm"
            :default-window-height-cm="activeFloorDefaults.windowHeightCm"
            :default-window-sill-z-cm="activeFloorDefaults.windowSillZCm"
            @plan-update="onPlanUpdate"
            @update:underlay-move-mode="underlayMoveMode = $event"
            @update-rescale-state="onRescaleStateUpdate"
            @cancel-rescale="rescaleActive ? cancelPlanRescale() : cancelUnderlayScale()"
            @update:canvas-fullscreen="canvasFullscreen = $event"
            @update:dimension-vis="dimensionVis = $event"
          />
        </div>
      </template>
      <div v-else class="empty-state viewer-canvas-host">
        <button
          v-if="!sidebarOpen"
          type="button"
          class="sidebar-fab"
          :aria-label="t('viewer.menu')"
          :title="t('viewer.menu')"
          @click="sidebarOpen = true"
        >
          <ToolbeltIcon name="menu" />
        </button>
        <p>{{ t('viewer.emptyHint') }}</p>
        <button
          type="button"
          class="upload-btn primary"
          :disabled="isLoadingPlan"
          @click="startNewPlan"
        >
          {{ t('viewer.newPlan') }}
        </button>
        <label class="upload-btn" :class="{ 'upload-btn--disabled': isLoadingPlan }">
          {{ t('viewer.chooseFml') }}
          <input
            type="file"
            :accept="EDITOR_PLAN_FILE_ACCEPT"
            :disabled="isLoadingPlan"
            @change="onFileInput"
          />
        </label>
      </div>
    </main>
  </div>
</template>

<style scoped>
.editor-layout {
  position: relative;
  display: flex;
  height: 100%;
}

.viewer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.sidebar-fab {
  position: absolute;
  top: max(8px, env(safe-area-inset-top));
  left: max(8px, env(safe-area-inset-left));
  z-index: 28;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: rgb(255 255 255 / 0.96);
  color: #0f172a;
  box-shadow: 0 4px 16px rgb(15 23 42 / 0.12);
}

.sidebar-fab :deep(.canvas-toolbelt__icon) {
  width: 18px;
  height: 18px;
}

.sidebar-backdrop {
  position: absolute;
  inset: 0;
  z-index: 22;
  background: rgb(15 23 42 / 0.28);
}

.viewer-header h3 {
  margin: 0;
  font-size: 14px;
}

.sidebar-handle {
  display: none;
}

.sidebar-wrap {
  position: relative;
  width: 300px;
  flex-shrink: 0;
  height: 100%;
  z-index: 5;
}

.sidebar-wrap--drawer {
  position: absolute;
  top: max(8px, env(safe-area-inset-top, 0px));
  bottom: max(8px, env(safe-area-inset-bottom, 0px));
  left: max(8px, env(safe-area-inset-left, 0px));
  z-index: 24;
  width: min(320px, calc(92vw - env(safe-area-inset-left, 0px)));
}

.sidebar {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  border-right: 1px solid #e2e8f0;
  background: #f8fafc;
}

.sidebar--drawer {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: rgb(255 255 255 / 0.96);
  box-shadow: 0 4px 16px rgb(15 23 42 / 0.12);
}

.sidebar-icon-row .sidebar-icon-btn--primary {
  display: none;
}

.underlay-reuse {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.underlay-reuse.is-needed .underlay-reuse-menu {
  border-color: #93c5fd;
  background: #eff6ff;
}

.underlay-reuse-menu {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
}

@media (max-width: 600px) {
  .sidebar-wrap--drawer {
    top: auto;
    right: max(8px, env(safe-area-inset-right, 0px));
    width: auto;
    height: min(72vh, 620px);
  }

  .sidebar--drawer {
    border-radius: 10px;
  }

  .sidebar--drawer .sidebar-handle {
    display: block;
    width: 36px;
    height: 4px;
    margin: 8px auto 0;
    border-radius: 999px;
    background: #cbd5e1;
  }
}

.viewer-main {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 12px;
  background: #f1f5f9;
}

.editor-layout--coarse .viewer-main {
  padding: 8px;
}

.editor-layout--fullscreen .viewer-main {
  padding: 0;
}

.editor-layout--fullscreen .viewer-canvas-host > :deep(.plan-canvas-wrap) {
  border: none;
  border-radius: 0;
}

.plan-load-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(241, 245, 249, 0.82);
  backdrop-filter: blur(2px);
}

.plan-load-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  max-width: 320px;
  padding: 20px 24px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
  text-align: center;
}

.plan-load-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid #e2e8f0;
  border-top-color: #2563eb;
  border-radius: 50%;
  animation: plan-load-spin 0.7s linear infinite;
}

@keyframes plan-load-spin {
  to {
    transform: rotate(360deg);
  }
}

.plan-load-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
}

.plan-load-file {
  margin: 0;
  font-size: 12px;
  color: #64748b;
  word-break: break-all;
}

.plan-load-hint {
  margin: 4px 0 0;
  font-size: 11px;
  color: #94a3b8;
}

.load-status-inline {
  margin: 8px 0 0;
  font-size: 12px;
  color: #334155;
}

.upload-btn--disabled {
  opacity: 0.55;
  pointer-events: none;
}

.viewer-canvas-host {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.viewer-canvas-host > :deep(.plan-canvas-wrap) {
  flex: 1;
  min-height: 0;
}

.floor-rail {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  padding: 6px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #f8fafc;
  flex-shrink: 0;
}

.rail-label {
  font-size: 11px;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}

.rail-floors {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  min-width: 0;
  flex: 1;
}

.floor-chip {
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 12px;
  cursor: pointer;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.floor-chip.active {
  border-color: #2563eb;
  background: #dbeafe;
  color: #1e3a8a;
  font-weight: 600;
}

.floor-chip.add {
  min-width: 28px;
  font-weight: 600;
}

.dak-groups {
  position: absolute;
  top: 48px;
  left: 12px;
  z-index: 12;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.dak-group-chip {
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}

.dak-group-chip.active {
  background: #0f172a;
  color: #fff;
  border-color: #0f172a;
}

.defaults-fold {
  margin-top: 12px;
}

.defaults-hint {
  margin: 10px 0 8px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.4;
}

.defaults-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.defaults-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: #334155;
}

.defaults-field input {
  width: 100%;
  height: 28px;
  padding: 0 8px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 13px;
}

.project-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
}

.project-catalog {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.project-catalog .defaults-hint {
  margin: 0 0 4px;
}

.floor-edit-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.floor-edit-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.floor-edit-name {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 13px;
}

.floor-edit-name.is-active {
  border-color: #2563eb;
  box-shadow: 0 0 0 1px #2563eb;
}

.floor-edit-remove {
  width: 28px;
  height: 28px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
  color: #64748b;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}

.floor-add-btn {
  align-self: flex-start;
}

.underlay-hint {
  margin: 8px 0 0;
  font-size: 11px;
  color: #b45309;
  line-height: 1.4;
}

.bind-roof-row {
  margin-top: 10px;
}

.bind-roof-hint {
  margin: 6px 0 0;
  font-size: 11px;
  color: #475569;
  line-height: 1.35;
}

.underlay-rotation-field {
  margin: 8px 0;
}

.underlay-rotation-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.underlay-rotation-row input[type='range'] {
  flex: 1;
  min-width: 0;
}

.underlay-rotation-row input[type='number'] {
  width: 64px;
  flex: none;
}

.underlay-rotation-unit {
  font-size: 12px;
  color: #64748b;
}

.defaults-check {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  font-size: 12px;
  color: #334155;
}

.panel {
  padding: 12px 16px;
  border-bottom: 1px solid #e2e8f0;
}

.sidebar--drawer .panel {
  padding: 10px 12px;
  background: transparent;
}

.sidebar--drawer .panel:last-child {
  border-bottom: none;
}

.panel h3 {
  margin: 0 0 8px;
  font-size: 14px;
}

.hint {
  margin: 0 0 12px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.45;
}

.mode-tabs {
  display: flex;
  gap: 0;
  margin: 0 0 8px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  overflow: hidden;
}

.mode-tab {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 0;
  background: #fff;
  padding: 6px 8px;
  font-size: 12px;
  color: #475569;
  cursor: pointer;
}

.mode-tab :deep(.canvas-toolbelt__icon) {
  width: 16px;
  height: 16px;
}

.mode-tab + .mode-tab {
  border-left: 1px solid #cbd5e1;
}

.mode-tab--active {
  background: #1e293b;
  color: #fff;
  font-weight: 600;
}

.download-warnings {
  margin: 16px 0 0;
}

.warnings {
  margin: 0 0 8px;
  font-size: 11px;
  color: #b45309;
}

.warnings p {
  margin: 0 0 4px;
}

.orient-block {
  margin: 10px 0 0;
}

.opacity-block {
  margin-top: 8px;
}

.opacity-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0 0 8px;
  font-size: 12px;
  color: #334155;
  user-select: none;
}

.opacity-row__label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.opacity-row input[type='range'] {
  width: 100%;
  min-width: 0;
}

.hide-plan-text {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 4px;
  font-size: 12px;
  color: #334155;
  cursor: pointer;
  user-select: none;
}

.hide-plan-text input {
  margin: 0;
}

.orient-label {
  margin: 0 0 6px;
  font-size: 11px;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.orient-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.actions {
  display: flex;
  justify-content: center;
  margin-top: 16px;
}

.download-export {
  min-width: 180px;
  height: 36px;
}

.upload-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  padding: 4px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: #fff;
  font-size: 12px;
  cursor: pointer;
}

.upload-btn input {
  display: none;
}

.upload-btn.primary {
  background: #2563eb;
  color: #fff;
  border-color: #2563eb;
}

.error-panel {
  color: #b91c1c;
  font-size: 12px;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #64748b;
  font-size: 14px;
}
</style>
