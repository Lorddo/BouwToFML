<script setup lang="ts">
import {
  TOOLBELT_HOTKEY_PRIORITY,
  useToolbeltHotkey,
  type ToolbeltHotkey,
} from '@/ui/composables/canvas/useToolbeltHotkey'
import type { ToolbeltIconName } from './canvas-toolbelt.types'
import ToolbeltIcon from './ToolbeltIcon.vue'

const props = withDefaults(
  defineProps<{
    icon: ToolbeltIconName | string
    title: string
    ariaLabel?: string
    hotkey?: ToolbeltHotkey
    hotkeyPriority?: number
    disabled?: boolean
  }>(),
  {
    hotkeyPriority: TOOLBELT_HOTKEY_PRIORITY.chrome,
    disabled: false,
  },
)

const emit = defineEmits<{
  click: []
}>()

function activate(): void {
  if (props.disabled) return
  emit('click')
}

useToolbeltHotkey(() => props.hotkey, activate, {
  enabled: () => !props.disabled && props.hotkey != null,
  priority: () => props.hotkeyPriority,
})
</script>

<template>
  <button
    type="button"
    class="canvas-toolbelt__btn"
    :title="title"
    :aria-label="ariaLabel ?? title"
    :disabled="disabled"
    @click="activate"
  >
    <ToolbeltIcon :name="icon" />
  </button>
</template>
