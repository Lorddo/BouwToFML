<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import type { HScaleState } from '@/platform/calibration'
import type { Point2D, Wall } from '@/core/plan/types'
import {
  applyRescaleHandleDrag,
  snapRescaleHandle,
  type RescaleHandleId,
} from '@/ui/composables/plan-canvas/plan-canvas-rescale-from-measure'

type HandleId = RescaleHandleId

const props = withDefaults(
  defineProps<{
    state: HScaleState
    walls: ReadonlyArray<Pick<Wall, 'a' | 'b' | 'thickness' | 'balance'>>
    width: number
    height: number
    toScreen: (x: number, y: number) => Point2D
    toCm: (screenX: number, screenY: number) => Point2D
    /** Space+sleep = pan; handles niet pakken. */
    spacePressed?: boolean
  }>(),
  { spacePressed: false },
)

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

function clientToLocal(event: PointerEvent): Point2D {
  const svg = rootRef.value
  if (!svg) return { x: event.clientX, y: event.clientY }
  const rect = svg.getBoundingClientRect()
  if (!(rect.width > 0) || !(rect.height > 0)) return { x: 0, y: 0 }
  const userW = svg.viewBox.baseVal.width || svg.width.baseVal.value || rect.width
  const userH = svg.viewBox.baseVal.height || svg.height.baseVal.value || rect.height
  return {
    x: ((event.clientX - rect.left) / rect.width) * userW,
    y: ((event.clientY - rect.top) / rect.height) * userH,
  }
}

function patchState(next: HScaleState): void {
  emit('updateState', next)
}

function onPointerMove(event: PointerEvent): void {
  const handle = dragHandle.value
  if (!handle) return
  snapDisabled.value = event.ctrlKey || event.metaKey
  const local = clientToLocal(event)
  const raw = props.toCm(local.x, local.y)
  const snapped = snapRescaleHandle(props.state, handle, raw, props.walls, {
    disabled: snapDisabled.value,
  })
  patchState(applyRescaleHandleDrag(props.state, handle, snapped))
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
  if (props.spacePressed) return
  event.preventDefault()
  event.stopPropagation()
  dragHandle.value = handle
  snapDisabled.value = event.ctrlKey || event.metaKey
  const target = event.currentTarget
  if (target instanceof Element) {
    try {
      target.setPointerCapture(event.pointerId)
    } catch {
      /* capture is optional — window listeners blijven de sleep volgen */
    }
  }
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
    class="plan-rescale-overlay"
    :width="width"
    :height="height"
    @mousedown.stop.prevent
  >
    <line
      class="plan-rescale-leg plan-rescale-leg--h"
      :x1="hLeft.x"
      y1="0"
      :x2="hLeft.x"
      :y2="height"
    />
    <line
      class="plan-rescale-leg plan-rescale-leg--h"
      :x1="hRight.x"
      y1="0"
      :x2="hRight.x"
      :y2="height"
    />
    <line
      class="plan-rescale-cross plan-rescale-cross--h"
      :x1="hLeft.x"
      :y1="hLeft.y"
      :x2="hRight.x"
      :y2="hRight.y"
      @pointerdown="onPointerDown('xGuideY', $event)"
    />
    <line class="plan-rescale-leg plan-rescale-leg--v" x1="0" :y1="vTop.y" :x2="width" :y2="vTop.y" />
    <line
      class="plan-rescale-leg plan-rescale-leg--v"
      x1="0"
      :y1="vBottom.y"
      :x2="width"
      :y2="vBottom.y"
    />
    <line
      class="plan-rescale-cross plan-rescale-cross--v"
      :x1="vTop.x"
      :y1="vTop.y"
      :x2="vBottom.x"
      :y2="vBottom.y"
      @pointerdown="onPointerDown('yGuideX', $event)"
    />
    <circle
      class="plan-rescale-handle plan-rescale-handle--h"
      :cx="hLeft.x"
      :cy="hLeft.y"
      r="8"
      @pointerdown="onPointerDown('xLeft', $event)"
    />
    <circle
      class="plan-rescale-handle plan-rescale-handle--h"
      :cx="hRight.x"
      :cy="hRight.y"
      r="8"
      @pointerdown="onPointerDown('xRight', $event)"
    />
    <circle
      class="plan-rescale-handle plan-rescale-handle--v"
      :cx="vTop.x"
      :cy="vTop.y"
      r="8"
      @pointerdown="onPointerDown('yTop', $event)"
    />
    <circle
      class="plan-rescale-handle plan-rescale-handle--v"
      :cx="vBottom.x"
      :cy="vBottom.y"
      r="8"
      @pointerdown="onPointerDown('yBottom', $event)"
    />
    <text class="plan-rescale-label plan-rescale-label--h" :x="hLeft.x - 14" :y="hLeft.y + 4">H</text>
    <text class="plan-rescale-label plan-rescale-label--h" :x="hRight.x + 14" :y="hRight.y + 4">
      H
    </text>
    <text class="plan-rescale-label plan-rescale-label--v" :x="vTop.x" :y="vTop.y - 14">V</text>
    <text class="plan-rescale-label plan-rescale-label--v" :x="vBottom.x" :y="vBottom.y + 18">V</text>
  </svg>
</template>

<style scoped>
.plan-rescale-overlay {
  position: absolute;
  inset: 0;
  z-index: 6;
  pointer-events: none;
}

.plan-rescale-leg {
  fill: none;
  stroke-width: 1.5;
  stroke-dasharray: 6 4;
  pointer-events: none;
}

.plan-rescale-leg--h {
  stroke: #0284c7;
}

.plan-rescale-leg--v {
  stroke: #d97706;
}

.plan-rescale-cross {
  fill: none;
  stroke-width: 3;
  pointer-events: stroke;
  cursor: grab;
}

.plan-rescale-cross--h {
  stroke: #0284c7;
}

.plan-rescale-cross--v {
  stroke: #d97706;
}

.plan-rescale-handle {
  stroke: #fff;
  stroke-width: 2;
  pointer-events: all;
  cursor: grab;
}

.plan-rescale-handle--h {
  fill: #0284c7;
}

.plan-rescale-handle--v {
  fill: #d97706;
}

.plan-rescale-handle:active,
.plan-rescale-cross:active {
  cursor: grabbing;
}

.plan-rescale-label {
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

.plan-rescale-label--h {
  fill: #0284c7;
}

.plan-rescale-label--v {
  fill: #d97706;
}
</style>
