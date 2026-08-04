<script setup lang="ts">
import { computed } from 'vue'
import type { CanvasToolId, ToolbeltItem } from './canvas-toolbelt.types'
import CanvasToolbeltButtons from './CanvasToolbeltButtons.vue'
import ToolbeltIcon from './ToolbeltIcon.vue'
import './canvas-toolbelt.css'

const props = withDefaults(
  defineProps<{
    tools: ToolbeltItem[]
    activeTool?: CanvasToolId | null
    brushSize?: number
    canUndo?: boolean
    staleHint?: boolean
    hint?: string
    showUndo?: boolean
    /** Alleen de knoppenrij — bedoeld voor CanvasToolbeltDock. */
    embedded?: boolean
  }>(),
  {
    activeTool: null,
    brushSize: 4,
    canUndo: false,
    staleHint: false,
    hint: '',
    showUndo: true,
    embedded: false,
  },
)

const emit = defineEmits<{
  'update:activeTool': [value: CanvasToolId | null]
  'update:brushSize': [value: number]
  undo: []
}>()

const activeToolShowsSize = computed(() => {
  const tool = props.tools.find((item) => item.id === props.activeTool)
  return !!tool?.showSize
})

function toggleTool(id: CanvasToolId) {
  emit('update:activeTool', props.activeTool === id ? null : id)
}

function onBrushSizeInput(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  emit('update:brushSize', value)
}
</script>

<template>
  <div v-if="!embedded" class="canvas-toolbelt">
    <p v-if="staleHint" class="canvas-toolbelt__stale">
      Onderlegger gewijzigd — klik «Verwerk wijzigingen» in de sidebar
    </p>
    <div class="canvas-toolbelt__bar">
      <CanvasToolbeltButtons :tools="tools" :active-tool="activeTool" @toggle="toggleTool" />
      <div v-if="activeToolShowsSize" class="canvas-toolbelt__size">
        <input
          type="range"
          min="1"
          max="20"
          step="1"
          :value="brushSize"
          aria-label="Lijndikte"
          @input="onBrushSizeInput"
        />
        <span class="canvas-toolbelt__size-value">{{ brushSize }}</span>
      </div>
      <button
        v-if="showUndo"
        type="button"
        class="canvas-toolbelt__btn"
        title="Ongedaan maken"
        aria-label="Ongedaan maken"
        :disabled="!canUndo"
        @click="emit('undo')"
      >
        <ToolbeltIcon name="undo" />
      </button>
    </div>
    <p v-if="hint" class="canvas-toolbelt__hint">{{ hint }}</p>
  </div>
  <div v-else class="canvas-toolbelt__bar canvas-toolbelt__bar--embedded">
    <CanvasToolbeltButtons :tools="tools" :active-tool="activeTool" @toggle="toggleTool" />
    <div v-if="activeToolShowsSize" class="canvas-toolbelt__size">
      <input
        type="range"
        min="1"
        max="20"
        step="1"
        :value="brushSize"
        aria-label="Lijndikte"
        @input="onBrushSizeInput"
      />
      <span class="canvas-toolbelt__size-value">{{ brushSize }}</span>
    </div>
    <button
      v-if="showUndo"
      type="button"
      class="canvas-toolbelt__btn"
      title="Ongedaan maken"
      aria-label="Ongedaan maken"
      :disabled="!canUndo"
      @click="emit('undo')"
    >
      <ToolbeltIcon name="undo" />
    </button>
  </div>
</template>
