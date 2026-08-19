<script setup lang="ts">
import { computed } from 'vue'
import type {
  RenderModel,
  RenderWall,
  RenderWallPolygon,
} from '@/ui/composables/fml-preview/useFmlPreviewRenderModel'

const props = defineProps<{
  renderModel: RenderModel
  moveWallPolygon: RenderWallPolygon | null
  settingsWallPolygons: RenderWallPolygon[]
  inspectWallPolygons: Array<RenderWallPolygon & { fill: string }>
  settingsWallIds: string[]
  moveWallId: string | null
}>()

/** Alleen zichtbare hit-strokes — geen opacity:0 node per muur (Staedion-killer). */
const highlightedWallHits = computed((): RenderWall[] => {
  const ids = new Set(props.settingsWallIds)
  if (props.moveWallId) ids.add(props.moveWallId)
  if (ids.size === 0) return []
  return props.renderModel.wallLines.filter((line) => ids.has(line.id))
})
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
        perfectDrawEnabled: false,
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
      v-for="polygon in inspectWallPolygons"
      :key="`inspect-${polygon.id}`"
      :config="{
        points: polygon.points,
        closed: true,
        fill: polygon.fill,
        strokeEnabled: false,
        opacity: 0.72,
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
      v-for="line in highlightedWallHits"
      :key="`${line.id}-hit`"
      :config="{
        points: line.points,
        stroke: settingsWallIds.includes(line.id) ? '#f97316' : '#3b82f6',
        strokeWidth: Math.max(14, line.strokeWidth + 12),
        opacity: 0.15,
        lineCap: 'butt',
        listening: false,
      }"
    />
  </v-group>
</template>
