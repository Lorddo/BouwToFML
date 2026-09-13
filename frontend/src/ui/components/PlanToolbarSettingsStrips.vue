<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ToolbeltActionButton from './canvas/ToolbeltActionButton.vue'
import ToolbeltIcon from './canvas/ToolbeltIcon.vue'
import './canvas/canvas-toolbelt.css'
import type { BoxSelectKind } from '@/ui/composables/plan-canvas/plan-canvas-wall-select'
import type { MeasureDrawMode } from '@/ui/composables/plan-canvas/usePlanCanvasMeasure'
import { TOOLBELT_HOTKEY_PRIORITY } from '@/ui/composables/canvas/useToolbeltHotkey'

const props = defineProps<{
  showBoxSelectStrip?: boolean
  showMeasureStrip?: boolean
  boxSelectKind: BoxSelectKind
  measureDrawMode: MeasureDrawMode
  measurePersistEnabled?: boolean
  slicerEditMode?: boolean
  measureLineCount?: number
}>()

const emit = defineEmits<{
  'update:boxSelectKind': [value: BoxSelectKind]
  'update:measureDrawMode': [value: MeasureDrawMode]
  'update:slicerEditMode': [value: boolean]
  boxSelectAll: []
  clearMeasures: []
  deactivateDrawTool: []
}>()

const { t } = useI18n()

const boxSelectKindModel = computed({
  get: () => props.boxSelectKind,
  set: (value: BoxSelectKind) => emit('update:boxSelectKind', value),
})

const measureDrawModeModel = computed({
  get: () => props.measureDrawMode,
  set: (value: MeasureDrawMode) => emit('update:measureDrawMode', value),
})

const slicerEditModeModel = computed({
  get: () => props.slicerEditMode === true,
  set: (value: boolean) => emit('update:slicerEditMode', value),
})

const boxSelectAllTitle = computed(() => {
  if (props.boxSelectKind === 'door') return t('result.toolbar.boxSelectAllDoors')
  if (props.boxSelectKind === 'window') return t('result.toolbar.boxSelectAllWindows')
  if (props.boxSelectKind === 'all') return t('result.toolbar.boxSelectAllMixed')
  return t('result.toolbar.boxSelectAllWalls')
})

const measureCountLabel = computed(() => {
  const count = props.measureLineCount ?? 0
  return count === 1
    ? t('result.toolbar.measureCountOne', { count })
    : t('result.toolbar.measureCountMany', { count })
})
</script>

<template>
  <template v-if="showBoxSelectStrip">
    <div class="canvas-toolbelt-dock__sep" aria-hidden="true" />
    <div class="canvas-toolbelt-dock__section canvas-toolbelt-dock__section--plan">
      <label class="plan-toolbelt__meta plan-measure-mode">
        <span>{{ t('result.toolbar.boxSelectKindLabel') }}</span>
        <select v-model="boxSelectKindModel" class="plan-measure-mode__select">
          <option value="wall">{{ t('result.toolbar.boxSelectKindWall') }}</option>
          <option value="door">{{ t('result.toolbar.boxSelectKindDoor') }}</option>
          <option value="window">{{ t('result.toolbar.boxSelectKindWindow') }}</option>
          <option value="all">{{ t('result.toolbar.boxSelectKindAll') }}</option>
        </select>
      </label>
      <button
        type="button"
        class="plan-box-select-all"
        :title="boxSelectAllTitle"
        :aria-label="boxSelectAllTitle"
        @click="emit('boxSelectAll')"
      >
        {{ t('result.toolbar.boxSelectAll') }}
      </button>
      <ToolbeltActionButton
        icon="clear"
        :title="t('result.toolbar.deactivateDrawTool')"
        :aria-label="t('result.toolbar.deactivateDrawTool')"
        hotkey="Escape"
        :hotkey-priority="TOOLBELT_HOTKEY_PRIORITY.tool"
        @click="emit('deactivateDrawTool')"
      />
    </div>
  </template>

  <template v-if="showMeasureStrip">
    <div class="canvas-toolbelt-dock__sep" aria-hidden="true" />
    <div class="canvas-toolbelt-dock__section canvas-toolbelt-dock__section--plan">
      <label class="plan-toolbelt__meta plan-measure-mode">
        <span>{{ t('result.toolbar.measureModeLabel') }}</span>
        <select v-model="measureDrawModeModel" class="plan-measure-mode__select">
          <option value="tape">{{ t('result.toolbar.measureModeTape') }}</option>
          <option v-if="measurePersistEnabled" value="manual">
            {{ t('result.toolbar.measureModeManual') }}
          </option>
          <option v-if="measurePersistEnabled" value="slicer">
            {{ t('result.toolbar.measureModeSlicer') }}
          </option>
        </select>
      </label>
      <button
        v-if="measureDrawMode === 'slicer'"
        type="button"
        class="canvas-toolbelt__btn"
        :class="{ 'is-active': slicerEditModeModel }"
        :title="t('result.toolbar.slicerEditToggle')"
        :aria-label="t('result.toolbar.slicerEditToggle')"
        :aria-pressed="slicerEditModeModel"
        @click="slicerEditModeModel = !slicerEditModeModel"
      >
        <ToolbeltIcon name="edit" />
      </button>
      <span
        v-if="measureDrawMode === 'tape' && (measureLineCount ?? 0) > 0"
        class="plan-toolbelt__meta"
      >
        {{ measureCountLabel }}
      </span>
      <ToolbeltActionButton
        v-if="measureDrawMode === 'tape' && (measureLineCount ?? 0) > 0"
        icon="delete"
        :title="t('result.toolbar.clearMeasures')"
        :aria-label="t('result.toolbar.clearMeasures')"
        hotkey="Delete"
        :hotkey-priority="TOOLBELT_HOTKEY_PRIORITY.chrome"
        @click="emit('clearMeasures')"
      />
      <ToolbeltActionButton
        icon="clear"
        :title="t('result.toolbar.deactivateDrawTool')"
        :aria-label="t('result.toolbar.deactivateDrawTool')"
        hotkey="Escape"
        :hotkey-priority="TOOLBELT_HOTKEY_PRIORITY.tool"
        @click="emit('deactivateDrawTool')"
      />
    </div>
  </template>
</template>

<style scoped>
.plan-measure-mode {
  display: flex;
  align-items: center;
  gap: 6px;
}
.plan-measure-mode__select {
  height: 26px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 0 6px;
  font-size: 12px;
  background: #fff;
  color: #334155;
}
.plan-box-select-all {
  height: 26px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 0 8px;
  font-size: 12px;
  background: #fff;
  color: #334155;
  cursor: pointer;
}
.plan-box-select-all:hover {
  background: #f1f5f9;
}
</style>
