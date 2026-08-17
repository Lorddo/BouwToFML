<script setup lang="ts">
import { computed } from 'vue'
import type { MeasureLine } from '@/ui/composables/fml-preview/fml-preview-measure'
import { buildMeasureLineScreen } from '@/ui/composables/fml-preview/fml-preview-measure'

const props = defineProps<{
  width: number
  height: number
  lines: MeasureLine[]
  preview: { a: { x: number; y: number }; b: { x: number; y: number } } | null
  hover: { x: number; y: number } | null
  toScreen: (x: number, y: number) => { x: number; y: number }
  dashed?: boolean
}>()

const screenLines = computed(() => {
  const toScreen = props.toScreen
  return props.lines.map((line) => buildMeasureLineScreen(line, toScreen))
})

const screenPreview = computed(() => {
  if (!props.preview) return null
  return buildMeasureLineScreen(
    { id: 'preview', a: props.preview.a, b: props.preview.b },
    props.toScreen,
  )
})

const screenHover = computed(() => {
  if (!props.hover) return null
  return props.toScreen(props.hover.x, props.hover.y)
})
</script>

<template>
  <svg class="fml-measure-overlay" :width="width" :height="height">
    <g v-for="line in screenLines" :key="line.id" class="fml-measure-line">
      <line :x1="line.x1" :y1="line.y1" :x2="line.x2" :y2="line.y2" />
      <line :x1="line.tickAx1" :y1="line.tickAy1" :x2="line.tickAx2" :y2="line.tickAy2" />
      <line :x1="line.tickBx1" :y1="line.tickBy1" :x2="line.tickBx2" :y2="line.tickBy2" />
      <text :x="line.labelX" :y="line.labelY">{{ line.label }}</text>
    </g>
    <g v-if="screenPreview" class="fml-measure-line fml-measure-line--preview">
      <line
        :x1="screenPreview.x1"
        :y1="screenPreview.y1"
        :x2="screenPreview.x2"
        :y2="screenPreview.y2"
        :stroke-dasharray="dashed ? '6 4' : undefined"
      />
      <line
        :x1="screenPreview.tickAx1"
        :y1="screenPreview.tickAy1"
        :x2="screenPreview.tickAx2"
        :y2="screenPreview.tickAy2"
      />
      <line
        :x1="screenPreview.tickBx1"
        :y1="screenPreview.tickBy1"
        :x2="screenPreview.tickBx2"
        :y2="screenPreview.tickBy2"
      />
      <text :x="screenPreview.labelX" :y="screenPreview.labelY">{{ screenPreview.label }}</text>
    </g>
    <g
      v-if="screenHover"
      class="fml-measure-hover"
      :transform="`translate(${screenHover.x} ${screenHover.y})`"
    >
      <circle r="5" />
      <line x1="-10" y1="0" x2="10" y2="0" />
      <line x1="0" y1="-10" x2="0" y2="10" />
    </g>
  </svg>
</template>

<style scoped>
.fml-measure-overlay {
  position: absolute;
  inset: 0;
  z-index: 9;
  pointer-events: none;
  overflow: visible;
}

.fml-measure-line line {
  stroke: #7c3aed;
  stroke-width: 1.5;
  stroke-linecap: round;
}

.fml-measure-line--preview line {
  stroke: #a78bfa;
}

.fml-measure-line text {
  font-size: 11px;
  font-weight: 600;
  fill: #5b21b6;
  text-anchor: middle;
  dominant-baseline: central;
  paint-order: stroke fill;
  stroke: #fff;
  stroke-width: 3px;
}

.fml-measure-hover circle {
  fill: #a78bfa;
  fill-opacity: 0.35;
  stroke: #7c3aed;
  stroke-width: 1.5;
}

.fml-measure-hover line {
  stroke: #7c3aed;
  stroke-width: 1.5;
  stroke-linecap: round;
}
</style>
