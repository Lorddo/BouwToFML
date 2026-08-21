<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ToolbeltIcon from './canvas/ToolbeltIcon.vue'
import {
  FML_AREA_SIDE_DIMS_TOOL_ID,
  getFmlSelectTools,
  type FmlToolId,
} from './canvas/fmlToolbeltItems'

const settingsMod = defineModel<boolean>('settingsMod', { default: false })
const axisLockMod = defineModel<boolean>('axisLockMod', { default: false })
const moveMod = defineModel<boolean>('moveMod', { default: false })
const activeTool = defineModel<FmlToolId | null>('activeTool', { default: null })
const areaSideDimsVisible = defineModel<boolean>('areaSideDimsVisible', { default: false })

const { t, locale } = useI18n()

const selectTools = computed(() => {
  void locale.value
  return getFmlSelectTools()
})

function toggleSettings(): void {
  settingsMod.value = !settingsMod.value
  if (settingsMod.value) moveMod.value = false
}

function toggleMove(): void {
  moveMod.value = !moveMod.value
  if (moveMod.value) settingsMod.value = false
}

function isSelectActive(id: string): boolean {
  if (id === FML_AREA_SIDE_DIMS_TOOL_ID) return areaSideDimsVisible.value
  return activeTool.value === id
}

function onSelectTool(id: string): void {
  if (id === FML_AREA_SIDE_DIMS_TOOL_ID) {
    areaSideDimsVisible.value = !areaSideDimsVisible.value
    return
  }
  const next = activeTool.value === id ? null : (id as FmlToolId)
  activeTool.value = next
  if (next) moveMod.value = false
}
</script>

<template>
  <div
    class="fml-mod-rail"
    data-fit-chrome="left"
    role="toolbar"
    :aria-label="t('viewer.modRailLabel')"
  >
    <button
      type="button"
      :class="{ 'is-on': settingsMod }"
      :aria-pressed="settingsMod"
      :title="t('viewer.modSettings')"
      :aria-label="t('viewer.modSettings')"
      @click="toggleSettings"
    >
      <ToolbeltIcon name="settings" />
    </button>
    <button
      type="button"
      :class="{ 'is-on': axisLockMod }"
      :aria-pressed="axisLockMod"
      :title="t('viewer.modAxis')"
      :aria-label="t('viewer.modAxis')"
      @click="axisLockMod = !axisLockMod"
    >
      <ToolbeltIcon name="axis" />
    </button>
    <button
      type="button"
      :class="{ 'is-on': moveMod }"
      :aria-pressed="moveMod"
      :title="t('viewer.modMove')"
      :aria-label="t('viewer.modMove')"
      @click="toggleMove"
    >
      <ToolbeltIcon name="move" />
    </button>
    <div class="fml-mod-rail__sep" aria-hidden="true" />
    <button
      v-for="tool in selectTools"
      :key="tool.id"
      type="button"
      :class="{ 'is-on': isSelectActive(tool.id) }"
      :aria-pressed="isSelectActive(tool.id)"
      :title="tool.label"
      :aria-label="tool.label"
      @click="onSelectTool(tool.id)"
    >
      <ToolbeltIcon :name="tool.icon" />
    </button>
  </div>
</template>

<style scoped>
@import '../fml-preview/fml-canvas-tokens.css';

.fml-mod-rail {
  position: absolute;
  left: var(--fml-chrome-safe-left);
  top: 50%;
  transform: translateY(-50%);
  z-index: var(--fml-z-mod-rail);
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: calc(100% - 96px);
  overflow-y: auto;
}
.fml-mod-rail button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: rgb(255 255 255 / 0.94);
  color: #0f172a;
  box-shadow: 0 2px 8px rgb(15 23 42 / 0.1);
}
.fml-mod-rail button.is-on {
  background: #0f172a;
  color: #fff;
  border-color: #0f172a;
}
.fml-mod-rail__sep {
  height: 1px;
  margin: 2px 8px;
  background: #cbd5e1;
}
.fml-mod-rail :deep(.canvas-toolbelt__icon) {
  width: 18px;
  height: 18px;
}
</style>
