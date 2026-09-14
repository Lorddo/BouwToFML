<script setup lang="ts">
/**
 * Public Vue embed: full editor (PLG-native; FML I/O per tenant).
 * No OpenCV / workspace — host supplies `plan` and handles `planUpdate`.
 */
import { ref } from 'vue'
import type { FloorPlan } from '@/core/plan/types'
import type { UnderlayOriginLayout } from '@/core/plan/translate-floor-plan'
import type { ThicknessBand } from '@/core/plan/wall-thickness-tiers'
import type { HScaleState } from '@/platform/calibration'
import type { DimensionVis } from '@/core/plan/plan-dimension-vis'
import PlanCanvas from '@/ui/components/PlanCanvas.vue'
import PlanChromeDialogHost from '@/ui/components/PlanChromeDialogHost.vue'

withDefaults(
  defineProps<{
    plan: FloorPlan | null
    floorIndex?: number
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
    thicknessPickTier?: ThicknessBand | null
    thicknessPresetCms?: number[]
    bovenlichtDefault?: boolean
    windowBovenlichtDefault?: boolean
    bovenlichtHeightCm?: number
    bovenlichtGapCm?: number
    bovenlichtPacked?: boolean
    defaultDoorHeightCm?: number
    defaultWindowHeightCm?: number
    defaultWindowSillZCm?: number
    setPlanNulpuntImageCm?: (point: { x: number; y: number } | null) => void
    labelsVisible?: boolean
    rescaleMode?: boolean
    rescaleState?: HScaleState | null
    canvasFullscreen?: boolean
    dimensionVis?: DimensionVis
    dakMode?: boolean
  }>(),
  {
    floorIndex: 0,
    underlaySrc: null,
    underlayOpacity: 0,
    contentOpacity: 0.8,
    labelsVisible: true,
    canvasFullscreen: false,
    dimensionVis: undefined,
    dakMode: false,
    thicknessPresetCms: () => [10, 20, 30],
  },
)

const emit = defineEmits<{
  planUpdate: [plan: FloorPlan, layout?: UnderlayOriginLayout | null]
  thicknessWallPick: [wallId: string]
  cancelThicknessPick: []
  'update:underlayMoveMode': [value: boolean]
  updateRescaleState: [state: HScaleState]
  cancelRescale: []
  'update:canvasFullscreen': [value: boolean]
  'update:dimensionVis': [value: DimensionVis]
}>()

const canvasRef = ref<InstanceType<typeof PlanCanvas> | null>(null)

defineExpose({
  flushPendingFieldCommits: () => canvasRef.value?.flushPendingFieldCommits(),
  sanitizeWalls: () => canvasRef.value?.sanitizeWalls() ?? false,
  bindWallsToRoof: (floorIndex: number) => canvasRef.value?.bindWallsToRoof?.(floorIndex) ?? null,
  applyStampToActiveFloor: () => canvasRef.value?.applyStampToActiveFloor() ?? false,
  canApplyStampOnActiveFloor: () => canvasRef.value?.canApplyStampOnActiveFloor() ?? false,
  applyCornerMarkerModeFromSettings: () => canvasRef.value?.applyCornerMarkerModeFromSettings(),
  undoEdit: () => canvasRef.value?.undoEdit(),
  redoEdit: () => canvasRef.value?.redoEdit(),
  resetView: () => canvasRef.value?.resetView(),
  pushUndo: () => canvasRef.value?.pushUndo?.(),
  convertOverlayToManual: (source: 'autogen' | 'slicer') =>
    canvasRef.value?.convertOverlayToManual?.(source) ?? false,
})
</script>

<template>
  <PlanChromeDialogHost />
  <PlanCanvas
    ref="canvasRef"
    kind="editor"
    :plan="plan"
    :floor-index="floorIndex"
    :underlay-src="underlaySrc"
    :underlay-width-px="underlayWidthPx"
    :underlay-height-px="underlayHeightPx"
    :underlay-opacity="underlayOpacity"
    :content-opacity="contentOpacity"
    :cm-origin="cmOrigin"
    :px-per-mm-x="pxPerMmX"
    :px-per-mm-y="pxPerMmY"
    :rotation-deg="rotationDeg"
    :flip-x="flipX"
    :underlay-move-mode="underlayMoveMode"
    :thickness-pick-tier="thicknessPickTier"
    :thickness-preset-cms="thicknessPresetCms"
    :bovenlicht-default="bovenlichtDefault"
    :window-bovenlicht-default="windowBovenlichtDefault"
    :bovenlicht-height-cm="bovenlichtHeightCm"
    :bovenlicht-gap-cm="bovenlichtGapCm"
    :bovenlicht-packed="bovenlichtPacked"
    :default-door-height-cm="defaultDoorHeightCm"
    :default-window-height-cm="defaultWindowHeightCm"
    :default-window-sill-z-cm="defaultWindowSillZCm"
    :set-plan-nulpunt-image-cm="setPlanNulpuntImageCm"
    :labels-visible="labelsVisible"
    :rescale-mode="rescaleMode"
    :rescale-state="rescaleState"
    :canvas-fullscreen="canvasFullscreen"
    :dimension-vis="dimensionVis"
    :dak-mode="dakMode"
    @plan-update="(p, layout) => emit('planUpdate', p, layout)"
    @thickness-wall-pick="emit('thicknessWallPick', $event)"
    @cancel-thickness-pick="emit('cancelThicknessPick')"
    @update:underlay-move-mode="emit('update:underlayMoveMode', $event)"
    @update-rescale-state="emit('updateRescaleState', $event)"
    @cancel-rescale="emit('cancelRescale')"
    @update:canvas-fullscreen="emit('update:canvasFullscreen', $event)"
    @update:dimension-vis="emit('update:dimensionVis', $event)"
  />
</template>
