<script setup lang="ts">
import type { CanvasToolId, ToolbeltItem } from './canvas-toolbelt.types'

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
    <svg
      v-if="tool.icon === 'eraser'"
      class="canvas-toolbelt__icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M16.24 3.56l4.95 4.94c.78.79.78 2.05 0 2.84L12 20.53a4.993 4.993 0 0 1-3.54 1.46H5v-3.46c0-1.33.53-2.59 1.46-3.54l9.19-9.19c.79-.78 2.05-.78 2.84 0zM6.41 18.18h2.05c.8 0 1.55-.31 2.12-.88l7.07-7.07-4.24-4.24-7.07 7.07c-.57.57-.88 1.32-.88 2.12v.1z"
      />
    </svg>
    <svg
      v-else-if="tool.icon === 'brush'"
      class="canvas-toolbelt__icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M7 14c-1.66 0-3 1.34-3 3 0 1.31.84 2.41 2 2.83V22h2v-2.17c1.16-.42 2-1.52 2-2.83 0-1.66-1.34-3-3-3zm9.71-9.96a1 1 0 0 0-1.41 0l-1.83 1.83 3.54 3.54 1.83-1.83a1 1 0 0 0 0-1.41l-2.13-2.13zM3 17.25V21h3.75L18.81 8.94l-3.75-3.75L3 17.25z"
      />
    </svg>
    <svg
      v-else-if="tool.icon === 'line'"
      class="canvas-toolbelt__icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M3 21l18-18-1.41-1.41L3 18.59V21zm2.59-2.59L18.17 6.83l-1.41-1.41L4.17 17l1.42 1.41z"
      />
    </svg>
    <svg
      v-else-if="tool.icon === 'rect'"
      class="canvas-toolbelt__icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path fill="currentColor" d="M3 5v14h18V5H3zm16 12H5V7h14v10z" />
    </svg>
    <svg
      v-else-if="tool.icon === 'unknown'"
      class="canvas-toolbelt__icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z"
      />
    </svg>
    <svg
      v-else-if="tool.icon === 'wall'"
      class="canvas-toolbelt__icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M3 5v2h2V5H3zm4 0v2h2V5H7zm4 0v2h2V5h-2zm4 0v2h2V5h-2zm4 0v2h2V5h-2zM3 9v2h2V9H3zm4 0v2h2V9H7zm4 0v2h2V9h-2zm4 0v2h2V9h-2zm4 0v2h2V9h-2zM3 13v2h2v-2H3zm4 0v2h2v-2H7zm4 0v2h2v-2h-2zm4 0v2h2v-2h-2zm4 0v2h2v-2h-2zM3 17v2h2v-2H3zm4 0v2h2v-2H7zm4 0v2h2v-2h-2zm4 0v2h2v-2h-2zm4 0v2h2v-2h-2z"
      />
    </svg>
    <svg
      v-else-if="tool.icon === 'door'"
      class="canvas-toolbelt__icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M19 19V5c0-1.1-.9-2-2-2H7c-1.1 0-2 .9-2 2v14H3v2h18v-2h-2zm-2 0H7V5h10v14zm-4-6h2v2h-2v-2z"
      />
    </svg>
    <svg
      v-else-if="tool.icon === 'window'"
      class="canvas-toolbelt__icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M3 5h18v14H3V5zm2 2v4h6V7H5zm8 0v4h6V7h-6zM5 13v4h6v-4H5zm8 0v4h6v-4h-6z"
      />
    </svg>
    <svg
      v-else-if="tool.icon === 'room'"
      class="canvas-toolbelt__icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path fill="currentColor" d="M4 4h16v16H4V4zm2 2v12h12V6H6zm3 3h6v2H9V9zm0 4h4v2H9v-2z" />
    </svg>
    <svg
      v-else-if="tool.icon === 'delete'"
      class="canvas-toolbelt__icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
      />
    </svg>
    <svg
      v-else-if="tool.icon === 'split'"
      class="canvas-toolbelt__icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path fill="currentColor" d="M3 5v14h8V5H3zm10 0v14h8V5h-8zM5 7h4v10H5V7zm12 0h4v10h-4V7z" />
    </svg>
    <svg
      v-else-if="tool.icon === 'ruler'"
      class="canvas-toolbelt__icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M19.5 3.5L18 2l-1.5 1.5L15 2l-1.5 1.5L12 2l-1.5 1.5L9 2 7.5 3.5 6 2 4.5 3.5 3 2v20l1.5-1.5L6 22l1.5-1.5L9 22l1.5-1.5L12 22l1.5-1.5L15 22l1.5-1.5L18 22l1.5-1.5L21 22V2l-1.5 1.5zM19 19.09H5V4.91h14V19.09zM6 15h2v2H6v-2zm3-4h2v2H9v-2zm3 0h2v2h-2v-2zm3 4h2v2h-2v-2z"
      />
    </svg>
    <svg
      v-else-if="tool.icon === 'fit'"
      class="canvas-toolbelt__icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M15 3l2.3 2.3-2.89 2.87 1.42 1.42L18.7 6.7 21 9V3h-6zM3 9l2.3-2.3 2.87 2.89 1.42-1.42L6.7 5.3 9 3H3v6zm12 12l-2.3-2.3 2.89-2.87-1.42-1.42L5.3 17.3 3 15v6h6zm6-6l-2.3 2.3-2.87-2.89-1.42 1.42 2.89 2.87L15 21h6v-6z"
      />
    </svg>
  </button>
</template>
