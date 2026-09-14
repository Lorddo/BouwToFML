<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChromeFitScale } from '@/ui/composables/useChromeFitScale'
import { loadUserSettings } from '@/ui/composables/settings/user-settings'
import ToolbeltIcon from './canvas/ToolbeltIcon.vue'

const DEFAULT_PLAN_HELP_KEYS = [
  'result.toolbar.hintDefault',
  'result.toolbar.hintMeasure',
  'result.toolbar.hintNulpunt',
  'result.toolbar.hintDrawWall',
  'result.toolbar.hintDrawRoom',
  'result.toolbar.hintDrawSurface',
  'result.toolbar.hintDrawRoof',
  'result.toolbar.hintDrawLabel',
  'result.toolbar.hintDrawLine',
  'result.toolbar.hintAddDoor',
  'result.toolbar.hintAddWindow',
  'result.toolbar.hintAddFixture',
  'result.toolbar.hintBoxSelect',
  'result.toolbar.hintAreaSideDims',
  'result.toolbar.hintWallMove',
  'result.toolbar.hintWallOne',
  'result.toolbar.hintJunction',
  'result.toolbar.hintDoorOne',
  'result.toolbar.hintWindowOne',
] as const

const props = defineProps<{
  canUndo: boolean
  canRedo: boolean
  hint?: string
  fullscreen?: boolean
  /** Geen app-header: topbar gebruikt safe-area. */
  edgeChrome?: boolean
  /** Inspect: geen teken-tips. */
  showHelp?: boolean
  /** i18n-keys voor de zoekbare help-lijst (default = editor). */
  helpKeys?: readonly string[]
  /** Viewport-vast hulpraster (settings). */
  showCanvasGrid?: boolean
  /** Plattegrond: toon dak-overlay-knop (niet op Dak/Gevels/stap 1–3). */
  showRoofOverlayToggle?: boolean
  /** Master dak-overlay op de plattegrond. */
  showRoofOverlayOnPlan?: boolean
}>()

const emit = defineEmits<{
  undo: []
  redo: []
  fit: []
  zoomIn: []
  zoomOut: []
  toggleFullscreen: []
  'update:showCanvasGrid': [value: boolean]
  'update:showRoofOverlayOnPlan': [value: boolean]
}>()

const { t } = useI18n()
const helpOpen = ref(false)
const helpQuery = ref('')
const topbarRef = ref<HTMLElement | null>(null)
useChromeFitScale(topbarRef)

const resolvedHelpKeys = computed(() => props.helpKeys ?? DEFAULT_PLAN_HELP_KEYS)

const helpItems = computed(() => {
  const q = helpQuery.value.trim().toLowerCase()
  const unit = loadUserSettings().scaleInputUnit
  const items = resolvedHelpKeys.value.map((key) => t(key, { count: 2, type: '…', unit }))
  if (!q) return items
  return items.filter((text) => text.toLowerCase().includes(q))
})

function toggleHelp(): void {
  helpOpen.value = !helpOpen.value
  if (!helpOpen.value) helpQuery.value = ''
}
</script>

<template>
  <div
    ref="topbarRef"
    class="editor-topbar"
    :class="{ 'editor-topbar--edge': props.edgeChrome }"
    data-fit-chrome="top"
    role="toolbar"
    :aria-label="t('viewer.topbarLabel')"
  >
    <button
      type="button"
      :disabled="!canUndo"
      :title="t('viewer.undo')"
      :aria-label="t('viewer.undo')"
      @click="emit('undo')"
    >
      <ToolbeltIcon name="undo" />
    </button>
    <button
      type="button"
      :disabled="!canRedo"
      :title="t('viewer.redo')"
      :aria-label="t('viewer.redo')"
      @click="emit('redo')"
    >
      <ToolbeltIcon name="redo" />
    </button>
    <button
      type="button"
      :title="t('viewer.fit')"
      :aria-label="t('viewer.fit')"
      @click="emit('fit')"
    >
      <ToolbeltIcon name="fit" />
    </button>
    <button
      type="button"
      :class="{ 'is-on': props.fullscreen }"
      :title="props.fullscreen ? t('viewer.fullscreenExit') : t('viewer.fullscreen')"
      :aria-label="props.fullscreen ? t('viewer.fullscreenExit') : t('viewer.fullscreen')"
      :aria-pressed="props.fullscreen === true"
      @click="emit('toggleFullscreen')"
    >
      <ToolbeltIcon :name="props.fullscreen ? 'fullscreen_exit' : 'fullscreen'" />
    </button>
    <button
      type="button"
      :title="t('viewer.zoomOut')"
      :aria-label="t('viewer.zoomOut')"
      @click="emit('zoomOut')"
    >
      −
    </button>
    <button
      type="button"
      :title="t('viewer.zoomIn')"
      :aria-label="t('viewer.zoomIn')"
      @click="emit('zoomIn')"
    >
      +
    </button>
    <button
      type="button"
      :class="{ 'is-on': props.showCanvasGrid === false }"
      :title="
        props.showCanvasGrid === false ? t('viewer.canvasGridShow') : t('viewer.canvasGridHide')
      "
      :aria-label="
        props.showCanvasGrid === false ? t('viewer.canvasGridShow') : t('viewer.canvasGridHide')
      "
      :aria-pressed="props.showCanvasGrid === false"
      @click="emit('update:showCanvasGrid', props.showCanvasGrid === false)"
    >
      <ToolbeltIcon name="grid_off" />
    </button>
    <button
      v-if="props.showRoofOverlayToggle === true"
      type="button"
      :class="{ 'is-on': props.showRoofOverlayOnPlan === false }"
      :title="
        props.showRoofOverlayOnPlan === false
          ? t('viewer.roofOverlayShow')
          : t('viewer.roofOverlayHide')
      "
      :aria-label="
        props.showRoofOverlayOnPlan === false
          ? t('viewer.roofOverlayShow')
          : t('viewer.roofOverlayHide')
      "
      :aria-pressed="props.showRoofOverlayOnPlan === false"
      @click="emit('update:showRoofOverlayOnPlan', props.showRoofOverlayOnPlan === false)"
    >
      <ToolbeltIcon name="roof" />
    </button>
    <button
      v-if="props.showHelp !== false"
      type="button"
      class="editor-topbar__info"
      :class="{ 'is-on': helpOpen }"
      :title="t('viewer.helpTitle')"
      :aria-pressed="helpOpen"
      @click="toggleHelp"
    >
      i
    </button>
  </div>
  <div
    v-if="helpOpen"
    class="editor-help-modal"
    :class="{ 'editor-help-modal--edge': props.edgeChrome }"
    role="dialog"
    aria-modal="true"
    :aria-label="t('viewer.helpTitle')"
  >
    <div class="editor-help-modal__backdrop" @click="toggleHelp" />
    <div class="editor-help-modal__card">
      <div class="editor-help-modal__head">
        <h3>{{ t('viewer.helpTitle') }}</h3>
        <button type="button" :title="t('viewer.closeMenu')" @click="toggleHelp">×</button>
      </div>
      <p v-if="props.hint" class="editor-help-modal__current">{{ props.hint }}</p>
      <input
        v-model="helpQuery"
        type="search"
        class="editor-help-modal__search"
        :placeholder="t('viewer.helpSearch')"
        :aria-label="t('viewer.helpSearch')"
      />
      <ul class="editor-help-modal__list">
        <li v-for="item in helpItems" :key="item">{{ item }}</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
@import '../plan-canvas/plan-canvas-tokens.css';

.editor-topbar {
  position: absolute;
  top: var(--plan-chrome-gap);
  left: 50%;
  transform: translateX(-50%) scale(var(--plan-chrome-fit-scale, 1));
  transform-origin: top center;
  z-index: var(--plan-z-topbar);
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 4px;
  height: 44px;
  max-width: calc(100% - 16px);
  box-sizing: border-box;
  padding: 4px 6px;
  background: rgb(255 255 255 / 0.96);
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-shadow: 0 4px 16px rgb(15 23 42 / 0.12);
  pointer-events: auto;
}
.editor-topbar--edge {
  top: var(--plan-chrome-safe-top);
  max-width: calc(100% - 16px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px));
}
.editor-topbar button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  height: 36px;
  min-width: 36px;
  padding: 0 8px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
  color: #0f172a;
  font-size: 13px;
}
.editor-topbar :deep(.canvas-toolbelt__icon) {
  width: 18px;
  height: 18px;
}
.editor-topbar button:disabled {
  opacity: 0.45;
}
.editor-topbar__info {
  font-weight: 700;
  font-style: italic;
}
.editor-topbar button.is-on,
.editor-topbar__info.is-on {
  background: #0f172a;
  color: #fff;
  border-color: #0f172a;
}

.editor-help-modal {
  position: absolute;
  inset: 0;
  z-index: 30;
  pointer-events: none;
}
.editor-help-modal__backdrop {
  position: absolute;
  inset: 0;
  background: rgb(15 23 42 / 0.28);
  pointer-events: auto;
}
.editor-help-modal--edge .editor-help-modal__card {
  top: max(60px, calc(env(safe-area-inset-top) + 52px));
}

.editor-help-modal__card {
  position: absolute;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  width: min(440px, calc(100% - 24px));
  max-height: min(70%, 480px);
  display: flex;
  flex-direction: column;
  padding: 12px 14px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-shadow: 0 12px 32px rgb(15 23 42 / 0.18);
  pointer-events: auto;
}
.editor-help-modal__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.editor-help-modal__head h3 {
  margin: 0;
  font-size: 14px;
}
.editor-help-modal__head button {
  min-width: 36px;
  min-height: 36px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
  font-size: 18px;
  line-height: 1;
}
.editor-help-modal__current {
  margin: 0 0 8px;
  font-size: 12px;
  color: #334155;
  line-height: 1.4;
}
.editor-help-modal__search {
  width: 100%;
  height: 36px;
  margin-bottom: 8px;
  padding: 0 10px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  box-sizing: border-box;
  font-size: 13px;
}
.editor-help-modal__list {
  margin: 0;
  padding: 0 0 0 16px;
  overflow: auto;
  font-size: 12px;
  color: #475569;
  line-height: 1.45;
}
.editor-help-modal__list li + li {
  margin-top: 8px;
}
</style>
