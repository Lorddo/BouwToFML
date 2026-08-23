<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { ViewerSessionDefaults } from '@/core/fml/viewer-session-defaults'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import ScaleLengthInput from './ScaleLengthInput.vue'

defineProps<{
  defaults: ViewerSessionDefaults
  unit: ScaleInputUnit
  /** Project-flag: flags+export-expand (true) vs losse ramen (false). Default true. */
  bovenlichtPacked?: boolean
  hint?: string
}>()

const emit = defineEmits<{
  cm: [field: keyof ViewerSessionDefaults, cm: number]
  bool: [field: 'bovenlichtDefault' | 'windowBovenlichtDefault', event: Event]
  packed: [packed: boolean]
}>()

const { t } = useI18n()
</script>

<template>
  <div class="viewer-defaults">
    <p v-if="hint" class="defaults-hint">{{ hint }}</p>
    <div class="defaults-grid">
      <label class="defaults-field">
        <span>{{ t('settings.wallHeightCm') }}</span>
        <ScaleLengthInput
          block
          :cm="defaults.wallHeightCm"
          :unit="unit"
          :min-cm="1"
          @update:cm="emit('cm', 'wallHeightCm', $event)"
        />
      </label>
      <label class="defaults-field">
        <span>{{ t('settings.doorHeightCm') }}</span>
        <ScaleLengthInput
          block
          :cm="defaults.doorHeightCm"
          :unit="unit"
          :min-cm="1"
          @update:cm="emit('cm', 'doorHeightCm', $event)"
        />
      </label>
      <label class="defaults-field">
        <span>{{ t('settings.windowHeightCm') }}</span>
        <ScaleLengthInput
          block
          :cm="defaults.windowHeightCm"
          :unit="unit"
          :min-cm="1"
          @update:cm="emit('cm', 'windowHeightCm', $event)"
        />
      </label>
      <label class="defaults-field">
        <span>{{ t('settings.sillZCm') }}</span>
        <ScaleLengthInput
          block
          :cm="defaults.windowSillZCm"
          :unit="unit"
          :min-cm="0"
          allow-zero
          @update:cm="emit('cm', 'windowSillZCm', $event)"
        />
      </label>
      <label class="defaults-field">
        <span>{{ t('settings.bovenlichtGapCm') }}</span>
        <ScaleLengthInput
          block
          :cm="defaults.bovenlichtGapCm"
          :unit="unit"
          :min-cm="0"
          allow-zero
          @update:cm="emit('cm', 'bovenlichtGapCm', $event)"
        />
      </label>
      <label class="defaults-field">
        <span>{{ t('settings.bovenlichtHeightCm') }}</span>
        <ScaleLengthInput
          block
          :cm="defaults.bovenlichtHeightCm"
          :unit="unit"
          :min-cm="1"
          @update:cm="emit('cm', 'bovenlichtHeightCm', $event)"
        />
      </label>
    </div>
    <label class="defaults-check" :title="t('settings.bovenlichtPackedHint')">
      <input
        type="checkbox"
        :checked="bovenlichtPacked !== false"
        @change="emit('packed', ($event.target as HTMLInputElement).checked)"
      />
      <span>{{ t('settings.bovenlichtPacked') }}</span>
    </label>
    <p class="defaults-packed-hint">{{ t('settings.bovenlichtPackedHint') }}</p>
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

.defaults-check {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  font-size: 12px;
  color: #334155;
}

.defaults-packed-hint {
  margin: 2px 0 0 22px;
  font-size: 11px;
  color: #64748b;
  line-height: 1.35;
}
</style>
