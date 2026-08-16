<script setup lang="ts">
import type { FloorPlan } from '@/core/fml/types'
import type { FmlThicknessBand } from '@/core/fml/fml-wall-thickness-tiers'
import FmlPreviewCanvas from './FmlPreviewCanvas.vue'

/**
 * Presentational FML canvas host for WorkspaceView.
 * Sidebar panel is `WorkspaceFmlResultPanel` (layout keeps them apart; same FML result step).
 */
const props = defineProps<{
  plan: FloorPlan | null
  /** Remount FML-canvas per verdieping — voorkomt stale localPlan/nulpunt van vorige floor. */
  floorId?: string | null
  underlaySrc: string | null
  underlayOpacity: number
  contentOpacity: number
  underlayWidthPx: number
  underlayHeightPx: number
  cmOrigin: { x: number; y: number } | null
  pxPerMmX: number
  pxPerMmY: number
  /** Onderlegger-rotatie in graden; default 0. */
  rotationDeg?: number
  flipX?: boolean
  underlayMoveMode?: boolean
  thicknessPickTier: FmlThicknessBand | null
  thicknessMinCm: number
  thicknessMidCm: number
  thicknessMaxCm: number
  bovenlichtDefault?: boolean
  windowBovenlichtDefault?: boolean
  setFmlNulpuntImageCm?: (point: { x: number; y: number } | null) => void
}>()

const emit = defineEmits<{
  planUpdate: [
    plan: FloorPlan,
    layout?: import('@/ui/composables/project/types').PreviewUnderlayLayout | null,
  ]
  thicknessWallPick: [wallId: string]
  cancelThicknessPick: []
  'update:underlayMoveMode': [value: boolean]
}>()
</script>

<template>
  <FmlPreviewCanvas
    :key="floorId ? `fml-preview:${floorId}` : 'fml-preview'"
    :plan="plan"
    :underlay-src="underlaySrc"
    :underlay-opacity="underlayOpacity"
    :content-opacity="contentOpacity"
    :underlay-width-px="underlayWidthPx"
    :underlay-height-px="underlayHeightPx"
    :cm-origin="cmOrigin"
    :px-per-mm-x="pxPerMmX"
    :px-per-mm-y="pxPerMmY"
    :rotation-deg="rotationDeg ?? 0"
    :flip-x="flipX === true"
    :underlay-move-mode="underlayMoveMode === true"
    :thickness-pick-tier="thicknessPickTier"
    :thickness-min-cm="thicknessMinCm"
    :thickness-mid-cm="thicknessMidCm"
    :thickness-max-cm="thicknessMaxCm"
    :bovenlicht-default="bovenlichtDefault"
    :window-bovenlicht-default="windowBovenlichtDefault"
    :set-fml-nulpunt-image-cm="props.setFmlNulpuntImageCm"
    @plan-update="(plan, layout) => emit('planUpdate', plan, layout)"
    @thickness-wall-pick="emit('thicknessWallPick', $event)"
    @cancel-thickness-pick="emit('cancelThicknessPick')"
    @update:underlay-move-mode="emit('update:underlayMoveMode', $event)"
  />
</template>
