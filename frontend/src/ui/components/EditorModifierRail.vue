<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ToolbeltIcon from './canvas/ToolbeltIcon.vue'
import {
  PLAN_AREA_SIDE_DIMS_TOOL_ID,
  getPlanSelectTools,
  type PlanToolId,
} from './canvas/planToolbeltItems'

const props = withDefaults(
  defineProps<{
    hideSelectTools?: boolean
  }>(),
  { hideSelectTools: false },
)

const settingsMod = defineModel<boolean>('settingsMod', { default: false })
const axisLockMod = defineModel<boolean>('axisLockMod', { default: false })
const moveMod = defineModel<boolean>('moveMod', { default: false })
const activeTool = defineModel<PlanToolId | null>('activeTool', { default: null })
const areaSideDimsVisible = defineModel<boolean>('areaSideDimsVisible', { default: false })

const { t, locale } = useI18n()

const selectTools = computed(() => {
  void locale.value
  return getPlanSelectTools()
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
  if (id === PLAN_AREA_SIDE_DIMS_TOOL_ID) return areaSideDimsVisible.value
  return activeTool.value === id
}

function onSelectTool(id: string): void {
  if (id === PLAN_AREA_SIDE_DIMS_TOOL_ID) {
    areaSideDimsVisible.value = !areaSideDimsVisible.value
    return
  }
  const next = activeTool.value === id ? null : (id as PlanToolId)
  activeTool.value = next
  if (next) moveMod.value = false
}
</script>

<template>
  <div
    class="editor-mod-rail"
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
    <template v-if="!props.hideSelectTools">
      <div class="editor-mod-rail__sep" aria-hidden="true" />
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
    </template>
  </div>
</template>

<style scoped>
@import '../plan-canvas/plan-canvas-tokens.css';

.editor-mod-rail {
  position: absolute;
  left: var(--plan-chrome-safe-left);
  top: 50%;
  transform: translateY(-50%);
  z-index: var(--plan-z-mod-rail);
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: calc(100% - 96px);
  overflow-y: auto;
}
.editor-mod-rail button {
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
.editor-mod-rail button.is-on {
  background: #0f172a;
  color: #fff;
  border-color: #0f172a;
}
.editor-mod-rail__sep {
  height: 1px;
  margin: 2px 8px;
  background: #cbd5e1;
}
.editor-mod-rail :deep(.canvas-toolbelt__icon) {
  width: 18px;
  height: 18px;
}
</style>
