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

    <g v-else-if="name === 'slash'" v-bind="strokeAttrs">
      <line x1="6" y1="5" x2="18" y2="19" />
    </g>

    <!-- NEW: origin crosshair (nulpunt) -->
    <g v-else-if="name === 'origin'" v-bind="strokeAttrs">
      <line x1="12" y1="3" x2="12" y2="21" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <circle cx="12" cy="12" r="3.5" />
    </g>

    <text
      v-else-if="name === 'text'"
      x="12"
      y="16.5"
      text-anchor="middle"
      fill="currentColor"
      font-size="9.5"
      font-weight="700"
      font-family="system-ui, Segoe UI, sans-serif"
    >
      abc
    </text>

    <text
      v-else-if="name === 'text_bold'"
      x="12"
      y="17"
      text-anchor="middle"
      fill="currentColor"
      font-size="14"
      font-weight="700"
      font-family="Georgia, 'Times New Roman', serif"
    >
      B
    </text>
    <text
      v-else-if="name === 'text_italic'"
      x="12"
      y="17"
      text-anchor="middle"
      fill="currentColor"
      font-size="14"
      font-style="italic"
      font-weight="600"
      font-family="Georgia, 'Times New Roman', serif"
    >
      I
    </text>
    <text
      v-else-if="name === 'text_outline'"
      x="12"
      y="17"
      text-anchor="middle"
      fill="none"
      stroke="currentColor"
      stroke-width="1.15"
      font-size="14"
      font-weight="700"
      font-family="Georgia, 'Times New Roman', serif"
    >
      A
    </text>

    <!-- KEEP -->
    <path
      v-else-if="name === 'fit'"
      fill="currentColor"
      d="M15 3l2.3 2.3-2.89 2.87 1.42 1.42L18.7 6.7 21 9V3h-6zM3 9l2.3-2.3 2.87 2.89 1.42-1.42L6.7 5.3 9 3H3v6zm12 12l-2.3-2.3 2.89-2.87-1.42-1.42L5.3 17.3 3 15v6h6zm6-6l-2.3 2.3-2.87-2.89-1.42 1.42 2.89 2.87L15 21h6v-6z"
    />
    <path
      v-else-if="name === 'fullscreen'"
      fill="currentColor"
      d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"
    />
    <path
      v-else-if="name === 'fullscreen_exit'"
      fill="currentColor"
      d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"
    />
    <path
      v-else-if="name === 'undo'"
      fill="currentColor"
      d="M12.5 8c-2.65 0-5.05 1.16-6.7 3h2.15v2H3.5V5.5h2V7.35C7.45 5.01 9.82 4 12.5 4c4.14 0 7.5 3.36 7.5 7.5h-2c0-3.03-2.47-5.5-5.5-5.5z"
    />
    <path
      v-else-if="name === 'redo'"
      fill="currentColor"
      d="M11.5 8c2.65 0 5.05 1.16 6.7 3h-2.15v2h4.45V5.5h-2V7.35C16.55 5.01 14.18 4 11.5 4 7.36 4 4 7.36 4 11.5h2c0-3.03 2.47-5.5 5.5-5.5z"
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
    <path
      v-else-if="name === 'check'"
      fill="currentColor"
      d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
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

    <g v-else-if="name === 'mirror_h'" v-bind="strokeAttrs">
      <line x1="12" y1="3" x2="12" y2="21" />
      <path d="M10 7 L4 12 L10 17" />
      <path d="M14 7 L20 12 L14 17" />
    </g>
    <g v-else-if="name === 'mirror_v'" v-bind="strokeAttrs">
      <line x1="3" y1="12" x2="21" y2="12" />
      <path d="M7 10 L12 4 L17 10" />
      <path d="M7 14 L12 20 L17 14" />
    </g>
    <g v-else-if="name === 'rotate_90'" v-bind="strokeAttrs">
      <path d="M7 19 V11 a5 5 0 0 1 10 0 v2" />
      <path d="M14.5 9.5 L17 14 L20.5 9.5" />
    </g>

    <!-- Room outline + mid-edge ticks (area side dims) -->
    <g v-else-if="name === 'dims'" v-bind="strokeAttrs">
      <rect x="5" y="6" width="14" height="12" rx="0.5" />
      <line x1="10" y1="4" x2="14" y2="4" />
      <line x1="12" y1="3" x2="12" y2="6" />
      <line x1="10" y1="20" x2="14" y2="20" />
      <line x1="12" y1="18" x2="12" y2="21" />
      <line x1="3" y1="10.5" x2="3" y2="13.5" />
      <line x1="2" y1="12" x2="5" y2="12" />
      <line x1="21" y1="10.5" x2="21" y2="13.5" />
      <line x1="19" y1="12" x2="22" y2="12" />
    </g>

    <!-- 3×3 tool-palette grid -->
    <g v-else-if="name === 'grid'" fill="currentColor" stroke="none">
      <rect x="3.5" y="3.5" width="4.5" height="4.5" rx="0.8" />
      <rect x="9.75" y="3.5" width="4.5" height="4.5" rx="0.8" />
      <rect x="16" y="3.5" width="4.5" height="4.5" rx="0.8" />
      <rect x="3.5" y="9.75" width="4.5" height="4.5" rx="0.8" />
      <rect x="9.75" y="9.75" width="4.5" height="4.5" rx="0.8" />
      <rect x="16" y="9.75" width="4.5" height="4.5" rx="0.8" />
      <rect x="3.5" y="16" width="4.5" height="4.5" rx="0.8" />
      <rect x="9.75" y="16" width="4.5" height="4.5" rx="0.8" />
      <rect x="16" y="16" width="4.5" height="4.5" rx="0.8" />
    </g>

    <!-- NEW: door swing (open door in frame) -->
    <g v-else-if="name === 'swing'" v-bind="strokeAttrs">
      <!-- frame: top + right jamb -->
      <path d="M6.5 4.5 H18.5 V19.5" />
      <!-- door panel swung open (hinge on right) -->
      <path d="M18.5 4.5 L7.5 6.5 V17.5 L18.5 19.5" />
      <circle cx="9.5" cy="12" r="1.15" fill="currentColor" stroke="none" />
    </g>

    <g v-else-if="name === 'menu'" v-bind="strokeAttrs">
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </g>
    <g v-else-if="name === 'upload'" v-bind="strokeAttrs">
      <path d="M4 16.5 V19 a1 1 0 0 0 1 1 h14 a1 1 0 0 0 1-1 v-2.5" />
      <path d="M12 4 v12" />
      <path d="M7.5 8.5 L12 4 L16.5 8.5" />
    </g>
    <g v-else-if="name === 'download'" v-bind="strokeAttrs">
      <path d="M4 16.5 V19 a1 1 0 0 0 1 1 h14 a1 1 0 0 0 1-1 v-2.5" />
      <path d="M12 4 v12" />
      <path d="M7.5 11.5 L12 16 L16.5 11.5" />
    </g>
    <g v-else-if="name === 'sanitize'" v-bind="strokeAttrs">
      <path d="M12 3.5 L13.15 8.2 L18 9.5 L13.15 10.8 L12 15.5 L10.85 10.8 L6 9.5 L10.85 8.2 Z" />
      <path
        d="M18.2 14.8 L18.75 16.55 L20.5 17.1 L18.75 17.65 L18.2 19.4 L17.65 17.65 L15.9 17.1 L17.65 16.55 Z"
      />
      <path
        d="M6.4 15.2 L6.85 16.7 L8.35 17.15 L6.85 17.6 L6.4 19.1 L5.95 17.6 L4.45 17.15 L5.95 16.7 Z"
      />
    </g>
    <g v-else-if="name === 'edit'" v-bind="strokeAttrs">
      <path
        d="M4 20 L8.1 18.7 L19.1 7.7 a1.35 1.35 0 0 0 0-1.9 L17.2 3.9 a1.35 1.35 0 0 0-1.9 0 L4.3 14.9 Z"
      />
      <path d="M14.6 5.1 L17.9 8.4" />
    </g>
    <g v-else-if="name === 'inspect'" v-bind="strokeAttrs">
      <path
        d="M3.6 12 C6.1 7.6 9.2 5.6 12 5.6 S17.9 7.6 20.4 12 C17.9 16.4 14.8 18.4 12 18.4 S6.1 16.4 3.6 12 Z"
      />
      <circle cx="12" cy="12" r="2.5" />
    </g>
    <g v-else-if="name === 'settings'" v-bind="strokeAttrs">
      <line x1="4" y1="8" x2="20" y2="8" />
      <line x1="4" y1="16" x2="20" y2="16" />
      <circle cx="9" cy="8" r="2" />
      <circle cx="15" cy="16" r="2" />
    </g>
    <g v-else-if="name === 'axis'" v-bind="strokeAttrs">
      <line x1="12" y1="3" x2="12" y2="21" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <path d="M10 5.2 L12 3 L14 5.2" />
      <path d="M18.8 10 L21 12 L18.8 14" />
    </g>
    <g v-else-if="name === 'move'" v-bind="strokeAttrs">
      <path d="M12 3.2 L12 20.8" />
      <path d="M3.2 12 L20.8 12" />
      <path d="M9.2 6.2 L12 3.2 L14.8 6.2" />
      <path d="M9.2 17.8 L12 20.8 L14.8 17.8" />
      <path d="M6.2 9.2 L3.2 12 L6.2 14.8" />
      <path d="M17.8 9.2 L20.8 12 L17.8 14.8" />
    </g>

    <!-- Sidebar: re-run wall/door/window classify -->
    <g v-else-if="name === 'classify'" v-bind="strokeAttrs">
      <path d="M4.5 12 A7.5 7.5 0 1 0 12 4.5" />
      <path d="M12 2.2 L12 6.2 L8.6 4.6" />
      <rect x="8.2" y="9.2" width="3.2" height="7.2" rx="0.5" />
      <rect x="12.6" y="11.4" width="3.2" height="5" rx="0.5" />
      <path d="M16.8 14.2 H19.2" />
      <path d="M16.8 16.4 H19.2" />
    </g>

    <!-- Sidebar: collapse panel -->
    <g v-else-if="name === 'close_menu'" v-bind="strokeAttrs">
      <rect x="3.5" y="4.5" width="9.5" height="15" rx="1.4" />
      <path d="M16.2 8.2 L20.2 12 L16.2 15.8" />
    </g>

    <!-- Sidebar: close loaded FML -->
    <g v-else-if="name === 'close_plan'" v-bind="strokeAttrs">
      <path d="M7 3.8 H14.2 L19 8.6 V20.2 H7 Z" />
      <path d="M14.2 3.8 V8.6 H19" />
      <path d="M10.2 13.2 L15.8 13.2" />
    </g>

    <!-- Sidebar: H/V rescale (not the measure ruler) -->
    <g v-else-if="name === 'rescale'" v-bind="strokeAttrs">
      <rect x="3.8" y="3.8" width="10.4" height="10.4" rx="0.6" />
      <path d="M16.2 9 H21" />
      <path d="M18.6 6.8 L21 9 L18.6 11.2" />
      <path d="M9 16.2 V21" />
      <path d="M6.8 18.6 L9 21 L11.2 18.6" />
    </g>

    <!-- Sidebar: flip whole floor/project -->
    <g v-else-if="name === 'mirror_plan'" v-bind="strokeAttrs">
      <line x1="12" y1="3.4" x2="12" y2="20.6" stroke-dasharray="1.6 1.5" />
      <path d="M4.4 5.6 H9.6 V10.4 H7.8 V18.4 H4.4 Z" />
      <path d="M19.6 5.6 H14.4 V10.4 H16.2 V18.4 H19.6 Z" />
    </g>

    <g v-else-if="name === 'rotate_plan_cw'" v-bind="strokeAttrs">
      <rect x="6.6" y="7.2" width="9.2" height="9.2" rx="0.8" />
      <path d="M5.4 9.6 A8.2 8.2 0 1 1 9.2 20.2" />
      <path d="M7.1 18.1 L9.2 20.2 L7.4 21.6" />
    </g>
    <g v-else-if="name === 'rotate_plan_ccw'" v-bind="strokeAttrs">
      <rect x="8.2" y="7.2" width="9.2" height="9.2" rx="0.8" />
      <path d="M18.6 9.6 A8.2 8.2 0 1 0 14.8 20.2" />
      <path d="M16.9 18.1 L14.8 20.2 L16.6 21.6" />
    </g>

    <!-- Sidebar: slide underlay image -->
    <g v-else-if="name === 'underlay_move'" v-bind="strokeAttrs">
      <rect x="3.6" y="5.2" width="13.2" height="9.6" rx="1.1" />
      <path d="M5.2 13.6 L8.1 10 L10.6 12.2 L12.8 9.8 L15.6 13.6" />
      <circle cx="14.2" cy="7.6" r="0.7" />
      <path d="M18.4 15.2 H21" />
      <path d="M19.4 13.4 L21 15.2 L19.4 17" />
      <path d="M18.4 19.4 V21.6" />
      <path d="M16.8 20.2 L18.4 21.6 L20 20.2" />
    </g>

    <g v-else-if="name === 'mirror_underlay'" v-bind="strokeAttrs">
      <rect x="3.6" y="5.4" width="16.8" height="13.2" rx="1.1" />
      <line x1="12" y1="5.4" x2="12" y2="18.6" stroke-dasharray="1.5 1.4" />
      <path d="M5.2 16.4 L8 12.2 L10.2 14.4 L11.4 13.2" />
      <path d="M18.8 16.4 L16 12.2 L13.8 14.4 L12.6 13.2" />
    </g>

    <g v-else-if="name === 'crop'" v-bind="strokeAttrs">
      <path d="M7 3 V17 H21" />
      <path d="M17 21 V7 H3" />
    </g>

    <g v-else-if="name === 'stamp'" v-bind="strokeAttrs">
      <path d="M8 4 H16 V10 H8 Z" />
      <path d="M10 10 V13 H14 V10" />
      <path d="M6 15 H18 V18 H6 Z" />
      <path d="M5 20 H19" />
    </g>

    <g v-else-if="name === 'add'" v-bind="strokeAttrs">
      <path d="M12 5 V19" />
      <path d="M5 12 H19" />
    </g>
  </svg>
</template>
