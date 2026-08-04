<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

withDefaults(
  defineProps<{
    underlayOpacity?: number
    fmlOpacity?: number
    underlayAvailable?: boolean
  }>(),
  {
    underlayOpacity: 25,
    fmlOpacity: 80,
    underlayAvailable: false,
  },
)

const emit = defineEmits<{
  'update:underlayOpacity': [value: number]
  'update:fmlOpacity': [value: number]
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
</style>
