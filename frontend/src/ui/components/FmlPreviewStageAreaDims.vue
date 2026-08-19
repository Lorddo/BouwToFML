<script setup lang="ts">
import { computed } from 'vue'
import { dimensionLabelVisibleOnScreen } from '@/ui/composables/fml-preview/fml-preview-world-stroke'
import type { RenderAreaSideDim } from '@/ui/composables/fml-preview/fml-preview-area-side-dims'

const props = withDefaults(
  defineProps<{
    dims: RenderAreaSideDim[]
    viewScale?: number
  }>(),
  { viewScale: 1 },
)

const DIM_LABEL_SCREEN_PX = 11

const invView = computed(() => 1 / Math.max(1e-6, props.viewScale))
const labelFont = computed(() => DIM_LABEL_SCREEN_PX * invView.value)
const labelStroke = computed(() => 3 * invView.value)
const labelWidth = computed(() => 72 * invView.value)

const visibleDims = computed(() =>
  props.dims.filter((dim) => dimensionLabelVisibleOnScreen(dim.lengthStage, props.viewScale)),
)
</script>

<template>
  <v-group :config="{ listening: false }">
    <v-text
      v-for="dim in visibleDims"
      :key="dim.id"
      :config="{
        x: dim.x,
        y: dim.y,
        text: dim.label,
        fontSize: labelFont,
        fontStyle: 'bold',
        fill: '#1e293b',
        stroke: '#ffffff',
        strokeWidth: labelStroke,
        fillAfterStrokeEnabled: true,
        align: 'center',
        width: labelWidth,
        offsetX: labelWidth / 2,
        offsetY: labelFont / 2,
        listening: false,
        perfectDrawEnabled: false,
      }"
    />
  </v-group>
</template>
