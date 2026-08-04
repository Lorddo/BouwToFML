<script setup lang="ts">
import { ref } from 'vue'
import WorkspaceView from './views/WorkspaceView.vue'

const workspaceRef = ref<InstanceType<typeof WorkspaceView> | null>(null)

function onNewWorkspace(): void {
  workspaceRef.value?.startNewWorkspace()
}
</script>

<template>
  <header>
    <div class="header-title">
      <h1>BouwToFML</h1>
      <span class="subtitle">Bouwtekening naar Floorplanner</span>
    </div>
    <nav class="header-nav">
      <button type="button" class="primary" @click="onNewWorkspace">Nieuwe tekening</button>
    </nav>
  </header>

  <WorkspaceView ref="workspaceRef" />
</template>

<style scoped>
header {
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.header-title {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.header-title h1 {
  margin: 0;
  font-size: 18px;
}

.subtitle {
  font-size: 13px;
  color: #64748b;
}

.header-nav {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-nav button {
  font-size: 13px;
}

.header-nav button.active {
  background: #e2e8f0;
  border-color: #94a3b8;
  font-weight: 600;
}
</style>
