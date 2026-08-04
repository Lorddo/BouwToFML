<script setup lang="ts">
import type { ToolbeltIconName } from './canvas-toolbelt.types'

/** Shared toolbelt / FML-context icons (24×24, currentColor). */
defineProps<{
  name: ToolbeltIconName | string
}>()

const strokeAttrs = {
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': 1.75,
  'stroke-linecap': 'round' as const,
  'stroke-linejoin': 'round' as const,
}
</script>

<template>
  <svg class="canvas-toolbelt__icon" viewBox="0 0 24 24" aria-hidden="true">
    <!-- NEW: Paint-style block eraser, diagonal -->
    <g v-if="name === 'eraser'" transform="rotate(-40 12 12)">
      <rect v-bind="strokeAttrs" x="8" y="4.5" width="8" height="15" rx="1.2" />
      <line v-bind="strokeAttrs" x1="8" y1="15.5" x2="16" y2="15.5" />
    </g>

    <!-- NEW: pencil (brush tool), diagonal -->
    <g v-else-if="name === 'brush'" transform="rotate(-40 12 12)">
      <path v-bind="strokeAttrs" d="M10 3.2h4v11.5L12 20.2 10 14.7V3.2z" />
      <line v-bind="strokeAttrs" x1="10" y1="5.4" x2="14" y2="5.4" />
      <line v-bind="strokeAttrs" x1="10" y1="14.7" x2="14" y2="14.7" />
    </g>

    <!-- KEEP -->
    <path
      v-else-if="name === 'line'"
      fill="currentColor"
      d="M3 21l18-18-1.41-1.41L3 18.59V21zm2.59-2.59L18.17 6.83l-1.41-1.41L4.17 17l1.42 1.41z"
    />
    <path v-else-if="name === 'rect'" fill="currentColor" d="M3 5v14h18V5H3zm16 12H5V7h14v10z" />
    <path
      v-else-if="name === 'unknown'"
      fill="currentColor"
      d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z"
    />

    <!-- NEW: running-bond brick wall -->
    <g v-else-if="name === 'wall'" v-bind="strokeAttrs">
      <rect x="3" y="4" width="18" height="16" rx="0.5" />
      <line x1="3" y1="8" x2="21" y2="8" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="16" x2="21" y2="16" />
      <!-- rows 1 & 3: half | full | full | half -->
      <line x1="6" y1="4" x2="6" y2="8" />
      <line x1="12" y1="4" x2="12" y2="8" />
      <line x1="18" y1="4" x2="18" y2="8" />
      <line x1="6" y1="12" x2="6" y2="16" />
      <line x1="12" y1="12" x2="12" y2="16" />
      <line x1="18" y1="12" x2="18" y2="16" />
      <!-- rows 2 & 4: three full -->
      <line x1="9" y1="8" x2="9" y2="12" />
      <line x1="15" y1="8" x2="15" y2="12" />
      <line x1="9" y1="16" x2="9" y2="20" />
      <line x1="15" y1="16" x2="15" y2="20" />
    </g>

    <!-- KEEP -->
    <path
      v-else-if="name === 'door'"
      fill="currentColor"
      d="M19 19V5c0-1.1-.9-2-2-2H7c-1.1 0-2 .9-2 2v14H3v2h18v-2h-2zm-2 0H7V5h10v14zm-4-6h2v2h-2v-2z"
    />
    <path
      v-else-if="name === 'window'"
      fill="currentColor"
      d="M3 5h18v14H3V5zm2 2v4h6V7H5zm8 0v4h6V7h-6zM5 13v4h6v-4H5zm8 0v4h6v-4h-6z"
    />

    <!-- NEW: isometric room corner + doorway -->
    <g v-else-if="name === 'room'" v-bind="strokeAttrs">
      <!-- floor diamond -->
      <path d="M12 9.5 L3.5 14.5 L12 19.5 L20.5 14.5 Z" />
      <!-- walls -->
      <path d="M3.5 14.5 V7 L12 2.5 L20.5 7 V14.5" />
      <line x1="12" y1="2.5" x2="12" y2="9.5" />
      <!-- doorway on right wall -->
      <path d="M16.2 11.2 V16.8 L18.8 15.2 V10.2 Z" />
    </g>

    <!-- KEEP -->
    <path
      v-else-if="name === 'delete'"
      fill="currentColor"
      d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
    />

    <!-- NEW: split — two panels + double arrow (currentColor-safe) -->
    <g v-else-if="name === 'split'" v-bind="strokeAttrs">
      <rect x="2.5" y="4" width="7.5" height="16" rx="2" />
      <rect x="14" y="4" width="7.5" height="16" rx="2" />
      <path d="M8.2 12 H15.8" />
      <path d="M10.4 9.6 L7.6 12 l2.8 2.4" />
      <path d="M13.6 9.6 L16.4 12 l-2.8 2.4" />
    </g>

    <!-- NEW: classic ruler with ticks -->
    <g v-else-if="name === 'ruler'" transform="rotate(-35 12 12)" v-bind="strokeAttrs">
      <rect x="3.5" y="9" width="17" height="6" rx="0.75" />
      <line x1="6.5" y1="9" x2="6.5" y2="12" />
      <line x1="9" y1="9" x2="9" y2="13.5" />
      <line x1="11.5" y1="9" x2="11.5" y2="12" />
      <line x1="14" y1="9" x2="14" y2="13.5" />
      <line x1="16.5" y1="9" x2="16.5" y2="12" />
      <line x1="19" y1="9" x2="19" y2="13.5" />
    </g>

    <!-- KEEP -->
    <path
      v-else-if="name === 'fit'"
      fill="currentColor"
      d="M15 3l2.3 2.3-2.89 2.87 1.42 1.42L18.7 6.7 21 9V3h-6zM3 9l2.3-2.3 2.87 2.89 1.42-1.42L6.7 5.3 9 3H3v6zm12 12l-2.3-2.3 2.89-2.87-1.42-1.42L5.3 17.3 3 15v6h6zm6-6l-2.3 2.3-2.87-2.89-1.42 1.42 2.89 2.87L15 21h6v-6z"
    />
    <path
      v-else-if="name === 'undo'"
      fill="currentColor"
      d="M12.5 8c-2.65 0-5.05 1.16-6.7 3h2.15v2H3.5V5.5h2V7.35C7.45 5.01 9.82 4 12.5 4c4.14 0 7.5 3.36 7.5 7.5h-2c0-3.03-2.47-5.5-5.5-5.5z"
    />
    <path
      v-else-if="name === 'copy'"
      fill="currentColor"
      d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"
    />
    <path
      v-else-if="name === 'clear'"
      fill="currentColor"
      d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"
    />

    <!-- NEW: door hinge -->
    <g v-else-if="name === 'hinge'" v-bind="strokeAttrs">
      <rect x="10.25" y="3" width="3.5" height="18" rx="1.75" />
      <line x1="10.25" y1="7.5" x2="13.75" y2="7.5" />
      <line x1="10.25" y1="12" x2="13.75" y2="12" />
      <line x1="10.25" y1="16.5" x2="13.75" y2="16.5" />
      <rect x="3" y="6" width="7.25" height="12" rx="0.5" />
      <rect x="13.75" y="6" width="7.25" height="12" rx="0.5" />
      <circle cx="5.2" cy="8.2" r="1" />
      <circle cx="5.2" cy="15.8" r="1" />
      <circle cx="8.2" cy="12" r="1" />
      <circle cx="18.8" cy="8.2" r="1" />
      <circle cx="18.8" cy="15.8" r="1" />
      <circle cx="15.8" cy="12" r="1" />
    </g>

    <!-- NEW: door swing (open door in frame) -->
    <g v-else-if="name === 'swing'" v-bind="strokeAttrs">
      <!-- frame: top + right jamb -->
      <path d="M6.5 4.5 H18.5 V19.5" />
      <!-- door panel swung open (hinge on right) -->
      <path d="M18.5 4.5 L7.5 6.5 V17.5 L18.5 19.5" />
      <circle cx="9.5" cy="12" r="1.15" fill="currentColor" stroke="none" />
    </g>
  </svg>
</template>
