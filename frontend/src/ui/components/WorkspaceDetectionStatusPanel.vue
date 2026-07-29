<script setup lang="ts">
import type { TemplateTab } from '@/cv/preprocess/layer-preprocess'
import type { RoomPhase } from '../composables/workspace/useWorkspaceRoomFaces'
import type { WorkspaceFlowStep } from '../composables/workspace/constants'

defineProps<{
  flowStep: WorkspaceFlowStep
  templateTab: TemplateTab
  profileConfirmed: boolean
  currentTabDetected: boolean
  roomPhase: RoomPhase
  ocrMaskedRegionCount: number
  wallsTabOutputReady: boolean
  running: boolean
  status: string | null
  error: string | null
  preprocessPreviewError: string | null
  scaleLocked: boolean
  lastOutputSummary: { extractorId: string; elapsedMs: number } | null
  activeSegmentCount: number | null
}>()
</script>

<template>
  <div class="panel" v-if="flowStep === 'templates' || flowStep === 'result'">
    <p v-if="running && status" class="status">{{ status }}</p>
    <p v-else-if="status" class="status">{{ status }}</p>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="preprocessPreviewError" class="error">{{ preprocessPreviewError }}</p>
  </div>
</template>

<style scoped>
.panel {
  padding: 12px 16px;
  border-bottom: 1px solid #e2e8f0;
}
</style>
