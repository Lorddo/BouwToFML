<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FmlEditor from '@/ui/fml-editor/FmlEditor.vue'
import FmlInspect from '@/ui/fml-inspect/FmlInspect.vue'
import FmlElevationHost from '../components/FmlElevationHost.vue'
import FmlElevationHeightFields from '../components/FmlElevationHeightFields.vue'
import FmlOpeningOverflowNotice from '../components/FmlOpeningOverflowNotice.vue'
import FmlViewerDefaultsFields from '../components/FmlViewerDefaultsFields.vue'
import FmlViewerDimensionFields from '../components/FmlViewerDimensionFields.vue'
import FmlRescalePanel from '../components/FmlRescalePanel.vue'
import ScaleConfirmBar from '../components/ScaleConfirmBar.vue'
import ToolbeltIcon from '../components/canvas/ToolbeltIcon.vue'
import '../components/fml-panel-fields.css'
import { buildFmlV3 } from '@/core/fml/buildFmlV3'
import {
  findOpeningHeightOverflows,
  summarizeOpeningHeightOverflows,
} from '@/core/fml/opening-height-overflow'
import {
  cloneUnderlayOriginLayout,
  copyUnderlayDisplayOrient,
  drawingFromImageScale,
  previewUnderlayLayoutFromDrawing,
  provisionalDrawingFromImage,
  resolveUnderlayPxPerMmFromRulers,
} from '@/core/fml/drawing-to-underlay-layout'
import {
  applyFloorOrientOp,
  composeFloorOrient,
  defaultFloorOrient,
  type FloorOrientOp,
  type FloorOrientState,
} from '@/core/fml/floor-plan-orient'
import { downloadFml } from '@/core/fml/downloadFml'
import {
  assignWallsToGroup,
  createFacadeGroup,
  detachWalls,
  facadeMemberIdsOnFloor,
  groupIdForWall,
  listFacadeGroups,
  STAMP_FACADE_GROUP_ID,
  stripStampGroupFromPlan,
} from '@/core/fml/facade-groups'
import {
  elevationViewForGroup,
  setElevationProjection,
  setElevationViewDrawing,
} from '@/core/fml/elevation-views'
import { setNokThicknessCm, setSlabThicknessCm } from '@/core/fml/floor-stack'
import {
  overwriteRidgeDakThickness,
  setFloorRidgeHeights,
  setRidgeDisplayWidthCm,
} from '@/core/fml/ridge-walls'
import { countPlanWalls, overwritePlanWallHeights } from '@/core/fml/wall-endpoint-height'
import {
  countExpandableBovenlicht,
  countFoldableBovenlicht,
  expandBovenlichtOnPlan,
  foldBovenlichtOnPlan,
  readBovenlichtPacked,
  writeBovenlichtPacked,
} from '@/core/fml/bovenlicht'
import { canApplyStampToFloor } from '@/core/fml/apply-stamp-to-floor'
import { useFmlViewerDak } from '@/ui/composables/fml-viewer/useFmlViewerDak'
import { useFmlViewerDimensions } from '@/ui/composables/fml-viewer/useFmlViewerDimensions'
import { useFmlViewerGevels } from '@/ui/composables/fml-viewer/useFmlViewerGevels'
import { applyJunctionSanitizeToPlan } from '@/core/fml/materialize-wall-junctions'
import { scaleFloorPlan, scaleUnderlayLayout } from '@/core/fml/scale-floor-plan'
import type { RebasePlanToItemRefidResult } from '@/core/fml/rebase-plan-to-item-refid'
import type { FloorPlan, ImportWarning } from '@/core/fml/types'
import type { HScaleState } from '@/platform/calibration'
import { inspectKindLabel } from '@/ui/composables/fml-preview/fml-inspect'
import { useFmlViewerInspect } from '@/ui/composables/fml-viewer/useFmlViewerInspect'
import { useFmlViewerLoad } from '@/ui/composables/fml-viewer/useFmlViewerLoad'
import { useFmlViewerSessionDefaults } from '@/ui/composables/fml-viewer/useFmlViewerSessionDefaults'
import {
  cancelFmlChromeDialog,
  confirmFmlChrome,
  promptFacadeGroupName,
} from '@/ui/composables/fml-chrome-dialog'
import { withStackedFacadeWalls } from '@/ui/composables/fml-facade-stacked'
import type { PreviewUnderlayLayout } from '@/ui/composables/project/types'
import { loadUserSettings } from '@/ui/composables/settings/user-settings'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import {
  fmlRescaleStateFromImageHandles,
  initFmlRescaleStateFromWalls,
  initImageScaleHandles,
  measuredCmFromRescaleState,
  resolveRescaleFactorsFromRulers,
} from '@/ui/composables/fml-preview/fml-rescale-from-measure'
import { imageDimensions, loadImage } from '@/platform/image'

const { t } = useI18n()

const plan = ref<FloorPlan | null>(null)
const warnings = ref<ImportWarning[]>([])
const error = ref<string | null>(null)
const underlayHint = ref<string | null>(null)
const fileName = ref<string | null>(null)
const activeFloorIndex = ref(0)
const previewCanvasRef = ref<{
  flushPendingFieldCommits?: () => void
  sanitizeWalls?: () => boolean
  generateRoofPlanes?: () => boolean | Promise<boolean>
  applyStampToActiveFloor?: () => boolean
  canApplyStampOnActiveFloor?: () => boolean
  applyCornerMarkerModeFromSettings?: () => void
  resetView?: () => void
  pushUndo?: () => void
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
  previewCanvasRef.value?.flushPendingFieldCommits?.()
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
const userSettings = loadUserSettings()
const scaleInputUnit = ref<ScaleInputUnit>(userSettings.scaleInputUnit)
const thicknessMinCm = ref(userSettings.defaults.thicknessMinCm)
const thicknessMidCm = ref(userSettings.defaults.thicknessMidCm)
const thicknessMaxCm = ref(userSettings.defaults.thicknessMaxCm)

const {
  viewerMode,
  inspectColors,
  lastInspectHit,
  inspectMode,
  onInspectSelect,
  resetInspectState,
} = useFmlViewerInspect()

const inspectFacadeGroups = computed(() =>
  listFacadeGroups(plan.value).filter((group) => group.id !== STAMP_FACADE_GROUP_ID),
)

let selectFloorLater: (index: number) => void | Promise<void> = () => {}
let leaveGevelsLater = (): void => {}

const dak = useFmlViewerDak({
  plan,
  activeFloorIndex,
  inspectMode,
  selectFloor: (index) => selectFloorLater(index),
  leaveGevelsMode: () => leaveGevelsLater(),
})
const gevels = useFmlViewerGevels({
  plan,
  inspectMode,
  planUnderlayLayout: underlayLayout,
  planUnderlayWidthPx: underlayWidthPx,
  planUnderlayHeightPx: underlayHeightPx,
  leaveDakMode: () => dak.leaveDakMode(),
  onLeaveGevels: (wasOn) => {
    if (wasOn) persistElevationUnderlayDrawing()
    cancelUnderlayScale()
    underlayMoveMode.value = false
  },
  onEnterGevels: () => {
    cancelUnderlayScale()
    underlayMoveMode.value = false
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
  elevationHeightRows,
  elevationRidgeDisplayWidthCm,
  elevationProjection,
  activeUnderlayLayout,
  activeUnderlayWidthPx,
  activeUnderlayHeightPx,
  leaveGevelsMode,
  enterGevelsMode,
  syncElevationUnderlayFromPlan,
} = gevels
leaveGevelsLater = leaveGevelsMode

function onAddFloorChip(): void {
  leaveGevelsMode()
  leaveDakMode()
  void addFloor()
}

watch(elevationGroupId, (_next, prev) => {
  if (!gevelsMode.value) return
  if (prev) persistElevationUnderlayDrawing(prev)
  cancelUnderlayScale()
  underlayMoveMode.value = false
  void syncElevationUnderlayFromPlan()
})

const inspectFacadeSelectValue = computed(() => {
  const hit = lastInspectHit.value
  if (!hit || hit.kind !== 'wall' || !plan.value) return ''
  return groupIdForWall(plan.value, hit.id) ?? ''
})

async function onInspectFacadeGroupChange(event: Event): Promise<void> {
  const hit = lastInspectHit.value
  if (!hit || hit.kind !== 'wall' || !plan.value) return
  const select = event.target as HTMLSelectElement
  const value = select.value
  const selectedIds = hit.ids && hit.ids.length > 0 ? hit.ids : [hit.id]
  if (value === '__new__') select.value = inspectFacadeSelectValue.value

  if (value === '__new__') {
    const name = await promptFacadeGroupName()
    if (name == null) return
    const wallIds = await withStackedFacadeWalls(plan.value, selectedIds, 'create')
    const group = createFacadeGroup(plan.value, { name })
    assignWallsToGroup(plan.value, group.id, wallIds)
  } else if (value === '') {
    const wallIds = await withStackedFacadeWalls(plan.value, selectedIds, 'detach')
    detachWalls(plan.value, wallIds)
  } else {
    const wallIds = await withStackedFacadeWalls(plan.value, selectedIds, 'assign', value)
    assignWallsToGroup(plan.value, value, wallIds)
  }

  const groupId = groupIdForWall(plan.value, hit.id)
  const ids = groupId ? facadeMemberIdsOnFloor(plan.value, groupId, hit.floorIndex) : undefined
  lastInspectHit.value = {
    ...hit,
    ids: ids && ids.length > 0 ? ids : undefined,
  }
  // Force plan reactivity for download/settings roundtrip.
  plan.value = { ...plan.value }
}

const {
  sessionDefaults,
  activeFloorDefaults,
  defaultsForFloor,
  onFloorDefaultNumber,
  onFloorDefaultBool,
  hydrateFloorDefaultsFromPlan,
  addFloorDefaultsSlot,
  removeFloorDefaultsSlot,
} = useFmlViewerSessionDefaults({ plan, activeFloorIndex, t })

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
  const ok = await confirmFmlChrome({
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

const {
  dimensionVis,
  dimensionSettings,
  canClearActiveDimensions,
  patchDimensionSettings,
  clearActiveDimensionType,
} = useFmlViewerDimensions({ plan, activeFloorIndex })

const fmlRescaleActive = ref(false)
const fmlRescaleState = ref<HScaleState | null>(null)
const fmlRescaleDistanceMmX = ref(0)
const fmlRescaleDistanceMmY = ref(0)
const underlayScaleActive = ref(false)
const underlayScaleState = ref<HScaleState | null>(null)
const underlayScaleMmX = ref(3000)
const underlayScaleMmY = ref(3000)

function cancelFmlRescale(): void {
  fmlRescaleActive.value = false
  fmlRescaleState.value = null
}

function cancelUnderlayScale(): void {
  underlayScaleActive.value = false
  underlayScaleState.value = null
}

function persistElevationUnderlayDrawing(groupId = elevationGroupId.value): void {
  const current = plan.value
  const layout = elevationUnderlayLayout.value
  const id = groupId.trim()
  if (!current || !layout || !id) return
  if (!(elevationUnderlayWidthPx.value > 0) || !(elevationUnderlayHeightPx.value > 0)) return
  const url =
    elevationViewForGroup(current, id)?.drawing?.url ?? elevationUnderlaySrc.value ?? undefined
  if (!url) return
  const drawing = drawingFromImageScale({
    imageWidthPx: elevationUnderlayWidthPx.value,
    imageHeightPx: elevationUnderlayHeightPx.value,
    pxPerMmX: layout.pxPerMmX,
    pxPerMmY: layout.pxPerMmY,
    origin: layout.origin,
    url,
    alpha: Math.round(underlayOpacity.value * 100),
    rotation: layout.rotationDeg ?? 0,
  })
  if (!drawing) return
  plan.value = setElevationViewDrawing(current, id, drawing)
}

function persistActiveUnderlayDrawing(): void {
  persistElevationUnderlayDrawing()
  const current = plan.value
  const layout = underlayLayout.value
  const idx = activeFloorIndex.value
  const floor = current?.floors[idx]
  if (!current || !floor || !layout) return
  if (!(underlayWidthPx.value > 0) || !(underlayHeightPx.value > 0)) return
  const url = floor.drawing?.url ?? underlaySrc.value
  if (!url) return
  const drawing = drawingFromImageScale({
    imageWidthPx: underlayWidthPx.value,
    imageHeightPx: underlayHeightPx.value,
    pxPerMmX: layout.pxPerMmX,
    pxPerMmY: layout.pxPerMmY,
    origin: layout.origin,
    url,
    alpha: Math.round(underlayOpacity.value * 100),
    rotation: layout.rotationDeg ?? 0,
  })
  if (!drawing) return
  if (floor.drawing?.extras) drawing.extras = floor.drawing.extras
  if (floor.drawing?.visible != null) drawing.visible = floor.drawing.visible
  plan.value = {
    ...current,
    floors: current.floors.map((item, i) => (i === idx ? { ...item, drawing } : item)),
  }
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
  cancelUnderlayScale()
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

const underlayAvailable = computed(() =>
  gevelsMode.value
    ? !!elevationUnderlaySrc.value && !!elevationUnderlayLayout.value
    : !!underlaySrc.value && !!underlayLayout.value,
)
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
const activeFloor = computed(() => floors.value[activeFloorIndex.value] ?? floors.value[0] ?? null)

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
      doorBovenlichtDefault: activeFloorDefaults.value.bovenlichtDefault,
      windowBovenlichtDefault: activeFloorDefaults.value.windowBovenlichtDefault,
      bovenlichtHeightCm: activeFloorDefaults.value.bovenlichtHeightCm,
      bovenlichtGapCm: activeFloorDefaults.value.bovenlichtGapCm,
    }),
  )
})

const fmlText = computed(() => {
  if (!plan.value) return ''
  const exportPlan = stripStampGroupFromPlan(plan.value)
  return buildFmlV3(exportPlan, {
    name: exportPlan.name,
    bovenlichtDefault: (_floor, index) => defaultsForFloor(index).bovenlichtDefault,
    windowBovenlichtDefault: (_floor, index) => defaultsForFloor(index).windowBovenlichtDefault,
    bovenlichtHeightCm: (_floor, index) => defaultsForFloor(index).bovenlichtHeightCm,
    bovenlichtGapCm: (_floor, index) => defaultsForFloor(index).bovenlichtGapCm,
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
  cancelUnderlayScale()
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

  underlayHint.value = t('viewer.underlayMissingUrl')
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('read failed'))
        return
      }
      resolve(result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(file)
  })
}

async function onUnderlayFileInput(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !plan.value) return
  cancelFmlRescale()
  cancelUnderlayScale()
  try {
    const dataUrl = await fileToDataUrl(file)
    const img = await loadImage(dataUrl)
    const { width, height } = imageDimensions(img)
    const drawing = provisionalDrawingFromImage(
      { width, height },
      { url: dataUrl, alpha: Math.round(underlayOpacity.value * 100) },
    )
    if (!drawing) {
      error.value = t('viewer.underlayInvalid')
      return
    }
    if (gevelsMode.value && elevationGroupId.value) {
      elevationUnderlayWidthPx.value = width
      elevationUnderlayHeightPx.value = height
      elevationUnderlaySrc.value = dataUrl
      plan.value = setElevationViewDrawing(plan.value, elevationGroupId.value, drawing)
      const layout = previewUnderlayLayoutFromDrawing(drawing, { width, height })
      elevationUnderlayLayout.value = layout
      underlayHint.value = null
      error.value = null
      await nextTick()
      previewCanvasRef.value?.resetView?.()
      beginUnderlayScale()
      return
    }
    const idx = activeFloorIndex.value
    plan.value = {
      ...plan.value,
      floors: plan.value.floors.map((item, i) => (i === idx ? { ...item, drawing } : item)),
    }
    applyImageToUnderlay(dataUrl, width, height, drawing)
    underlayHint.value = null
    error.value = null
    await nextTick()
    previewCanvasRef.value?.resetView?.()
    beginUnderlayScale()
  } catch {
    error.value = t('viewer.underlayLoadFailed')
  }
}

function beginUnderlayScale(): boolean {
  if (inspectMode.value || !underlayAvailable.value) return false
  const layout = activeUnderlayLayout.value
  const widthPx = activeUnderlayWidthPx.value
  const heightPx = activeUnderlayHeightPx.value
  const handles = initImageScaleHandles(widthPx, heightPx)
  if (!layout || !handles) return false
  const cmState = fmlRescaleStateFromImageHandles(handles, layout)
  if (!cmState) return false
  const measured = measuredCmFromRescaleState(cmState)
  cancelFmlRescale()
  underlayScaleState.value = cmState
  underlayScaleMmX.value = measured.x * 10
  underlayScaleMmY.value = measured.y * 10
  underlayMoveMode.value = false
  underlayScaleActive.value = true
  return true
}

function updateUnderlayScaleState(next: HScaleState): void {
  if (!underlayScaleActive.value) return
  underlayScaleState.value = { ...next }
}

function onRescaleStateUpdate(next: HScaleState): void {
  if (fmlRescaleActive.value) updateFmlRescaleState(next)
  else if (underlayScaleActive.value) updateUnderlayScaleState(next)
}

function confirmUnderlayScale(): boolean {
  const state = underlayScaleState.value
  const layout = activeUnderlayLayout.value
  const current = plan.value
  if (!state || !layout || !current || !underlayScaleActive.value) return false
  const measured = measuredCmFromRescaleState(state)
  const nextPpm = resolveUnderlayPxPerMmFromRulers({
    measuredCmX: measured.x,
    measuredCmY: measured.y,
    currentPxPerMmX: layout.pxPerMmX,
    currentPxPerMmY: layout.pxPerMmY,
    trueMmX: underlayScaleMmX.value,
    trueMmY: underlayScaleMmY.value,
  })
  if (!nextPpm) return false
  const widthPx = activeUnderlayWidthPx.value
  const heightPx = activeUnderlayHeightPx.value
  const url = gevelsMode.value
    ? (elevationViewForGroup(current, elevationGroupId.value)?.drawing?.url ??
      elevationUnderlaySrc.value ??
      undefined)
    : (current.floors[activeFloorIndex.value]?.drawing?.url ?? underlaySrc.value ?? undefined)
  const drawing = drawingFromImageScale({
    imageWidthPx: widthPx,
    imageHeightPx: heightPx,
    pxPerMmX: nextPpm.pxPerMmX,
    pxPerMmY: nextPpm.pxPerMmY,
    origin: layout.origin,
    url,
    alpha: Math.round(underlayOpacity.value * 100),
    rotation: layout.rotationDeg ?? 0,
  })
  if (!drawing) return false
  if (gevelsMode.value && elevationGroupId.value) {
    plan.value = setElevationViewDrawing(current, elevationGroupId.value, drawing)
    const nextLayout = previewUnderlayLayoutFromDrawing(drawing, {
      width: widthPx,
      height: heightPx,
    })
    if (nextLayout) {
      elevationUnderlayLayout.value = copyUnderlayDisplayOrient(nextLayout, layout)
    }
    cancelUnderlayScale()
    void nextTick().then(() => previewCanvasRef.value?.resetView?.())
    return true
  }
  const idx = activeFloorIndex.value
  const floor = current.floors[idx]
  if (floor?.drawing?.extras) drawing.extras = floor.drawing.extras
  if (floor?.drawing?.visible != null) drawing.visible = floor.drawing.visible
  plan.value = {
    ...current,
    floors: current.floors.map((item, i) => (i === idx ? { ...item, drawing } : item)),
  }
  const nextLayout = previewUnderlayLayoutFromDrawing(drawing, {
    width: underlayWidthPx.value,
    height: underlayHeightPx.value,
  })
  if (nextLayout) {
    underlayLayout.value = copyUnderlayDisplayOrient(nextLayout, layout)
  }
  cancelUnderlayScale()
  if ((floor?.walls.length ?? 0) === 0) {
    void nextTick().then(() => previewCanvasRef.value?.resetView?.())
  }
  return true
}

const underlayScalePxX = computed(() => {
  const state = underlayScaleState.value
  const layout = activeUnderlayLayout.value
  if (!state || !layout) return 0
  return measuredCmFromRescaleState(state).x * 10 * layout.pxPerMmX
})

const underlayScalePxY = computed(() => {
  const state = underlayScaleState.value
  const layout = activeUnderlayLayout.value
  if (!state || !layout) return 0
  return measuredCmFromRescaleState(state).y * 10 * layout.pxPerMmY
})

const underlayScaleCanConfirm = computed(
  () =>
    underlayScaleActive.value &&
    underlayScalePxX.value > 3 &&
    underlayScalePxY.value > 3 &&
    underlayScaleMmX.value > 0 &&
    underlayScaleMmY.value > 0,
)

const underlayScaleMismatchPct = computed(() => {
  const x = underlayScalePxX.value / underlayScaleMmX.value
  const y = underlayScalePxY.value / underlayScaleMmY.value
  if (!(x > 0) || !(y > 0)) return 0
  return (Math.abs(x - y) / Math.min(x, y)) * 100
})

const canApplyStamp = computed(
  () =>
    !inspectMode.value && !!plan.value && canApplyStampToFloor(plan.value, activeFloorIndex.value),
)

function applyStampFromSidebar(): void {
  previewCanvasRef.value?.applyStampToActiveFloor?.()
}

const canStartUnderlayScale = computed(() => underlayAvailable.value && !inspectMode.value)
const rescaleOverlayActive = computed(() => fmlRescaleActive.value || underlayScaleActive.value)
const rescaleOverlayState = computed(() =>
  fmlRescaleActive.value ? fmlRescaleState.value : underlayScaleState.value,
)

const {
  loadFileName,
  isLoadingFml,
  loadStatusLabel,
  floorLabel,
  selectFloor,
  setPlanName,
  renameFloor,
  addFloor,
  removeFloor,
  startNewPlan,
  onFileInput,
} = useFmlViewerLoad({
  // assigned after load; dak-enter uses this via selectFloorLater

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
  cancelUnderlayScale,
  persistActiveUnderlayDrawing,
  clearUnderlayState,
  syncUnderlayForActiveFloor,
  resetInspectState,
  hydrateFloorDefaultsFromPlan,
  addFloorDefaultsSlot,
  removeFloorDefaultsSlot,
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

async function onGenerateRoofPlanes(): Promise<void> {
  leaveGevelsMode()
  await nextTick()
  const ok = await previewCanvasRef.value?.generateRoofPlanes?.()
  if (ok === false) return
  enterDakMode()
}

async function onElevationStoryHeight(floorIndex: number, cm: number): Promise<void> {
  if (!plan.value) return
  const count = countPlanWalls(plan.value, floorIndex)
  const ok = await confirmFmlChrome({
    title: t('viewer.defaultsOverwriteTitle'),
    message: t('viewer.defaultsOverwriteWallFloor', { cm, count }),
    confirmLabel: t('common.apply'),
    cancelLabel: t('common.cancel'),
  })
  if (!ok || !plan.value) return
  plan.value = overwritePlanWallHeights(plan.value, cm, floorIndex)
}

function onElevationNok(cm: number): void {
  if (!plan.value) return
  plan.value = overwriteRidgeDakThickness(setNokThicknessCm(plan.value, cm), cm)
}

function onElevationRidgeZ(floorIndex: number, cm: number): void {
  if (!plan.value) return
  plan.value = setFloorRidgeHeights(plan.value, floorIndex, cm)
}

function onElevationRidgeDisplayWidth(cm: number): void {
  if (!plan.value) return
  plan.value = setRidgeDisplayWidthCm(plan.value, cm)
}

function onElevationProjection(mode: 'architect' | 'projective'): void {
  if (!plan.value) return
  plan.value = setElevationProjection(plan.value, mode)
}

function onElevationSlab(floorIndex: number, cm: number): void {
  const floor = plan.value?.floors[floorIndex]
  if (!plan.value || !floor) return
  plan.value = setSlabThicknessCm(plan.value, floor.level, cm)
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

watch(pendingAlignRebase, async (preview) => {
  if (!preview) {
    cancelFmlChromeDialog()
    return
  }
  const ok = await confirmFmlChrome({
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

function applyViewerUnderlayOrient(): void {
  const layout = activeUnderlayLayout.value
  if (!layout) return
  const next = cloneUnderlayOriginLayout(layout)
  next.flipX = !next.flipX
  if (!next.flipX) delete next.flipX
  if (gevelsMode.value) elevationUnderlayLayout.value = next
  else underlayLayout.value = next
}

function setUnderlayRotationDeg(raw: number): void {
  const layout = activeUnderlayLayout.value
  if (!layout || !Number.isFinite(raw)) return
  const next = cloneUnderlayOriginLayout(layout)
  let rotationDeg = raw
  while (rotationDeg > 180) rotationDeg -= 360
  while (rotationDeg <= -180) rotationDeg += 360
  if (Math.abs(rotationDeg) < 0.001) delete next.rotationDeg
  else next.rotationDeg = Math.round(rotationDeg * 10) / 10
  if (gevelsMode.value) elevationUnderlayLayout.value = next
  else underlayLayout.value = next
}

const underlayRotationDeg = computed(() => activeUnderlayLayout.value?.rotationDeg ?? 0)

function downloadCurrentFml(): void {
  flushPreviewFieldCommits()
  persistActiveUnderlayDrawing()
  if (!plan.value) return
  const junctioned = applyJunctionSanitizeToPlan(plan.value)
  if (junctioned !== plan.value) {
    plan.value = junctioned
  }
  if (!fmlText.value) return
  const base = fileName.value?.replace(/\.[^.]+$/i, '') || plan.value?.name?.trim() || 'fml-export'
  downloadFml(fmlText.value, `${base}.fml`)
}

function onPlanUpdate(next: FloorPlan, layout?: PreviewUnderlayLayout | null): void {
  plan.value = next
  if (layout !== undefined) {
    underlayLayout.value = layout ? cloneUnderlayOriginLayout(layout) : null
  }
}

function onElevationUnderlayLayout(layout: PreviewUnderlayLayout): void {
  elevationUnderlayLayout.value = cloneUnderlayOriginLayout(layout)
}

watch(inspectMode, (on) => {
  if (on) {
    cancelFmlRescale()
    cancelUnderlayScale()
  }
})

function applyViewerSettings(): void {
  const settings = loadUserSettings()
  scaleInputUnit.value = settings.scaleInputUnit
  thicknessMinCm.value = settings.defaults.thicknessMinCm
  thicknessMidCm.value = settings.defaults.thicknessMidCm
  thicknessMaxCm.value = settings.defaults.thicknessMaxCm
  previewCanvasRef.value?.applyCornerMarkerModeFromSettings?.()
}

onBeforeUnmount(() => {
  clearUnderlayState()
})

defineExpose({
  startNewPlan,
  applyViewerSettings,
  applyCornerMarkerModeFromSettings: () => applyViewerSettings(),
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
              class="sidebar-icon-btn sidebar-icon-btn--primary"
              title="Download .fml"
              aria-label="Download .fml"
              @click="downloadCurrentFml"
            >
              <ToolbeltIcon name="download" />
              <span>Download .fml</span>
            </button>
            <button
              v-if="!plan"
              type="button"
              class="sidebar-icon-btn sidebar-icon-btn--primary"
              :title="t('viewer.newPlan')"
              :aria-label="t('viewer.newPlan')"
              :disabled="isLoadingFml"
              @click="startNewPlan"
            >
              <ToolbeltIcon name="edit" />
              <span>{{ t('viewer.newPlan') }}</span>
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

          <details v-if="!inspectMode" class="fml-fold defaults-fold">
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
              <div class="sidebar-icon-row sidebar-plan-actions">
                <label
                  class="sidebar-icon-btn"
                  :class="{ 'is-disabled': isLoadingFml }"
                  :title="t('viewer.chooseFml')"
                  :aria-label="t('viewer.chooseFml')"
                >
                  <ToolbeltIcon name="upload" />
                  <span>{{ t('viewer.chooseFml') }}</span>
                  <input
                    type="file"
                    accept=".fml,.json,.json.fml"
                    :disabled="isLoadingFml"
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
                  @click="applyViewerProjectOrient('flipX')"
                >
                  <ToolbeltIcon name="mirror_plan" />
                  <span>{{ t('result.mirrorProject') }}</span>
                </button>
                <button
                  type="button"
                  class="sidebar-icon-btn"
                  :disabled="!plan || floors.length === 0"
                  :title="t('result.toolbar.generateRoofPlanesAria')"
                  :aria-label="t('result.toolbar.generateRoofPlanesAria')"
                  @click="onGenerateRoofPlanes()"
                >
                  <ToolbeltIcon name="rect" />
                  <span>{{ t('result.toolbar.generateRoofPlanes') }}</span>
                </button>
              </div>
            </div>
          </details>

          <details v-if="!inspectMode" class="fml-fold defaults-fold">
            <summary>{{ t('viewer.underlayFold') }}</summary>
            <p v-if="underlayHint" class="underlay-hint">{{ underlayHint }}</p>
            <div class="sidebar-icon-row sidebar-plan-actions">
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
                  :disabled="isLoadingFml"
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

          <details v-if="gevelsMode && !inspectMode" class="fml-fold defaults-fold" open>
            <summary>{{ t('viewer.elevationHeightsFold') }}</summary>
            <FmlElevationHeightFields
              :rows="elevationHeightRows"
              :ridge-display-width-cm="elevationRidgeDisplayWidthCm"
              :projection="elevationProjection"
              @nok="onElevationNok"
              @story="onElevationStoryHeight"
              @ridge="onElevationRidgeZ"
              @slab="onElevationSlab"
              @ridge-display-width="onElevationRidgeDisplayWidth"
              @projection="onElevationProjection"
            />
          </details>

          <details v-if="!inspectMode && !gevelsMode" class="fml-fold defaults-fold">
            <summary>{{ t('viewer.fmlFold') }}</summary>
            <div class="sidebar-icon-row sidebar-plan-actions">
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
            </div>
            <FmlRescalePanel
              v-if="!underlayScaleActive"
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
            <FmlViewerDefaultsFields
              :defaults="activeFloorDefaults"
              :bovenlicht-packed="bovenlichtPacked"
              :hint="t('viewer.defaultsHintFloor')"
              @number="onFloorDefaultNumber"
              @bool="onFloorDefaultBool"
              @packed="onBovenlichtPackedChange"
            />
          </details>

          <details v-if="!inspectMode && !gevelsMode && !dakMode" class="fml-fold defaults-fold">
            <summary>{{ t('viewer.dimensionsFold') }}</summary>
            <FmlViewerDimensionFields
              :settings="dimensionSettings"
              :vis="dimensionVis"
              :can-clear="canClearActiveDimensions"
              @update:vis="dimensionVis = $event"
              @auto="patchDimensionSettings({ engineAutoDims: $event })"
              @mode="patchDimensionSettings({ dimensionMode: $event })"
              @outer="patchDimensionSettings({ generateOuterDimension: $event })"
              @clear-active="clearActiveDimensionType"
            />
          </details>

          <div v-if="inspectMode" class="inspect-panel">
            <p class="inspect-hint">
              Tik cyclet de statuskleur: uit → open (oranje) → klaar (groen) → uit. Muur in een
              gevelgroep selecteert alle leden op deze verdieping.
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
              <div v-if="lastInspectHit.ids?.length">
                <dt>Gevel-leden</dt>
                <dd class="inspect-id">{{ lastInspectHit.ids.length }}</dd>
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
            <div v-if="lastInspectHit?.kind === 'wall'" class="inspect-facade">
              <label class="inspect-facade-label" for="inspect-facade-select">{{
                t('result.toolbar.facadeGroup')
              }}</label>
              <select
                id="inspect-facade-select"
                class="inspect-facade-select"
                :value="inspectFacadeSelectValue"
                @change="onInspectFacadeGroupChange"
              >
                <option value="">{{ t('result.toolbar.facadeGroupNone') }}</option>
                <option v-for="group in inspectFacadeGroups" :key="group.id" :value="group.id">
                  {{ group.code }} — {{ group.name }}
                </option>
                <option value="__new__">{{ t('result.toolbar.facadeGroupNew') }}</option>
              </select>
            </div>
            <p v-else-if="!lastInspectHit" class="inspect-empty">
              Nog geen selectie — tik op de plattegrond.
            </p>
          </div>

          <div v-if="openingOverflow || warnings.length > 0" class="download-warnings">
            <FmlOpeningOverflowNotice v-if="openingOverflow" :summary="openingOverflow" />
            <div v-if="warnings.length > 0" class="warnings">
              <p v-for="(warning, index) in warnings" :key="index">{{ warning.message }}</p>
            </div>
          </div>
          <div class="actions sidebar-download-row">
            <button
              type="button"
              class="upload-btn primary download-fml"
              @click="downloadCurrentFml"
            >
              Download .fml
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
              :disabled="isLoadingFml"
              :title="floorLabel(index)"
              @click="onSelectFloorChip(index)"
            >
              {{ floorLabel(index) }}
            </button>
            <button
              type="button"
              class="floor-chip add"
              :disabled="isLoadingFml"
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
              :disabled="isLoadingFml"
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
              :disabled="isLoadingFml"
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
          <FmlElevationHost
            v-if="gevelsMode && !inspectMode && plan"
            ref="previewCanvasRef"
            :plan="plan"
            :group-id="elevationGroupId"
            :underlay-src="elevationUnderlaySrc"
            :underlay-width-px="elevationUnderlayWidthPx"
            :underlay-height-px="elevationUnderlayHeightPx"
            :underlay-opacity="elevationUnderlaySrc ? underlayOpacity : 0"
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
          <FmlInspect
            v-else-if="inspectMode"
            ref="previewCanvasRef"
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
            :inspect-colors="inspectColors"
            :canvas-fullscreen="canvasFullscreen"
            @inspect-select="onInspectSelect"
            @update:canvas-fullscreen="canvasFullscreen = $event"
          />
          <FmlEditor
            v-else
            ref="previewCanvasRef"
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
            :underlay-move-mode="underlayMoveMode && underlayOpacity > 0"
            :canvas-fullscreen="canvasFullscreen"
            :dimension-vis="dimensionVis"
            :dak-mode="dakMode"
            :thickness-min-cm="thicknessMinCm"
            :thickness-mid-cm="thicknessMidCm"
            :thickness-max-cm="thicknessMaxCm"
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
            @cancel-rescale="fmlRescaleActive ? cancelFmlRescale() : cancelUnderlayScale()"
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
          :disabled="isLoadingFml"
          @click="startNewPlan"
        >
          {{ t('viewer.newPlan') }}
        </button>
        <label class="upload-btn" :class="{ 'upload-btn--disabled': isLoadingFml }">
          {{ t('viewer.chooseFml') }}
          <input
            type="file"
            accept=".fml,.json,.json.fml"
            :disabled="isLoadingFml"
            @change="onFileInput"
          />
        </label>
      </div>
    </main>
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

.inspect-facade {
  margin: 10px 0 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.inspect-facade-label {
  font-size: 11px;
  color: #64748b;
}

.inspect-facade-select {
  width: 100%;
  font-size: 12px;
  padding: 4px 6px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: #fff;
  color: #0f172a;
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
</style>
