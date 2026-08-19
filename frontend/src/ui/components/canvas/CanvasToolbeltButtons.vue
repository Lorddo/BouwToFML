<script setup lang="ts">
import type { CanvasToolId, ToolbeltItem } from './canvas-toolbelt.types'
import ToolbeltIcon from './ToolbeltIcon.vue'

const props = defineProps<{
  tools: ToolbeltItem[]
  activeTool?: CanvasToolId | null
  pressedIds?: readonly string[]
}>()

const emit = defineEmits<{
  toggle: [id: CanvasToolId]
}>()

function isActive(tool: ToolbeltItem): boolean {
  if (tool.toggle) return (props.pressedIds ?? []).includes(tool.id)
  return props.activeTool === tool.id
}
</script>

<template>
  <button
    v-for="tool in tools"
    :key="tool.id"
    type="button"
    class="canvas-toolbelt__btn"
    :class="{ 'is-active': isActive(tool) }"
    :title="tool.label"
    :aria-label="tool.label"
    :aria-pressed="tool.toggle ? isActive(tool) : undefined"
    @click="emit('toggle', tool.id)"
  >
    <ToolbeltIcon :name="tool.icon" />
  </button>
</template>
