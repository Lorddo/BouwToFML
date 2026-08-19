<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import type { HScaleState } from '@/platform/calibration'
import type { Point2D, Wall } from '@/core/fml/types'
import { snapPointToWallFaces, WALL_FACE_SNAP_CM } from '@/ui/components/fml-preview-wall-face-snap'

type HandleId = 'xLeft' | 'xRight' | 'xGuideY' | 'yTop' | 'yBottom' | 'yGuideX'

const props = defineProps<{
  state: HScaleState
  walls: ReadonlyArray<Pick<Wall, 'a' | 'b' | 'thickness' | 'balance'>>
  width: number
  height: number
  toScreen: (x: number, y: number) => Point2D
  toCm: (screenX: number, screenY: number) => Point2D
}>()

const emit = defineEmits<{
  updateState: [state: HScaleState]
}>()

const rootRef = ref<SVGSVGElement | null>(null)
const dragHandle = ref<HandleId | null>(null)
const snapDisabled = ref(false)

const hLeft = computed(() => props.toScreen(props.state.xLeft, props.state.xGuideY))
const hRight = computed(() => props.toScreen(props.state.xRight, props.state.xGuideY))
const vTop = computed(() => props.toScreen(props.state.yGuideX, props.state.yTop))
const vBottom = computed(() => props.toScreen(props.state.yGuideX, props.state.yBottom))

const hCrossY = computed(() => hLeft.value.y)
const vCrossX = computed(() => vTop.value.x)

function clientToLocal(event: PointerEvent): Point2D {
  const rect = rootRef.value?.getBoundingClientRect()
  if (!rect) return { x: event.clientX, y: event.clientY }
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

function applySnap(point: Point2D): Point2D {
  return snapPointToWallFaces(props.walls, point, WALL_FACE_SNAP_CM, {
    disabled: snapDisabled.value,
  })
}

function patchState(partial: Partial<HScaleState>): void {
  emit('updateState', { ...props.state, ...partial })
}

function onPointerMove(event: PointerEvent): void {
  const handle = dragHandle.value
  if (!handle) return
  snapDisabled.value = event.ctrlKey || event.metaKey
  const local = clientToLocal(event)
  const cm = applySnap(props.toCm(local.x, local.y))
  if (handle === 'xLeft') patchState({ xLeft: cm.x, xGuideY: cm.y })
  else if (handle === 'xRight') patchState({ xRight: cm.x, xGuideY: cm.y })
  else if (handle === 'xGuideY') patchState({ xGuideY: cm.y })
  else if (handle === 'yTop') patchState({ yTop: cm.y, yGuideX: cm.x })
  else if (handle === 'yBottom') patchState({ yBottom: cm.y, yGuideX: cm.x })
  else if (handle === 'yGuideX') patchState({ yGuideX: cm.x })
}

function endDrag(): void {
  if (!dragHandle.value) return
  dragHandle.value = null
  snapDisabled.value = false
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', endDrag)
  window.removeEventListener('pointercancel', endDrag)
}

function onPointerDown(handle: HandleId, event: PointerEvent): void {
  if (event.button !== 0) return
  event.preventDefault()
  event.stopPropagation()
  dragHandle.value = handle
  snapDisabled.value = event.ctrlKey || event.metaKey
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', endDrag)
  window.addEventListener('pointercancel', endDrag)
}

onUnmounted(() => {
  endDrag()
})
</script>

<template>
  <svg
    ref="rootRef"
    class="fml-rescale-overlay"
    :width="width"
    :height="height"
    @mousedown.stop.prevent
  >
    <line
      class="fml-rescale-leg fml-rescale-leg--h"
      :x1="hLeft.x"
      y1="0"
      :x2="hLeft.x"
      :y2="height"
    />
    <line
      class="fml-rescale-leg fml-rescale-leg--h"
      :x1="hRight.x"
      y1="0"
      :x2="hRight.x"
      :y2="height"
    />
    <line
      class="fml-rescale-cross fml-rescale-cross--h"
      :x1="hLeft.x"
      :y1="hCrossY"
      :x2="hRight.x"
      :y2="hCrossY"
      @pointerdown="onPointerDown('xGuideY', $event)"
    />
    <line class="fml-rescale-leg fml-rescale-leg--v" x1="0" :y1="vTop.y" :x2="width" :y2="vTop.y" />
    <line
      class="fml-rescale-leg fml-rescale-leg--v"
      x1="0"
      :y1="vBottom.y"
      :x2="width"
      :y2="vBottom.y"
    />
    <line
      class="fml-rescale-cross fml-rescale-cross--v"
      :x1="vCrossX"
      :y1="vTop.y"
      :x2="vCrossX"
      :y2="vBottom.y"
      @pointerdown="onPointerDown('yGuideX', $event)"
    />
    <circle
      class="fml-rescale-handle fml-rescale-handle--h"
      :cx="hLeft.x"
      :cy="hLeft.y"
      r="8"
      @pointerdown="onPointerDown('xLeft', $event)"
    />
    <circle
      class="fml-rescale-handle fml-rescale-handle--h"
      :cx="hRight.x"
      :cy="hRight.y"
      r="8"
      @pointerdown="onPointerDown('xRight', $event)"
    />
    <circle
      class="fml-rescale-handle fml-rescale-handle--v"
      :cx="vTop.x"
      :cy="vTop.y"
      r="8"
      @pointerdown="onPointerDown('yTop', $event)"
    />
    <circle
      class="fml-rescale-handle fml-rescale-handle--v"
      :cx="vBottom.x"
      :cy="vBottom.y"
      r="8"
      @pointerdown="onPointerDown('yBottom', $event)"
    />
    <text class="fml-rescale-label fml-rescale-label--h" :x="hLeft.x - 14" :y="hLeft.y + 4">H</text>
    <text class="fml-rescale-label fml-rescale-label--h" :x="hRight.x + 14" :y="hRight.y + 4">
      H
    </text>
    <text class="fml-rescale-label fml-rescale-label--v" :x="vTop.x" :y="vTop.y - 14">V</text>
    <text class="fml-rescale-label fml-rescale-label--v" :x="vBottom.x" :y="vBottom.y + 18">V</text>
  </svg>
</template>

<style scoped>
.fml-rescale-overlay {
  position: absolute;
  inset: 0;
  z-index: 6;
  pointer-events: none;
}

.fml-rescale-leg {
  fill: none;
  stroke-width: 1.5;
  stroke-dasharray: 6 4;
  pointer-events: none;
}

.fml-rescale-leg--h {
  stroke: #0284c7;
}

.fml-rescale-leg--v {
  stroke: #d97706;
}

.fml-rescale-cross {
  fill: none;
  stroke-width: 3;
  pointer-events: stroke;
  cursor: grab;
}

.fml-rescale-cross--h {
  stroke: #0284c7;
}

.fml-rescale-cross--v {
  stroke: #d97706;
}

.fml-rescale-handle {
  stroke: #fff;
  stroke-width: 2;
  pointer-events: all;
  cursor: grab;
}

.fml-rescale-handle--h {
  fill: #0284c7;
}

.fml-rescale-handle--v {
  fill: #d97706;
}

.fml-rescale-handle:active,
.fml-rescale-cross:active {
  cursor: grabbing;
}

.fml-rescale-label {
  font:
    700 12px system-ui,
    Segoe UI,
    sans-serif;
  stroke: #fff;
  stroke-width: 3px;
  paint-order: stroke fill;
  pointer-events: none;
  text-anchor: middle;
}

.fml-rescale-label--h {
  fill: #0284c7;
}

.fml-rescale-label--v {
  fill: #d97706;
}
</style>
