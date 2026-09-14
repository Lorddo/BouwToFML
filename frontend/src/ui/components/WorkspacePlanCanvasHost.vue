<script setup lang="ts">
import { computed, ref } from 'vue'
import type { FloorPlan } from '@/core/plan/types'
import { readBovenlichtPacked } from '@/core/plan/bovenlicht'
import type { ThicknessBand } from '@/core/plan/wall-thickness-tiers'
import type { HScaleState } from '@/platform/calibration'
import { PLAN_AREA_SURFACE_EDIT_VISIBLE } from '@/ui/composables/workspace/constants'
import PlanCanvas from './PlanCanvas.vue'

/**
 * Presentational FML canvas host for WorkspaceView (detection kind).
 * Sidebar panel is `WorkspacePlanResultPanel` (layout keeps them apart; same FML result step).
 */
const props = defineProps<{
  plan: FloorPlan | null
  /** Remount FML-canvas per verdieping — voorkomt stale localPlan/nulpunt van vorige floor. */
  floorId?: string | null
  underlaySrc: string | null
  underlayOpacity: number
  contentOpacity: number
  /** false = kamer-/FML-labels verbergen. Default true. */
  labelsVisible?: boolean
  underlayWidthPx: number
  underlayHeightPx: number
  cmOrigin: { x: number; y: number } | null
  pxPerMmX: number
  pxPerMmY: number
  /** Onderlegger-rotatie in graden; default 0. */
  rotationDeg?: number
  flipX?: boolean
  underlayMoveMode?: boolean
  thicknessPickTier: ThicknessBand | null
  thicknessPresetCms: number[]
  bovenlichtDefault?: boolean
  windowBovenlichtDefault?: boolean
  bovenlichtHeightCm?: number
  bovenlichtGapCm?: number
  setPlanNulpuntImageCm?: (point: { x: number; y: number } | null) => void
  /** Workspace: Herschalen H/V-linialen. */
  rescaleMode?: boolean
  rescaleState?: HScaleState | null
  canvasFullscreen?: boolean
}>()

const emit = defineEmits<{
  planUpdate: [
    plan: FloorPlan,
    layout?: import('@/ui/composables/project/types').PreviewUnderlayLayout | null,
  ]
  thicknessWallPick: [wallId: string]
  cancelThicknessPick: []
  'update:underlayMoveMode': [value: boolean]
  updateRescaleState: [state: HScaleState]
  cancelRescale: []
  'update:canvasFullscreen': [value: boolean]
}>()

/**
 * Product gate: when area/surface edit is enabled in workspace, override detection preset.
 * Canvas `kind` still supplies the rest of the detection profile.
 */
const areaSurfaceEditEnabled = computed(() => PLAN_AREA_SURFACE_EDIT_VISIBLE)
const bovenlichtPacked = computed(() => readBovenlichtPacked(props.plan))

const canvasRef = ref<{
  flushPendingFieldCommits: () => void
  sanitizeWalls: () => boolean
  applyCornerMarkerModeFromSettings: () => void
} | null>(null)

defineExpose({
  flushPendingFieldCommits: () => canvasRef.value?.flushPendingFieldCommits(),
  sanitizeWalls: () => canvasRef.value?.sanitizeWalls() ?? false,
  applyCornerMarkerModeFromSettings: () => canvasRef.value?.applyCornerMarkerModeFromSettings(),
})
</script>

<template>
  <PlanCanvas
    ref="canvasRef"
    :key="floorId ? `fml-preview:${floorId}` : 'fml-preview'"
    kind="detection"
    :area-surface-edit-enabled="areaSurfaceEditEnabled"
    :plan="plan"
    :underlay-src="underlaySrc"
    :underlay-opacity="underlayOpacity"
    :content-opacity="contentOpacity"
    :labels-visible="labelsVisible !== false"
    :underlay-width-px="underlayWidthPx"
    :underlay-height-px="underlayHeightPx"
    :cm-origin="cmOrigin"
    :px-per-mm-x="pxPerMmX"
    :px-per-mm-y="pxPerMmY"
    :rotation-deg="rotationDeg ?? 0"
    :flip-x="flipX === true"
    :underlay-move-mode="underlayMoveMode === true"
    :thickness-pick-tier="thicknessPickTier"
    :thickness-preset-cms="thicknessPresetCms"
    :bovenlicht-default="bovenlichtDefault"
    :window-bovenlicht-default="windowBovenlichtDefault"
    :bovenlicht-height-cm="bovenlichtHeightCm"
    :bovenlicht-gap-cm="bovenlichtGapCm"
    :bovenlicht-packed="bovenlichtPacked"
    :set-plan-nulpunt-image-cm="props.setPlanNulpuntImageCm"
    :rescale-mode="rescaleMode === true"
    :rescale-state="rescaleState ?? null"
    :canvas-fullscreen="canvasFullscreen === true"
    @plan-update="(plan, layout) => emit('planUpdate', plan, layout)"
    @thickness-wall-pick="emit('thicknessWallPick', $event)"
    @cancel-thickness-pick="emit('cancelThicknessPick')"
    @update:underlay-move-mode="emit('update:underlayMoveMode', $event)"
    @update-rescale-state="emit('updateRescaleState', $event)"
    @cancel-rescale="emit('cancelRescale')"
    @update:canvas-fullscreen="emit('update:canvasFullscreen', $event)"
  />
</template>
