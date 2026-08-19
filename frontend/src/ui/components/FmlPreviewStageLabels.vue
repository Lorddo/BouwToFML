<script setup lang="ts">
import { computed } from 'vue'
import {
  areaLabelFontSizeStage,
  areaLabelKonvaConfig,
  areaLabelVisibleOnScreen,
} from '@/ui/composables/fml-preview/fml-preview-render-areas'
import type { RenderLabel } from '@/ui/composables/fml-preview/fml-preview-render-types'

const props = withDefaults(
  defineProps<{
    labels: RenderLabel[]
    settingsLabelId: string | null
    hoveredLabelId: string | null
    /** Content-layout scale (cm → stage). */
    layoutScale?: number
    viewScale?: number
    /** false = geen FML draw_label tekst. */
    labelsVisible?: boolean
  }>(),
  { layoutScale: 1, viewScale: 1, labelsVisible: true },
)

const fontSizeStage = computed(() => areaLabelFontSizeStage(props.layoutScale))
const visibleLabels = computed(() => {
  if (!props.labelsVisible) return []
  if (!areaLabelVisibleOnScreen(fontSizeStage.value, props.viewScale)) return []
  return props.labels
})

/** Zelfde lettergrootte + center-anker als kamerbenaming; FML fontSize blijft in model. */
function labelTextConfig(label: RenderLabel): Record<string, unknown> {
  return {
    ...areaLabelKonvaConfig(label.text, 0, 0, label.fontColor || '#1f2937', fontSizeStage.value),
    fontFamily: label.fontFamily || 'arial',
    fontStyle: label.bold ? 'bold' : 'normal',
  }
}

function labelSelectWidth(text: string): number {
  const fontSize = fontSizeStage.value
  return Math.max(fontSize * 4, text.length * fontSize * 0.62)
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
          width: labelSelectWidth(label.text),
          height: fontSizeStage + 4,
          offsetX: labelSelectWidth(label.text) / 2,
          offsetY: (fontSizeStage + 4) / 2,
          stroke: settingsLabelId === label.id ? '#f97316' : '#94a3b8',
          strokeWidth: settingsLabelId === label.id ? 2 : 1,
          listening: false,
        }"
      />
    </v-group>
  </v-group>
</template>
