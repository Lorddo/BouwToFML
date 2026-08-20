<script setup lang="ts">
/**
 * Public Vue embed: read-only FML inspection canvas.
 * Host drives status fills via `inspectColors` and listens to `inspectSelect`.
 */
import { ref } from 'vue'
import type { FloorPlan } from '@/core/fml/types'
import type { FmlInspectHit } from '@/ui/composables/fml-preview/fml-inspect'
import FmlPreviewCanvas from '@/ui/components/FmlPreviewCanvas.vue'

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
    /** FML guid → #RRGGBB status fill (open / done). */
    inspectColors?: Record<string, string>
    labelsVisible?: boolean
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
  inspectSelect: [hit: FmlInspectHit | null]
  'update:canvasFullscreen': [value: boolean]
}>()

const canvasRef = ref<InstanceType<typeof FmlPreviewCanvas> | null>(null)

defineExpose({
  resetView: () => canvasRef.value?.resetView(),
  applyCornerMarkerModeFromSettings: () => canvasRef.value?.applyCornerMarkerModeFromSettings(),
})
</script>

<template>
  <FmlPreviewCanvas
    ref="canvasRef"
    kind="inspect"
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
    :inspect-colors="inspectColors"
    :labels-visible="labelsVisible"
    :canvas-fullscreen="canvasFullscreen"
    @inspect-select="emit('inspectSelect', $event)"
    @update:canvas-fullscreen="emit('update:canvasFullscreen', $event)"
  />
</template>
