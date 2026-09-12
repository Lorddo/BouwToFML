<script setup lang="ts">
import { computed } from 'vue'
import { worldDashStage, worldStrokeStage } from '@/ui/composables/fml-preview/fml-preview-world-stroke'
import type { RenderRoofPlaneOutline } from '@/ui/composables/fml-preview/fml-preview-render-types'

const props = withDefaults(
  defineProps<{
    outlines: RenderRoofPlaneOutline[]
    layoutScale?: number
    visible?: boolean
  }>(),
  { layoutScale: 1, visible: false },
)

/** Zelfde dash-familie als 1,50; andere kleur. */
const ROOF_DASH_CM: readonly [number, number] = [12, 6]
const LINE_STROKE_CM = 1.4

const dash = computed(() => worldDashStage(ROOF_DASH_CM, props.layoutScale))
const strokeW = computed(() => worldStrokeStage(LINE_STROKE_CM, props.layoutScale))
const shown = computed(() => (props.visible === true ? props.outlines : []))
</script>

<template>
  <v-group v-if="shown.length > 0" :config="{ listening: false }">
    <v-line
      v-for="outline in shown"
      :key="`roof-outline-${outline.id}`"
      :config="{
        points: outline.points,
        closed: true,
        stroke: outline.color,
        strokeWidth: strokeW,
        dash,
        lineCap: 'round',
        lineJoin: 'round',
        fillEnabled: false,
        listening: false,
        perfectDrawEnabled: false,
      }"
    />
  </v-group>
</template>
