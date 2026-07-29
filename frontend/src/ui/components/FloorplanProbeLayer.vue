<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  probePoint?: { x: number; y: number } | null
  probePreviewRect?: { x: number; y: number; width: number; height: number } | null
  probeResultRect?: { x: number; y: number; width: number; height: number } | null
}>()

const markerConfig = computed(() => {
  if (!props.probePoint) return null
  return {
    x: props.probePoint.x,
    y: props.probePoint.y,
    radius: 6,
    stroke: '#2563eb',
    strokeWidth: 2,
    fill: 'rgba(37, 99, 235, 0.25)',
    listening: false,
  }
})

function rectConfig(rect: { x: number; y: number; width: number; height: number }, stroke: string) {
  const x = rect.width < 0 ? rect.x + rect.width : rect.x
  const y = rect.height < 0 ? rect.y + rect.height : rect.y
  return {
    x,
    y,
    width: Math.abs(rect.width),
    height: Math.abs(rect.height),
    stroke,
    strokeWidth: 2,
    dash: [6, 4],
    fill: stroke === '#2563eb' ? 'rgba(37, 99, 235, 0.12)' : 'rgba(22, 163, 74, 0.1)',
    listening: false,
  }
}
</script>

<template>
  <v-group>
    <v-rect v-if="probePreviewRect" :config="rectConfig(probePreviewRect, '#2563eb')" />
    <v-rect v-if="probeResultRect" :config="rectConfig(probeResultRect, '#16a34a')" />
    <v-circle v-if="markerConfig" :config="markerConfig" />
    <v-line
      v-if="probePoint"
      :config="{
        points: [probePoint.x - 10, probePoint.y, probePoint.x + 10, probePoint.y],
        stroke: '#2563eb',
        strokeWidth: 1,
        listening: false,
      }"
    />
    <v-line
      v-if="probePoint"
      :config="{
        points: [probePoint.x, probePoint.y - 10, probePoint.x, probePoint.y + 10],
        stroke: '#2563eb',
        strokeWidth: 1,
        listening: false,
      }"
    />
  </v-group>
</template>
