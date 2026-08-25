<script setup lang="ts">
import { computed } from 'vue'
import {
  areaLabelFontSizeStage,
  areaLabelKonvaConfig,
  areaLabelVisibleOnScreen,
} from '@/ui/composables/fml-preview/fml-preview-render-areas'
import { inspectColorFor, resolveInspectFill } from '@/ui/composables/fml-preview/fml-inspect'
import type { RenderSurface } from '@/ui/composables/fml-preview/fml-preview-render-types'
import type { Point2D } from '@/core/fml/types'
import {
  ARCHITECT_AREA_FILL,
  ARCHITECT_STROKE,
  DEFAULT_PLAN_DISPLAY_STYLE,
  isArchitectPlanStyle,
  type PlanDisplayStyleChoice,
} from '@/ui/composables/settings/plan-display-style'

const props = withDefaults(
  defineProps<{
    surfaces: RenderSurface[]
    settingsSurfaceId: string | null
    hoveredSurfaceId: string | null
    inspectColors: Record<string, string>
    surfaceEditId: string | null
    /** Stage-space vertex handles when editing. */
    editVertices: Point2D[] | null
    selectedVertexIndex?: number | null
    /** Content-layout scale (cm → stage); nodig voor wereldmaat-labels. */
    layoutScale?: number
    /** Viewport zoom; LOD filtert te kleine labels. */
    viewScale?: number
    /** false = geen surface-benaming (geen Konva.Text). */
    labelsVisible?: boolean
    /** fill = vlakken; labels = benaming + edit-handles bovenop. */
    layer?: 'fill' | 'labels' | 'all'
    planDisplayStyle?: PlanDisplayStyleChoice
  }>(),
  {
    layer: 'all',
    layoutScale: 1,
    viewScale: 1,
    labelsVisible: true,
    planDisplayStyle: DEFAULT_PLAN_DISPLAY_STYLE,
  },
)

const architect = computed(() => isArchitectPlanStyle(props.planDisplayStyle))
const showFill = computed(() => props.layer !== 'labels')
const showLabels = computed(() => props.layer !== 'fill' && props.labelsVisible)
const fillSurfaces = computed(() => (showFill.value ? props.surfaces : []))
const fontSizeStage = computed(() => areaLabelFontSizeStage(props.layoutScale))
const labeledSurfaces = computed(() => {
  if (!showLabels.value) return []
  if (!areaLabelVisibleOnScreen(fontSizeStage.value, props.viewScale)) return []
  return props.surfaces.filter((surface) => surface.label && surface.showAreaLabel !== false)
})
/** Edit-handles blijven zichtbaar ook als benaming uit staat. */
const editHandleVertices = computed(() =>
  props.layer !== 'fill' ? (props.editVertices ?? []) : [],
)
const cutoutMarks = computed(() => {
  if (!showFill.value) return []
  return fillSurfaces.value.flatMap((surface) =>
    surface.isCutout
      ? cutoutDiagonals(surface.points).map((points, idx) => ({
          id: `${surface.id}-cut-${idx}`,
          points,
        }))
      : [],
  )
})

function surfaceFill(surface: RenderSurface): string {
  if (surface.isCutout) return '#ffffff'
  if (architect.value) {
    const inspect = inspectColorFor(surface.id, props.inspectColors)
    if (inspect) return inspect
    if (props.settingsSurfaceId === surface.id || props.surfaceEditId === surface.id) {
      return '#f97316'
    }
    return ARCHITECT_AREA_FILL
  }
  return resolveInspectFill(surface.id, props.inspectColors, surface.fill)
}

function surfaceStroke(surface: RenderSurface): string {
  if (props.settingsSurfaceId === surface.id || props.surfaceEditId === surface.id) {
    return '#f97316'
  }
  if (architect.value) return ARCHITECT_STROKE
  return surface.isRoof ? '#b45309' : '#64748b'
}

const handleScale = computed(() => 1 / Math.max(0.35, props.viewScale))
const handleRadius = computed(() => 3.5 * handleScale.value)
const handleRadiusSelected = computed(() => 4.5 * handleScale.value)
const handleStroke = computed(() => 1.25 * handleScale.value)

function surfaceOpacity(surface: RenderSurface): number {
  if (architect.value) {
    if (props.settingsSurfaceId === surface.id || props.surfaceEditId === surface.id) return 0.72
    if (props.hoveredSurfaceId === surface.id) return 0.85
    return 1
  }
  const isRoof = surface.isRoof === true
  const base = isRoof ? 0.42 : 0.55
  if (props.settingsSurfaceId === surface.id || props.surfaceEditId === surface.id) {
    return isRoof ? 0.7 : 0.8
  }
  if (props.hoveredSurfaceId === surface.id) return isRoof ? 0.58 : 0.68
  return base
}

/** Default trapgat-kruis op een 4-punts cutout (geen extra FML-item). */
function cutoutDiagonals(points: number[]): number[][] {
  if (points.length < 8) return []
  return [
    [points[0] ?? 0, points[1] ?? 0, points[4] ?? 0, points[5] ?? 0],
    [points[2] ?? 0, points[3] ?? 0, points[6] ?? 0, points[7] ?? 0],
  ]
}
</script>

<template>
  <v-group :config="{ listening: false }">
    <v-line
      v-for="surface in fillSurfaces"
      :key="surface.id"
      :config="{
        points: surface.points,
        closed: true,
        fill: surfaceFill(surface),
        opacity: surfaceOpacity(surface),
        stroke: surfaceStroke(surface),
        strokeWidth: settingsSurfaceId === surface.id || surfaceEditId === surface.id ? 1.5 : 1,
        dash:
          surface.isCutout || (surface.isRoof && !architect)
            ? surface.isCutout
              ? [6, 4]
              : [8, 5]
            : undefined,
        listening: false,
        strokeScaleEnabled: false,
      }"
    />
    <v-line
      v-for="diag in cutoutMarks"
      :key="diag.id"
      :config="{
        points: diag.points,
        stroke: architect ? ARCHITECT_STROKE : '#64748b',
        strokeWidth: 0.7,
        dash: [6, 4],
        opacity: architect ? 1 : 0.7,
        listening: false,
        strokeScaleEnabled: false,
      }"
    />
    <v-text
      v-for="surface in labeledSurfaces"
      :key="`${surface.id}-label`"
      :config="
        areaLabelKonvaConfig(
          surface.label ?? '',
          surface.labelX,
          surface.labelY,
          architect ? ARCHITECT_STROKE : '#334155',
          fontSizeStage,
        )
      "
    />
    <v-circle
      v-for="(vertex, index) in editHandleVertices"
      :key="`edit-v-${index}`"
      :config="{
        x: vertex.x,
        y: vertex.y,
        radius: selectedVertexIndex === index ? handleRadiusSelected : handleRadius,
        fill: selectedVertexIndex === index ? '#5b21b6' : '#7c3aed',
        stroke: '#fff',
        strokeWidth: handleStroke,
        listening: false,
        strokeScaleEnabled: false,
      }"
    />
  </v-group>
</template>
