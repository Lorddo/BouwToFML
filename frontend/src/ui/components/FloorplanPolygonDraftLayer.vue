<script setup lang="ts">
import type { PolygonPoint } from '@/cv/tools/polygon'
import { polygonToKonvaPoints } from '@/cv/tools/polygon'

defineProps<{
  polygonDraftPoints: PolygonPoint[]
  stageScale: number
  strokeColor: string
}>()
</script>

<template>
  <v-group v-if="polygonDraftPoints.length > 0">
    <v-line
      v-if="polygonDraftPoints.length >= 2"
      :config="{
        points: polygonToKonvaPoints(polygonDraftPoints),
        closed: false,
        stroke: strokeColor,
        strokeWidth: 2,
        strokeScaleEnabled: false,
        dash: [6, 4],
      }"
    />
    <v-circle
      v-for="(pt, i) in polygonDraftPoints"
      :key="'poly-draft-' + i"
      :config="{
        x: pt.x,
        y: pt.y,
        radius: Math.max(4, 6 / stageScale),
        fill: i === 0 ? strokeColor : '#ffffff',
        stroke: strokeColor,
        strokeWidth: 1.5,
        strokeScaleEnabled: false,
      }"
    />
  </v-group>
</template>
