<script setup lang="ts">
/**
 * Public Vue embed: full FML editor (leading capability preset).
 * No OpenCV / workspace — host supplies `plan` and handles `planUpdate`.
 */
import { ref } from 'vue'
import type { FloorPlan } from '@/core/fml/types'
import type { UnderlayOriginLayout } from '@/core/fml/translate-floor-plan'
import type { FmlThicknessBand } from '@/core/fml/fml-wall-thickness-tiers'
import type { HScaleState } from '@/platform/calibration'
import FmlPreviewCanvas from '@/ui/components/FmlPreviewCanvas.vue'
import FmlChromeDialogHost from '@/ui/components/FmlChromeDialogHost.vue'

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
    thicknessPickTier?: FmlThicknessBand | null
    thicknessMinCm?: number
    thicknessMidCm?: number
    thicknessMaxCm?: number
    bovenlichtDefault?: boolean
    windowBovenlichtDefault?: boolean
    bovenlichtHeightCm?: number
    bovenlichtGapCm?: number
    defaultDoorHeightCm?: number
    defaultWindowHeightCm?: number
    defaultWindowSillZCm?: number
    setFmlNulpuntImageCm?: (point: { x: number; y: number } | null) => void
    labelsVisible?: boolean
    rescaleMode?: boolean
    rescaleState?: HScaleState | null
    canvasFullscreen?: boolean
  }>(),
  {
    floorIndex: 0,
    underlaySrc: null,
    underlayOpacity: 0,
    contentOpacity: 0.8,
    labelsVisible: true,
    canvasFullscreen: false,
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
}>()

const canvasRef = ref<InstanceType<typeof FmlPreviewCanvas> | null>(null)

defineExpose({
  flushPendingFieldCommits: () => canvasRef.value?.flushPendingFieldCommits(),
  sanitizeWalls: () => canvasRef.value?.sanitizeWalls() ?? false,
  applyCornerMarkerModeFromSettings: () => canvasRef.value?.applyCornerMarkerModeFromSettings(),
  undoEdit: () => canvasRef.value?.undoEdit(),
  redoEdit: () => canvasRef.value?.redoEdit(),
  resetView: () => canvasRef.value?.resetView(),
})
</script>

<template>
  <FmlChromeDialogHost />
  <FmlPreviewCanvas
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
    :thickness-min-cm="thicknessMinCm"
    :thickness-mid-cm="thicknessMidCm"
    :thickness-max-cm="thicknessMaxCm"
    :bovenlicht-default="bovenlichtDefault"
    :window-bovenlicht-default="windowBovenlichtDefault"
    :bovenlicht-height-cm="bovenlichtHeightCm"
    :bovenlicht-gap-cm="bovenlichtGapCm"
    :default-door-height-cm="defaultDoorHeightCm"
    :default-window-height-cm="defaultWindowHeightCm"
    :default-window-sill-z-cm="defaultWindowSillZCm"
    :set-fml-nulpunt-image-cm="setFmlNulpuntImageCm"
    :labels-visible="labelsVisible"
    :rescale-mode="rescaleMode"
    :rescale-state="rescaleState"
    :canvas-fullscreen="canvasFullscreen"
    @plan-update="(p, layout) => emit('planUpdate', p, layout)"
    @thickness-wall-pick="emit('thicknessWallPick', $event)"
    @cancel-thickness-pick="emit('cancelThicknessPick')"
    @update:underlay-move-mode="emit('update:underlayMoveMode', $event)"
    @update-rescale-state="emit('updateRescaleState', $event)"
    @cancel-rescale="emit('cancelRescale')"
    @update:canvas-fullscreen="emit('update:canvasFullscreen', $event)"
  />
</template>
