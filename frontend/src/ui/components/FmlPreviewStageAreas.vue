<script setup lang="ts">
import { computed } from 'vue'
import {
  areaLabelFontSizeStage,
  areaLabelKonvaConfig,
  areaLabelSelectRectConfig,
  areaLabelVisibleOnScreen,
} from '@/ui/composables/fml-preview/fml-preview-render-areas'
import { inspectColorFor, resolveInspectFill } from '@/ui/composables/fml-preview/fml-inspect'
import type { RenderArea } from '@/ui/composables/fml-preview/fml-preview-render-types'
import {
  ARCHITECT_AREA_FILL,
  DEFAULT_PLAN_DISPLAY_STYLE,
  isArchitectPlanStyle,
  type PlanDisplayStyleChoice,
} from '@/ui/composables/settings/plan-display-style'

const props = withDefaults(
  defineProps<{
    areas: RenderArea[]
    settingsAreaId: string | null
    hoveredAreaId: string | null
    inspectColors: Record<string, string>
    /** Content-layout scale (cm → stage); nodig voor wereldmaat-labels. */
    layoutScale?: number
    /** Viewport zoom; LOD filtert te kleine labels. */
    viewScale?: number
    /** false = geen kamerbenaming (geen Konva.Text). */
    labelsVisible?: boolean
    /** fill = vlakken; labels = benaming bovenop. */
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
const fillAreas = computed(() => (showFill.value ? props.areas : []))
const fontSizeStage = computed(() => areaLabelFontSizeStage(props.layoutScale))
const invView = computed(() => 1 / Math.max(1e-6, props.viewScale))
const labeledAreas = computed(() => {
  if (!showLabels.value) return []
  if (!areaLabelVisibleOnScreen(fontSizeStage.value, props.viewScale)) return []
  return props.areas.filter((area) => area.label && area.showAreaLabel !== false)
})
const selectedLabeledArea = computed(
  () => labeledAreas.value.find((area) => area.id === props.settingsAreaId) ?? null,
)

function areaFill(area: RenderArea): string {
  if (architect.value) {
    // Selectie/inspect behouden voor edit; anders wit (alleen UI).
    const inspect = inspectColorFor(area.id, props.inspectColors)
    if (inspect) return inspect
    if (props.settingsAreaId === area.id) return '#f97316'
    if (props.hoveredAreaId === area.id) return '#93c5fd'
    return ARCHITECT_AREA_FILL
  }
  return resolveInspectFill(area.id, props.inspectColors, area.fill)
}

function areaOpacity(areaId: string): number {
  if (props.settingsAreaId === areaId) return 0.72
  if (props.hoveredAreaId === areaId) return 0.58
  // Architect: volle witte plaat (geen pastel door opacity).
  if (architect.value) return 1
  return 0.45
}
</script>

<template>
  <v-group :config="{ listening: false }">
    <v-line
      v-for="area in fillAreas"
      :key="area.id"
      :config="{
        points: area.points,
        closed: true,
        fill: areaFill(area),
        opacity: areaOpacity(area.id),
        stroke: settingsAreaId === area.id ? '#f97316' : undefined,
        strokeWidth: settingsAreaId === area.id ? 2 : 0,
        listening: false,
      }"
    />
    <v-text
      v-for="area in labeledAreas"
      :key="`${area.id}-label`"
      :config="
        areaLabelKonvaConfig(
          area.label ?? '',
          area.labelX,
          area.labelY,
          architect ? '#111827' : '#1f2937',
          fontSizeStage,
        )
      "
    />
    <v-rect
      v-if="selectedLabeledArea"
      :config="
        areaLabelSelectRectConfig(
          selectedLabeledArea.label ?? '',
          selectedLabeledArea.labelX,
          selectedLabeledArea.labelY,
          fontSizeStage,
          true,
          invView,
        )
      "
    />
  </v-group>
</template>
