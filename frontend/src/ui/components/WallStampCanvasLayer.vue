<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type Konva from 'konva'
import { RESIZE_HANDLES, type ResizeHandle } from '@/ui/composables/useFloorplanRectInteraction'
import { loadImage } from '@/ui/composables/workspace/imageUtils'

const props = defineProps<{
  bounds: { x: number; y: number; width: number; height: number }
  interactive: boolean
  handleSize: number
  /** Ghost PNG in baseBounds-ruimte; wordt gestretcht naar live bounds. */
  ghostSrc?: string | null
  /** false = alleen sleep (stempelset); default true (band-stempel). */
  allowResize?: boolean
}>()

const emit = defineEmits<{
  boundsChange: [bounds: { x: number; y: number; width: number; height: number }]
}>()

const stroke = '#ea580c'
const MIN = 8
const ghostImageObj = ref<HTMLImageElement | null>(null)
const resizeEnabled = computed(() => props.allowResize !== false)

watch(
  () => props.ghostSrc,
  (src, _prev, onCleanup) => {
    if (!src) {
      ghostImageObj.value = null
      return
    }
    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })
    void loadImage(src)
      .then((img) => {
        if (!cancelled) ghostImageObj.value = img
      })
      .catch(() => {
        if (!cancelled) ghostImageObj.value = null
      })
  },
  { immediate: true },
)

const ghostConfig = computed(() => {
  const image = ghostImageObj.value
  if (!image) return null
  return {
    x: props.bounds.x,
    y: props.bounds.y,
    width: props.bounds.width,
    height: props.bounds.height,
    image,
    listening: false,
  }
})

function handlePos(
  bounds: { x: number; y: number; width: number; height: number },
  handle: ResizeHandle,
  handleSize: number,
): { x: number; y: number } {
  const hs = handleSize / 2
  const { x, y, width, height } = bounds
  switch (handle) {
    case 'nw':
      return { x: x - hs, y: y - hs }
    case 'n':
      return { x: x + width / 2 - hs, y: y - hs }
    case 'ne':
      return { x: x + width - hs, y: y - hs }
    case 'e':
      return { x: x + width - hs, y: y + height / 2 - hs }
    case 'se':
      return { x: x + width - hs, y: y + height - hs }
    case 's':
      return { x: x + width / 2 - hs, y: y + height - hs }
    case 'sw':
      return { x: x - hs, y: y + height - hs }
    case 'w':
      return { x: x - hs, y: y + height / 2 - hs }
  }
}

const handleConfigs = computed(() => {
  if (!resizeEnabled.value) return []
  return RESIZE_HANDLES.map((handle) => {
    const p = handlePos(props.bounds, handle, props.handleSize)
    return {
      handle,
      x: p.x,
      y: p.y,
      width: props.handleSize,
      height: props.handleSize,
      fill: '#fff',
      stroke,
    }
  })
})

function applyResize(
  handle: ResizeHandle,
  start: { x: number; y: number; width: number; height: number },
  dx: number,
  dy: number,
) {
  let { x, y, width, height } = { ...start }
  if (handle.includes('e')) width = Math.max(MIN, start.width + dx)
  if (handle.includes('s')) height = Math.max(MIN, start.height + dy)
  if (handle.includes('w')) {
    const nextW = Math.max(MIN, start.width - dx)
    x = start.x + (start.width - nextW)
    width = nextW
  }
  if (handle.includes('n')) {
    const nextH = Math.max(MIN, start.height - dy)
    y = start.y + (start.height - nextH)
    height = nextH
  }
  return { x, y, width, height }
}

type DragState =
  | { kind: 'move'; ox: number; oy: number; start: typeof props.bounds; stage: Konva.Stage }
  | {
      kind: 'resize'
      handle: ResizeHandle
      startPointer: { x: number; y: number }
      start: typeof props.bounds
      stage: Konva.Stage
    }

let drag: DragState | null = null

function stageFromEvent(e: Konva.KonvaEventObject<MouseEvent>): Konva.Stage | null {
  return e.target.getStage()
}

function pointerOnStage(stage: Konva.Stage): { x: number; y: number } | null {
  return stage.getRelativePointerPosition() ?? null
}

function onMoveDown(e: Konva.KonvaEventObject<MouseEvent>) {
  if (!props.interactive) return
  e.cancelBubble = true
  const stage = stageFromEvent(e)
  const pos = stage ? pointerOnStage(stage) : null
  if (!stage || !pos) return
  drag = {
    kind: 'move',
    ox: pos.x - props.bounds.x,
    oy: pos.y - props.bounds.y,
    start: { ...props.bounds },
    stage,
  }
  bindWindow()
}

function onHandleDown(e: Konva.KonvaEventObject<MouseEvent>, handle: ResizeHandle) {
  if (!props.interactive || !resizeEnabled.value) return
  e.cancelBubble = true
  const stage = stageFromEvent(e)
  const pos = stage ? pointerOnStage(stage) : null
  if (!stage || !pos) return
  drag = {
    kind: 'resize',
    handle,
    startPointer: { ...pos },
    start: { ...props.bounds },
    stage,
  }
  bindWindow()
}

function bindWindow() {
  window.addEventListener('mousemove', onWindowMove)
  window.addEventListener('mouseup', onWindowUp)
}

function onWindowMove(_ev: MouseEvent) {
  if (!drag) return
  const pos = pointerOnStage(drag.stage)
  if (!pos) return
  if (drag.kind === 'move') {
    emit('boundsChange', {
      x: pos.x - drag.ox,
      y: pos.y - drag.oy,
      width: drag.start.width,
      height: drag.start.height,
    })
    return
  }
  emit(
    'boundsChange',
    applyResize(drag.handle, drag.start, pos.x - drag.startPointer.x, pos.y - drag.startPointer.y),
  )
}

function onWindowUp() {
  drag = null
  window.removeEventListener('mousemove', onWindowMove)
  window.removeEventListener('mouseup', onWindowUp)
}
</script>

<template>
  <!-- Geen @mousemove/@mouseup op v-group: vue-konva Group = fragment → Vue warn. -->
  <v-group v-if="interactive">
    <v-image v-if="ghostConfig" :config="ghostConfig" />
    <v-rect
      :config="{
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        stroke,
        strokeWidth: 2,
        dash: [8, 4],
        fill: ghostConfig ? 'transparent' : 'rgba(234, 88, 12, 0.08)',
      }"
      @mousedown="onMoveDown"
    />
    <v-rect
      v-for="h in handleConfigs"
      :key="h.handle"
      :config="{
        x: h.x,
        y: h.y,
        width: h.width,
        height: h.height,
        fill: h.fill,
        stroke: h.stroke,
        strokeWidth: 1,
      }"
      @mousedown="(e: Konva.KonvaEventObject<MouseEvent>) => onHandleDown(e, h.handle)"
    />
  </v-group>
</template>
