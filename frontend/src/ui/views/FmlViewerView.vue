<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FmlPreviewCanvas from '../components/FmlPreviewCanvas.vue'
import { buildFmlV3 } from '@/core/fml/buildFmlV3'
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
import { importFmlV3 } from '@/core/fml/importFmlV3'
import {
  rebasePlanToItemRefid,
  type RebasePlanToItemRefidResult,
} from '@/core/fml/rebase-plan-to-item-refid'
import type { FloorPlan, ImportWarning } from '@/core/fml/types'
import type { PreviewUnderlayLayout } from '@/ui/composables/project/types'
import { imageDimensions, loadImage } from '@/ui/composables/workspace/imageUtils'

const { t } = useI18n()

const emit = defineEmits<{
  back: []
}>()

const plan = ref<FloorPlan | null>(null)
const warnings = ref<ImportWarning[]>([])
const error = ref<string | null>(null)
const underlayHint = ref<string | null>(null)
const fileName = ref<string | null>(null)
const activeFloorIndex = ref(0)

const underlaySrc = ref<string | null>(null)
const underlayWidthPx = ref(0)
const underlayHeightPx = ref(0)
const underlayLayout = ref<PreviewUnderlayLayout | null>(null)
const underlayOpacity = ref(0.5)
/** FML-geometrie opacity 0–1; 0 = uit. */
const fmlOpacity = ref(0.8)
/** Per-floor FML-oriëntatie (viewer heeft geen regenerate-from-detectie). */
const orientByFloor = ref<Record<number, FloorOrientState>>({})
const underlayMoveMode = ref(false)
const pendingAlignRebase = ref<RebasePlanToItemRefidResult | null>(null)

const underlayAvailable = computed(() => !!underlaySrc.value && !!underlayLayout.value)
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
const hasDrawingMeta = computed(() => {
  const d = activeFloor.value?.drawing
  return !!d && d.width > 0 && d.height > 0
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
  void syncUnderlayForActiveFloor()
})

const stats = computed(() => {
  const floor = activeFloor.value
  if (!floor) return { walls: 0, doors: 0, windows: 0 }
  const openings = floor.walls.flatMap((wall) => wall.openings)
  return {
    walls: floor.walls.length,
    doors: openings.filter((item) => item.type === 'door').length,
    windows: openings.filter((item) => item.type === 'window').length,
  }
})

const fmlText = computed(() => {
  if (!plan.value) return ''
  return buildFmlV3(plan.value, { name: plan.value.name })
})

function floorLabel(index: number): string {
  const floor = floors.value[index]
  if (!floor) return t('project.floorNameIndexed', { n: index + 1 })
  const name = floor.name?.trim()
  if (name) return name
  return t('project.floorNameIndexed', { n: index + 1 })
}

function selectFloor(index: number): void {
  if (index < 0 || index >= floors.value.length) return
  activeFloorIndex.value = index
}

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

  underlayHint.value = 'Deze FML heeft een drawing zonder URL — kies lokaal een PNG/JPG.'
}

async function onLocalUnderlayInput(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const drawing = activeFloor.value?.drawing
  if (!drawing || !(drawing.width > 0) || !(drawing.height > 0)) {
    underlayHint.value = 'Geen drawing-meta in deze verdieping — onderlegger niet uit te lijnen.'
    return
  }

  underlayLoadGen += 1
  const gen = underlayLoadGen
  revokeLocalUnderlay()
  const objectUrl = URL.createObjectURL(file)
  localUnderlayObjectUrl = objectUrl

  try {
    const img = await loadImage(objectUrl)
    if (gen !== underlayLoadGen) return
    const { width, height } = imageDimensions(img)
    if (!applyImageToUnderlay(objectUrl, width, height, drawing)) {
      underlayHint.value = 'Onderlegger kon niet worden uitgelijnd (ongeldige drawing-maten).'
      return
    }
    underlayHint.value = null
  } catch {
    if (gen !== underlayLoadGen) return
    underlayHint.value = 'Lokale onderlegger laden mislukt.'
    revokeLocalUnderlay()
    underlaySrc.value = null
  }
}

async function onFileInput(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  error.value = null
  clearUnderlayState()
  try {
    const rawText = await file.text()
    const parsed = importFmlV3(rawText)
    plan.value = parsed.plan
    warnings.value = parsed.warnings
    fileName.value = file.name
    activeFloorIndex.value = 0
    orientByFloor.value = {}
    pendingAlignRebase.value = null
    await syncUnderlayForActiveFloor()
    const preview = rebasePlanToItemRefid(parsed.plan)
    pendingAlignRebase.value = preview.moved.length > 0 ? preview : null
  } catch (err) {
    plan.value = null
    warnings.value = []
    fileName.value = null
    activeFloorIndex.value = 0
    orientByFloor.value = {}
    pendingAlignRebase.value = null
    clearUnderlayState()
    error.value = err instanceof Error ? err.message : 'FML import mislukt.'
  }
}

function clearPlan(): void {
  plan.value = null
  warnings.value = []
  fileName.value = null
  error.value = null
  activeFloorIndex.value = 0
  orientByFloor.value = {}
  fmlOpacity.value = 0.8
  pendingAlignRebase.value = null
  clearUnderlayState()
}

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
  if (!fmlText.value) return
  const base = fileName.value?.replace(/\.[^.]+$/i, '') || plan.value?.name || 'fml-export'
  downloadFml(fmlText.value, `${base}.fml`)
}

async function copyCurrentFml(): Promise<void> {
  if (!fmlText.value) return
  try {
    await navigator.clipboard.writeText(fmlText.value)
  } catch {
    error.value = 'Kopieren naar klembord is niet beschikbaar in deze browser/context.'
  }
}

function onPlanUpdate(next: FloorPlan, layout?: PreviewUnderlayLayout | null): void {
  plan.value = next
  if (layout !== undefined) {
    underlayLayout.value = layout ? cloneUnderlayOriginLayout(layout) : null
  }
}

onBeforeUnmount(() => {
  clearUnderlayState()
})
</script>

<template>
  <div class="fml-viewer-layout">
    <aside class="sidebar">
      <div class="panel">
        <div class="viewer-header">
          <h3>FML viewer</h3>
          <button type="button" class="secondary back-btn" @click="emit('back')">
            {{ t('settings.backToSettings') }}
          </button>
        </div>
        <p class="hint">Open een bestaand .fml-bestand om te bekijken en te bewerken.</p>
        <label class="upload-btn">
          FML uploaden
          <input type="file" accept=".fml,.json,.json.fml" @change="onFileInput" />
        </label>
        <button v-if="plan" type="button" class="link-btn" @click="clearPlan">Sluiten</button>
      </div>

      <div v-if="error" class="panel error-panel">{{ error }}</div>

      <div v-if="plan" class="panel">
        <p v-if="fileName" class="file-name">{{ fileName }}</p>
        <p v-if="multiFloor" class="floor-meta">
          {{ floors.length }} verdiepingen · actief: {{ floorLabel(activeFloorIndex) }}
        </p>
        <p class="stats">
          <strong>{{ stats.walls }}</strong> muren
          <template v-if="stats.doors > 0"> · {{ stats.doors }} deuren</template>
          <template v-if="stats.windows > 0"> · {{ stats.windows }} ramen</template>
        </p>
        <div v-if="warnings.length > 0" class="warnings">
          <p v-for="(warning, index) in warnings" :key="index">{{ warning.message }}</p>
        </div>
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
        </div>

        <div v-if="hasDrawingMeta" class="underlay-block">
          <p v-if="underlayHint" class="underlay-hint">{{ underlayHint }}</p>
          <p v-else-if="underlaySrc" class="underlay-ok">Onderlegger uit drawing actief.</p>
          <label class="upload-btn">
            Lokale onderlegger
            <input
              type="file"
              accept="image/png,image/jpeg,.png,.jpg,.jpeg"
              @change="onLocalUnderlayInput"
            />
          </label>
          <div v-if="underlayAvailable" class="orient-block">
            <p class="orient-label">{{ t('result.underlayOrientLabel') }}</p>
            <div class="orient-actions">
              <button
                type="button"
                class="orient-btn"
                :disabled="underlayOpacity <= 0"
                :title="t('result.underlayRotate90CcwHint')"
                @click="applyViewerUnderlayOrient('rotCcw')"
              >
                {{ t('result.underlayRotate90Ccw') }}
              </button>
              <button
                type="button"
                class="orient-btn"
                :disabled="underlayOpacity <= 0"
                :title="t('result.underlayRotate90CwHint')"
                @click="applyViewerUnderlayOrient('rotCw')"
              >
                {{ t('result.underlayRotate90Cw') }}
              </button>
              <button
                type="button"
                class="orient-btn"
                :class="{ 'orient-btn--active': underlayLayout?.flipX === true }"
                :disabled="underlayOpacity <= 0"
                :title="t('result.underlayMirrorVerticalHint')"
                @click="applyViewerUnderlayOrient('flipX')"
              >
                {{ t('result.underlayMirrorVertical') }}
              </button>
              <button
                type="button"
                class="orient-btn"
                :class="{ 'orient-btn--active': underlayMoveMode }"
                :disabled="underlayOpacity <= 0"
                :title="t('result.underlayMoveHint')"
                @click="underlayMoveMode = !underlayMoveMode"
              >
                {{ t('result.underlayMove') }}
              </button>
            </div>
          </div>
        </div>

        <div class="orient-block">
          <p class="orient-label">{{ t('result.floorOrientLabel') }}</p>
          <div class="orient-actions">
            <button
              type="button"
              class="orient-btn"
              :class="{ 'orient-btn--active': activeFmlOrient.flipX }"
              :title="t('result.mirrorVerticalHint')"
              @click="applyViewerFloorOrient('flipX')"
            >
              {{ t('result.mirrorVertical') }}
            </button>
            <button
              type="button"
              class="orient-btn"
              :class="{ 'orient-btn--active': projectOrientFlipX }"
              :disabled="!plan || floors.length === 0"
              :title="t('result.mirrorProjectHint')"
              @click="applyViewerProjectOrient('flipX')"
            >
              {{ t('result.mirrorProject') }}
            </button>
            <button
              type="button"
              class="orient-btn"
              :title="t('result.rotate90CcwHint')"
              @click="applyViewerFloorOrient('rotCcw')"
            >
              {{ t('result.rotate90Ccw') }}
            </button>
            <button
              type="button"
              class="orient-btn"
              :title="t('result.rotate90CwHint')"
              @click="applyViewerFloorOrient('rotCw')"
            >
              {{ t('result.rotate90Cw') }}
            </button>
          </div>
        </div>

        <div class="actions">
          <button type="button" @click="downloadCurrentFml">Download .fml</button>
          <button type="button" @click="copyCurrentFml">Kopieer FML</button>
        </div>
      </div>
    </aside>

    <main class="viewer-main">
      <template v-if="plan">
        <div
          v-if="multiFloor"
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
              :title="floorLabel(index)"
              @click="selectFloor(index)"
            >
              {{ floorLabel(index) }}
            </button>
          </div>
        </div>
        <FmlPreviewCanvas
          :plan="plan"
          :floor-index="activeFloorIndex"
          :underlay-src="underlaySrc"
          :underlay-width-px="underlayWidthPx"
          :underlay-height-px="underlayHeightPx"
          :underlay-opacity="underlaySrc ? underlayOpacity : 0"
          :content-opacity="fmlOpacity"
          :cm-origin="underlayLayout?.origin ?? null"
          :px-per-mm-x="underlayLayout?.pxPerMmX ?? 1"
          :px-per-mm-y="underlayLayout?.pxPerMmY ?? 1"
          :rotation-deg="underlayLayout?.rotationDeg ?? 0"
          :flip-x="underlayLayout?.flipX === true"
          :underlay-move-mode="underlayMoveMode && underlayOpacity > 0"
          @plan-update="onPlanUpdate"
          @update:underlay-move-mode="underlayMoveMode = $event"
        />
      </template>
      <div v-else class="empty-state">
        <p>Upload een FML-bestand om de plattegrond te bekijken.</p>
        <label class="upload-btn primary">
          FML kiezen
          <input type="file" accept=".fml,.json,.json.fml" @change="onFileInput" />
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

.viewer-header h3 {
  margin: 0;
  font-size: 14px;
}

.back-btn {
  flex-shrink: 0;
  font-size: 12px;
}

.sidebar {
  width: 300px;
  flex-shrink: 0;
  overflow-y: auto;
  border-right: 1px solid #e2e8f0;
  background: #f8fafc;
}

.viewer-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 12px;
  background: #f1f5f9;
}

.viewer-main > :deep(.fml-preview-wrap) {
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

.floor-meta {
  margin: 0 0 6px;
  font-size: 12px;
  color: #334155;
}

.panel {
  padding: 12px 16px;
  border-bottom: 1px solid #e2e8f0;
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

.file-name {
  margin: 0 0 6px;
  font-size: 12px;
  color: #334155;
  word-break: break-all;
}

.stats {
  margin: 0 0 8px;
  font-size: 12px;
  color: #475569;
}

.warnings {
  margin: 0 0 8px;
  font-size: 11px;
  color: #b45309;
}

.warnings p {
  margin: 0 0 4px;
}

.underlay-block {
  margin: 0 0 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.underlay-hint {
  margin: 0;
  font-size: 11px;
  color: #b45309;
  line-height: 1.4;
}

.underlay-ok {
  margin: 0;
  font-size: 11px;
  color: #15803d;
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

.orient-label {
  margin: 0 0 6px;
  font-size: 11px;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.orient-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.orient-btn {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #334155;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 11px;
  cursor: pointer;
}

.orient-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.orient-btn--active {
  border-color: #3b82f6;
  background: #eff6ff;
  color: #1d4ed8;
}

.actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
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

.link-btn {
  display: block;
  margin-top: 8px;
  padding: 0;
  border: none;
  background: none;
  color: #2563eb;
  font-size: 12px;
  cursor: pointer;
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
