<script setup lang="ts">
import type { ElevationRenderModel } from '@/ui/composables/fml-preview/useFmlElevationRenderModel'
import type { ElevationInteraction } from '@/ui/composables/fml-preview/useFmlElevationInteraction'
import type { FacadeElevation } from '@/core/fml/facade-elevation'
import { FML_PLAN_HANDLE_RADIUS_PX } from '@/ui/composables/fml-preview/fml-preview-vertex-hit'

const props = defineProps<{
  elevation: FacadeElevation | null
  render: ElevationRenderModel
  interaction: ElevationInteraction
}>()

const r = props.render
const layoutXform = r.layoutXform
const viewScale = r.viewScale
const elevStroke = r.elevStroke
const planSideLabelMarks = r.planSideLabelMarks
const junctionSelected = r.junctionSelected

const ix = props.interaction
const settingsTarget = ix.settingsTarget
const selectedRoofPlane = ix.selectedRoofPlane
const wallElevationHandles = ix.wallElevationHandles
const junctionElevationHandles = ix.junctionElevationHandles
const ridgeCenter = ix.ridgeCenter
const ridgeEndHandles = ix.ridgeEndHandles
const wallAxisEndHandles = ix.wallAxisEndHandles
const ridgeHandles = ix.ridgeHandles
const openingMoveHandle = ix.openingMoveHandle
const openingHandles = ix.openingHandles
const onRoofVertexDown = ix.onRoofVertexDown
const onWallElevHandleDown = ix.onWallElevHandleDown
const onJunctionElevHandleDown = ix.onJunctionElevHandleDown
const onRidgeMoveHandleDown = ix.onRidgeMoveHandleDown
const onRidgeEndHandleDown = ix.onRidgeEndHandleDown
const onWallAxisEndHandleDown = ix.onWallAxisEndHandleDown
const onRidgeHandleDown = ix.onRidgeHandleDown
const onMoveHandleDown = ix.onMoveHandleDown
const onHandleDown = ix.onHandleDown
const stopKonvaBubble = ix.stopKonvaBubble
</script>

<template>
  <template v-if="elevation">
    <!-- Junction top circles -->
    <v-circle
      v-for="junction in elevation.junctions"
      :key="`jh-${junction.id}`"
      :config="{
        ...(() => {
          const stage = layoutXform.toStagePoint(junction.x, junction.yTop)
          return { x: stage.x, y: stage.y }
        })(),
        radius: (junctionSelected(junction.id) ? 6 : 4) / viewScale,
        fill: '#fff',
        stroke: junctionSelected(junction.id) ? '#f97316' : '#334155',
        strokeWidth: elevStroke,
        listening: true,
      }"
      @mousedown="interaction.onJunctionDown(junction.id, $event)"
    />

    <!-- Junction elevation handles (shift/lift) -->
    <v-circle
      v-for="handle in junctionElevationHandles"
      :key="`junc-elev-${handle.mode}`"
      :config="{
        ...(() => {
          const stage = layoutXform.toStagePoint(handle.x, handle.y)
          return { x: stage.x, y: stage.y }
        })(),
        radius: (handle.mode === 'shift' ? 6 : 5) / viewScale,
        fill: '#fff',
        stroke: '#f97316',
        strokeWidth: 2 / viewScale,
        listening: true,
      }"
      @mousedown="onJunctionElevHandleDown(handle.mode, $event)"
    />

    <!-- Roof vertex handles -->
    <v-circle
      v-for="(point, index) in selectedRoofPlane?.points ?? []"
      :key="`roof-v-${selectedRoofPlane?.id}-${index}`"
      :config="{
        ...(() => {
          const stage = layoutXform.toStagePoint(point.x, point.y)
          return { x: stage.x, y: stage.y }
        })(),
        radius: FML_PLAN_HANDLE_RADIUS_PX / viewScale,
        fill:
          settingsTarget?.kind === 'roof' && settingsTarget.vertexIndex === index
            ? '#fbbf24'
            : '#f97316',
        stroke: '#fff',
        strokeWidth: 2 / viewScale,
        listening: true,
      }"
      @mousedown="onRoofVertexDown(index, $event)"
      @click="stopKonvaBubble"
    />

    <!-- Wall elevation handles -->
    <v-circle
      v-for="handle in wallElevationHandles"
      :key="`wall-elev-${handle.mode}`"
      :config="{
        ...(() => {
          const stage = layoutXform.toStagePoint(handle.x, handle.y)
          return { x: stage.x, y: stage.y }
        })(),
        radius: (handle.mode === 'shift' ? 6 : 5) / viewScale,
        fill: '#fff',
        stroke: '#f97316',
        strokeWidth: 2 / viewScale,
        listening: true,
      }"
      @mousedown="onWallElevHandleDown(handle.mode, $event)"
    />

    <!-- Ridge center move handle -->
    <v-circle
      v-if="ridgeCenter"
      :config="{
        ...(() => {
          const stage = layoutXform.toStagePoint(ridgeCenter.x, ridgeCenter.y)
          return { x: stage.x, y: stage.y }
        })(),
        radius: 6 / viewScale,
        fill: '#f97316',
        stroke: '#fff',
        strokeWidth: 2 / viewScale,
        listening: true,
      }"
      @mousedown="onRidgeMoveHandleDown"
    />

    <!-- Ridge end handles -->
    <v-circle
      v-for="handle in ridgeEndHandles"
      :key="`ridge-end-${handle.end}`"
      :config="{
        ...(() => {
          const stage = layoutXform.toStagePoint(handle.x, handle.y)
          return { x: stage.x, y: stage.y }
        })(),
        radius: FML_PLAN_HANDLE_RADIUS_PX / viewScale,
        fill:
          settingsTarget?.kind === 'ridge' && settingsTarget.end === handle.end
            ? '#fbbf24'
            : '#f97316',
        stroke: '#fff',
        strokeWidth: 2 / viewScale,
        listening: true,
      }"
      @mousedown="onRidgeEndHandleDown(handle.end, $event)"
      @click="stopKonvaBubble"
    />

    <!-- Dakkapel-randmuur as-einden -->
    <v-circle
      v-for="handle in wallAxisEndHandles"
      :key="`wall-axis-end-${handle.end}`"
      :config="{
        ...(() => {
          const stage = layoutXform.toStagePoint(handle.x, handle.y)
          return { x: stage.x, y: stage.y }
        })(),
        radius: FML_PLAN_HANDLE_RADIUS_PX / viewScale,
        fill: '#f97316',
        stroke: '#fff',
        strokeWidth: 2 / viewScale,
        listening: true,
      }"
      @mousedown="onWallAxisEndHandleDown(handle.end, $event)"
      @click="stopKonvaBubble"
    />

    <!-- Ridge resize handles -->
    <v-circle
      v-for="handle in ridgeHandles"
      :key="`ridge-handle-${handle.side}`"
      :config="{
        ...(() => {
          const stage = layoutXform.toStagePoint(handle.x, handle.y)
          return { x: stage.x, y: stage.y }
        })(),
        radius: 6 / viewScale,
        fill: '#fff',
        stroke: '#f97316',
        strokeWidth: 2 / viewScale,
        listening: true,
      }"
      @mousedown="onRidgeHandleDown(handle.side, $event)"
    />

    <!-- Opening move handle -->
    <v-circle
      v-if="openingMoveHandle"
      :config="{
        ...(() => {
          const stage = layoutXform.toStagePoint(openingMoveHandle.x, openingMoveHandle.y)
          return { x: stage.x, y: stage.y }
        })(),
        radius: 6 / viewScale,
        fill: '#f97316',
        stroke: '#fff',
        strokeWidth: 2 / viewScale,
        listening: true,
      }"
      @mousedown="onMoveHandleDown"
    />

    <!-- Opening resize handles -->
    <v-circle
      v-for="handle in openingHandles"
      :key="`handle-${handle.side}`"
      :config="{
        ...(() => {
          const stage = layoutXform.toStagePoint(handle.x, handle.y)
          return { x: stage.x, y: stage.y }
        })(),
        radius: 6 / viewScale,
        fill: '#fff',
        stroke: '#f97316',
        strokeWidth: 2 / viewScale,
        listening: true,
      }"
      @mousedown="onHandleDown(handle.side, $event)"
    />

    <!-- Plan-side labels -->
    <v-text
      v-for="mark in planSideLabelMarks"
      :key="`plan-side-${mark.key}`"
      :config="mark.config"
    />
  </template>
</template>
