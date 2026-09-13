<script setup lang="ts">
import { computed } from 'vue'
import { worldDashStage, worldStrokeStage } from '@/ui/composables/plan-canvas/plan-canvas-world-stroke'
import type { RenderClearHeight } from '@/ui/composables/plan-canvas/plan-canvas-render-types'
import {
  clearHeightFillRgba,
  DEFAULT_CLEAR_HEIGHT_FILL_COLOR,
} from '@/ui/composables/settings/user-settings'
import { parseFmlHex } from '@/core/fml/roomtype-catalog'

const props = withDefaults(
  defineProps<{
    clearHeight: RenderClearHeight | null
    layoutScale?: number
    /** Plattegrond vs Dak-tab. */
    dakMode?: boolean
    show150?: boolean
    show200?: boolean
    showPlanFill?: boolean
    /** `#RRGGBB` arcering + 1,50-lijn. */
    fillColor?: string
  }>(),
  {
    layoutScale: 1,
    dakMode: false,
    show150: true,
    show200: false,
    showPlanFill: false,
    fillColor: DEFAULT_CLEAR_HEIGHT_FILL_COLOR,
  },
)

/** Andere dash dan trapgat `[6,4]`. */
const CLEAR_HEIGHT_DASH_CM: readonly [number, number] = [12, 6]
const LINE_STROKE_CM = 1.4
const COLOR_200 = '#a855f7'

const baseHex = computed(
  () => parseFmlHex(props.fillColor) ?? DEFAULT_CLEAR_HEIGHT_FILL_COLOR,
)
const fill150 = computed(() => clearHeightFillRgba(baseHex.value))
const color150 = computed(() => baseHex.value)

const dash = computed(() => worldDashStage(CLEAR_HEIGHT_DASH_CM, props.layoutScale))
const strokeW = computed(() => worldStrokeStage(LINE_STROKE_CM, props.layoutScale))

const showLines150 = computed(
  () => props.show150 === true && props.dakMode !== true && (props.clearHeight?.lines150.length ?? 0) > 0,
)
const showLines200 = computed(
  () => props.show200 === true && props.dakMode !== true && (props.clearHeight?.lines200.length ?? 0) > 0,
)
const showFill150 = computed(() => {
  if (props.show150 !== true) return false
  const fills = props.clearHeight?.fills150 ?? []
  if (fills.length === 0) return false
  if (props.dakMode === true) return true
  return props.showPlanFill === true
})
</script>

<template>
  <v-group v-if="clearHeight" :config="{ listening: false }">
    <v-line
      v-for="(points, index) in showFill150 ? clearHeight.fills150 : []"
      :key="`ch-fill-150-${index}`"
      :config="{
        points,
        closed: true,
        fill: fill150,
        strokeEnabled: false,
        listening: false,
        perfectDrawEnabled: false,
      }"
    />
    <v-line
      v-for="(points, index) in showLines150 ? clearHeight.lines150 : []"
      :key="`ch-line-150-${index}`"
      :config="{
        points,
        closed: false,
        stroke: color150,
        strokeWidth: strokeW,
        dash,
        lineCap: 'round',
        lineJoin: 'round',
        listening: false,
        perfectDrawEnabled: false,
      }"
    />
    <v-line
      v-for="(points, index) in showLines200 ? clearHeight.lines200 : []"
      :key="`ch-line-200-${index}`"
      :config="{
        points,
        closed: false,
        stroke: COLOR_200,
        strokeWidth: strokeW,
        dash,
        lineCap: 'round',
        lineJoin: 'round',
        listening: false,
        perfectDrawEnabled: false,
      }"
    />
  </v-group>
</template>
