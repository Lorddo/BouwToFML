<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import {
  FML_HIDE_PLAN_TEXT_CONTROL_VISIBLE,
  FML_ORIENT_CONTROLS_VISIBLE,
} from '@/ui/composables/workspace/constants'

const { t } = useI18n()

withDefaults(
  defineProps<{
    underlayOpacity?: number
    fmlOpacity?: number
    underlayAvailable?: boolean
    underlayMoveMode?: boolean
    underlayFlipX?: boolean
    /** true = kamer-/FML-labels verborgen. */
    hidePlanText?: boolean
  }>(),
  {
    underlayOpacity: 25,
    fmlOpacity: 80,
    underlayAvailable: false,
    underlayMoveMode: false,
    underlayFlipX: false,
    hidePlanText: false,
  },
)

const emit = defineEmits<{
  'update:underlayOpacity': [value: number]
  'update:fmlOpacity': [value: number]
  'update:underlayMoveMode': [value: boolean]
  'update:hidePlanText': [value: boolean]
  underlayRotate90Cw: []
  underlayRotate90Ccw: []
  underlayMirrorVertical: []
}>()

/** Focus loslaten na sleep — voorkomt dat Space+pan geblokkeerd blijft. */
function releaseSliderFocus(event: Event): void {
  const el = event.target
  if (el instanceof HTMLInputElement) el.blur()
}
</script>

<template>
  <div v-if="underlayAvailable" class="underlay-opacity">
    <div class="underlay-opacity__label">
      <span>{{ t('result.underlayOpacity') }}</span>
      <span>{{ underlayOpacity }}%</span>
    </div>
    <input
      type="range"
      min="0"
      max="100"
      step="1"
      :value="underlayOpacity"
      :aria-label="t('result.underlayOpacityAria')"
      @input="emit('update:underlayOpacity', Number(($event.target as HTMLInputElement).value))"
      @change="releaseSliderFocus"
      @pointerup="releaseSliderFocus"
    />
    <div class="underlay-orient">
      <button
        v-if="FML_ORIENT_CONTROLS_VISIBLE"
        type="button"
        class="underlay-orient__btn"
        :title="t('result.underlayRotate90CcwHint')"
        @click="emit('underlayRotate90Ccw')"
      >
        {{ t('result.underlayRotate90Ccw') }}
      </button>
      <button
        v-if="FML_ORIENT_CONTROLS_VISIBLE"
        type="button"
        class="underlay-orient__btn"
        :title="t('result.underlayRotate90CwHint')"
        @click="emit('underlayRotate90Cw')"
      >
        {{ t('result.underlayRotate90Cw') }}
      </button>
      <button
        v-if="FML_ORIENT_CONTROLS_VISIBLE"
        type="button"
        class="underlay-orient__btn"
        :class="{ 'underlay-orient__btn--active': underlayFlipX }"
        :title="t('result.underlayMirrorVerticalHint')"
        @click="emit('underlayMirrorVertical')"
      >
        {{ t('result.underlayMirrorVertical') }}
      </button>
      <button
        type="button"
        class="underlay-orient__btn"
        :class="{ 'underlay-orient__btn--active': underlayMoveMode }"
        :title="t('result.underlayMoveHint')"
        @click="emit('update:underlayMoveMode', !underlayMoveMode)"
      >
        {{ t('result.underlayMove') }}
      </button>
    </div>
  </div>
  <div class="underlay-opacity">
    <div class="underlay-opacity__label">
      <span>{{ t('result.fmlOpacity') }}</span>
      <span>{{ fmlOpacity }}%</span>
    </div>
    <input
      type="range"
      min="0"
      max="100"
      step="1"
      :value="fmlOpacity"
      :aria-label="t('result.fmlOpacityAria')"
      @input="emit('update:fmlOpacity', Number(($event.target as HTMLInputElement).value))"
      @change="releaseSliderFocus"
      @pointerup="releaseSliderFocus"
    />
  </div>
  <label v-if="FML_HIDE_PLAN_TEXT_CONTROL_VISIBLE" class="hide-plan-text">
    <input
      type="checkbox"
      :checked="hidePlanText"
      :aria-label="t('result.hidePlanTextAria')"
      @change="emit('update:hidePlanText', ($event.target as HTMLInputElement).checked)"
    />
    <span>{{ t('result.hidePlanText') }}</span>
  </label>
</template>

<style scoped>
.underlay-opacity {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0 0 8px;
  font-size: 12px;
  color: #334155;
  user-select: none;
}

.underlay-opacity__label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.underlay-opacity input[type='range'] {
  width: 100%;
  min-width: 0;
}

.underlay-orient {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.underlay-orient__btn {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #334155;
  border-radius: 4px;
  padding: 3px 6px;
  font-size: 11px;
  cursor: pointer;
}

.underlay-orient__btn--active {
  border-color: #3b82f6;
  background: #eff6ff;
  color: #1d4ed8;
}

.hide-plan-text {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 8px;
  font-size: 12px;
  color: #334155;
  cursor: pointer;
  user-select: none;
}

.hide-plan-text input {
  margin: 0;
}
</style>
