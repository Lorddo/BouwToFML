<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PreprocessConfig } from '@/core/extraction/types'
import { hasPendingInputRotation } from '@/platform/canvas/rotationPreview'
import ToolbeltIcon from './canvas/ToolbeltIcon.vue'

const model = defineModel<PreprocessConfig>({ required: true })
const props = withDefaults(
  defineProps<{
    canBake?: boolean
    baking?: boolean
  }>(),
  {
    canBake: false,
    baking: false,
  },
)
const emit = defineEmits<{
  bakeRotation: []
}>()

const { t } = useI18n()

const pendingRotation = computed(() => hasPendingInputRotation(model.value))
const bakeDisabled = computed(() => props.baking || !props.canBake || !pendingRotation.value)
</script>

<template>
  <div class="panel">
    <h3>{{ t('input.rotationTitle') }}</h3>
    <p class="hint">{{ t('input.bakeRotationHint') }}</p>
    <div class="setting-row">
      <span class="setting-label">{{ t('input.rotationLabel') }}</span>
      <div class="field-row">
        <input
          v-model.number="model.rotationDeg"
          type="range"
          min="-180"
          max="180"
          step="0.1"
          :disabled="baking"
        />
        <input
          v-model.number="model.rotationDeg"
          type="number"
          min="-180"
          max="180"
          step="0.1"
          class="num-input"
          :disabled="baking"
        />
      </div>
    </div>
    <button
      type="button"
      class="sidebar-icon-btn sidebar-icon-btn--primary"
      :disabled="bakeDisabled"
      @click="emit('bakeRotation')"
    >
      <ToolbeltIcon name="rotate_90" />
      <span>{{ baking ? t('input.bakingRotation') : t('input.bakeRotation') }}</span>
    </button>
  </div>
</template>

<style scoped>
.setting-row {
  display: grid;
  grid-template-columns: 108px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

.setting-label {
  font-size: 12px;
  color: #0f172a;
}

.field-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 74px;
  gap: 8px;
  align-items: center;
  width: 100%;
}

.field-row input[type='range'] {
  width: 100%;
  min-width: 0;
}

.num-input {
  width: 74px;
  min-width: 74px;
}

.hint {
  font-size: 12px;
  color: #666;
  margin: 4px 0;
}

.sidebar-icon-btn {
  margin-top: 8px;
}
</style>
