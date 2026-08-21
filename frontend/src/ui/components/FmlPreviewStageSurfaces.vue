<script setup lang="ts">
import { computed } from 'vue'
import {
  areaLabelFontSizeStage,
  areaLabelKonvaConfig,
  areaLabelVisibleOnScreen,
} from '@/ui/composables/fml-preview/fml-preview-render-areas'
import { resolveInspectFill } from '@/ui/composables/fml-preview/fml-inspect'
import type { RenderSurface } from '@/ui/composables/fml-preview/fml-preview-render-types'
import type { Point2D } from '@/core/fml/types'

const props = withDefaults(
  defineProps<{
    surfaces: RenderSurface[]
    settingsSurfaceId: string | null
    hoveredSurfaceId: string | null
    inspectColors: Record<string, string>
    surfaceEditId: string | null
    /** Stage-space vertex handles when editing. */
    editVertices: Point2D[] | null
    /** Content-layout scale (cm → stage); nodig voor wereldmaat-labels. */
    layoutScale?: number
    /** Viewport zoom; LOD filtert te kleine labels. */
    viewScale?: number
    /** false = geen surface-benaming (geen Konva.Text). */
    labelsVisible?: boolean
    /** fill = vlakken; labels = benaming + edit-handles bovenop. */
    layer?: 'fill' | 'labels' | 'all'
  }>(),
  { layer: 'all', layoutScale: 1, viewScale: 1, labelsVisible: true },
)

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
  return resolveInspectFill(surface.id, props.inspectColors, surface.fill)
}

function surfaceOpacity(surfaceId: string): number {
  if (props.settingsSurfaceId === surfaceId || props.surfaceEditId === surfaceId) return 0.8
  if (props.hoveredSurfaceId === surfaceId) return 0.68
  return 0.55
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
        opacity: surfaceOpacity(surface.id),
        stroke:
          settingsSurfaceId === surface.id || surfaceEditId === surface.id ? '#f97316' : '#64748b',
        strokeWidth: settingsSurfaceId === surface.id || surfaceEditId === surface.id ? 2 : 1,
        dash: surface.isCutout ? [6, 4] : undefined,
        listening: false,
      }"
    />
    <v-line
      v-for="diag in cutoutMarks"
      :key="diag.id"
      :config="{
        points: diag.points,
        stroke: '#64748b',
        strokeWidth: 0.7,
        dash: [6, 4],
        opacity: 0.7,
        listening: false,
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
          '#334155',
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
        radius: 5,
        fill: '#f97316',
        stroke: '#fff',
        strokeWidth: 1,
        listening: false,
      }"
    />
  </v-group>
</template>
