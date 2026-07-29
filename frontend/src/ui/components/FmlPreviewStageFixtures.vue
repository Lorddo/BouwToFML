<script setup lang="ts">
import type { RenderModel } from '@/ui/composables/fml-preview/useFmlPreviewRenderModel'

defineProps<{
  renderModel: RenderModel
}>()
</script>

<template>
  <v-group :config="{ listening: false }">
    <v-group
      v-for="fixture in renderModel.fixtures"
      :key="fixture.id"
      :config="{
        x: fixture.x,
        y: fixture.y,
        rotation: fixture.rotationDeg,
        scaleX: fixture.scaleX,
        scaleY: fixture.scaleY,
        listening: false,
      }"
    >
      <v-rect
        v-for="(rect, rectIdx) in fixture.rects"
        :key="`${fixture.id}-r-${rectIdx}`"
        :config="{
          x: rect[0],
          y: rect[1],
          width: rect[2],
          height: rect[3],
          fill: fixture.fill,
          stroke: fixture.stroke,
          strokeWidth: 1.2 / Math.max(Math.abs(fixture.scaleX), 0.001),
          listening: false,
        }"
      />
      <v-ellipse
        v-for="(ell, ellIdx) in fixture.ellipses"
        :key="`${fixture.id}-e-${ellIdx}`"
        :config="{
          x: ell[0],
          y: ell[1],
          radiusX: ell[2],
          radiusY: ell[3],
          fill: fixture.fill,
          stroke: fixture.stroke,
          strokeWidth: 1.2 / Math.max(Math.abs(fixture.scaleX), 0.001),
          listening: false,
        }"
      />
      <v-circle
        v-for="(cir, cirIdx) in fixture.circles"
        :key="`${fixture.id}-c-${cirIdx}`"
        :config="{
          x: cir[0],
          y: cir[1],
          radius: cir[2],
          fill: fixture.fill,
          stroke: fixture.stroke,
          strokeWidth: 1.2 / Math.max(Math.abs(fixture.scaleX), 0.001),
          listening: false,
        }"
      />
      <v-line
        v-for="(poly, polyIdx) in fixture.polylines"
        :key="`${fixture.id}-p-${polyIdx}`"
        :config="{
          points: poly,
          stroke: fixture.stroke,
          strokeWidth: 1.2 / Math.max(Math.abs(fixture.scaleX), 0.001),
          lineCap: 'round',
          listening: false,
        }"
      />
    </v-group>
  </v-group>
</template>
