<script setup lang="ts">
import { computed } from 'vue'
import type { HScaleState } from '@/platform/calibration'

const LABEL_FONT_PX = 13
const LABEL_GAP_PX = 16

const props = defineProps<{
  scaleState: HScaleState
  imgWidth: number
  imgHeight: number
  stageScale: number
}>()

const emit = defineEmits<{
  moveScaleHandle: [handle: keyof HScaleState, value: number]
}>()

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** Schermconstante H/V-letters bij de handles — schalen niet mee met zoom. */
const axisEndLabels = computed(() => {
  const s = props.stageScale || 1
  const gap = LABEL_GAP_PX / s
  const { xLeft, xRight, xGuideY, yTop, yBottom, yGuideX } = props.scaleState
  const base = {
    fontSize: LABEL_FONT_PX,
    fontStyle: 'bold',
    fontFamily: 'system-ui, Segoe UI, sans-serif',
    align: 'center' as const,
    offsetX: LABEL_FONT_PX * 0.36,
    offsetY: LABEL_FONT_PX * 0.48,
    scaleX: 1 / s,
    scaleY: 1 / s,
    stroke: '#ffffff',
    strokeWidth: 3,
    fillAfterStrokeEnabled: true,
    listening: false,
  }
  return [
    { key: 'h-left', config: { ...base, text: 'H', x: xLeft - gap, y: xGuideY, fill: '#0284c7' } },
    {
      key: 'h-right',
      config: { ...base, text: 'H', x: xRight + gap, y: xGuideY, fill: '#0284c7' },
    },
    { key: 'v-top', config: { ...base, text: 'V', x: yGuideX, y: yTop - gap, fill: '#d97706' } },
    {
      key: 'v-bottom',
      config: { ...base, text: 'V', x: yGuideX, y: yBottom + gap, fill: '#d97706' },
    },
  ]
})

function bindDragX(currentY: number) {
  return (pos: { x: number; y: number }) => ({
    x: clamp(pos.x, 0, props.imgWidth),
    y: currentY,
  })
}

function bindDragY(currentX: number) {
  return (pos: { x: number; y: number }) => ({
    x: currentX,
    y: clamp(pos.y, 0, props.imgHeight),
  })
}

function bindDragVerticalLeg() {
  return (pos: { x: number; y: number }) => ({
    x: clamp(pos.x, -10, props.imgWidth - 10),
    y: 0,
  })
}

function bindDragHorizontalLeg() {
  return (pos: { x: number; y: number }) => ({
    x: 0,
    y: clamp(pos.y, -10, props.imgHeight - 10),
  })
}

function legHalfWidth(): number {
  return Math.max(10, 12 / props.stageScale)
}
</script>

<template>
  <v-group>
    <v-rect
      :config="{
        x: scaleState.xLeft - legHalfWidth(),
        y: 0,
        width: Math.max(20, 24 / stageScale),
        height: imgHeight,
        fill: '#00000000',
        draggable: true,
        dragBoundFunc: bindDragVerticalLeg(),
      }"
      @dragmove="emit('moveScaleHandle', 'xLeft', ($event.target as any).x() + legHalfWidth())"
    />
    <v-rect
      :config="{
        x: scaleState.xRight - legHalfWidth(),
        y: 0,
        width: Math.max(20, 24 / stageScale),
        height: imgHeight,
        fill: '#00000000',
        draggable: true,
        dragBoundFunc: bindDragVerticalLeg(),
      }"
      @dragmove="emit('moveScaleHandle', 'xRight', ($event.target as any).x() + legHalfWidth())"
    />
    <v-rect
      :config="{
        x: 0,
        y: scaleState.yTop - legHalfWidth(),
        width: imgWidth,
        height: Math.max(20, 24 / stageScale),
        fill: '#00000000',
        draggable: true,
        dragBoundFunc: bindDragHorizontalLeg(),
      }"
      @dragmove="emit('moveScaleHandle', 'yTop', ($event.target as any).y() + legHalfWidth())"
    />
    <v-rect
      :config="{
        x: 0,
        y: scaleState.yBottom - legHalfWidth(),
        width: imgWidth,
        height: Math.max(20, 24 / stageScale),
        fill: '#00000000',
        draggable: true,
        dragBoundFunc: bindDragHorizontalLeg(),
      }"
      @dragmove="emit('moveScaleHandle', 'yBottom', ($event.target as any).y() + legHalfWidth())"
    />

    <v-line
      :config="{
        points: [scaleState.xLeft, 0, scaleState.xLeft, imgHeight],
        stroke: '#0ea5e9',
        strokeWidth: 1,
        strokeScaleEnabled: false,
      }"
    />
    <v-line
      :config="{
        points: [scaleState.xRight, 0, scaleState.xRight, imgHeight],
        stroke: '#0ea5e9',
        strokeWidth: 1,
        strokeScaleEnabled: false,
      }"
    />
    <v-line
      :config="{
        points: [scaleState.xLeft, scaleState.xGuideY, scaleState.xRight, scaleState.xGuideY],
        stroke: '#0ea5e9',
        strokeWidth: 1,
        strokeScaleEnabled: false,
      }"
    />
    <v-line
      :config="{
        points: [0, scaleState.yTop, imgWidth, scaleState.yTop],
        stroke: '#f59e0b',
        strokeWidth: 1,
        strokeScaleEnabled: false,
      }"
    />
    <v-line
      :config="{
        points: [0, scaleState.yBottom, imgWidth, scaleState.yBottom],
        stroke: '#f59e0b',
        strokeWidth: 1,
        strokeScaleEnabled: false,
      }"
    />
    <v-line
      :config="{
        points: [scaleState.yGuideX, scaleState.yTop, scaleState.yGuideX, scaleState.yBottom],
        stroke: '#f59e0b',
        strokeWidth: 1,
        strokeScaleEnabled: false,
      }"
    />
    <v-circle
      :config="{
        x: scaleState.xLeft,
        y: scaleState.xGuideY,
        radius: Math.max(7, 9 / stageScale),
        fill: '#0284c7',
        draggable: true,
        dragBoundFunc: bindDragX(scaleState.xGuideY),
      }"
      @dragmove="emit('moveScaleHandle', 'xLeft', ($event.target as any).x())"
    />
    <v-circle
      :config="{
        x: scaleState.xRight,
        y: scaleState.xGuideY,
        radius: Math.max(7, 9 / stageScale),
        fill: '#0284c7',
        draggable: true,
        dragBoundFunc: bindDragX(scaleState.xGuideY),
      }"
      @dragmove="emit('moveScaleHandle', 'xRight', ($event.target as any).x())"
    />
    <v-circle
      :config="{
        x: scaleState.yGuideX,
        y: scaleState.yTop,
        radius: Math.max(7, 9 / stageScale),
        fill: '#d97706',
        draggable: true,
        dragBoundFunc: bindDragY(scaleState.yGuideX),
      }"
      @dragmove="emit('moveScaleHandle', 'yTop', ($event.target as any).y())"
    />
    <v-circle
      :config="{
        x: scaleState.yGuideX,
        y: scaleState.yBottom,
        radius: Math.max(7, 9 / stageScale),
        fill: '#d97706',
        draggable: true,
        dragBoundFunc: bindDragY(scaleState.yGuideX),
      }"
      @dragmove="emit('moveScaleHandle', 'yBottom', ($event.target as any).y())"
    />
    <v-text v-for="label in axisEndLabels" :key="label.key" :config="label.config" />
  </v-group>
</template>
