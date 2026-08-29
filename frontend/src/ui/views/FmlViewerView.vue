<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FmlEditor from '@/ui/fml-editor/FmlEditor.vue'
import FmlInspect from '@/ui/fml-inspect/FmlInspect.vue'
import FmlElevationHost from '../components/FmlElevationHost.vue'
import FmlElevationHeightFields from '../components/FmlElevationHeightFields.vue'
import FmlOpeningOverflowNotice from '../components/FmlOpeningOverflowNotice.vue'
import FmlViewerDefaultsFields from '../components/FmlViewerDefaultsFields.vue'
import FmlViewerDimensionFields from '../components/FmlViewerDimensionFields.vue'
import FmlViewerInspectPanel from '../components/FmlViewerInspectPanel.vue'
import FmlRescalePanel from '../components/FmlRescalePanel.vue'
import ScaleConfirmBar from '../components/ScaleConfirmBar.vue'
import ToolbeltIcon from '../components/canvas/ToolbeltIcon.vue'
import { hasToolbeltHotkey } from '@/ui/composables/canvas/useToolbeltHotkey'
import '../components/fml-panel-fields.css'
import { buildFmlV3 } from '@/core/fml/buildFmlV3'
import {
  findOpeningHeightOverflows,
  summarizeOpeningHeightOverflows,
} from '@/core/fml/opening-height-overflow'
import { cloneUnderlayOriginLayout } from '@/core/fml/drawing-to-underlay-layout'
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
  detachWallsFromGroup,
  facadeMemberIdsOnFloor,
  groupIdsForWall,
  listFacadeGroups,
  renameFacadeGroup,
  STAMP_FACADE_GROUP_ID,
  stripStampGroupFromPlan,
} from '@/core/fml/facade-groups'
import { setNokThicknessCm, setSlabThicknessCm } from '@/core/fml/floor-stack'
import { bindFloorWallsToRoofs, listFloorsWithRoofPlanes } from '@/core/fml/bind-walls-to-roofs'
import { overwriteRidgeDakThickness } from '@/core/fml/ridge-walls'
import { countPlanWalls, overwritePlanWallHeights } from '@/core/fml/wall-endpoint-height'
import { splitWallAtT } from '@/ui/components/fml-preview-wall-edit'
import {
  countExpandableBovenlicht,
  countFoldableBovenlicht,
  expandBovenlichtOnPlan,
  foldBovenlichtOnPlan,
  readBovenlichtPacked,
  writeBovenlichtPacked,
} from '@/core/fml/bovenlicht'
import { canApplyStampToFloor } from '@/core/fml/apply-stamp-to-floor'
import { setElevationProjection } from '@/core/fml/elevation-views'
import { useFmlViewerDak } from '@/ui/composables/fml-viewer/useFmlViewerDak'
import { useFmlViewerDimensions } from '@/ui/composables/fml-viewer/useFmlViewerDimensions'
import { useFmlViewerGevels } from '@/ui/composables/fml-viewer/useFmlViewerGevels'
import { useFmlViewerUnderlay } from '@/ui/composables/fml-viewer/useFmlViewerUnderlay'
import { applyJunctionSanitizeToPlan } from '@/core/fml/materialize-wall-junctions'
import type { RebasePlanToItemRefidResult } from '@/core/fml/rebase-plan-to-item-refid'
import type { FloorPlan, ImportWarning } from '@/core/fml/types'
import { useFmlViewerInspect } from '@/ui/composables/fml-viewer/useFmlViewerInspect'
import { useFmlViewerLoad } from '@/ui/composables/fml-viewer/useFmlViewerLoad'
import { useFmlViewerSessionDefaults } from '@/ui/composables/fml-viewer/useFmlViewerSessionDefaults'
import {
  cancelFmlChromeDialog,
  confirmFmlChrome,
  promptFacadeGroupName,
  promptFacadeGroupsEdit,
  promptFmlChromeChoice,
} from '@/ui/composables/fml-chrome-dialog'
import { withStackedFacadeWalls } from '@/ui/composables/fml-facade-stacked'
import type { PreviewUnderlayLayout } from '@/ui/composables/project/types'
import { loadUserSettings } from '@/ui/composables/settings/user-settings'
import {
  formatScaleInputLabel,
  type ScaleInputUnit,
} from '@/ui/composables/settings/scale-input-unit'

const { t } = useI18n()

const plan = ref<FloorPlan | null>(null)
const warnings = ref<ImportWarning[]>([])
const error = ref<string | null>(null)
const bindRoofHint = ref<string | null>(null)
const bindRoofFloorIndex = ref<number | null>(null)
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
} = useFmlViewerInspect()

const /** FML-geometrie opacity 0–1; 0 = uit. */ fmlOpacity = ref(0.8)
const /** Sesssie-only: kamer-/FML-labels verbergen. */ hidePlanText = ref(false)
const /** Per-floor FML-oriëntatie (viewer heeft geen regenerate-from-detectie). */ orientByFloor =
    ref<Record<number, FloorOrientState>>({})
const pendingAlignRebase = ref<RebasePlanToItemRefidResult | null>(null)
const userSettings = loadUserSettings()
const scaleInputUnit = ref<ScaleInputUnit>(userSettings.scaleInputUnit)
const thicknessPresetCms = ref<number[]>([...userSettings.defaults.thicknessCms])

const floors = computed(() => plan.value?.floors ?? [])
const activeFloor = computed(() => floors.value[activeFloorIndex.value] ?? floors.value[0] ?? null)

const inspectFacadeGroups = computed(() =>
  listFacadeGroups(plan.value).filter((group) => group.id !== STAMP_FACADE_GROUP_ID),
)

let selectFloorLater: (index: number) => void | Promise<void> = () => {}
let leaveGevelsLater = (): void => {}

const underlayBox: { api: ReturnType<typeof useFmlViewerUnderlay> | null } = { api: null }

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
  planUnderlayLayout: computed(() => underlayBox.api?.underlayLayout.value ?? null),
  planUnderlayWidthPx: computed(() => underlayBox.api?.underlayWidthPx.value ?? 0),
  planUnderlayHeightPx: computed(() => underlayBox.api?.underlayHeightPx.value ?? 0),
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
} = gevels
leaveGevelsLater = leaveGevelsMode

const underlay = useFmlViewerUnderlay({
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
  fmlRescaleActive,
  fmlRescaleState,
  fmlRescaleDistanceMmX,
  fmlRescaleDistanceMmY,
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
  cancelFmlRescale,
  beginFmlRescale,
  setFmlRescaleDistanceMmX,
  setFmlRescaleDistanceMmY,
  confirmFmlRescale,
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

function inspectFacadeChecked(groupId: string): boolean {
  const hit = lastInspectHit.value
  if (!hit || hit.kind !== 'wall' || !plan.value) return false
  return groupIdsForWall(plan.value, hit.id).includes(groupId)
}

const inspectMemberFacadeGroups = computed(() =>
  inspectFacadeGroups.value.filter((group) => inspectFacadeChecked(group.id)),
)

const inspectAddableFacadeGroups = computed(() =>
  inspectFacadeGroups.value.filter((group) => !inspectFacadeChecked(group.id)),
)

function refreshInspectFacadeHit(): void {
  const hit = lastInspectHit.value
  if (!hit || hit.kind !== 'wall' || !plan.value) return
  const groupIds = groupIdsForWall(plan.value, hit.id)
  const ids =
    groupIds.length === 1
      ? facadeMemberIdsOnFloor(plan.value, groupIds[0], hit.floorIndex)
      : undefined
  lastInspectHit.value = {
    ...hit,
    ids: ids && ids.length > 0 ? ids : undefined,
  }
  plan.value = { ...plan.value }
}

async function onInspectFacadeToggle(groupId: string, enabled: boolean): Promise<void> {
  const hit = lastInspectHit.value
  if (!hit || hit.kind !== 'wall' || !plan.value) return
  const selectedIds = hit.ids && hit.ids.length > 0 ? hit.ids : [hit.id]
  if (enabled) {
    const wallIds = await withStackedFacadeWalls(plan.value, selectedIds, 'assign', groupId)
    assignWallsToGroup(plan.value, groupId, wallIds)
  } else {
    const wallIds = await withStackedFacadeWalls(plan.value, selectedIds, 'detach', groupId)
    detachWallsFromGroup(plan.value, groupId, wallIds)
  }
  refreshInspectFacadeHit()
}

async function onInspectFacadeChange(event: Event): Promise<void> {
  const select = event.target as HTMLSelectElement
  const value = select.value
  select.value = ''
  if (!value) return
  if (value === '__edit__') {
    await onInspectFacadeEditAll()
    return
  }
  if (value === '__new__') {
    await onInspectFacadeNew()
    return
  }
  await onInspectFacadeToggle(value, true)
}

async function onInspectFacadeEditAll(): Promise<void> {
  const groups = inspectFacadeGroups.value
  if (groups.length === 0 || !plan.value) return
  const edited = await promptFacadeGroupsEdit(groups.map((g) => ({ id: g.id, name: g.name })))
  if (!edited) return
  let changed = false
  for (const row of edited) {
    const current = groups.find((g) => g.id === row.id)
    if (!current || current.name === row.name) continue
    renameFacadeGroup(plan.value, row.id, { name: row.name })
    changed = true
  }
  if (changed) plan.value = { ...plan.value }
}

async function onInspectFacadeNew(): Promise<void> {
  const hit = lastInspectHit.value
  if (!hit || hit.kind !== 'wall' || !plan.value) return
  const selectedIds = hit.ids && hit.ids.length > 0 ? hit.ids : [hit.id]
  const name = await promptFacadeGroupName()
  if (name == null) return
  const wallIds = await withStackedFacadeWalls(plan.value, selectedIds, 'create')
  const group = createFacadeGroup(plan.value, { name })
  assignWallsToGroup(plan.value, group.id, wallIds)
  refreshInspectFacadeHit()
}

function onInspectFacadeSelectMembers(groupId: string): void {
  const hit = lastInspectHit.value
  if (!hit || hit.kind !== 'wall' || !plan.value) return
  const ids = facadeMemberIdsOnFloor(plan.value, groupId, hit.floorIndex)
  if (ids.length === 0) return
  lastInspectHit.value = { ...hit, ids }
}

async function onInspectFacadeRemove(groupId: string): Promise<void> {
  await onInspectFacadeToggle(groupId, false)
}

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

// --- Dimensions ---

const {
  dimensionVis,
  dimensionSettings,
  canClearActiveDimensions,
  canConvertActiveDimensions,
  patchDimensionSettings,
  clearActiveDimensionType,
} = useFmlViewerDimensions({ plan, activeFloorIndex })

function convertActiveDimensionsToManual(): void {
  const vis = dimensionVis.value
  if (vis !== 'autogen' && vis !== 'slicer') return
  const ok = previewCanvasRef.value?.convertOverlayToManual?.(vis) === true
  if (ok) dimensionVis.value = 'manual'
}

// --- Opacity / text ---

function onFmlOpacityInput(event: Event): void {
  fmlOpacity.value = Number((event.target as HTMLInputElement).value) / 100
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

// --- FML export ---

const fmlText = computed(() => {
  if (!plan.value) return ''
  const exportPlan = stripStampGroupFromPlan(plan.value)
  return buildFmlV3(exportPlan, {
    name: exportPlan.name,
    bovenlichtDefault: (_floor, index) => defaultsForFloor(index).bovenlichtDefault,
    windowBovenlichtDefault: (_floor, index) => defaultsForFloor(index).windowBovenlichtDefault,
    bovenlichtHeightCm: (_floor, index) => defaultsForFloor(index).bovenlichtHeightCm,
    bovenlichtGapCm: (_floor, index) => defaultsForFloor(index).bovenlichtGapCm,
    useMetric: loadUserSettings().unitSystem === 'metric',
  })
})

// --- Orient ---

const activeFmlOrient = computed(
  () => orientByFloor.value[activeFloorIndex.value] ?? defaultFloorOrient(),
)

const projectOrientFlipX = computed(() => {
  const list = floors.value
  if (list.length === 0) return false
  return list.every((_, i) => (orientByFloor.value[i] ?? defaultFloorOrient()).flipX)
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

// --- Stamp ---

const canApplyStamp = computed(
  () =>
    !inspectMode.value && !!plan.value && canApplyStampToFloor(plan.value, activeFloorIndex.value),
)

function applyStampFromSidebar(): void {
  previewCanvasRef.value?.applyStampToActiveFloor?.()
}

// --- Elevation events ---

async function onElevationStoryHeight(floorIndex: number, cm: number): Promise<void> {
  if (!plan.value) return
  const count = countPlanWalls(plan.value, floorIndex)
  const ok = await confirmFmlChrome({
    title: t('viewer.defaultsOverwriteTitle'),
    message: t('viewer.defaultsOverwriteWallFloor', {
      length: formatScaleInputLabel(cm, scaleInputUnit.value),
      cm: formatScaleInputLabel(cm, scaleInputUnit.value),
      count,
    }),
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

function onElevationProjection(mode: 'architect' | 'projective'): void {
  if (!plan.value) return
  plan.value = setElevationProjection(plan.value, mode)
}

function onElevationSlab(floorIndex: number, cm: number): void {
  const floor = plan.value?.floors[floorIndex]
  if (!plan.value || !floor) return
  plan.value = setSlabThicknessCm(plan.value, floor.level, cm)
}

// --- Bind walls to roof ---

const floorsWithRoofPlanes = computed(() => listFloorsWithRoofPlanes(plan.value))

const canBindWallsToRoof = computed(() => {
  if (!plan.value) return false
  if (dakMode.value) return resolveBindRoofFloorIndex() != null
  return floorsWithRoofPlanes.value.length > 0
})

function resolveBindRoofFloorIndex(): number | null {
  const floorList = floorsWithRoofPlanes.value
  if (floorList.length === 0) return null
  if (dakMode.value) {
    return floorList.some((f) => f.floorIndex === activeFloorIndex.value)
      ? activeFloorIndex.value
      : null
  }
  if (
    bindRoofFloorIndex.value != null &&
    floorList.some((f) => f.floorIndex === bindRoofFloorIndex.value)
  ) {
    return bindRoofFloorIndex.value
  }
  if (floorList.some((f) => f.floorIndex === activeFloorIndex.value)) {
    return activeFloorIndex.value
  }
  return floorList[0]?.floorIndex ?? null
}

watch([floorsWithRoofPlanes, activeFloorIndex, dakMode, gevelsMode], () => {
  const resolved = resolveBindRoofFloorIndex()
  if (resolved != null) bindRoofFloorIndex.value = resolved
  else bindRoofFloorIndex.value = null
  bindRoofHint.value = null
})

async function bindWallsToRoof(): Promise<void> {
  if (!plan.value) return
  const floorList = floorsWithRoofPlanes.value
  if (floorList.length === 0) return

  let floorIndex: number | null
  if (dakMode.value) {
    floorIndex = resolveBindRoofFloorIndex()
  } else if (floorList.length === 1) {
    floorIndex = floorList[0]?.floorIndex ?? null
  } else {
    const picked = await promptFmlChromeChoice({
      title: t('viewer.bindWallsToRoof'),
      message: t('viewer.bindWallsToRoofPickHint'),
      confirmLabel: t('viewer.bindWallsToRoof'),
      defaultValue: String(resolveBindRoofFloorIndex() ?? floorList[0]?.floorIndex ?? 0),
      listItems: floorList.map((floor) => ({
        id: String(floor.floorIndex),
        name: floor.name,
      })),
    })
    if (picked == null) return
    floorIndex = Number(picked)
    if (!floorList.some((floor) => floor.floorIndex === floorIndex)) return
    bindRoofFloorIndex.value = floorIndex
  }
  if (floorIndex == null) return
  applyBindWallsToRoof(floorIndex)
}

function applyBindWallsToRoof(floorIndex: number): void {
  if (!plan.value) return

  if (dakMode.value && previewCanvasRef.value?.bindWallsToRoof) {
    const result = previewCanvasRef.value.bindWallsToRoof(floorIndex)
    if (!result) return
    bindRoofHint.value = t('viewer.bindWallsToRoofResult', {
      bound: result.boundJunctions,
      skipped: result.skippedBlocked + result.skippedUncovered,
      splits: result.splits,
    })
    return
  }

  previewCanvasRef.value?.flushPendingFieldCommits?.()
  const result = bindFloorWallsToRoofs(plan.value, floorIndex, {
    splitCreases: true,
    splitWalls: splitWallAtT,
  })
  bindRoofHint.value = t('viewer.bindWallsToRoofResult', {
    bound: result.boundJunctions,
    skipped: result.skippedBlocked + result.skippedUncovered,
    splits: result.splits,
  })
  if (result.boundJunctions === 0 && result.splits === 0) return
  previewCanvasRef.value?.pushUndo?.()
  plan.value = result.plan
}

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

// --- Download ---

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

watch(inspectMode, (on) => {
  if (on) {
    cancelFmlRescale()
    cancelUnderlayScale()
  }
})

// --- Load ---

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

// --- Settings ---

function applyViewerSettings(): void {
  const settings = loadUserSettings()
  scaleInputUnit.value = settings.scaleInputUnit
  thicknessPresetCms.value = [...settings.defaults.thicknessCms]
  previewCanvasRef.value?.applyCornerMarkerModeFromSettings?.()
}

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
            </div>
          </details>

          <details
            v-if="!inspectMode"
            class="fml-fold defaults-fold"
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
                  :disabled="underlayReuseDonors.length === 0 || isLoadingFml"
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
              :unit="scaleInputUnit"
              :bovenlicht-packed="bovenlichtPacked"
              :hint="t('viewer.defaultsHintFloor')"
              @cm="onFloorDefaultCm"
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
              :can-convert="canConvertActiveDimensions"
              @update:vis="dimensionVis = $event"
              @auto="patchDimensionSettings({ engineAutoDims: $event })"
              @mode="patchDimensionSettings({ dimensionMode: $event })"
              @outer="patchDimensionSettings({ generateOuterDimension: $event })"
              @convert-active="convertActiveDimensionsToManual"
              @clear-active="clearActiveDimensionType"
            />
          </details>

          <FmlViewerInspectPanel
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
            <FmlOpeningOverflowNotice
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
            :unit="scaleInputUnit"
            :underlay-src="elevationUnderlaySrc"
            :underlay-width-px="elevationUnderlayWidthPx"
            :underlay-height-px="elevationUnderlayHeightPx"
            :underlay-opacity="elevationUnderlaySrc ? underlayOpacity : 0"
            :content-opacity="fmlOpacity"
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
