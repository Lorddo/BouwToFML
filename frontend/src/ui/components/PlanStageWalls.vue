<script setup lang="ts">
import { computed } from 'vue'
import type {
  RenderModel,
  RenderWall,
  RenderWallPolygon,
} from '@/ui/composables/plan-canvas/usePlanCanvasRenderModel'
import {
  OPENING_STROKE_CM,
  SELECTION_HIGHLIGHT_PAD_PX,
  worldStrokeStage,
} from '@/ui/composables/plan-canvas/plan-canvas-world-stroke'
import {
  ARCHITECT_STROKE,
  isArchitectPlanStyle,
  type PlanDisplayStyleChoice,
  DEFAULT_PLAN_DISPLAY_STYLE,
} from '@/ui/composables/settings/plan-display-style'

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
    /** Dak-tab: dunne schermvaste lijnen, geen oranje nok-vulling. */
    dakMode?: boolean
    /** Settings: toon gestippelde nokbalk. */
    showRidgeDisplay?: boolean
    viewScale?: number
    /** Content-layout scale (cm → stage) for outline stroke. */
    layoutScale?: number
    planDisplayStyle?: PlanDisplayStyleChoice
  }>(),
  {
    facadeWallPolygons: () => [],
    dakMode: false,
    showRidgeDisplay: true,
    viewScale: 1,
    layoutScale: 1,
    planDisplayStyle: DEFAULT_PLAN_DISPLAY_STYLE,
  },
)

const outlineStroke = computed(() => worldStrokeStage(OPENING_STROKE_CM, props.layoutScale))
const hasOutlines = computed(() => props.renderModel.wallOutlinePolylines.length > 0)
const architect = computed(() => isArchitectPlanStyle(props.planDisplayStyle))

function wallHighlightStroke(line: RenderWall): number {
  const pad = SELECTION_HIGHLIGHT_PAD_PX / Math.max(props.viewScale, 0.01)
  return line.strokeWidth + pad
}

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
      v-if="renderModel.wallFillPathData && !hasOutlines && !architect"
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
      v-for="(points, index) in renderModel.wallOutlinePolylines"
      :key="`wall-outline-${index}`"
      :config="{
        points,
        stroke: ARCHITECT_STROKE,
        strokeWidth: outlineStroke,
        fillEnabled: false,
        lineCap: 'butt',
        lineJoin: 'miter',
        listening: false,
        perfectDrawEnabled: false,
      }"
    />
    <v-line
      v-for="line in renderModel.ghostWallLines"
      :key="`${line.id}-ghost`"
      :config="{
        points: line.points,
        stroke: architect ? ARCHITECT_STROKE : '#94a3b8',
        strokeWidth: 1,
        dash: architect ? undefined : [7, 5],
        lineCap: 'butt',
        opacity: architect ? 1 : 0.85,
        listening: false,
        perfectDrawEnabled: false,
        strokeScaleEnabled: false,
      }"
    />
    <v-line
      v-for="polygon in renderModel.ghostWallPolygons"
      :key="`${polygon.id}-ghost-poly`"
      :config="{
        points: polygon.points,
        closed: true,
        stroke: architect ? ARCHITECT_STROKE : '#64748b',
        strokeWidth: architect ? outlineStroke : 1,
        dash: architect ? undefined : [7, 5],
        fillEnabled: false,
        lineJoin: 'miter',
        lineCap: 'butt',
        opacity: architect ? 1 : 0.95,
        listening: false,
        perfectDrawEnabled: false,
        strokeScaleEnabled: architect,
      }"
    />
    <v-line
      v-if="moveWallPolygon && !dakMode"
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
      v-for="polygon in dakMode ? [] : settingsWallPolygons"
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
      v-for="ridge in showRidgeDisplay ? renderModel.ridgeLines : []"
      :key="`${ridge.id}-center`"
      :config="{
        points: ridge.points,
        stroke: settingsWallIds.includes(ridge.id)
          ? '#f97316'
          : architect
            ? ARCHITECT_STROKE
            : '#0f766e',
        strokeWidth: settingsWallIds.includes(ridge.id) ? 1.5 : 1,
        dash: architect ? undefined : [8, 6],
        lineCap: 'butt',
        listening: false,
        perfectDrawEnabled: false,
        strokeScaleEnabled: false,
      }"
    />
    <v-line
      v-for="outline in (showRidgeDisplay ? renderModel.ridgeLines : []).flatMap((ridge) =>
        ridge.outlinePoints.map((points, index) => ({ id: ridge.id, index, points })),
      )"
      :key="`${outline.id}-outline-${outline.index}`"
      :config="{
        points: outline.points,
        stroke: settingsWallIds.includes(outline.id)
          ? '#f97316'
          : architect
            ? ARCHITECT_STROKE
            : '#0f766e',
        strokeWidth: 1,
        dash: architect ? undefined : [8, 6],
        lineCap: 'butt',
        listening: false,
        perfectDrawEnabled: false,
        strokeScaleEnabled: false,
      }"
    />
    <v-line
      v-for="line in highlightedWallHits"
      :key="`${line.id}-hit`"
      :config="{
        points: line.points,
        stroke: settingsWallIds.includes(line.id) ? '#f97316' : '#3b82f6',
        strokeWidth: wallHighlightStroke(line),
        opacity: 0.15,
        lineCap: 'butt',
        listening: false,
      }"
    />
  </v-group>
</template>
