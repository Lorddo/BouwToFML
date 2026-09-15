<script setup lang="ts">
import type { ElevationRenderModel } from '@/ui/composables/elevation/useElevationRenderModel'
import type { ElevationInteraction } from '@/ui/composables/elevation/useElevationInteraction'
import type { FacadeElevation } from '@/core/plan/facade-elevation'

const props = defineProps<{
  elevation: FacadeElevation | null
  render: ElevationRenderModel
  interaction: ElevationInteraction
}>()

const r = props.render
const stageRect = r.stageRect
const stagePoints = r.stagePoints
const stagePoly = r.stagePoly
const elevStroke = r.elevStroke
const elevStrokeHeavy = r.elevStrokeHeavy
const elevDash = r.elevDash
const layoutXform = r.layoutXform
const viewScale = r.viewScale

const ix = props.interaction
const snapGuide = ix.snapGuide
const splitDraft = ix.splitDraft
const ridgePlacePreview = ix.ridgePlacePreview
const roofPlaceDraft = ix.roofPlaceDraft
const roofPlacePreview = ix.roofPlacePreview
const roofPlaceHover = ix.roofPlaceHover
const activeTool = ix.activeTool
</script>

<template>
  <template v-if="elevation">
    <!-- Snap guide Y -->
    <v-line
      v-if="snapGuide?.y != null"
      :config="{
        points: (() => {
          const a = layoutXform.toStagePoint(elevation.bounds.x0, snapGuide.y)
          const b = layoutXform.toStagePoint(elevation.bounds.x1, snapGuide.y)
          return [a.x, a.y, b.x, b.y]
        })(),
        stroke: '#2563eb',
        dash: [6 / viewScale, 4 / viewScale],
        strokeWidth: 1 / viewScale,
        listening: false,
      }"
    />
    <!-- Snap guide X -->
    <v-line
      v-if="snapGuide?.x != null"
      :config="{
        points: (() => {
          const a = layoutXform.toStagePoint(snapGuide.x, elevation.bounds.y0)
          const b = layoutXform.toStagePoint(snapGuide.x, elevation.bounds.y1)
          return [a.x, a.y, b.x, b.y]
        })(),
        stroke: '#2563eb',
        dash: [6 / viewScale, 4 / viewScale],
        strokeWidth: 1 / viewScale,
        listening: false,
      }"
    />
    <!-- Split draft line -->
    <v-line
      v-if="splitDraft"
      :config="{
        points: stagePoints(
          { x: splitDraft.x, y: splitDraft.y0 },
          { x: splitDraft.x, y: splitDraft.y1 },
        ),
        stroke: '#f97316',
        strokeWidth: elevStrokeHeavy,
        listening: false,
      }"
    />
    <!-- Ridge place preview -->
    <v-rect
      v-if="ridgePlacePreview"
      :config="{
        ...stageRect(ridgePlacePreview.rect),
        fill: 'rgba(123, 142, 166, 0.35)',
        stroke: '#f97316',
        strokeWidth: elevStrokeHeavy,
        dash: elevDash,
        listening: false,
        perfectDrawEnabled: false,
      }"
    />
    <!-- Roof place draft line -->
    <v-line
      v-if="roofPlaceDraft && roofPlaceHover"
      :config="{
        points: stagePoints(roofPlaceDraft.eaveElev, roofPlaceHover),
        stroke: '#f97316',
        strokeWidth: elevStroke,
        dash: elevDash,
        listening: false,
        perfectDrawEnabled: false,
      }"
    />
    <!-- Roof place draft point -->
    <v-circle
      v-if="roofPlaceDraft"
      :config="{
        ...(() => {
          const stage = layoutXform.toStagePoint(
            roofPlaceDraft.eaveElev.x,
            roofPlaceDraft.eaveElev.y,
          )
          return { x: stage.x, y: stage.y }
        })(),
        radius: 5 / viewScale,
        fill: '#f97316',
        stroke: '#fff',
        strokeWidth: 1.5 / viewScale,
        listening: false,
      }"
    />
    <!-- Roof hover point (no draft yet) -->
    <v-circle
      v-else-if="activeTool === 'add_roof' && roofPlaceHover"
      :config="{
        ...(() => {
          const stage = layoutXform.toStagePoint(roofPlaceHover.x, roofPlaceHover.y)
          return { x: stage.x, y: stage.y }
        })(),
        radius: 5 / viewScale,
        fill: 'rgba(249, 115, 22, 0.85)',
        stroke: '#fff',
        strokeWidth: 1.5 / viewScale,
        listening: false,
      }"
    />
    <!-- Roof place preview polygon -->
    <v-line
      v-if="roofPlacePreview"
      :config="{
        points: stagePoly(roofPlacePreview.elevPoints),
        closed: true,
        fill: 'rgba(100, 116, 139, 0.35)',
        stroke: '#f97316',
        strokeWidth: elevStrokeHeavy,
        dash: elevDash,
        listening: false,
        perfectDrawEnabled: false,
      }"
    />
  </template>
</template>
