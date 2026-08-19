<script setup lang="ts">
import { computed } from 'vue'
import {
  areaLabelFontSizeStage,
  areaLabelKonvaConfig,
  areaLabelVisibleOnScreen,
} from '@/ui/composables/fml-preview/fml-preview-render-areas'
import { resolveInspectFill } from '@/ui/composables/fml-preview/fml-inspect'
import type { RenderArea } from '@/ui/composables/fml-preview/fml-preview-render-types'

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
  }>(),
  { layer: 'all', layoutScale: 1, viewScale: 1, labelsVisible: true },
)

const showFill = computed(() => props.layer !== 'labels')
const showLabels = computed(() => props.layer !== 'fill' && props.labelsVisible)
const fillAreas = computed(() => (showFill.value ? props.areas : []))
const fontSizeStage = computed(() => areaLabelFontSizeStage(props.layoutScale))
const labeledAreas = computed(() => {
  if (!showLabels.value) return []
  if (!areaLabelVisibleOnScreen(fontSizeStage.value, props.viewScale)) return []
  return props.areas.filter((area) => area.label)
})

function areaFill(area: RenderArea): string {
  return resolveInspectFill(area.id, props.inspectColors, area.fill)
}

function areaOpacity(areaId: string): number {
  if (props.settingsAreaId === areaId) return 0.72
  if (props.hoveredAreaId === areaId) return 0.58
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
        areaLabelKonvaConfig(area.label ?? '', area.labelX, area.labelY, '#1f2937', fontSizeStage)
      "
    />
  </v-group>
</template>
