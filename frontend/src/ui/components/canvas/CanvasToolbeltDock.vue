<script setup lang="ts">
import CanvasToolbelt from './CanvasToolbelt.vue'
import ToolbeltActionButton from './ToolbeltActionButton.vue'
import type { CanvasToolId } from './canvas-toolbelt.types'
import type { ToolbeltItem } from './canvas-toolbelt.types'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChromeFitScale } from '@/ui/composables/useChromeFitScale'
import { TOOLBELT_HOTKEY_PRIORITY } from '@/ui/composables/canvas/useToolbeltHotkey'
import './canvas-toolbelt.css'

const props = withDefaults(
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

const { t } = useI18n()
const dockRef = ref<HTMLElement | null>(null)
useChromeFitScale(dockRef)

const hasActiveTool = computed(() => props.faceActiveTool != null || props.inkActiveTool != null)

function deactivateActiveTool(): void {
  if (props.inkActiveTool) emit('update:inkActiveTool', null)
  if (props.faceActiveTool) emit('update:faceActiveTool', null)
}
</script>

<template>
  <div
    v-if="faceVisible || inkVisible"
    ref="dockRef"
    class="canvas-toolbelt-dock"
    data-fit-chrome="bottom"
  >
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
      <div v-if="hasActiveTool" class="canvas-toolbelt-dock__sep" aria-hidden="true" />
      <div
        v-if="hasActiveTool"
        class="canvas-toolbelt-dock__section canvas-toolbelt-dock__section--fml"
      >
        <ToolbeltActionButton
          icon="clear"
          :title="t('result.toolbar.deactivateDrawTool')"
          :aria-label="t('result.toolbar.deactivateDrawTool')"
          hotkey="Escape"
          :hotkey-priority="TOOLBELT_HOTKEY_PRIORITY.tool"
          @click="deactivateActiveTool"
        />
      </div>
    </div>
  </div>
</template>
