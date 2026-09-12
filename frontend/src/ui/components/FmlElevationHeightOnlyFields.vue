<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import ScaleLengthInput from './ScaleLengthInput.vue'
import './fml-toolbelt-settings-fields.css'

withDefaults(
  defineProps<{
    unit: ScaleInputUnit
    title: string
    heightCm: number
    min?: number
    max?: number
    /** Muurbodem vanaf vloer; alleen bij muur-settings. */
    bottomZCm?: number | null
    showBottomZ?: boolean
  }>(),
  {
    min: 0,
    max: 800,
    bottomZCm: null,
    showBottomZ: false,
  },
)

const emit = defineEmits<{
  height: [cm: number]
  bottomZ: [cm: number]
}>()

const { t } = useI18n()
</script>

<template>
  <span class="fml-toolbelt__meta">{{ title }}</span>
  <div v-if="showBottomZ" class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.floor') }}</span>
    <div class="fml-toolbelt__field-controls">
      <ScaleLengthInput
        :cm="bottomZCm ?? 0"
        :unit="unit"
        :min-cm="0"
        allow-zero
        :max-cm="2000"
        :aria-label="t('result.toolbar.floorAria', { unit: t(`common.${unit}`) })"
        input-class="fml-toolbelt__thickness-input"
        @update:cm="emit('bottomZ', $event)"
      />
    </div>
  </div>
  <div class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.height') }}</span>
    <div class="fml-toolbelt__field-controls">
      <ScaleLengthInput
        :cm="heightCm"
        :unit="unit"
        :min-cm="min ?? 0"
        :max-cm="max ?? 800"
        :allow-zero="(min ?? 0) <= 0"
        :allow-negative="(min ?? 0) < 0"
        :aria-label="t('result.toolbar.height')"
        input-class="fml-toolbelt__thickness-input"
        @update:cm="emit('height', $event)"
      />
    </div>
  </div>
</template>
