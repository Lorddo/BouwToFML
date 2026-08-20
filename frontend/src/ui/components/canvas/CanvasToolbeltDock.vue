<script setup lang="ts">
import CanvasToolbelt from './CanvasToolbelt.vue'
import type { CanvasToolId } from './canvas-toolbelt.types'
import type { ToolbeltItem } from './canvas-toolbelt.types'
import { ref } from 'vue'
import { useChromeFitScale } from '@/ui/composables/useChromeFitScale'
import './canvas-toolbelt.css'

withDefaults(
  defineProps<{
    faceTools?: ToolbeltItem[]
    faceActiveTool?: CanvasToolId | null
    faceVisible?: boolean
    inkTools?: ToolbeltItem[]
    inkActiveTool?: CanvasToolId | null
    inkBrushSize?: number
    inkVisible?: boolean
    inkCanUndo?: boolean
  }>(),
  {
    faceTools: () => [],
    faceActiveTool: null,
    faceVisible: false,
    inkTools: () => [],
    inkActiveTool: null,
    inkBrushSize: 4,
    inkVisible: false,
    inkCanUndo: false,
  },
)

const emit = defineEmits<{
  'update:faceActiveTool': [value: CanvasToolId | null]
  'update:inkActiveTool': [value: CanvasToolId | null]
  'update:inkBrushSize': [value: number]
  inkUndo: []
}>()

const dockRef = ref<HTMLElement | null>(null)
useChromeFitScale(dockRef)
</script>

<template>
  <div v-if="faceVisible || inkVisible" ref="dockRef" class="canvas-toolbelt-dock">
    <div class="canvas-toolbelt-dock__row">
      <div
        v-if="faceVisible"
        class="canvas-toolbelt-dock__section canvas-toolbelt-dock__section--face"
      >
        <CanvasToolbelt
          embedded
          :tools="faceTools"
          :active-tool="faceActiveTool"
          :show-undo="false"
          @update:active-tool="emit('update:faceActiveTool', $event)"
        />
      </div>
      <div v-if="faceVisible && inkVisible" class="canvas-toolbelt-dock__sep" aria-hidden="true" />
      <div
        v-if="inkVisible"
        class="canvas-toolbelt-dock__section canvas-toolbelt-dock__section--ink"
      >
        <CanvasToolbelt
          embedded
          :tools="inkTools"
          :active-tool="inkActiveTool"
          :brush-size="inkBrushSize"
          :can-undo="inkCanUndo"
          @update:active-tool="emit('update:inkActiveTool', $event)"
          @update:brush-size="emit('update:inkBrushSize', $event)"
          @undo="emit('inkUndo')"
        />
      </div>
    </div>
  </div>
</template>
