<script setup lang="ts">

import { computed } from 'vue'

import type Konva from 'konva'

import type { SelectionRect } from '@/platform/selection'

import type { ElementClass } from '@/core/extraction/types'

import type { ResizeHandle } from '../composables/useFloorplanRectInteraction'

import { RESIZE_HANDLES } from '../composables/useFloorplanRectInteraction'



const props = defineProps<{

  lbeRects: SelectionRect[]

  previewRect?: SelectionRect | null

  selectedRectId?: string | null

  selectedRect: SelectionRect | null

  isSelectionMode: boolean

  typeColors: Partial<Record<ElementClass, string>>

  iconSize: number

  handleSize: number

  handlePosition: (rect: SelectionRect, handle: ResizeHandle) => { x: number; y: number }

  iconPositions: (rect: SelectionRect) => {

    move: { x: number; y: number }

    delete: { x: number; y: number }

  }

  onRectMouseDown: (e: Konva.KonvaEventObject<MouseEvent>, rectId: string) => void

  onResizeHandleDown: (e: Konva.KonvaEventObject<MouseEvent>, handle: ResizeHandle, rect: SelectionRect) => void

  onMoveIconDown: (e: Konva.KonvaEventObject<MouseEvent>, rect: SelectionRect) => void

  onDeleteIconClick: (e: Konva.KonvaEventObject<MouseEvent>, rectId: string) => void

}>()



function colorFor(type: ElementClass): string {

  return props.typeColors[type] ?? '#64748b'

}



function rectConfig(rect: SelectionRect) {

  const stroke = colorFor(rect.type)

  return {

    x: rect.x,

    y: rect.y,

    width: rect.width,

    height: rect.height,

    stroke,

    strokeWidth: rect.id === props.selectedRectId ? 3 : 2,

    fill: stroke + (rect.id === props.selectedRectId ? '66' : '44'),

    listening: props.isSelectionMode,

    onMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => props.onRectMouseDown(e, rect.id),

  }

}



const previewConfig = computed(() => {

  const rect = props.previewRect

  if (!rect) return null

  const stroke = colorFor(rect.type)

  return {

    x: rect.x,

    y: rect.y,

    width: rect.width,

    height: rect.height,

    stroke,

    strokeWidth: 2,

    dash: [6, 4],

    fill: stroke + '33',

    listening: false,

  }

})



const handleConfigs = computed(() => {

  const rect = props.selectedRect

  if (!rect || !props.isSelectionMode) return []

  const stroke = colorFor(rect.type)

  return RESIZE_HANDLES.map((handle) => {

    const pos = props.handlePosition(rect, handle)

    return {

      key: handle,

      config: {

        x: pos.x,

        y: pos.y,

        width: props.handleSize,

        height: props.handleSize,

        fill: '#ffffff',

        stroke,

        strokeWidth: 1.5,

        strokeScaleEnabled: false,

        onMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) =>

          props.onResizeHandleDown(e, handle, rect),

      },

    }

  })

})



const moveIconGroupConfig = computed(() => {

  const rect = props.selectedRect

  if (!rect || !props.isSelectionMode) return null

  const stroke = colorFor(rect.type)

  const pos = props.iconPositions(rect).move

  const sz = props.iconSize

  return {

    group: {

      x: pos.x,

      y: pos.y,

      onMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => props.onMoveIconDown(e, rect),

    },

    box: {

      width: sz,

      height: sz,

      fill: '#ffffff',

      stroke,

      strokeWidth: 1.5,

      cornerRadius: 3,

      strokeScaleEnabled: false,

    },

    label: {

      x: sz * 0.22,

      y: sz * 0.12,

      text: '✥',

      fontSize: sz * 0.72,

      fill: stroke,

      listening: false,

    },

  }

})



const deleteIconGroupConfig = computed(() => {

  const rect = props.selectedRect

  if (!rect || !props.isSelectionMode) return null

  const pos = props.iconPositions(rect).delete

  const sz = props.iconSize

  return {

    group: {

      x: pos.x,

      y: pos.y,

      onMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => props.onDeleteIconClick(e, rect.id),

    },

    box: {

      width: sz,

      height: sz,

      fill: '#fee2e2',

      stroke: '#dc2626',

      strokeWidth: 1.5,

      cornerRadius: 3,

      strokeScaleEnabled: false,

    },

    label: {

      x: sz * 0.28,

      y: sz * 0.08,

      text: '✕',

      fontSize: sz * 0.72,

      fill: '#dc2626',

      listening: false,

    },

  }

})

</script>



<template>
  <v-group>
    <v-rect
      v-for="rect in lbeRects"
      :key="rect.id"
      :config="rectConfig(rect)"
    />
    <v-rect v-if="previewConfig" :config="previewConfig" />

    <template v-if="selectedRect && isSelectionMode">
      <v-rect
        v-for="handle in handleConfigs"
        :key="'handle-' + handle.key"
        :config="handle.config"
      />

      <template v-if="moveIconGroupConfig">
        <v-group :config="moveIconGroupConfig.group">
          <v-rect :config="moveIconGroupConfig.box" />
          <v-text :config="moveIconGroupConfig.label" />
        </v-group>
      </template>

      <template v-if="deleteIconGroupConfig">
        <v-group :config="deleteIconGroupConfig.group">
          <v-rect :config="deleteIconGroupConfig.box" />
          <v-text :config="deleteIconGroupConfig.label" />
        </v-group>
      </template>
    </template>
  </v-group>
</template>

