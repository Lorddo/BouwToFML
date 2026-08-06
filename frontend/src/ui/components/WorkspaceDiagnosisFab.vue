<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import bellIcon from '@/ui/assets/diagnosis-bell.png'

const props = defineProps<{
  visible: boolean
  exportDiagnosisReport: () => void | Promise<void>
}>()

const { t } = useI18n()
const busy = ref(false)

async function onClick() {
  if (busy.value) return
  busy.value = true
  try {
    await props.exportDiagnosisReport()
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <button
    v-if="visible"
    type="button"
    class="diagnosis-fab"
    :class="{ 'is-busy': busy }"
    :disabled="busy"
    :title="t('diagnosis.fabTooltip')"
    :aria-label="t('diagnosis.fabAria')"
    @click="onClick"
  >
    <img :src="bellIcon" alt="" class="diagnosis-fab-icon" draggable="false" />
  </button>
</template>

<style scoped>
.diagnosis-fab {
  position: fixed;
  right: 10px;
  bottom: 10px;
  z-index: 40;
  box-sizing: content-box;
  width: 25px;
  height: 25px;
  padding: 1px;
  border: none;
  border-radius: 50%;
  background: #fff;
  background-clip: content-box;
  box-shadow:
    inset 0 0 0 1px #e2e8f0,
    0 2px 8px rgb(15 23 42 / 18%);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.diagnosis-fab-icon {
  width: 12px;
  height: 12px;
  object-fit: contain;
  display: block;
  pointer-events: none;
}

.diagnosis-fab:hover:not(:disabled) {
  background: #f8fafc;
  background-clip: content-box;
}

.diagnosis-fab.is-busy,
.diagnosis-fab:disabled {
  opacity: 0.65;
  cursor: wait;
}

.diagnosis-fab:focus-visible {
  outline: 2px solid #f59e0b;
  outline-offset: 2px;
}
</style>
