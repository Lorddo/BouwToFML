<script setup lang="ts">
import { computed } from 'vue'
import type {
  RenderModel,
  RenderWall,
  RenderWallPolygon,
} from '@/ui/composables/fml-preview/useFmlPreviewRenderModel'

const props = withDefaults(
  defineProps<{
    renderModel: RenderModel
    moveWallPolygon: RenderWallPolygon | null
    settingsWallPolygons: RenderWallPolygon[]
    /** Andere leden van dezelfde gevelgroep (niet geselecteerd). */
    facadeWallPolygons?: RenderWallPolygon[]
    inspectWallPolygons: Array<RenderWallPolygon & { fill: string }>
    settingsWallIds: string[]
    moveWallId: string | null
  }>(),
  {
    facadeWallPolygons: () => [],
  },
)

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
      v-for="line in renderModel.ghostWallLines"
      :key="`${line.id}-ghost`"
      :config="{
        points: line.points,
        stroke: '#94a3b8',
        strokeWidth: 1.25,
        dash: [7, 5],
        lineCap: 'butt',
        opacity: 0.85,
        listening: false,
        perfectDrawEnabled: false,
      }"
    />
    <v-line
      v-for="polygon in renderModel.ghostWallPolygons"
      :key="`${polygon.id}-ghost-poly`"
      :config="{
        points: polygon.points,
        closed: true,
        stroke: '#64748b',
        strokeWidth: 1.35,
        dash: [7, 5],
        fillEnabled: false,
        lineJoin: 'miter',
        lineCap: 'butt',
        opacity: 0.95,
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
      v-for="polygon in facadeWallPolygons"
      :key="`facade-${polygon.id}`"
      :config="{
        points: polygon.points,
        closed: true,
        fill: '#38bdf8',
        strokeEnabled: false,
        opacity: 0.4,
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
      v-for="ridge in renderModel.ridgeLines"
      :key="`${ridge.id}-center`"
      :config="{
        points: ridge.points,
        stroke: '#0f766e',
        strokeWidth: 1.25,
        dash: [8, 6],
        lineCap: 'butt',
        listening: false,
        perfectDrawEnabled: false,
      }"
    />
    <v-line
      v-for="outline in renderModel.ridgeLines.flatMap((ridge) =>
        ridge.outlinePoints.map((points, index) => ({ id: ridge.id, index, points })),
      )"
      :key="`${outline.id}-outline-${outline.index}`"
      :config="{
        points: outline.points,
        stroke: '#0f766e',
        strokeWidth: 1.5,
        dash: [8, 6],
        lineCap: 'butt',
        listening: false,
        perfectDrawEnabled: false,
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
