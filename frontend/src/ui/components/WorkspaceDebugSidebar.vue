<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

const STORAGE_KEY = 'bouw-workspace-debug-sidebar-open'

defineProps<{
  visible?: boolean
}>()

const open = ref(true)

onMounted(() => {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored !== null) open.value = stored === 'true'
})

watch(open, (value) => {
  localStorage.setItem(STORAGE_KEY, String(value))
})

function toggle() {
  open.value = !open.value
}
</script>

<template>
  <aside v-if="visible !== false" class="debug-sidebar" :class="{ open }">
    <button
      type="button"
      class="debug-sidebar-toggle"
      :title="open ? 'Debug-paneel inklappen' : 'Debug-paneel uitklappen'"
      :aria-expanded="open"
      @click="toggle"
    >
      <span class="chevron" aria-hidden="true">{{ open ? '›' : '‹' }}</span>
      <span v-if="!open" class="collapsed-label">Debug</span>
    </button>
    <div v-show="open" class="debug-sidebar-scroll">
      <slot />
    </div>
  </aside>
</template>

<style scoped>
.debug-sidebar {
  flex-shrink: 0;
  display: flex;
  flex-direction: row-reverse;
  align-items: stretch;
  border-left: 1px solid #e2e8f0;
  background: #f8fafc;
  min-height: 0;
}

.debug-sidebar.open {
  width: 300px;
}

.debug-sidebar:not(.open) {
  width: 0;
  border-left: none;
  background: transparent;
  overflow: visible;
}

.debug-sidebar:not(.open) .debug-sidebar-toggle {
  transform: translateX(-36px);
  border-left: 1px solid #e2e8f0;
  border-right: 1px solid #e2e8f0;
}

.debug-sidebar-toggle {
  flex-shrink: 0;
  width: 36px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 4px;
  border: none;
  border-left: 1px solid #e2e8f0;
  background: #f1f5f9;
  color: #475569;
  cursor: pointer;
}

.debug-sidebar-toggle:hover {
  background: #e2e8f0;
  color: #0f172a;
}

.chevron {
  font-size: 18px;
  line-height: 1;
  font-weight: 600;
}

.collapsed-label {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  transform: rotate(180deg);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #64748b;
}

.debug-sidebar-scroll {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
}
</style>
