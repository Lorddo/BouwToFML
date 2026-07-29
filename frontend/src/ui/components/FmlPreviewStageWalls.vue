<script setup lang="ts">
import type {
  RenderModel,
  RenderWallPolygon,
} from '@/ui/composables/fml-preview/useFmlPreviewRenderModel'

defineProps<{
  renderModel: RenderModel
  moveWallPolygon: RenderWallPolygon | null
  settingsWallPolygons: RenderWallPolygon[]
  settingsWallIds: string[]
  moveWallId: string | null
}>()
</script>

<template>
  <v-group :config="{ listening: false }">
    <v-path
      v-if="renderModel.wallFillPathData"
      :config="{
        data: renderModel.wallFillPathData,
        fill: '#111827',
        fillRule: 'evenodd',
        strokeEnabled: false,
        listening: false,
      }"
    />
    <v-line
      v-if="moveWallPolygon"
      :config="{
        points: moveWallPolygon.points,
        closed: true,
        fill: '#3b82f6',
        strokeEnabled: false,
        opacity: 0.35,
        listening: false,
      }"
    />
    <v-line
      v-for="polygon in settingsWallPolygons"
      :key="`settings-${polygon.id}`"
      :config="{
        points: polygon.points,
        closed: true,
        fill: '#f97316',
        strokeEnabled: false,
        opacity: 0.92,
        listening: false,
      }"
    />
    <v-line
      v-for="line in renderModel.wallLines"
      :key="`${line.id}-hit`"
      :config="{
        points: line.points,
        stroke:
          settingsWallIds.includes(line.id)
            ? '#f97316'
            : moveWallId === line.id
              ? '#3b82f6'
              : '#000000',
        strokeWidth: Math.max(14, line.strokeWidth + 12),
        opacity: settingsWallIds.includes(line.id) || moveWallId === line.id ? 0.15 : 0,
        lineCap: 'butt',
        listening: false,
      }"
    />
  </v-group>
</template>
