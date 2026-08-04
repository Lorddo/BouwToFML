<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

const open = defineModel<boolean>('open', { default: false })

function toggle() {
  open.value = !open.value
}

function onKeydown(event: KeyboardEvent) {
  if (!event.ctrlKey || !event.shiftKey || event.altKey || event.metaKey) return
  if (event.key.toLowerCase() !== 'h') return
  event.preventDefault()
  toggle()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <aside v-if="open" class="debug-sidebar" aria-label="DevTools">
    <div class="debug-sidebar-header">
      <h2>DevTools</h2>
      <span class="hotkey-hint" title="Sneltoets">Ctrl+Shift+H</span>
      <button type="button" class="close-btn" title="Sluiten (Ctrl+Shift+H)" @click="toggle">
        ×
      </button>
    </div>
    <div class="debug-sidebar-scroll">
      <slot />
    </div>
  </aside>
</template>

<style scoped>
.debug-sidebar {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  width: 300px;
  border-left: 1px solid #e2e8f0;
  background: #f8fafc;
  min-height: 0;
}

.debug-sidebar-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid #e2e8f0;
  background: #f1f5f9;
}

.debug-sidebar-header h2 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  flex: 1;
}

.hotkey-hint {
  font-size: 10px;
  color: #94a3b8;
  font-family: ui-monospace, monospace;
}

.close-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #64748b;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.close-btn:hover {
  background: #e2e8f0;
  color: #0f172a;
}

.debug-sidebar-scroll {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
}
</style>
