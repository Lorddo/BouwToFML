<script setup lang="ts">
import { computed } from 'vue'
import type Konva from 'konva'
import {
  CANVAS_GUIDE_GRID_PITCH_PX,
  CANVAS_GUIDE_GRID_STROKE,
  canvasGuideGridInverseConfig,
  type ViewportTransform,
} from './canvas-guide-grid'

const props = withDefaults(
  defineProps<{
    /** When false, mount nothing. */
    visible?: boolean
    /** Parent pan/zoom (Stage or content-group). */
    parentTransform: ViewportTransform
    /** Viewport size in CSS/screen pixels. */
    viewportWidth: number
    viewportHeight: number
  }>(),
  {
    visible: true,
  },
)

const groupConfig = computed(() => canvasGuideGridInverseConfig(props.parentTransform))

const shapeConfig = computed(() => {
  const w = Math.max(1, props.viewportWidth)
  const h = Math.max(1, props.viewportHeight)
  const pitch = CANVAS_GUIDE_GRID_PITCH_PX
  return {
    x: 0,
    y: 0,
    width: w,
    height: h,
    listening: false,
    perfectDrawEnabled: false,
    stroke: CANVAS_GUIDE_GRID_STROKE,
    strokeWidth: 1,
    sceneFunc: (ctx: Konva.Context, shape: Konva.Shape) => {
      ctx.beginPath()
      for (let x = 0; x <= w + 0.5; x += pitch) {
        ctx.moveTo(x, 0)
        ctx.lineTo(x, h)
      }
      for (let y = 0; y <= h + 0.5; y += pitch) {
        ctx.moveTo(0, y)
        ctx.lineTo(w, y)
      }
      ctx.fillStrokeShape(shape)
    },
  }
})
</script>

<template>
  <v-group v-if="visible" :config="groupConfig">
    <v-shape :config="shapeConfig" />
  </v-group>
</template>
