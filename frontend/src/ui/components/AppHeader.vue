<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { DASHBOARD_URL, type AppShellView } from '@/ui/app-routes'

const { t } = useI18n()

defineProps<{
  appView: AppShellView
}>()

const emit = defineEmits<{
  newDrawing: []
  goWorkspace: []
  goEditor: []
  openSettings: []
}>()
</script>

<template>
  <header class="app-header">
    <div class="header-left">
      <div
        class="header-title"
        role="button"
        tabindex="0"
        @click="emit('goWorkspace')"
        @keydown.enter="emit('goWorkspace')"
      >
        <h1>{{ t('app.title') }}</h1>
        <span class="subtitle">{{ t('app.subtitle') }}</span>
      </div>
      <button type="button" class="primary header-new" @click="emit('newDrawing')">
        {{ t('app.newDrawing') }}
      </button>
    </div>
    <nav class="header-nav" :aria-label="t('app.title')">
      <a class="nav-link" :href="DASHBOARD_URL" target="_blank" rel="noopener noreferrer">
        {{ t('app.navDashboard') }}
      </a>
      <button
        type="button"
        class="nav-link"
        :class="{ active: appView === 'workspace' }"
        :aria-current="appView === 'workspace' ? 'page' : undefined"
        @click="emit('goWorkspace')"
      >
        {{ t('app.navConverter') }}
      </button>
      <button
        type="button"
        class="nav-link"
        :class="{ active: appView === 'editor' }"
        :aria-current="appView === 'editor' ? 'page' : undefined"
        @click="emit('goEditor')"
      >
        {{ t('app.navEditor') }}
      </button>
      <button
        type="button"
        class="icon-btn"
        :class="{ active: appView === 'settings' }"
        :title="t('app.settings')"
        :aria-label="t('app.settings')"
        :aria-pressed="appView === 'settings'"
        @click="emit('openSettings')"
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
</template>

<style scoped>
.app-header {
  flex-shrink: 0;
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
  padding: 10px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  z-index: 20;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.header-new {
  flex-shrink: 0;
}

.header-title {
  display: flex;
  align-items: baseline;
  gap: 12px;
  cursor: pointer;
  min-width: 0;
}

.header-title h1 {
  margin: 0;
  font-size: 18px;
  white-space: nowrap;
}

.subtitle {
  font-size: 13px;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-nav {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.nav-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 6px 12px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #334155;
  font-size: 13px;
  text-decoration: none;
  line-height: 1.2;
}

.nav-link:hover {
  background: #f1f5f9;
}

.nav-link.active,
.icon-btn.active {
  background: #e2e8f0;
  color: #0f172a;
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
  border: none;
  background: transparent;
  border-radius: 6px;
}

.icon-btn:hover {
  background: #f1f5f9;
}

@media (max-width: 820px) {
  .subtitle {
    display: none;
  }
}

@media (max-width: 560px) {
  .header-title h1 {
    display: none;
  }
}
</style>
