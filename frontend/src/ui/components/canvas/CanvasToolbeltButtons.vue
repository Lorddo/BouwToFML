<script setup lang="ts">
import type { CanvasToolId, ToolbeltItem } from './canvas-toolbelt.types'
import ToolbeltIcon from './ToolbeltIcon.vue'

defineProps<{
  tools: ToolbeltItem[]
  activeTool?: CanvasToolId | null
}>()

const emit = defineEmits<{
  toggle: [id: CanvasToolId]
}>()
</script>

<template>
  <button
    v-for="tool in tools"
    :key="tool.id"
    type="button"
    class="canvas-toolbelt__btn"
    :class="{ 'is-active': activeTool === tool.id }"
    :title="tool.label"
    :aria-label="tool.label"
    @click="emit('toggle', tool.id)"
  >
    <ToolbeltIcon :name="tool.icon" />
  </button>
</template>
