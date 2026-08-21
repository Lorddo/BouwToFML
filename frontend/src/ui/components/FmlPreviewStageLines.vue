<script setup lang="ts">
import { computed } from 'vue'
import { dimensionLabelVisibleOnScreen } from '@/ui/composables/fml-preview/fml-preview-world-stroke'
import type {
  RenderDimension,
  RenderLine,
} from '@/ui/composables/fml-preview/fml-preview-render-types'

const props = withDefaults(
  defineProps<{
    lines: RenderLine[]
    dimensions: RenderDimension[]
    settingsLineId: string | null
    hoveredLineId: string | null
    /** Viewport zoom — maattekst blijft schermgrootte. */
    viewScale?: number
  }>(),
  { viewScale: 1 },
)

/** Scherm-px voor maat-label (niet meezoomen zoals kamerbenaming). */
const DIM_LABEL_SCREEN_PX = 11

const invView = computed(() => 1 / Math.max(1e-6, props.viewScale))
const labelFont = computed(() => DIM_LABEL_SCREEN_PX * invView.value)
const labelStroke = computed(() => 3 * invView.value)
const labelWidth = computed(() => 72 * invView.value)

function dimLengthStage(dim: RenderDimension): number {
  const x0 = dim.points[0] ?? 0
  const y0 = dim.points[1] ?? 0
  const x1 = dim.points[2] ?? 0
  const y1 = dim.points[3] ?? 0
  return Math.hypot(x1 - x0, y1 - y0)
}

const dimensionsWithLabel = computed(() =>
  props.dimensions.map((dim) => ({
    dim,
    showLabel: dimensionLabelVisibleOnScreen(dimLengthStage(dim), props.viewScale),
  })),
)
</script>

<template>
  <v-group>
    <!-- Maatlijnen: lijn/ticks schermvast; tekst schermgrootte + LOD -->
    <v-group v-for="{ dim, showLabel } in dimensionsWithLabel" :key="`dim-${dim.id}`">
      <v-line
        :config="{
          points: dim.points,
          stroke: '#334155',
          strokeWidth: 1,
          strokeScaleEnabled: false,
          listening: false,
        }"
      />
      <v-line
        :config="{
          points: dim.tickA,
          stroke: '#334155',
          strokeWidth: 1,
          strokeScaleEnabled: false,
          listening: false,
        }"
      />
      <v-line
        :config="{
          points: dim.tickB,
          stroke: '#334155',
          strokeWidth: 1,
          strokeScaleEnabled: false,
          listening: false,
        }"
      />
      <v-text
        v-if="showLabel"
        :config="{
          x: dim.labelX,
          y: dim.labelY,
          text: dim.label,
          fontSize: labelFont,
          fontStyle: 'bold',
          fill: '#1e293b',
          stroke: '#ffffff',
          strokeWidth: labelStroke,
          fillAfterStrokeEnabled: true,
          align: 'center',
          width: labelWidth,
          offsetX: labelWidth / 2,
          offsetY: labelFont / 2,
          listening: false,
          perfectDrawEnabled: false,
        }"
      />
    </v-group>
    <!-- Notatielijnen: thickness = schermpixels (Floorplanner) -->
    <v-line
      v-for="line in lines"
      :key="line.id"
      :config="{
        points: line.points,
        stroke: line.stroke,
        strokeWidth:
          settingsLineId === line.id || hoveredLineId === line.id
            ? line.strokeWidth + 1
            : line.strokeWidth,
        strokeScaleEnabled: false,
        dash: line.dash,
        listening: false,
      }"
    />
  </v-group>
</template>
