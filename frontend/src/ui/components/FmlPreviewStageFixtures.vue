<script setup lang="ts">
import { computed } from 'vue'
import type { RenderFixture } from '@/ui/composables/fml-preview/fml-preview-render-types'
import type { RenderModel } from '@/ui/composables/fml-preview/useFmlPreviewRenderModel'

const props = withDefaults(
  defineProps<{
    renderModel: RenderModel
    /** under = meubels achter muurfill; over = dak/gevel-symbolen. */
    layer?: 'under' | 'over' | 'all'
  }>(),
  { layer: 'all' },
)

const fixtures = computed(() => {
  const all = props.renderModel.fixtures
  if (props.layer === 'under') return all.filter((item) => !item.overWalls)
  if (props.layer === 'over') return all.filter((item) => item.overWalls)
  return all
})

function localStroke(fixture: RenderFixture, px = fixture.strokeWidth): number {
  return px / Math.max(Math.abs(fixture.scaleX), 0.001)
}

function localDash(fixture: RenderFixture): number[] | undefined {
  if (!fixture.dash?.length) return undefined
  const s = Math.max(Math.abs(fixture.scaleX), 0.001)
  return fixture.dash.map((d) => d / s)
}

function localCutDash(fixture: RenderFixture): number[] {
  const s = Math.max(Math.abs(fixture.scaleX), 0.001)
  return [5, 4].map((d) => d / s)
}
</script>

<template>
  <v-group :config="{ listening: false }">
    <v-group
      v-for="fixture in fixtures"
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
      <v-line
        v-for="(poly, polyIdx) in fixture.fillPolygons"
        :key="`${fixture.id}-f-${polyIdx}`"
        :config="{
          points: poly,
          closed: true,
          fill: fixture.fill,
          strokeEnabled: false,
          listening: false,
        }"
      />
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
          strokeWidth: localStroke(fixture),
          dash: localDash(fixture),
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
          strokeWidth: localStroke(fixture),
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
          fill: fixture.circleFill ?? fixture.fill,
          stroke: fixture.stroke,
          strokeWidth: localStroke(fixture),
          listening: false,
        }"
      />
      <v-line
        v-for="(poly, polyIdx) in fixture.polylines"
        :key="`${fixture.id}-p-${polyIdx}`"
        :config="{
          points: poly,
          stroke: fixture.stroke,
          strokeWidth: localStroke(fixture),
          lineCap: 'round',
          listening: false,
        }"
      />
      <v-line
        v-for="(poly, polyIdx) in fixture.dashPolylines"
        :key="`${fixture.id}-d-${polyIdx}`"
        :config="{
          points: poly,
          stroke: fixture.stroke,
          strokeWidth: localStroke(fixture),
          lineCap: 'round',
          dash: localCutDash(fixture),
          listening: false,
        }"
      />
      <v-line
        v-for="(poly, polyIdx) in fixture.arrowPolylines"
        :key="`${fixture.id}-a-${polyIdx}`"
        :config="{
          points: poly,
          stroke: fixture.stroke,
          strokeWidth: localStroke(fixture, fixture.arrowStrokeWidth ?? fixture.strokeWidth),
          lineCap: 'butt',
          lineJoin: 'miter',
          listening: false,
        }"
      />
    </v-group>
  </v-group>
</template>
