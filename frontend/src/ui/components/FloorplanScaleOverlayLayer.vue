<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import type Konva from 'konva'
import type { HScaleState } from '@/platform/calibration'
import { scaleOverlayHandleValue, type ScaleOverlayHandle } from './floorplan-scale-overlay'

const LABEL_FONT_PX = 13
const LABEL_GAP_PX = 16

const props = withDefaults(
  defineProps<{
    scaleState: HScaleState
    imgWidth: number
    imgHeight: number
    stageScale: number
    spacePressed?: boolean
  }>(),
  { spacePressed: false },
)

const emit = defineEmits<{
  moveScaleHandle: [handle: keyof HScaleState, value: number]
}>()

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

function legHalfWidth(): number {
  return Math.max(10, 12 / props.stageScale)
}

type DragSession = {
  handle: ScaleOverlayHandle
  stage: { setPointersPositions: (evt: PointerEvent | MouseEvent) => void }
  parent: { getRelativePointerPosition: () => { x: number; y: number } | null }
}

const drag = ref<DragSession | null>(null)

function applyPointer(event: PointerEvent | MouseEvent): void {
  const session = drag.value
  if (!session) return
  session.stage.setPointersPositions(event)
  const pos = session.parent.getRelativePointerPosition()
  if (!pos) return
  emit(
    'moveScaleHandle',
    session.handle,
    scaleOverlayHandleValue(session.handle, pos, {
      width: props.imgWidth,
      height: props.imgHeight,
    }),
  )
}

function endDrag(): void {
  if (!drag.value) return
  drag.value = null
  window.removeEventListener('pointermove', onWindowMove)
  window.removeEventListener('pointerup', endDrag)
  window.removeEventListener('pointercancel', endDrag)
}

function onWindowMove(event: PointerEvent): void {
  applyPointer(event)
}

function onHandleDown(
  handle: ScaleOverlayHandle,
  event: Konva.KonvaEventObject<PointerEvent | MouseEvent>,
): void {
  if (drag.value || props.spacePressed) return
  if ('button' in event.evt && event.evt.button !== 0) return
  const stage = event.target.getStage()
  const parent = event.target.getParent()
  if (!stage || !parent) return
  event.cancelBubble = true
  event.evt.preventDefault()
  drag.value = { handle, stage, parent }
  applyPointer(event.evt)
  window.addEventListener('pointermove', onWindowMove)
  window.addEventListener('pointerup', endDrag)
  window.addEventListener('pointercancel', endDrag)
}

onUnmounted(() => {
  endDrag()
})
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
      }"
      @pointerdown="onHandleDown('xLeft', $event)"
      @mousedown="onHandleDown('xLeft', $event)"
    />
    <v-rect
      :config="{
        x: scaleState.xRight - legHalfWidth(),
        y: 0,
        width: Math.max(20, 24 / stageScale),
        height: imgHeight,
        fill: '#00000000',
      }"
      @pointerdown="onHandleDown('xRight', $event)"
      @mousedown="onHandleDown('xRight', $event)"
    />
    <v-rect
      :config="{
        x: 0,
        y: scaleState.yTop - legHalfWidth(),
        width: imgWidth,
        height: Math.max(20, 24 / stageScale),
        fill: '#00000000',
      }"
      @pointerdown="onHandleDown('yTop', $event)"
      @mousedown="onHandleDown('yTop', $event)"
    />
    <v-rect
      :config="{
        x: 0,
        y: scaleState.yBottom - legHalfWidth(),
        width: imgWidth,
        height: Math.max(20, 24 / stageScale),
        fill: '#00000000',
      }"
      @pointerdown="onHandleDown('yBottom', $event)"
      @mousedown="onHandleDown('yBottom', $event)"
    />

    <v-line
      :config="{
        points: [scaleState.xLeft, 0, scaleState.xLeft, imgHeight],
        stroke: '#0ea5e9',
        strokeWidth: 1,
        strokeScaleEnabled: false,
        listening: false,
      }"
    />
    <v-line
      :config="{
        points: [scaleState.xRight, 0, scaleState.xRight, imgHeight],
        stroke: '#0ea5e9',
        strokeWidth: 1,
        strokeScaleEnabled: false,
        listening: false,
      }"
    />
    <v-line
      :config="{
        points: [scaleState.xLeft, scaleState.xGuideY, scaleState.xRight, scaleState.xGuideY],
        stroke: '#0ea5e9',
        strokeWidth: 1,
        strokeScaleEnabled: false,
        listening: false,
      }"
    />
    <v-line
      :config="{
        points: [0, scaleState.yTop, imgWidth, scaleState.yTop],
        stroke: '#f59e0b',
        strokeWidth: 1,
        strokeScaleEnabled: false,
        listening: false,
      }"
    />
    <v-line
      :config="{
        points: [0, scaleState.yBottom, imgWidth, scaleState.yBottom],
        stroke: '#f59e0b',
        strokeWidth: 1,
        strokeScaleEnabled: false,
        listening: false,
      }"
    />
    <v-line
      :config="{
        points: [scaleState.yGuideX, scaleState.yTop, scaleState.yGuideX, scaleState.yBottom],
        stroke: '#f59e0b',
        strokeWidth: 1,
        strokeScaleEnabled: false,
        listening: false,
      }"
    />
    <v-circle
      :config="{
        x: scaleState.xLeft,
        y: scaleState.xGuideY,
        radius: Math.max(7, 9 / stageScale),
        fill: '#0284c7',
      }"
      @pointerdown="onHandleDown('xLeft', $event)"
      @mousedown="onHandleDown('xLeft', $event)"
    />
    <v-circle
      :config="{
        x: scaleState.xRight,
        y: scaleState.xGuideY,
        radius: Math.max(7, 9 / stageScale),
        fill: '#0284c7',
      }"
      @pointerdown="onHandleDown('xRight', $event)"
      @mousedown="onHandleDown('xRight', $event)"
    />
    <v-circle
      :config="{
        x: scaleState.yGuideX,
        y: scaleState.yTop,
        radius: Math.max(7, 9 / stageScale),
        fill: '#d97706',
      }"
      @pointerdown="onHandleDown('yTop', $event)"
      @mousedown="onHandleDown('yTop', $event)"
    />
    <v-circle
      :config="{
        x: scaleState.yGuideX,
        y: scaleState.yBottom,
        radius: Math.max(7, 9 / stageScale),
        fill: '#d97706',
      }"
      @pointerdown="onHandleDown('yBottom', $event)"
      @mousedown="onHandleDown('yBottom', $event)"
    />
    <v-text v-for="label in axisEndLabels" :key="label.key" :config="label.config" />
  </v-group>
</template>
