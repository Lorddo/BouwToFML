<script setup lang="ts">
import { computed } from 'vue'
import { areaLabelKonvaConfig } from '@/ui/composables/fml-preview/fml-preview-render-areas'
import {
  DEFAULT_LABEL_FONT_SIZE_PX,
  labelKonvaFontStyle,
} from '@/ui/composables/fml-preview/fml-preview-render-annotations'
import type { RenderLabel } from '@/ui/composables/fml-preview/fml-preview-render-types'

const props = withDefaults(
  defineProps<{
    labels: RenderLabel[]
    settingsLabelId: string | null
    hoveredLabelId: string | null
    /** Content-layout scale (cm → stage). Unused for annotation fontSize (scherm-px). */
    layoutScale?: number
    viewScale?: number
    /** false = geen FML draw_label tekst. */
    labelsVisible?: boolean
  }>(),
  { layoutScale: 1, viewScale: 1, labelsVisible: true },
)

const invView = computed(() => 1 / Math.max(1e-6, props.viewScale))

const visibleLabels = computed(() => (props.labelsVisible ? props.labels : []))

function screenPxToStage(px: number): number {
  return Math.max(0.01, px * invView.value)
}

function labelFontPx(label: RenderLabel): number {
  return Number.isFinite(label.fontSize) && label.fontSize > 0
    ? label.fontSize
    : DEFAULT_LABEL_FONT_SIZE_PX
}

/** Floorplanner fontSize = schermpixels; Stage schaalt met viewScale, dus delen. */
function labelTextConfig(label: RenderLabel): Record<string, unknown> {
  const fontSize = screenPxToStage(labelFontPx(label))
  const fill = label.fontColor || '#1f2937'
  const cfg = areaLabelKonvaConfig(label.text, 0, 0, fill, fontSize)
  const outline = label.outline === true
  return {
    ...cfg,
    fontFamily: label.fontFamily || 'arial',
    fontStyle: labelKonvaFontStyle(label.bold, label.italic),
    stroke: outline ? '#ffffff' : undefined,
    strokeWidth: outline ? screenPxToStage(Math.max(2, labelFontPx(label) * 0.14)) : 0,
    fillAfterStrokeEnabled: outline,
  }
}

function labelSelectWidth(label: RenderLabel): number {
  const fontSize = screenPxToStage(labelFontPx(label))
  return Math.max(fontSize * 4, label.text.length * fontSize * 0.62)
}

function labelSelectHeight(label: RenderLabel): number {
  return screenPxToStage(labelFontPx(label)) + 4 * invView.value
}
</script>

<template>
  <v-group>
    <v-group
      v-for="label in visibleLabels"
      :key="label.id"
      :config="{
        x: label.x,
        y: label.y,
        rotation: label.rotation,
        listening: false,
      }"
    >
      <v-text :config="labelTextConfig(label)" />
      <v-rect
        v-if="settingsLabelId === label.id || hoveredLabelId === label.id"
        :config="{
          x: 0,
          y: 0,
          width: labelSelectWidth(label),
          height: labelSelectHeight(label),
          offsetX: labelSelectWidth(label) / 2,
          offsetY: labelSelectHeight(label) / 2,
          stroke: settingsLabelId === label.id ? '#f97316' : '#94a3b8',
          strokeWidth: settingsLabelId === label.id ? 2 * invView : invView,
          listening: false,
        }"
      />
    </v-group>
  </v-group>
</template>
