<script setup lang="ts">
import { computed } from 'vue'
import { detailSymbolsVisibleOnScreen } from '@/ui/composables/fml-preview/fml-preview-world-stroke'
import { inspectColorFor } from '@/ui/composables/fml-preview/fml-inspect'
import type { RenderFixture } from '@/ui/composables/fml-preview/fml-preview-render-types'
import type { RenderModel } from '@/ui/composables/fml-preview/useFmlPreviewRenderModel'

const props = withDefaults(
  defineProps<{
    renderModel: RenderModel
    /** under = meubels achter muurfill; over = dak/gevel-symbolen. */
    layer?: 'under' | 'over' | 'all'
    layoutScale?: number
    viewScale?: number
    inspectColors?: Record<string, string>
    settingsItemId?: string | null
    moveItemId?: string | null
    itemDragPreview?: { id: string; x: number; y: number } | null
  }>(),
  {
    layer: 'all',
    layoutScale: 1,
    viewScale: 1,
    inspectColors: undefined,
    settingsItemId: null,
    moveItemId: null,
    itemDragPreview: null,
  },
)

function fixtureStagePos(fixture: RenderFixture): { x: number; y: number } {
  const preview = props.itemDragPreview
  if (preview && preview.id === fixture.id) return { x: preview.x, y: preview.y }
  return { x: fixture.x, y: fixture.y }
}

function itemHighlight(id: string): string | null {
  if (props.settingsItemId === id) return '#f97316'
  if (props.moveItemId === id) return '#3b82f6'
  return null
}

function fixtureFill(fixture: RenderFixture): string | undefined {
  return inspectColorFor(fixture.id, props.inspectColors) ?? fixture.fill
}

function fixtureStroke(fixture: RenderFixture): string | undefined {
  return inspectColorFor(fixture.id, props.inspectColors) ?? fixture.stroke
}

const detailVisible = computed(() =>
  detailSymbolsVisibleOnScreen(props.layoutScale, props.viewScale),
)

const fixtures = computed(() => {
  if (!detailVisible.value) return []
  const all = props.renderModel.fixtures
  if (props.layer === 'under') return all.filter((item) => !item.overWalls)
  if (props.layer === 'over') return all.filter((item) => item.overWalls)
  return all
})

/**
 * Fixture-groep schaalt cm→stage (`scaleX`). strokeWidth is wereld-cm in lokale coords
 * — niet delen door scale (dat hield schermpixels en dikte bij zoom).
 */
function localStroke(fixture: RenderFixture, cm = fixture.strokeWidth): number {
  return Math.max(0.05, cm)
}

function localDash(fixture: RenderFixture): number[] | undefined {
  if (!fixture.dash?.length) return undefined
  return fixture.dash
}

function localCutDash(_fixture: RenderFixture): number[] {
  return [5, 4]
}
</script>

<template>
  <v-group :config="{ listening: false }">
    <v-group
      v-for="fixture in fixtures"
      :key="fixture.id"
      :config="{
        x: fixtureStagePos(fixture).x,
        y: fixtureStagePos(fixture).y,
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
          fill: fixtureFill(fixture),
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
          fill: fixtureFill(fixture),
          stroke: fixtureStroke(fixture),
          strokeWidth: localStroke(fixture),
          dash: localDash(fixture),
          cornerRadius: fixture.cornerRadius ?? 0,
          listening: false,
          perfectDrawEnabled: false,
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
          fill: fixtureFill(fixture),
          stroke: fixtureStroke(fixture),
          strokeWidth: localStroke(fixture),
          listening: false,
          perfectDrawEnabled: false,
        }"
      />
      <v-circle
        v-for="(cir, cirIdx) in fixture.circles"
        :key="`${fixture.id}-c-${cirIdx}`"
        :config="{
          x: cir[0],
          y: cir[1],
          radius: cir[2],
          fill: inspectColorFor(fixture.id, inspectColors) ?? fixture.circleFill ?? fixture.fill,
          stroke: fixtureStroke(fixture),
          strokeWidth: localStroke(fixture),
          listening: false,
          perfectDrawEnabled: false,
        }"
      />
      <v-line
        v-for="(poly, polyIdx) in fixture.polylines"
        :key="`${fixture.id}-p-${polyIdx}`"
        :config="{
          points: poly,
          stroke: fixtureStroke(fixture),
          strokeWidth: localStroke(fixture),
          lineCap: 'round',
          listening: false,
          perfectDrawEnabled: false,
        }"
      />
      <v-line
        v-for="(poly, polyIdx) in fixture.dashPolylines"
        :key="`${fixture.id}-d-${polyIdx}`"
        :config="{
          points: poly,
          stroke: fixtureStroke(fixture),
          strokeWidth: localStroke(fixture),
          lineCap: 'round',
          dash: localCutDash(fixture),
          listening: false,
          perfectDrawEnabled: false,
        }"
      />
      <v-line
        v-for="(poly, polyIdx) in fixture.arrowPolylines"
        :key="`${fixture.id}-a-${polyIdx}`"
        :config="{
          points: poly,
          stroke: fixtureStroke(fixture),
          strokeWidth: localStroke(fixture, fixture.arrowStrokeWidth ?? fixture.strokeWidth),
          lineCap: 'butt',
          lineJoin: 'miter',
          listening: false,
          perfectDrawEnabled: false,
        }"
      />
      <v-rect
        v-if="itemHighlight(fixture.id)"
        :config="{
          x: fixture.localX,
          y: fixture.localY,
          width: fixture.localWidth,
          height: fixture.localHeight,
          fill: itemHighlight(fixture.id) ?? undefined,
          opacity: 0.2,
          stroke: itemHighlight(fixture.id) ?? undefined,
          strokeWidth: 0.45,
          listening: false,
          perfectDrawEnabled: false,
        }"
      />
    </v-group>
  </v-group>
</template>
