<script setup lang="ts">
import { computed } from 'vue'
import {
  commentLabelFontSizeStage,
  labelKonvaFontStyle,
} from '@/ui/composables/plan-canvas/plan-canvas-render-annotations'
import {
  areaLabelKonvaConfig,
  areaLabelVisibleOnScreen,
  planLabelBox,
  type PlanLabelAlign,
} from '@/ui/composables/plan-canvas/plan-canvas-render-areas'
import type { RenderLabel } from '@/ui/composables/plan-canvas/plan-canvas-render-types'

const props = withDefaults(
  defineProps<{
    labels: RenderLabel[]
    settingsLabelId: string | null
    hoveredLabelId: string | null
    /** Content-layout scale (cm → stage); zelfde wereldmaat als kamerbenaming. */
    layoutScale?: number
    viewScale?: number
    /** false = geen FML draw_label tekst. */
    labelsVisible?: boolean
  }>(),
  { layoutScale: 1, viewScale: 1, labelsVisible: true },
)

const invView = computed(() => 1 / Math.max(1e-6, props.viewScale))

const visibleLabels = computed(() => {
  if (!props.labelsVisible) return []
  return props.labels.filter((label) => {
    const fontSize = commentLabelFontSizeStage(label.fontSize, props.layoutScale)
    return areaLabelVisibleOnScreen(fontSize, props.viewScale)
  })
})

function labelAlign(label: RenderLabel): PlanLabelAlign {
  return label.align === 'left' || label.align === 'right' ? label.align : 'center'
}

function labelFontStage(label: RenderLabel): number {
  return commentLabelFontSizeStage(label.fontSize, props.layoutScale)
}

function labelOffsetX(width: number, align: PlanLabelAlign): number {
  if (align === 'left') return 0
  if (align === 'right') return width
  return width / 2
}

function labelTextConfig(label: RenderLabel): Record<string, unknown> {
  const fontSize = labelFontStage(label)
  const fill = label.fontColor || '#1f2937'
  const cfg = areaLabelKonvaConfig(label.text, 0, 0, fill, fontSize, labelAlign(label))
  const outline = label.outline === true
  return {
    ...cfg,
    fontStyle: labelKonvaFontStyle(label.bold, label.italic),
    stroke: outline ? '#ffffff' : undefined,
    strokeWidth: outline ? Math.max(fontSize * 0.14, 0.4) : 0,
    fillAfterStrokeEnabled: outline,
  }
}

function labelSelectConfig(label: RenderLabel): Record<string, unknown> {
  const { width, height } = planLabelBox(label.text, labelFontStage(label))
  const selected = props.settingsLabelId === label.id
  return {
    x: 0,
    y: 0,
    width,
    height,
    offsetX: labelOffsetX(width, labelAlign(label)),
    offsetY: height / 2,
    stroke: selected ? '#f97316' : '#94a3b8',
    strokeWidth: selected ? 2 * invView.value : invView.value,
    listening: false,
  }
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
        :config="labelSelectConfig(label)"
      />
    </v-group>
  </v-group>
</template>
