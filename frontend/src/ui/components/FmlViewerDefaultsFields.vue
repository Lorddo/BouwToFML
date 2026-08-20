<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { ViewerSessionDefaults } from '@/core/fml/viewer-session-defaults'

defineProps<{
  defaults: ViewerSessionDefaults
  hint?: string
}>()

const emit = defineEmits<{
  number: [field: keyof ViewerSessionDefaults, event: Event]
  bool: [field: 'bovenlichtDefault' | 'windowBovenlichtDefault', event: Event]
}>()

const { t } = useI18n()
</script>

<template>
  <div class="viewer-defaults">
    <p v-if="hint" class="defaults-hint">{{ hint }}</p>
    <div class="defaults-grid">
      <label class="defaults-field">
        <span>{{ t('settings.wallHeightCm') }}</span>
        <input
          type="number"
          min="1"
          :value="defaults.wallHeightCm"
          @change="emit('number', 'wallHeightCm', $event)"
        />
      </label>
      <label class="defaults-field">
        <span>{{ t('settings.doorHeightCm') }}</span>
        <input
          type="number"
          min="1"
          :value="defaults.doorHeightCm"
          @change="emit('number', 'doorHeightCm', $event)"
        />
      </label>
      <label class="defaults-field">
        <span>{{ t('settings.windowHeightCm') }}</span>
        <input
          type="number"
          min="1"
          :value="defaults.windowHeightCm"
          @change="emit('number', 'windowHeightCm', $event)"
        />
      </label>
      <label class="defaults-field">
        <span>{{ t('settings.sillZCm') }}</span>
        <input
          type="number"
          min="0"
          :value="defaults.windowSillZCm"
          @change="emit('number', 'windowSillZCm', $event)"
        />
      </label>
      <label class="defaults-field">
        <span>{{ t('settings.bovenlichtGapCm') }}</span>
        <input
          type="number"
          min="0"
          :value="defaults.bovenlichtGapCm"
          @change="emit('number', 'bovenlichtGapCm', $event)"
        />
      </label>
      <label class="defaults-field">
        <span>{{ t('settings.bovenlichtHeightCm') }}</span>
        <input
          type="number"
          min="1"
          :value="defaults.bovenlichtHeightCm"
          @change="emit('number', 'bovenlichtHeightCm', $event)"
        />
      </label>
    </div>
    <label class="defaults-check">
      <input
        type="checkbox"
        :checked="defaults.bovenlichtDefault"
        @change="emit('bool', 'bovenlichtDefault', $event)"
      />
      <span>{{ t('settings.bovenlichtDoors') }}</span>
    </label>
    <label class="defaults-check">
      <input
        type="checkbox"
        :checked="defaults.windowBovenlichtDefault"
        @change="emit('bool', 'windowBovenlichtDefault', $event)"
      />
      <span>{{ t('settings.bovenlichtWindows') }}</span>
    </label>
  </div>
</template>

<style scoped>
.viewer-defaults {
  display: flex;
  flex-direction: column;
}

.defaults-hint {
  margin: 10px 0 8px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.4;
}

.defaults-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.defaults-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: #334155;
}

.defaults-field input {
  width: 100%;
  height: 28px;
  padding: 0 8px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 13px;
}

.defaults-check {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  font-size: 12px;
  color: #334155;
}
</style>
