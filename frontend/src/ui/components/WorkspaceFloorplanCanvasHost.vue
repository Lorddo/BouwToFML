<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TemplatesBusyStep } from '@/ui/composables/workspace/workspace-view-visibility'
import CanvasToolbeltDock from './canvas/CanvasToolbeltDock.vue'
import type { FaceToolId, InkToolId } from './canvas/canvas-toolbelt.types'
import { getFaceToolbeltItems } from './canvas/faceToolbeltItems'
import { getInkToolbeltItems } from './canvas/inkToolbeltItems'

/**
 * Presentational shell around FloorplanCanvas: busy overlay (detectie/afronden) + toolbelt.
 * Canvas stays in WorkspaceView (ref + multi-arg emits) — no state move.
 */
defineProps<{
  busyOverlay: boolean
  busyOverlayTitle: string
  busyOverlaySteps: TemplatesBusyStep[]
  faceToolbeltVisible: boolean
  inkToolbeltVisible: boolean
  activeFaceBoxTool: FaceToolId | null
  activeInkTool: InkToolId | null
  inkBrushSize: number
  canUndoInkEdit: boolean
}>()

const emit = defineEmits<{
  'update:activeFaceBoxTool': [value: FaceToolId | null]
  'update:activeInkTool': [value: InkToolId | null]
  'update:inkBrushSize': [value: number]
  inkUndo: []
}>()

const { locale } = useI18n()
const faceTools = computed(() => {
  void locale.value
  return getFaceToolbeltItems()
})
const inkTools = computed(() => {
  void locale.value
  return getInkToolbeltItems()
})
</script>

<template>
  <slot />
  <div v-if="busyOverlay" class="initial-detection-overlay" aria-live="polite" aria-busy="true">
    <div class="initial-detection-card">
      <div class="initial-detection-spinner" aria-hidden="true" />
      <p class="initial-detection-title">{{ busyOverlayTitle }}</p>
      <ul class="initial-detection-steps">
        <li v-for="step in busyOverlaySteps" :key="step.id" :class="`step-${step.status}`">
          <span class="step-mark" aria-hidden="true" />
          <span>{{ step.label }}</span>
        </li>
      </ul>
    </div>
  </div>
  <CanvasToolbeltDock
    :face-visible="faceToolbeltVisible && !busyOverlay"
    :face-active-tool="activeFaceBoxTool"
    :face-tools="faceTools"
    :ink-visible="inkToolbeltVisible && !busyOverlay"
    :ink-active-tool="activeInkTool"
    :ink-brush-size="inkBrushSize"
    :ink-tools="inkTools"
    :ink-can-undo="canUndoInkEdit"
    @update:face-active-tool="emit('update:activeFaceBoxTool', $event as FaceToolId | null)"
    @update:ink-active-tool="emit('update:activeInkTool', $event as InkToolId | null)"
    @update:ink-brush-size="emit('update:inkBrushSize', $event)"
    @ink-undo="emit('inkUndo')"
  />
</template>

<style scoped>
.initial-detection-overlay {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(241, 245, 249, 0.55);
  backdrop-filter: blur(1px);
  pointer-events: none;
}

.initial-detection-card {
  min-width: 240px;
  max-width: min(360px, 90%);
  padding: 18px 20px;
  border-radius: 10px;
  background: #fff;
  border: 1px solid #e2e8f0;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12);
}

.initial-detection-spinner {
  width: 28px;
  height: 28px;
  margin: 0 auto 12px;
  border-radius: 50%;
  border: 3px solid #cbd5e1;
  border-top-color: #2563eb;
  animation: initial-detection-spin 0.8s linear infinite;
}

.initial-detection-title {
  margin: 0 0 12px;
  text-align: center;
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
}

.initial-detection-steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.initial-detection-steps li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #64748b;
}

.initial-detection-steps li.step-active {
  color: #0f172a;
  font-weight: 600;
}

.initial-detection-steps li.step-done {
  color: #15803d;
}

.step-mark {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #cbd5e1;
  flex-shrink: 0;
}

.step-active .step-mark {
  background: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.2);
}

.step-done .step-mark {
  background: #22c55e;
}

@keyframes initial-detection-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
