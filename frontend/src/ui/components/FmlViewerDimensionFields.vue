<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { DimensionMode, DimensionSettings } from '@/core/fml/fml-dimension-settings'
import type { DimensionVis } from '@/core/fml/fml-dimension-vis'

defineProps<{
  settings: DimensionSettings
  vis: DimensionVis
  canClear: boolean
}>()

const emit = defineEmits<{
  'update:vis': [vis: DimensionVis]
  auto: [enabled: boolean]
  mode: [mode: DimensionMode]
  outer: [enabled: boolean]
  clearActive: []
}>()

const { t } = useI18n()
</script>

<template>
  <div class="viewer-dimensions">
    <label class="dim-field">
      <span class="dim-field-label">{{ t('viewer.dimensionsVis') }}</span>
      <select
        class="dim-select"
        :value="vis"
        @change="emit('update:vis', ($event.target as HTMLSelectElement).value as DimensionVis)"
      >
        <option value="none">{{ t('viewer.dimensionsVisNone') }}</option>
        <option value="autogen">{{ t('viewer.dimensionsVisAutogen') }}</option>
        <option value="slicer">{{ t('viewer.dimensionsVisSlicer') }}</option>
        <option value="manual">{{ t('viewer.dimensionsVisManual') }}</option>
      </select>
    </label>

    <template v-if="vis === 'autogen'">
      <label class="defaults-check">
        <input
          type="checkbox"
          :checked="settings.engineAutoDims"
          @change="emit('auto', ($event.target as HTMLInputElement).checked)"
        />
        <span>{{ t('viewer.dimensionsAuto') }}</span>
      </label>
      <div class="dim-mode" role="group" :aria-label="t('viewer.dimensionsMode')">
        <span class="dim-mode-label">{{ t('viewer.dimensionsMode') }}</span>
        <div class="dim-mode-seg">
          <button
            type="button"
            class="dim-mode-btn"
            :class="{ 'is-on': settings.dimensionMode === 'interior' }"
            :disabled="!settings.engineAutoDims"
            @click="emit('mode', 'interior')"
          >
            {{ t('viewer.dimensionsInterior') }}
          </button>
          <button
            type="button"
            class="dim-mode-btn"
            :class="{ 'is-on': settings.dimensionMode === 'exterior' }"
            :disabled="!settings.engineAutoDims"
            @click="emit('mode', 'exterior')"
          >
            {{ t('viewer.dimensionsExterior') }}
          </button>
        </div>
      </div>
      <label class="defaults-check">
        <input
          type="checkbox"
          :checked="settings.generateOuterDimension"
          :disabled="!settings.engineAutoDims"
          @change="emit('outer', ($event.target as HTMLInputElement).checked)"
        />
        <span>{{ t('viewer.dimensionsOuter') }}</span>
      </label>
    </template>

    <template v-else-if="vis === 'slicer'">
      <div class="dim-mode" role="group" :aria-label="t('viewer.dimensionsMode')">
        <span class="dim-mode-label">{{ t('viewer.dimensionsMode') }}</span>
        <div class="dim-mode-seg">
          <button
            type="button"
            class="dim-mode-btn"
            :class="{ 'is-on': settings.dimensionMode === 'interior' }"
            @click="emit('mode', 'interior')"
          >
            {{ t('viewer.dimensionsInterior') }}
          </button>
          <button
            type="button"
            class="dim-mode-btn"
            :class="{ 'is-on': settings.dimensionMode === 'exterior' }"
            @click="emit('mode', 'exterior')"
          >
            {{ t('viewer.dimensionsExterior') }}
          </button>
        </div>
      </div>
    </template>

    <button
      type="button"
      class="dim-clear"
      :disabled="!canClear || vis === 'none'"
      @click="emit('clearActive')"
    >
      {{ t('viewer.dimensionsClearActive') }}
    </button>
  </div>
</template>

<style scoped>
.viewer-dimensions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 0 4px;
}

.dim-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
}

.dim-field-label,
.dim-mode-label {
  font-size: 12px;
  color: #334155;
}

.dim-select {
  height: 28px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 0 8px;
  font-size: 12px;
  color: #334155;
  background: #fff;
}

.defaults-check {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  color: #334155;
}

.defaults-check input:disabled + span {
  color: #94a3b8;
}

.dim-mode {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dim-mode-seg {
  display: flex;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  overflow: hidden;
}

.dim-mode-btn {
  flex: 1;
  height: 28px;
  border: 0;
  background: #fff;
  font-size: 12px;
  color: #334155;
  cursor: pointer;
}

.dim-mode-btn + .dim-mode-btn {
  border-left: 1px solid #cbd5e1;
}

.dim-mode-btn.is-on {
  background: #e2e8f0;
  font-weight: 600;
}

.dim-mode-btn:disabled {
  color: #94a3b8;
  cursor: default;
}

.dim-clear {
  height: 28px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
  font-size: 12px;
  color: #334155;
  cursor: pointer;
}

.dim-clear:disabled {
  color: #94a3b8;
  cursor: default;
}
</style>
