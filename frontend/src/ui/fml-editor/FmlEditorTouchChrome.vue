<script setup lang="ts">
/**
 * Editor-owned chrome (topbar + coarse modifier rail).
 * Rendered by the canvas when `touchChrome` is on; lives in the fml-editor package
 * so hosts can later mount it outside the canvas.
 */
import type { FmlToolId } from '@/ui/components/canvas/fmlToolbeltItems'
import FmlEditorTopbar from '@/ui/components/FmlEditorTopbar.vue'
import FmlEditorModifierRail from '@/ui/components/FmlEditorModifierRail.vue'

defineProps<{
  showTopbar: boolean
  showHelp?: boolean
  showModRail: boolean
  canUndo: boolean
  canRedo: boolean
  hint?: string
  fullscreen?: boolean
  edgeChrome?: boolean
  helpKeys?: readonly string[]
}>()

const emit = defineEmits<{
  undo: []
  redo: []
  fit: []
  zoomIn: []
  zoomOut: []
  toggleFullscreen: []
}>()

const settingsMod = defineModel<boolean>('settingsMod', { default: false })
const axisLockMod = defineModel<boolean>('axisLockMod', { default: false })
const moveMod = defineModel<boolean>('moveMod', { default: false })
const activeTool = defineModel<FmlToolId | null>('activeTool', { default: null })
const areaSideDimsVisible = defineModel<boolean>('areaSideDimsVisible', { default: false })
</script>

<template>
  <FmlEditorTopbar
    v-if="showTopbar"
    :can-undo="canUndo"
    :can-redo="canRedo"
    :show-help="showHelp !== false"
    :hint="hint"
    :fullscreen="fullscreen"
    :edge-chrome="edgeChrome"
    :help-keys="helpKeys"
    @undo="emit('undo')"
    @redo="emit('redo')"
    @fit="emit('fit')"
    @zoom-in="emit('zoomIn')"
    @zoom-out="emit('zoomOut')"
    @toggle-fullscreen="emit('toggleFullscreen')"
  />
  <FmlEditorModifierRail
    v-if="showModRail"
    v-model:settings-mod="settingsMod"
    v-model:axis-lock-mod="axisLockMod"
    v-model:move-mod="moveMod"
    v-model:active-tool="activeTool"
    v-model:area-side-dims-visible="areaSideDimsVisible"
  />
</template>
