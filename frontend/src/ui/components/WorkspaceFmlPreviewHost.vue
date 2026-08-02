<script setup lang="ts">
import type { FloorPlan } from '@/core/fml/types'
import type { FmlThicknessBand } from '@/core/fml/fml-wall-thickness-tiers'
import FmlPreviewCanvas from './FmlPreviewCanvas.vue'

/**
 * Presentational FML canvas host for WorkspaceView.
 * Sidebar panel is `WorkspaceFmlResultPanel` (layout keeps them apart; same FML result step).
 */
defineProps<{
  plan: FloorPlan | null
  underlaySrc: string | null
  underlayOpacity: number
  contentOpacity: number
  underlayWidthPx: number
  underlayHeightPx: number
  cmOrigin: { x: number; y: number } | null
  pxPerMmX: number
  pxPerMmY: number
  thicknessPickTier: FmlThicknessBand | null
  thicknessMinCm: number
  thicknessMidCm: number
  thicknessMaxCm: number
  bovenlichtDefault?: boolean
}>()

const emit = defineEmits<{
  planUpdate: [plan: FloorPlan]
  thicknessWallPick: [wallId: string]
  cancelThicknessPick: []
}>()
</script>

<template>
  <FmlPreviewCanvas
    key="fml-preview"
    :plan="plan"
    :underlay-src="underlaySrc"
    :underlay-opacity="underlayOpacity"
    :content-opacity="contentOpacity"
    :underlay-width-px="underlayWidthPx"
    :underlay-height-px="underlayHeightPx"
    :cm-origin="cmOrigin"
    :px-per-mm-x="pxPerMmX"
    :px-per-mm-y="pxPerMmY"
    :thickness-pick-tier="thicknessPickTier"
    :thickness-min-cm="thicknessMinCm"
    :thickness-mid-cm="thicknessMidCm"
    :thickness-max-cm="thicknessMaxCm"
    :bovenlicht-default="bovenlichtDefault"
    @plan-update="emit('planUpdate', $event)"
    @thickness-wall-pick="emit('thicknessWallPick', $event)"
    @cancel-thickness-pick="emit('cancelThicknessPick')"
  />
</template>
