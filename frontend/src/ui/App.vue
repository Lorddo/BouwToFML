<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import WorkspaceView from './views/WorkspaceView.vue'
import UserSettingsView from './views/UserSettingsView.vue'
import FmlViewerView from './views/FmlViewerView.vue'
import AppAccessGate from './components/AppAccessGate.vue'
import AppHeader from './components/AppHeader.vue'
import FmlChromeDialogHost from './components/FmlChromeDialogHost.vue'
import { appFatalError, clearAppError } from '@/ui/app-error'
import { isAccessPasswordRequired, isAccessUnlocked } from '@/ui/access-gate'
import {
  FML_EDITOR_PATH,
  isFmlEditorPath,
  syncFmlEditorCanonicalPath,
  viewFromPathname,
  type AppShellView,
} from '@/ui/app-routes'
import { confirmFmlChrome } from '@/ui/composables/fml-chrome-dialog'
import type { FloorPlan } from '@/core/fml/types'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

type AppView = AppShellView

function viewFromLocation(): Exclude<AppView, 'settings'> {
  return viewFromPathname(window.location.pathname)
}

const accessGranted = ref(!isAccessPasswordRequired() || isAccessUnlocked())
const appView = ref<AppView>(viewFromLocation())
const settingsReturn = ref<AppView | null>(null)
const workspaceMounted = ref(appView.value !== 'fml-viewer')
const editorMounted = ref(appView.value === 'fml-viewer')
const workspaceRef = ref<InstanceType<typeof WorkspaceView> | null>(null)
const fmlViewerRef = ref<{
  startNewPlan: () => void
  loadPlan: (plan: FloorPlan, sourceName: string) => Promise<void>
  hasOpenContent: () => boolean
  applyViewerSettings: () => void
  applyCornerMarkerModeFromSettings: () => void
} | null>(null)
const canvasFullscreen = ref(false)

function onAccessUnlocked(): void {
  accessGranted.value = true
}

function onNewWorkspace(): void {
  workspaceRef.value?.startNewWorkspace()
}

function onNewDrawing(): void {
  const dest = appView.value === 'settings' ? (settingsReturn.value ?? 'workspace') : appView.value
  if (dest === 'fml-viewer') {
    if (appView.value === 'settings') {
      settingsReturn.value = null
      appView.value = 'fml-viewer'
    }
    fmlViewerRef.value?.startNewPlan()
    return
  }
  if (appView.value === 'settings') {
    goToWorkspace()
  }
  onNewWorkspace()
}

function goToWorkspace(): void {
  workspaceMounted.value = true
  settingsReturn.value = null
  if (isFmlEditorPath(window.location.pathname)) {
    history.pushState(null, '', '/')
  }
  appView.value = 'workspace'
}

function goToEditor(): void {
  editorMounted.value = true
  settingsReturn.value = null
  if (!isFmlEditorPath(window.location.pathname)) {
    history.pushState(null, '', FML_EDITOR_PATH)
  }
  appView.value = 'fml-viewer'
}

async function openProjectInEditor(plan: FloorPlan): Promise<void> {
  if (fmlViewerRef.value?.hasOpenContent?.()) {
    const ok = await confirmFmlChrome({
      title: t('viewer.replacePlanTitle'),
      message: t('viewer.replacePlanBody'),
      confirmLabel: t('result.openInEditor'),
      cancelLabel: t('common.cancel'),
    })
    if (!ok) return
  }
  goToEditor()
  await nextTick()
  if (!fmlViewerRef.value?.loadPlan) await nextTick()
  const name = `${plan.name?.trim() || 'project'}.plg`
  await fmlViewerRef.value?.loadPlan(plan, name)
}

function openSettings(): void {
  if (appView.value === 'settings') {
    backFromSettings()
    return
  }
  settingsReturn.value = appView.value
  appView.value = 'settings'
}

function backFromSettings(): void {
  const dest = settingsReturn.value ?? 'workspace'
  settingsReturn.value = null
  if (dest === 'fml-viewer') {
    appView.value = 'fml-viewer'
    return
  }
  goToWorkspace()
}

function onPopState(): void {
  const next = viewFromLocation()
  if (next === 'fml-viewer') editorMounted.value = true
  else workspaceMounted.value = true
  settingsReturn.value = null
  appView.value = next
  canvasFullscreen.value = false
  syncViewerLockClass()
}

function syncViewerLockClass(): void {
  const lock = appView.value === 'fml-viewer' || settingsReturn.value === 'fml-viewer'
  document.documentElement.classList.toggle('fml-viewer-lock', lock)
}

onMounted(() => {
  syncFmlEditorCanonicalPath()
  window.addEventListener('popstate', onPopState)
  syncViewerLockClass()
})

onBeforeUnmount(() => {
  window.removeEventListener('popstate', onPopState)
  document.documentElement.classList.remove('fml-viewer-lock')
})

watch(appView, () => {
  canvasFullscreen.value = false
})

watch([appView, settingsReturn], () => {
  syncViewerLockClass()
})

function onSettingsSaved(): void {
  workspaceRef.value?.applyUserViewerSettings()
  fmlViewerRef.value?.applyViewerSettings()
}

function dismissFatalError(): void {
  clearAppError()
}
</script>

<template>
  <AppAccessGate v-if="!accessGranted" @unlocked="onAccessUnlocked" />
  <div
    v-else
    class="app-shell"
    :class="{
      'app-shell--fml-viewer': appView === 'fml-viewer' || settingsReturn === 'fml-viewer',
      'app-shell--canvas-fs': canvasFullscreen,
    }"
  >
    <FmlChromeDialogHost />
    <div v-if="appFatalError" class="app-error-banner" role="alert">
      <span class="app-error-banner__text">{{ appFatalError }}</span>
      <button type="button" class="app-error-banner__dismiss" @click="dismissFatalError">
        {{ t('common.dismiss') }}
      </button>
    </div>
    <AppHeader
      :app-view="appView"
      @new-drawing="onNewDrawing"
      @go-workspace="goToWorkspace"
      @go-editor="goToEditor"
      @open-settings="openSettings"
    />

    <main class="app-main">
      <!-- Wrapper: WorkspaceView is multi-root; v-show op de component zelf verbergt het canvas niet. -->
      <div
        v-if="workspaceMounted"
        v-show="appView === 'workspace'"
        class="app-page app-page--workspace"
      >
        <WorkspaceView
          ref="workspaceRef"
          v-model:canvas-fullscreen="canvasFullscreen"
          @open-in-editor="openProjectInEditor"
        />
      </div>
      <div v-if="appView === 'settings'" class="app-page app-page--settings">
        <UserSettingsView
          :variant="settingsReturn === 'fml-viewer' ? 'viewer' : 'workspace'"
          @saved="onSettingsSaved"
          @close="backFromSettings"
        />
      </div>
      <div
        v-if="editorMounted || settingsReturn === 'fml-viewer'"
        v-show="appView === 'fml-viewer'"
        class="app-page app-page--fml-viewer"
      >
        <FmlViewerView ref="fmlViewerRef" @update:canvas-fullscreen="canvasFullscreen = $event" />
      </div>
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: #f4f5f7;
}

.app-shell--fml-viewer {
  height: 100dvh;
  max-height: 100dvh;
  overflow: hidden;
}

.app-shell--canvas-fs {
  height: 100dvh;
  max-height: 100dvh;
  overflow: hidden;
}

.app-shell--canvas-fs :deep(.app-header) {
  display: none;
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

<style>
html.fml-viewer-lock,
html.fml-viewer-lock body,
html.fml-viewer-lock #app {
  height: 100%;
  max-height: 100dvh;
  overflow: hidden;
}
</style>
