<script setup lang="ts">
import type { PolygonToolMode } from '@/cv/tools/polygon'
import type { ElementClass } from '@/core/extraction/types'
import type { InkToolId, FaceToolId } from '@/ui/components/canvas/canvas-toolbelt.types'
import './canvas/canvas-toolbelt.css'

defineProps<{
  polygonToolMode?: PolygonToolMode
  isEraserMode: boolean
  isDrawMode: boolean
  isFaceSelectMode: boolean
  isFaceBoxMode?: boolean
  faceBoxTool?: FaceToolId | null
  isSelectionMode: boolean
  isProbeMode?: boolean
  probeMode?: 'point' | 'region'
  drawType?: ElementClass | null
  inkTool?: InkToolId | null
  /** Inkt/vlak-tool hints staan in instructiebalk boven canvas. */
  relocateToolHints?: boolean
}>()

defineEmits<{
  fit: []
}>()
</script>

<template>
  <div class="canvas-toolbar">
    <button type="button" @click="$emit('fit')">Passend maken</button>
    <span v-if="!relocateToolHints" class="hint">
      <template v-if="polygonToolMode">
        Klik punten · dubbelklik of eerste punt = sluiten · Enter = klaar · Esc = annuleren
      </template>
      <template v-else-if="isEraserMode">
        Klik + sleep om te gummen · spatie + sleep = pan · scroll = zoom
      </template>
      <template v-else-if="inkTool === 'brush'">
        Klik + sleep om inkt te tekenen · spatie + sleep = pan · scroll = zoom
      </template>
      <template v-else-if="inkTool === 'eraser'">
        Klik + sleep om inkt te wissen · spatie + sleep = pan · scroll = zoom
      </template>
      <template v-else-if="inkTool === 'line'">
        Sleep een lijn · spatie + sleep = pan · scroll = zoom
      </template>
      <template v-else-if="inkTool === 'rect'">
        Sleep een rechthoek · spatie + sleep = pan · scroll = zoom
      </template>
      <template v-else-if="isDrawMode">
        Sleep vak op tekening ({{ drawType }}) · spatie + sleep = pan · Shift+klik op vak = verwijderen
      </template>
      <template v-else-if="isFaceBoxMode">
        <template v-if="faceBoxTool === 'box_unknown'">
          Sleep een box — vlakken volledig binnen selectie worden onbekend · spatie + sleep = pan · scroll = zoom
        </template>
        <template v-else>
          Sleep een box — vlakken volledig binnen selectie worden muur · spatie + sleep = pan · scroll = zoom
        </template>
      </template>
      <template v-else-if="isFaceSelectMode">
        Shift + klik op een wit vlak = classificatie wisselen · sleep = pan · spatie + sleep = pan · scroll = zoom
      </template>
      <template v-else-if="isProbeMode">
        <template v-if="probeMode === 'point'">
          Klik op de tekening voor pixel-coördinaten · spatie + sleep = pan · scroll = zoom
        </template>
        <template v-else>
          Sleep een venster op de tekening · spatie + sleep = pan · scroll = zoom
        </template>
      </template>
      <template v-else-if="isSelectionMode">
        Klik vak om te selecteren · sleep randen = wijzigen · Shift+klik = verwijderen · icoon rechts = verwijderen
      </template>
      <template v-else>Sleep = pan · scroll = zoom · kies type links om vak te tekenen</template>
    </span>
    <span v-else class="hint">
      <template v-if="isFaceSelectMode">
        Shift + klik op een wit vlak = classificatie wisselen · sleep = pan · spatie + sleep = pan · scroll = zoom
      </template>
      <template v-else-if="isProbeMode">
        <template v-if="probeMode === 'point'">
          Klik op de tekening voor pixel-coördinaten · spatie + sleep = pan · scroll = zoom
        </template>
        <template v-else>
          Sleep een venster op de tekening · spatie + sleep = pan · scroll = zoom
        </template>
      </template>
      <template v-else-if="isSelectionMode">
        Klik vak om te selecteren · sleep randen = wijzigen · icoon links = verplaatsen · icoon rechts = verwijderen
      </template>
      <template v-else-if="isDrawMode">
        Sleep vak op tekening ({{ drawType }}) · spatie + sleep = pan
      </template>
      <template v-else>Sleep = pan · scroll = zoom</template>
    </span>
  </div>
</template>

<style scoped>
.canvas-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid #e2e8f0;
  flex-wrap: wrap;
}
</style>
