<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FmlPreviewCanvas from '../components/FmlPreviewCanvas.vue'
import FmlOpeningOverflowNotice from '../components/FmlOpeningOverflowNotice.vue'
import FmlRescalePanel from '../components/FmlRescalePanel.vue'
import ToolbeltIcon from '../components/canvas/ToolbeltIcon.vue'
import '../components/fml-panel-fields.css'
import { buildFmlV3 } from '@/core/fml/buildFmlV3'
import {
  findOpeningHeightOverflows,
  summarizeOpeningHeightOverflows,
} from '@/core/fml/opening-height-overflow'
import {
  cloneUnderlayOriginLayout,
  previewUnderlayLayoutFromDrawing,
} from '@/core/fml/drawing-to-underlay-layout'
import {
  applyFloorOrientOp,
  composeFloorOrient,
  defaultFloorOrient,
  type FloorOrientOp,
  type FloorOrientState,
} from '@/core/fml/floor-plan-orient'
import { downloadFml } from '@/core/fml/downloadFml'
import { scaleFloorPlan, scaleUnderlayLayout } from '@/core/fml/scale-floor-plan'
import type { RebasePlanToItemRefidResult } from '@/core/fml/rebase-plan-to-item-refid'
import type { FloorPlan, ImportWarning } from '@/core/fml/types'
import type { HScaleState } from '@/platform/calibration'
import { inspectKindLabel } from '@/ui/composables/fml-preview/fml-inspect'
import { useFmlViewerInspect } from '@/ui/composables/fml-viewer/useFmlViewerInspect'
import { useFmlViewerLoad } from '@/ui/composables/fml-viewer/useFmlViewerLoad'
import { useFmlViewerSessionDefaults } from '@/ui/composables/fml-viewer/useFmlViewerSessionDefaults'
import type { PreviewUnderlayLayout } from '@/ui/composables/project/types'
import { loadUserSettings } from '@/ui/composables/settings/user-settings'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import {
  initFmlRescaleStateFromWalls,
  measuredCmFromRescaleState,
  resolveRescaleFactorsFromRulers,
} from '@/ui/composables/workspace/fml-rescale-from-measure'
import { imageDimensions, loadImage } from '@/ui/composables/workspace/imageUtils'

const { t } = useI18n()

const plan = ref<FloorPlan | null>(null)
const warnings = ref<ImportWarning[]>([])
const error = ref<string | null>(null)
const underlayHint = ref<string | null>(null)
const fileName = ref<string | null>(null)
const activeFloorIndex = ref(0)
const previewCanvasRef = ref<{
  flushPendingFieldCommits: () => void
  sanitizeWalls: () => boolean
  applyCornerMarkerModeFromSettings: () => void
} | null>(null)

const emit = defineEmits<{
  'update:canvasFullscreen': [value: boolean]
}>()

const sidebarOpen = ref(true)
const coarsePointer = ref(false)
const canvasFullscreen = ref(false)

watch(canvasFullscreen, (on) => {
  emit('update:canvasFullscreen', on)
  if (on) sidebarOpen.value = false
})

const coarseMq = window.matchMedia('(pointer: coarse)')
const narrowMq = window.matchMedia('(max-width: 900px)')

function syncCoarsePointer(): void {
  coarsePointer.value = coarseMq.matches || narrowMq.matches
  if (coarsePointer.value) sidebarOpen.value = false
}

function onViewerKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && canvasFullscreen.value) {
    canvasFullscreen.value = false
  }
}

onMounted(() => {
  syncCoarsePointer()
  coarseMq.addEventListener('change', syncCoarsePointer)
  narrowMq.addEventListener('change', syncCoarsePointer)
  window.addEventListener('keydown', onViewerKeydown)
})

onBeforeUnmount(() => {
  coarseMq.removeEventListener('change', syncCoarsePointer)
  narrowMq.removeEventListener('change', syncCoarsePointer)
  window.removeEventListener('keydown', onViewerKeydown)
})

function flushPreviewFieldCommits(): void {
  previewCanvasRef.value?.flushPendingFieldCommits()
}

const underlaySrc = ref<string | null>(null)
const underlayWidthPx = ref(0)
const underlayHeightPx = ref(0)
const underlayLayout = ref<PreviewUnderlayLayout | null>(null)
const underlayOpacity = ref(0.5)
/** FML-geometrie opacity 0–1; 0 = uit. */
const fmlOpacity = ref(0.8)
/** Sesssie-only: kamer-/FML-labels verbergen. */
const hidePlanText = ref(false)
/** Per-floor FML-oriëntatie (viewer heeft geen regenerate-from-detectie). */
const orientByFloor = ref<Record<number, FloorOrientState>>({})
const underlayMoveMode = ref(false)
const pendingAlignRebase = ref<RebasePlanToItemRefidResult | null>(null)
const scaleInputUnit = ref<ScaleInputUnit>(loadUserSettings().scaleInputUnit)

const {
  viewerMode,
  inspectColors,
  lastInspectHit,
  inspectMode,
  onInspectSelect,
  resetInspectState,
} = useFmlViewerInspect()

const { sessionDefaults, onSessionDefaultNumber, onSessionDefaultBool } =
  useFmlViewerSessionDefaults({ plan, activeFloorIndex, t })

const fmlRescaleActive = ref(false)
const fmlRescaleState = ref<HScaleState | null>(null)
const fmlRescaleDistanceMmX = ref(0)
const fmlRescaleDistanceMmY = ref(0)

function cancelFmlRescale(): void {
  fmlRescaleActive.value = false
  fmlRescaleState.value = null
}

function beginFmlRescale(): boolean {
  if (inspectMode.value) return false
  const walls = plan.value?.floors[activeFloorIndex.value]?.walls ?? []
  const state = initFmlRescaleStateFromWalls(walls)
  if (!state) return false
  const measured = measuredCmFromRescaleState(state)
  fmlRescaleState.value = state
  fmlRescaleDistanceMmX.value = measured.x * 10
  fmlRescaleDistanceMmY.value = measured.y * 10
  underlayMoveMode.value = false
  fmlRescaleActive.value = true
  return true
}

function updateFmlRescaleState(next: HScaleState): void {
  if (!fmlRescaleActive.value) return
  fmlRescaleState.value = { ...next }
}

function setFmlRescaleDistanceMmX(mm: number): void {
  if (!(mm > 0) || !Number.isFinite(mm)) return
  fmlRescaleDistanceMmX.value = mm
}

function setFmlRescaleDistanceMmY(mm: number): void {
  if (!(mm > 0) || !Number.isFinite(mm)) return
  fmlRescaleDistanceMmY.value = mm
}

function confirmFmlRescale(): boolean {
  const state = fmlRescaleState.value
  const current = plan.value
  if (!state || !fmlRescaleActive.value || !current) return false
  const measured = measuredCmFromRescaleState(state)
  const factors = resolveRescaleFactorsFromRulers({
    measuredCmX: measured.x,
    measuredCmY: measured.y,
    trueMmX: fmlRescaleDistanceMmX.value,
    trueMmY: fmlRescaleDistanceMmY.value,
  })
  if (factors == null) return false
  plan.value = scaleFloorPlan(current, factors, activeFloorIndex.value)
  if (underlayLayout.value) {
    underlayLayout.value = scaleUnderlayLayout(underlayLayout.value, factors)
  }
  cancelFmlRescale()
  return true
}

const underlayAvailable = computed(() => !!underlaySrc.value && !!underlayLayout.value)
const canStartRescale = computed(
  () => (plan.value?.floors[activeFloorIndex.value]?.walls.length ?? 0) > 0 && !inspectMode.value,
)
const activeFmlOrient = computed(
  () => orientByFloor.value[activeFloorIndex.value] ?? defaultFloorOrient(),
)
/** Alle floors hebben flipX — voor project-spiegel knop-styling. */
const projectOrientFlipX = computed(() => {
  const list = floors.value
  if (list.length === 0) return false
  return list.every((_, i) => (orientByFloor.value[i] ?? defaultFloorOrient()).flipX)
})

/** Object-URL van lokale fallback-PNG; revoke bij clear/switch. */
let localUnderlayObjectUrl: string | null = null
let underlayLoadGen = 0

const floors = computed(() => plan.value?.floors ?? [])
const multiFloor = computed(() => floors.value.length > 1)
const activeFloor = computed(() => floors.value[activeFloorIndex.value] ?? floors.value[0] ?? null)

const alignFixturePartial = computed(() => {
  const pending = pendingAlignRebase.value
  if (!pending) return false
  return pending.missing.length > 0
})
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

const openingOverflow = computed(() => {
  const floor = activeFloor.value
  if (!floor) return null
  return summarizeOpeningHeightOverflows(
    findOpeningHeightOverflows(floor, {
      doorBovenlichtDefault: sessionDefaults.value.bovenlichtDefault,
      windowBovenlichtDefault: sessionDefaults.value.windowBovenlichtDefault,
      bovenlichtHeightCm: sessionDefaults.value.bovenlichtHeightCm,
      bovenlichtGapCm: sessionDefaults.value.bovenlichtGapCm,
    }),
  )
})

const fmlText = computed(() => {
  if (!plan.value) return ''
  return buildFmlV3(plan.value, {
    name: plan.value.name,
    bovenlichtDefault: sessionDefaults.value.bovenlichtDefault,
    windowBovenlichtDefault: sessionDefaults.value.windowBovenlichtDefault,
    bovenlichtHeightCm: sessionDefaults.value.bovenlichtHeightCm,
    bovenlichtGapCm: sessionDefaults.value.bovenlichtGapCm,
  })
})

function revokeLocalUnderlay(): void {
  if (localUnderlayObjectUrl) {
    URL.revokeObjectURL(localUnderlayObjectUrl)
    localUnderlayObjectUrl = null
  }
}

function clearUnderlayState(): void {
  underlayLoadGen += 1
  revokeLocalUnderlay()
  underlaySrc.value = null
  underlayWidthPx.value = 0
  underlayHeightPx.value = 0
  underlayLayout.value = null
  underlayOpacity.value = 0.5
  underlayHint.value = null
  underlayMoveMode.value = false
}

function resolveDrawingOpacity(alpha: number | undefined): number {
  // Floorplanner alpha is 0–100; ontbrekend → 50.
  const pct = typeof alpha === 'number' && Number.isFinite(alpha) ? alpha : 50
  return Math.min(1, Math.max(0, pct / 100))
}

function onUnderlayOpacityInput(event: Event): void {
  const next = Number((event.target as HTMLInputElement).value) / 100
  underlayOpacity.value = next
  if (next <= 0) underlayMoveMode.value = false
}

function onFmlOpacityInput(event: Event): void {
  fmlOpacity.value = Number((event.target as HTMLInputElement).value) / 100
}

function applyImageToUnderlay(
  src: string,
  width: number,
  height: number,
  drawing: NonNullable<(typeof floors.value)[number]['drawing']>,
): boolean {
  const layout = previewUnderlayLayoutFromDrawing(drawing, { width, height })
  if (!layout) return false
  underlaySrc.value = src
  underlayWidthPx.value = width
  underlayHeightPx.value = height
  underlayLayout.value = cloneUnderlayOriginLayout(layout)
  underlayOpacity.value = resolveDrawingOpacity(drawing.alpha)
  return true
}

async function tryLoadDrawingUrl(
  url: string,
  drawing: NonNullable<(typeof floors.value)[number]['drawing']>,
  gen: number,
): Promise<boolean> {
  try {
    const img = await loadImage(url)
    if (gen !== underlayLoadGen) return false
    const { width, height } = imageDimensions(img)
    return applyImageToUnderlay(url, width, height, drawing)
  } catch {
    return false
  }
}

async function syncUnderlayForActiveFloor(): Promise<void> {
  const drawing = activeFloor.value?.drawing
  underlayLoadGen += 1
  const gen = underlayLoadGen
  revokeLocalUnderlay()
  underlaySrc.value = null
  underlayWidthPx.value = 0
  underlayHeightPx.value = 0
  underlayLayout.value = null
  underlayHint.value = null

  if (!drawing || !(drawing.width > 0) || !(drawing.height > 0)) {
    underlayOpacity.value = 0.5
    return
  }

  underlayOpacity.value = resolveDrawingOpacity(drawing.alpha)

  if (drawing.url) {
    const ok = await tryLoadDrawingUrl(drawing.url, drawing, gen)
    if (gen !== underlayLoadGen) return
    if (ok) {
      underlayHint.value = null
      return
    }
    underlayHint.value =
      'Onderlegger-URL kon niet laden (COEP/CORS). Kies lokaal een PNG/JPG van dezelfde scan.'
    return
  }

  underlayHint.value = 'Deze FML heeft een drawing zonder URL.'
}

const {
  loadFileName,
  isLoadingFml,
  loadStatusLabel,
  floorLabel,
  selectFloor,
  onFileInput,
  clearPlan,
} = useFmlViewerLoad({
  plan,
  warnings,
  error,
  fileName,
  activeFloorIndex,
  sessionDefaults,
  orientByFloor,
  pendingAlignRebase,
  fmlOpacity,
  hidePlanText,
  floors,
  t,
  flushPreviewFieldCommits,
  cancelFmlRescale,
  clearUnderlayState,
  syncUnderlayForActiveFloor,
  resetInspectState,
})

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

function applyViewerFloorOrient(op: FloorOrientOp): void {
  if (!plan.value) return
  const idx = activeFloorIndex.value
  const prev = orientByFloor.value[idx] ?? defaultFloorOrient()
  orientByFloor.value = {
    ...orientByFloor.value,
    [idx]: composeFloorOrient(prev, op),
  }
  plan.value = applyFloorOrientOp(plan.value, op, idx)
  underlayMoveMode.value = false
}

/** Spiegel alle verdiepingen om hun nulpunt (geen floor-switch). */
function applyViewerProjectOrient(op: 'flipX'): void {
  if (!plan.value || plan.value.floors.length === 0) return
  const nextOrient: Record<number, FloorOrientState> = { ...orientByFloor.value }
  for (let i = 0; i < plan.value.floors.length; i++) {
    const prev = nextOrient[i] ?? defaultFloorOrient()
    nextOrient[i] = composeFloorOrient(prev, op)
  }
  orientByFloor.value = nextOrient
  plan.value = applyFloorOrientOp(plan.value, op, null)
  underlayMoveMode.value = false
}

function applyViewerUnderlayOrient(op: 'rotCw' | 'rotCcw' | 'flipX'): void {
  const layout = underlayLayout.value
  if (!layout) return
  const next = cloneUnderlayOriginLayout(layout)
  if (op === 'flipX') {
    next.flipX = !next.flipX
    if (!next.flipX) delete next.flipX
  } else {
    const delta = op === 'rotCw' ? 90 : -90
    const current = next.rotationDeg ?? 0
    let rotationDeg = current + delta
    while (rotationDeg > 180) rotationDeg -= 360
    while (rotationDeg <= -180) rotationDeg += 360
    if (Math.abs(rotationDeg) < 0.001) delete next.rotationDeg
    else next.rotationDeg = rotationDeg
  }
  underlayLayout.value = next
}

function downloadCurrentFml(): void {
  flushPreviewFieldCommits()
  if (!fmlText.value) return
  const base = fileName.value?.replace(/\.[^.]+$/i, '') || plan.value?.name || 'fml-export'
  downloadFml(fmlText.value, `${base}.fml`)
}

function onPlanUpdate(next: FloorPlan, layout?: PreviewUnderlayLayout | null): void {
  plan.value = next
  if (layout !== undefined) {
    underlayLayout.value = layout ? cloneUnderlayOriginLayout(layout) : null
  }
}

watch(inspectMode, (on) => {
  if (on) cancelFmlRescale()
})

onBeforeUnmount(() => {
  clearUnderlayState()
})

defineExpose({
  applyCornerMarkerModeFromSettings: () =>
    previewCanvasRef.value?.applyCornerMarkerModeFromSettings(),
})
</script>

<template>
  <div
    class="fml-viewer-layout"
    :class="{
      'fml-viewer-layout--coarse': coarsePointer,
      'fml-viewer-layout--fullscreen': canvasFullscreen,
    }"
  >
    <div
      v-if="sidebarOpen && coarsePointer"
      class="sidebar-backdrop"
      @click="sidebarOpen = false"
    />
    <aside v-show="sidebarOpen" class="sidebar" :class="{ 'sidebar--drawer': coarsePointer }">
      <div v-if="coarsePointer" class="sidebar-handle" aria-hidden="true" />
      <div class="panel">
        <div class="viewer-header">
          <h3>FML viewer</h3>
          <button
            type="button"
            class="sidebar-icon-btn"
            :aria-label="t('viewer.closeMenu')"
            :title="t('viewer.closeMenu')"
            @click="sidebarOpen = false"
          >
            <ToolbeltIcon name="close_menu" />
          </button>
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
              ? 'Inspectie: tik een muur, deur, raam, kamer of vlak. Geen detectie of tekenen.'
              : 'Open een bestaand .fml-bestand om te bekijken en te bewerken.'
          }}
        </p>
        <div class="sidebar-icon-row">
          <label
            class="sidebar-icon-btn"
            :class="{ 'is-disabled': isLoadingFml }"
            title="FML uploaden"
          >
            <ToolbeltIcon name="upload" />
            <span>FML uploaden</span>
            <input
              type="file"
              accept=".fml,.json,.json.fml"
              :disabled="isLoadingFml"
              @change="onFileInput"
            />
          </label>
          <button
            v-if="plan"
            type="button"
            class="sidebar-icon-btn"
            :disabled="isLoadingFml"
            title="Sluiten"
            aria-label="Sluiten"
            @click="clearPlan"
          >
            <ToolbeltIcon name="close_plan" />
            <span>Sluiten</span>
          </button>
          <button
            v-if="plan"
            type="button"
            class="sidebar-icon-btn sidebar-icon-btn--primary"
            title="Download .fml"
            aria-label="Download .fml"
            @click="downloadCurrentFml"
          >
            <ToolbeltIcon name="download" />
            <span>Download .fml</span>
          </button>
        </div>
        <p v-if="isLoadingFml" class="load-status-inline" role="status" aria-live="polite">
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
              <span>{{ t('result.fmlOpacity') }}</span>
              <span>{{ Math.round(fmlOpacity * 100) }}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              :value="Math.round(fmlOpacity * 100)"
              :aria-label="t('result.fmlOpacityAria')"
              @input="onFmlOpacityInput"
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
        <div v-if="!inspectMode" class="sidebar-icon-row sidebar-plan-actions">
          <button
            type="button"
            class="sidebar-icon-btn"
            :class="{ 'is-on': fmlRescaleActive }"
            :disabled="!canStartRescale"
            :title="t('result.rescaleHint')"
            :aria-label="t('result.rescale')"
            :aria-pressed="fmlRescaleActive"
            @click="fmlRescaleActive ? cancelFmlRescale() : beginFmlRescale()"
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
            @click="previewCanvasRef?.sanitizeWalls()"
          >
            <ToolbeltIcon name="sanitize" />
            <span>{{ t('result.sanitize') }}</span>
          </button>
          <button
            type="button"
            class="sidebar-icon-btn"
            :class="{ 'is-on': projectOrientFlipX }"
            :disabled="!plan || floors.length === 0"
            :title="t('result.mirrorProjectHint')"
            :aria-label="t('result.mirrorProject')"
            :aria-pressed="projectOrientFlipX"
            @click="applyViewerProjectOrient('flipX')"
          >
            <ToolbeltIcon name="mirror_plan" />
            <span>{{ t('result.mirrorProject') }}</span>
          </button>
        </div>
        <FmlRescalePanel
          v-if="!inspectMode"
          hide-start
          :active="fmlRescaleActive"
          :can-start="canStartRescale"
          :state="fmlRescaleState"
          :mm-x="fmlRescaleDistanceMmX"
          :mm-y="fmlRescaleDistanceMmY"
          :unit="scaleInputUnit"
          @begin="beginFmlRescale()"
          @cancel="cancelFmlRescale()"
          @confirm="confirmFmlRescale()"
          @update-mm-x="setFmlRescaleDistanceMmX"
          @update-mm-y="setFmlRescaleDistanceMmY"
        />
        <details v-if="!inspectMode" class="fml-fold defaults-fold">
          <summary>{{ t('result.heightsFold') }}</summary>
          <p class="defaults-hint">{{ t('viewer.defaultsHint') }}</p>
          <div class="defaults-grid">
            <label class="defaults-field">
              <span>{{ t('settings.wallHeightCm') }}</span>
              <input
                type="number"
                min="1"
                :value="sessionDefaults.wallHeightCm"
                @change="onSessionDefaultNumber('wallHeightCm', $event)"
              />
            </label>
            <label class="defaults-field">
              <span>{{ t('settings.doorHeightCm') }}</span>
              <input
                type="number"
                min="1"
                :value="sessionDefaults.doorHeightCm"
                @change="onSessionDefaultNumber('doorHeightCm', $event)"
              />
            </label>
            <label class="defaults-field">
              <span>{{ t('settings.windowHeightCm') }}</span>
              <input
                type="number"
                min="1"
                :value="sessionDefaults.windowHeightCm"
                @change="onSessionDefaultNumber('windowHeightCm', $event)"
              />
            </label>
            <label class="defaults-field">
              <span>{{ t('settings.sillZCm') }}</span>
              <input
                type="number"
                min="0"
                :value="sessionDefaults.windowSillZCm"
                @change="onSessionDefaultNumber('windowSillZCm', $event)"
              />
            </label>
            <label class="defaults-field">
              <span>{{ t('settings.bovenlichtGapCm') }}</span>
              <input
                type="number"
                min="0"
                :value="sessionDefaults.bovenlichtGapCm"
                @change="onSessionDefaultNumber('bovenlichtGapCm', $event)"
              />
            </label>
            <label class="defaults-field">
              <span>{{ t('settings.bovenlichtHeightCm') }}</span>
              <input
                type="number"
                min="1"
                :value="sessionDefaults.bovenlichtHeightCm"
                @change="onSessionDefaultNumber('bovenlichtHeightCm', $event)"
              />
            </label>
          </div>
          <label class="defaults-check">
            <input
              type="checkbox"
              :checked="sessionDefaults.bovenlichtDefault"
              @change="onSessionDefaultBool('bovenlichtDefault', $event)"
            />
            <span>{{ t('settings.bovenlichtDoors') }}</span>
          </label>
          <label class="defaults-check">
            <input
              type="checkbox"
              :checked="sessionDefaults.windowBovenlichtDefault"
              @change="onSessionDefaultBool('windowBovenlichtDefault', $event)"
            />
            <span>{{ t('settings.bovenlichtWindows') }}</span>
          </label>
        </details>
        <div v-if="inspectMode" class="inspect-panel">
          <p class="inspect-hint">
            Tik cyclet de statuskleur: uit → open (oranje) → klaar (groen) → uit.
          </p>
          <dl v-if="lastInspectHit" class="inspect-hit">
            <div>
              <dt>Type</dt>
              <dd>{{ inspectKindLabel(lastInspectHit.kind) }}</dd>
            </div>
            <div>
              <dt>Id</dt>
              <dd class="inspect-id">{{ lastInspectHit.id }}</dd>
            </div>
            <div v-if="lastInspectHit.wallId">
              <dt>Muur</dt>
              <dd class="inspect-id">{{ lastInspectHit.wallId }}</dd>
            </div>
            <div>
              <dt>Kleur</dt>
              <dd>
                <span
                  v-if="inspectColors[lastInspectHit.id]"
                  class="inspect-swatch"
                  :style="{ background: inspectColors[lastInspectHit.id] }"
                />
                {{ inspectColors[lastInspectHit.id] ?? 'geen' }}
              </dd>
            </div>
          </dl>
          <p v-else class="inspect-empty">Nog geen selectie — tik op de plattegrond.</p>
        </div>

        <details v-if="!inspectMode" class="fml-fold defaults-fold">
          <summary>{{ t('result.orientFold') }}</summary>
          <div v-if="underlayAvailable" class="orient-block">
            <p class="orient-label">{{ t('result.underlayOrientLabel') }}</p>
            <div class="orient-actions">
              <button
                type="button"
                class="sidebar-icon-btn"
                :disabled="underlayOpacity <= 0"
                :title="t('result.underlayRotate90CcwHint')"
                :aria-label="t('result.underlayRotate90Ccw')"
                @click="applyViewerUnderlayOrient('rotCcw')"
              >
                <ToolbeltIcon name="rotate_plan_ccw" />
                <span>{{ t('result.underlayRotate90Ccw') }}</span>
              </button>
              <button
                type="button"
                class="sidebar-icon-btn"
                :disabled="underlayOpacity <= 0"
                :title="t('result.underlayRotate90CwHint')"
                :aria-label="t('result.underlayRotate90Cw')"
                @click="applyViewerUnderlayOrient('rotCw')"
              >
                <ToolbeltIcon name="rotate_plan_cw" />
                <span>{{ t('result.underlayRotate90Cw') }}</span>
              </button>
              <button
                type="button"
                class="sidebar-icon-btn"
                :class="{ 'is-on': underlayLayout?.flipX === true }"
                :disabled="underlayOpacity <= 0"
                :title="t('result.underlayMirrorVerticalHint')"
                :aria-label="t('result.underlayMirrorVertical')"
                :aria-pressed="underlayLayout?.flipX === true"
                @click="applyViewerUnderlayOrient('flipX')"
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
          <div class="orient-block">
            <p class="orient-label">{{ t('result.floorOrientLabel') }}</p>
            <div class="orient-actions">
              <button
                type="button"
                class="sidebar-icon-btn"
                :class="{ 'is-on': activeFmlOrient.flipX }"
                :title="t('result.mirrorVerticalHint')"
                :aria-label="t('result.mirrorVertical')"
                :aria-pressed="activeFmlOrient.flipX"
                @click="applyViewerFloorOrient('flipX')"
              >
                <ToolbeltIcon name="mirror_plan" />
                <span>{{ t('result.mirrorVertical') }}</span>
              </button>
              <button
                type="button"
                class="sidebar-icon-btn"
                :title="t('result.rotate90CcwHint')"
                :aria-label="t('result.rotate90Ccw')"
                @click="applyViewerFloorOrient('rotCcw')"
              >
                <ToolbeltIcon name="rotate_plan_ccw" />
                <span>{{ t('result.rotate90Ccw') }}</span>
              </button>
              <button
                type="button"
                class="sidebar-icon-btn"
                :title="t('result.rotate90CwHint')"
                :aria-label="t('result.rotate90Cw')"
                @click="applyViewerFloorOrient('rotCw')"
              >
                <ToolbeltIcon name="rotate_plan_cw" />
                <span>{{ t('result.rotate90Cw') }}</span>
              </button>
            </div>
          </div>
        </details>

        <div v-if="openingOverflow || warnings.length > 0" class="download-warnings">
          <FmlOpeningOverflowNotice v-if="openingOverflow" :summary="openingOverflow" />
          <div v-if="warnings.length > 0" class="warnings">
            <p v-for="(warning, index) in warnings" :key="index">{{ warning.message }}</p>
          </div>
        </div>
        <div class="actions sidebar-download-row">
          <button type="button" class="upload-btn primary download-fml" @click="downloadCurrentFml">
            Download .fml
          </button>
        </div>
      </div>
    </aside>

    <main class="viewer-main">
      <div
        v-if="isLoadingFml"
        class="fml-load-overlay"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div class="fml-load-card">
          <div class="fml-load-spinner" aria-hidden="true" />
          <p class="fml-load-title">{{ loadStatusLabel }}</p>
          <p v-if="loadFileName" class="fml-load-file">{{ loadFileName }}</p>
          <p class="fml-load-hint">{{ t('viewer.loadHint') }}</p>
        </div>
      </div>
      <template v-if="plan">
        <div
          v-if="multiFloor && !canvasFullscreen"
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
              :class="{ active: index === activeFloorIndex }"
              :aria-selected="index === activeFloorIndex"
              :disabled="isLoadingFml"
              :title="floorLabel(index)"
              @click="selectFloor(index)"
            >
              {{ floorLabel(index) }}
            </button>
          </div>
        </div>
        <div class="viewer-canvas-host">
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
          <FmlPreviewCanvas
            ref="previewCanvasRef"
            :touch-editor="true"
            :plan="plan"
            :floor-index="activeFloorIndex"
            :underlay-src="underlaySrc"
            :underlay-width-px="underlayWidthPx"
            :underlay-height-px="underlayHeightPx"
            :underlay-opacity="underlaySrc ? underlayOpacity : 0"
            :content-opacity="fmlOpacity"
            :labels-visible="!hidePlanText"
            :cm-origin="underlayLayout?.origin ?? null"
            :px-per-mm-x="underlayLayout?.pxPerMmX ?? 1"
            :px-per-mm-y="underlayLayout?.pxPerMmY ?? 1"
            :rotation-deg="underlayLayout?.rotationDeg ?? 0"
            :flip-x="underlayLayout?.flipX === true"
            :underlay-move-mode="!inspectMode && underlayMoveMode && underlayOpacity > 0"
            :area-surface-edit-enabled="true"
            :annotation-edit-enabled="!inspectMode"
            :inspect-mode="inspectMode"
            :inspect-colors="inspectColors"
            :canvas-fullscreen="canvasFullscreen"
            :rescale-mode="fmlRescaleActive"
            :rescale-state="fmlRescaleState"
            :bovenlicht-default="sessionDefaults.bovenlichtDefault"
            :window-bovenlicht-default="sessionDefaults.windowBovenlichtDefault"
            :bovenlicht-height-cm="sessionDefaults.bovenlichtHeightCm"
            :bovenlicht-gap-cm="sessionDefaults.bovenlichtGapCm"
            :default-door-height-cm="sessionDefaults.doorHeightCm"
            :default-window-height-cm="sessionDefaults.windowHeightCm"
            :default-window-sill-z-cm="sessionDefaults.windowSillZCm"
            @plan-update="onPlanUpdate"
            @update:underlay-move-mode="underlayMoveMode = $event"
            @update-rescale-state="updateFmlRescaleState"
            @cancel-rescale="cancelFmlRescale()"
            @inspect-select="onInspectSelect"
            @update:canvas-fullscreen="canvasFullscreen = $event"
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
        <p>Upload een FML-bestand om de plattegrond te bekijken.</p>
        <label class="upload-btn primary" :class="{ 'upload-btn--disabled': isLoadingFml }">
          FML kiezen
          <input
            type="file"
            accept=".fml,.json,.json.fml"
            :disabled="isLoadingFml"
            @change="onFileInput"
          />
        </label>
      </div>
    </main>

    <div
      v-if="pendingAlignRebase"
      class="align-dialog-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="align-fixture-title"
      @click.self="dismissAlignFixtureRebase"
    >
      <div class="align-dialog">
        <h3 id="align-fixture-title">{{ t('viewer.alignFixtureTitle') }}</h3>
        <p>{{ t('viewer.alignFixtureBody') }}</p>
        <p v-if="alignFixturePartial" class="align-dialog-partial">
          {{
            t('viewer.alignFixtureBodyPartial', {
              moved: pendingAlignRebase.moved.length,
              total: floors.length,
            })
          }}
        </p>
        <div class="align-dialog-actions">
          <button type="button" class="secondary" @click="dismissAlignFixtureRebase">
            {{ t('common.cancel') }}
          </button>
          <button type="button" class="align-dialog-apply" @click="applyAlignFixtureRebase">
            {{ t('common.apply') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fml-viewer-layout {
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

.sidebar-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  width: 100%;
  min-height: 36px;
  height: auto;
  padding: 6px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
  color: #0f172a;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.viewer-header .sidebar-icon-btn {
  width: auto;
  min-width: 36px;
  height: 36px;
  padding: 0 8px;
  justify-content: center;
  font-weight: 400;
}

.sidebar-icon-btn input {
  display: none;
}

.sidebar-icon-btn.is-on {
  background: #0f172a;
  color: #fff;
  border-color: #0f172a;
}

.sidebar-icon-btn--primary {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}

.sidebar-icon-btn:disabled,
.sidebar-icon-btn.is-disabled {
  opacity: 0.45;
  pointer-events: none;
  cursor: not-allowed;
}

.sidebar-icon-btn :deep(.canvas-toolbelt__icon) {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.sidebar-icon-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0 0 10px;
}

.sidebar {
  width: 300px;
  flex-shrink: 0;
  overflow-y: auto;
  border-right: 1px solid #e2e8f0;
  background: #f8fafc;
}

.sidebar--drawer {
  position: absolute;
  top: max(8px, env(safe-area-inset-top, 0px));
  bottom: max(8px, env(safe-area-inset-bottom, 0px));
  left: max(8px, env(safe-area-inset-left, 0px));
  z-index: 24;
  width: min(320px, calc(92vw - env(safe-area-inset-left, 0px)));
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: rgb(255 255 255 / 0.96);
  box-shadow: 0 4px 16px rgb(15 23 42 / 0.12);
}

.sidebar-icon-row .sidebar-icon-btn--primary {
  display: none;
}

@media (max-width: 600px) {
  .sidebar--drawer {
    top: auto;
    right: max(8px, env(safe-area-inset-right, 0px));
    width: auto;
    height: min(72vh, 620px);
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

.fml-viewer-layout--coarse .viewer-main {
  padding: 8px;
}

.fml-viewer-layout--fullscreen .viewer-main {
  padding: 0;
}

.fml-viewer-layout--fullscreen .viewer-canvas-host > :deep(.fml-preview-wrap) {
  border: none;
  border-radius: 0;
}

.fml-load-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(241, 245, 249, 0.82);
  backdrop-filter: blur(2px);
}

.fml-load-card {
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

.fml-load-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid #e2e8f0;
  border-top-color: #2563eb;
  border-radius: 50%;
  animation: fml-load-spin 0.7s linear infinite;
}

@keyframes fml-load-spin {
  to {
    transform: rotate(360deg);
  }
}

.fml-load-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
}

.fml-load-file {
  margin: 0;
  font-size: 12px;
  color: #64748b;
  word-break: break-all;
}

.fml-load-hint {
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

.viewer-canvas-host > :deep(.fml-preview-wrap) {
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

.defaults-fold {
  margin-top: 12px;
}

.defaults-hint {
  margin: 0 0 8px;
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

.inspect-panel {
  margin: 0 0 10px;
  padding: 8px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
}

.inspect-hint,
.inspect-empty {
  margin: 0;
  font-size: 11px;
  color: #64748b;
  line-height: 1.4;
}

.inspect-hit {
  margin: 8px 0 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.inspect-hit div {
  display: grid;
  grid-template-columns: 48px 1fr;
  gap: 8px;
  align-items: start;
}

.inspect-hit dt {
  margin: 0;
  font-size: 11px;
  color: #64748b;
}

.inspect-hit dd {
  margin: 0;
  font-size: 12px;
  color: #0f172a;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.inspect-id {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  word-break: break-all;
}

.inspect-swatch {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  border: 1px solid rgb(15 23 42 / 0.2);
  flex-shrink: 0;
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

.download-fml {
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

.align-dialog-backdrop {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(15 23 42 / 0.45);
}

.align-dialog {
  width: min(420px, calc(100% - 32px));
  padding: 16px 18px;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 12px 40px rgb(15 23 42 / 0.2);
}

.align-dialog h3 {
  margin: 0 0 8px;
  font-size: 15px;
  color: #0f172a;
}

.align-dialog p {
  margin: 0 0 8px;
  font-size: 13px;
  line-height: 1.45;
  color: #334155;
}

.align-dialog-partial {
  color: #64748b;
  font-size: 12px;
}

.align-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.align-dialog-actions .secondary {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #334155;
  border-radius: 4px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
}

.align-dialog-apply {
  background: #2563eb;
  color: #fff;
  border: 1px solid #2563eb;
  border-radius: 4px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
}
</style>
