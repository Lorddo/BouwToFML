<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import WorkspaceView from './views/WorkspaceView.vue'
import UserSettingsView from './views/UserSettingsView.vue'
import FmlViewerView from './views/FmlViewerView.vue'
import AppAccessGate from './components/AppAccessGate.vue'
import { appFatalError, clearAppError } from '@/ui/app-error'
import { isAccessPasswordRequired, isAccessUnlocked } from '@/ui/access-gate'

const { t } = useI18n()

type AppView = 'workspace' | 'settings' | 'fml-viewer'

const accessGranted = ref(!isAccessPasswordRequired() || isAccessUnlocked())
const appView = ref<AppView>('workspace')
const workspaceRef = ref<InstanceType<typeof WorkspaceView> | null>(null)

function onAccessUnlocked(): void {
  accessGranted.value = true
}

function onNewWorkspace(): void {
  workspaceRef.value?.startNewWorkspace()
}

function openSettings(): void {
  appView.value = 'settings'
}

function openFmlViewer(): void {
  appView.value = 'fml-viewer'
}

function backToWorkspace(): void {
  appView.value = 'workspace'
}

function backToSettings(): void {
  appView.value = 'settings'
}

function onSettingsSaved(): void {
  workspaceRef.value?.applyUserViewerSettings()
}

function dismissFatalError(): void {
  clearAppError()
}
</script>

<template>
  <AppAccessGate v-if="!accessGranted" @unlocked="onAccessUnlocked" />
  <div v-else class="app-shell">
    <div v-if="appFatalError" class="app-error-banner" role="alert">
      <span class="app-error-banner__text">{{ appFatalError }}</span>
      <button type="button" class="app-error-banner__dismiss" @click="dismissFatalError">
        {{ t('common.dismiss') }}
      </button>
    </div>
    <header>
      <div
        class="header-title"
        role="button"
        tabindex="0"
        @click="backToWorkspace"
        @keydown.enter="backToWorkspace"
      >
        <h1>{{ t('app.title') }}</h1>
        <span class="subtitle">{{ t('app.subtitle') }}</span>
      </div>
      <nav class="header-nav">
        <button
          v-if="appView === 'workspace'"
          type="button"
          class="primary"
          @click="onNewWorkspace"
        >
          {{ t('app.newDrawing') }}
        </button>
        <button
          type="button"
          class="icon-btn"
          :class="{ active: appView === 'settings' }"
          :title="t('app.settings')"
          :aria-label="t('app.settings')"
          @click="openSettings"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              fill="currentColor"
              d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54A.49.49 0 0 0 13.9 2h-3.8a.49.49 0 0 0-.49.42l-.36 2.54c-.59.22-1.14.53-1.63.94l-2.39-.96a.49.49 0 0 0-.59.22L2.72 8.48a.49.49 0 0 0 .12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.84 14.52a.49.49 0 0 0-.12.61l1.92 3.32c.13.22.39.31.59.22l2.39-.96c.49.41 1.04.72 1.63.94l.36 2.54c.05.24.25.42.49.42h3.8c.24 0 .44-.18.49-.42l.36-2.54c.59-.22 1.14-.53 1.63-.94l2.39.96c.22.09.46 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"
            />
          </svg>
        </button>
      </nav>
    </header>

    <main class="app-main">
      <!-- Wrapper: WorkspaceView is multi-root; v-show op de component zelf verbergt het canvas niet. -->
      <div v-show="appView === 'workspace'" class="app-page app-page--workspace">
        <WorkspaceView ref="workspaceRef" />
      </div>
      <div v-if="appView === 'settings'" class="app-page app-page--settings">
        <UserSettingsView
          @back="backToWorkspace"
          @saved="onSettingsSaved"
          @open-fml-viewer="openFmlViewer"
        />
      </div>
      <div v-if="appView === 'fml-viewer'" class="app-page app-page--fml-viewer">
        <FmlViewerView @back="backToSettings" />
      </div>
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f4f5f7;
}

.app-error-banner {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  background: #fef2f2;
  border-bottom: 1px solid #fecaca;
  color: #991b1b;
  font-size: 13px;
  z-index: 30;
}

.app-error-banner__text {
  flex: 1;
  min-width: 0;
  word-break: break-word;
}

.app-error-banner__dismiss {
  flex-shrink: 0;
  font-size: 13px;
  padding: 4px 10px;
  border: 1px solid #fca5a5;
  border-radius: 4px;
  background: #fff;
  color: #991b1b;
  cursor: pointer;
}

.app-error-banner__dismiss:hover {
  background: #fee2e2;
}

header {
  flex-shrink: 0;
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  z-index: 20;
}

.header-title {
  display: flex;
  align-items: baseline;
  gap: 12px;
  cursor: pointer;
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

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  color: #334155;
}

.icon-btn:hover {
  background: #f1f5f9;
}

.app-main {
  flex: 1;
  min-height: 0;
  position: relative;
}

.app-page--workspace {
  height: 100%;
}

.app-page--settings {
  position: absolute;
  inset: 0;
  overflow: auto;
  background: #f4f5f7;
  z-index: 10;
}

.app-page--fml-viewer {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #f1f5f9;
  z-index: 10;
}
</style>
