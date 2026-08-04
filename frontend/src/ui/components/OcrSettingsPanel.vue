<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { PreprocessConfig } from '@/core/extraction/types'

const model = defineModel<PreprocessConfig>({ required: true })

withDefaults(
  defineProps<{
    compact?: boolean
  }>(),
  { compact: true },
)

const { t } = useI18n()
</script>

<template>
  <div class="panel">
    <h3 v-if="!compact">{{ t('preprocess.ocrSettings.title') }}</h3>
    <template v-if="model.ocrEnabled">
      <label>
        <input v-model="model.ocrDetectVertical" type="checkbox" />
        {{ t('preprocess.ocrSettings.verticalText') }}
      </label>
      <label>
        {{ t('preprocess.ocrSettings.minConfidence') }}
        <div class="field-row">
          <input v-model.number="model.ocrMinConfidence" type="range" min="0" max="100" step="1" />
          <input
            v-model.number="model.ocrMinConfidence"
            type="number"
            min="0"
            max="100"
            step="1"
            class="num-input"
          />
        </div>
      </label>
    </template>
    <p v-else class="hint">{{ t('preprocess.ocrSettings.disabledHint') }}</p>
  </div>
</template>

<style scoped>
label {
  display: block;
  font-size: 13px;
  margin: 6px 0;
}

.hint {
  font-size: 12px;
  color: #64748b;
  margin: 0 0 8px;
}

.field-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.field-row input[type='range'] {
  flex: 1;
}

.num-input {
  width: 74px;
}
</style>
