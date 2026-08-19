<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ToolbeltIcon from './canvas/ToolbeltIcon.vue'

const settingsMod = defineModel<boolean>('settingsMod', { default: false })
const axisLockMod = defineModel<boolean>('axisLockMod', { default: false })
const moveMod = defineModel<boolean>('moveMod', { default: false })

const { t } = useI18n()

function toggleSettings(): void {
  settingsMod.value = !settingsMod.value
  if (settingsMod.value) moveMod.value = false
}

function toggleMove(): void {
  moveMod.value = !moveMod.value
  if (moveMod.value) settingsMod.value = false
}
</script>

<template>
  <div class="fml-mod-rail" role="toolbar" :aria-label="t('viewer.modRailLabel')">
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
  </div>
</template>

<style scoped>
.fml-mod-rail {
  position: absolute;
  left: max(8px, env(safe-area-inset-left));
  top: 50%;
  transform: translateY(-50%);
  z-index: 14;
  display: flex;
  flex-direction: column;
  gap: 6px;
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
.fml-mod-rail :deep(.canvas-toolbelt__icon) {
  width: 18px;
  height: 18px;
}
</style>
