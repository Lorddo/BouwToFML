<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  DOOR_ADD_SUBTYPES,
  WINDOW_ADD_SUBTYPES,
  type DoorAddSubtype,
  type WindowAddSubtype,
} from '@/core/fml/opening-add-presets'
import { MAX_OPENING_WIDTH_CM, MIN_OPENING_HEIGHT_CM } from '@/ui/components/fml-preview-openings'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import type { FmlToolId } from './canvas/fmlToolbeltItems'
import ScaleLengthInput from './ScaleLengthInput.vue'
import './fml-toolbelt-settings-fields.css'

const addDoorSubtype = defineModel<DoorAddSubtype>('addDoorSubtype', { default: 'standard' })
const addDoorWidthCm = defineModel<number>('addDoorWidthCm', { default: 90 })
const addWindowSubtype = defineModel<WindowAddSubtype>('addWindowSubtype', { default: 'single' })
const addWindowWidthCm = defineModel<number>('addWindowWidthCm', { default: 100 })
const addWindowSillZCm = defineModel<number>('addWindowSillZCm', { default: 70 })
const addWindowHeightCm = defineModel<number>('addWindowHeightCm', { default: 150 })

defineProps<{
  unit: ScaleInputUnit
  activeTool: FmlToolId | null
}>()

const { t } = useI18n()

const doorSubtypeOptions = computed(() =>
  DOOR_ADD_SUBTYPES.map((value) => ({
    value,
    label: t(`result.toolbar.doorSubtypes.${value}`),
  })),
)

const windowSubtypeOptions = computed(() =>
  WINDOW_ADD_SUBTYPES.map((value) => ({
    value,
    label: t(`result.toolbar.windowSubtypes.${value}`),
  })),
)

function releaseControlFocus(event: Event): void {
  const el = event.target
  if (el instanceof HTMLElement) el.blur()
}
</script>

<template>
  <div v-if="activeTool === 'add_door'" class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.doorType') }}</span>
    <div class="fml-toolbelt__field-controls">
      <select
        v-model="addDoorSubtype"
        class="fml-toolbelt__select"
        :aria-label="t('result.toolbar.doorType')"
        @change="releaseControlFocus"
      >
        <option v-for="opt in doorSubtypeOptions" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
    </div>
  </div>
  <div v-if="activeTool === 'add_door'" class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.size') }}</span>
    <div class="fml-toolbelt__field-controls">
      <ScaleLengthInput
        :cm="addDoorWidthCm"
        :unit="unit"
        :min-cm="10"
        :max-cm="MAX_OPENING_WIDTH_CM"
        :aria-label="t('result.toolbar.doorSizeAria', { unit: t(`common.${unit}`) })"
        input-class="fml-toolbelt__thickness-input"
        @update:cm="addDoorWidthCm = $event"
      />
    </div>
  </div>
  <div v-if="activeTool === 'add_window'" class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.windowType') }}</span>
    <div class="fml-toolbelt__field-controls">
      <select
        v-model="addWindowSubtype"
        class="fml-toolbelt__select"
        :aria-label="t('result.toolbar.windowType')"
        @change="releaseControlFocus"
      >
        <option v-for="opt in windowSubtypeOptions" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
    </div>
  </div>
  <div v-if="activeTool === 'add_window'" class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.size') }}</span>
    <div class="fml-toolbelt__field-controls">
      <ScaleLengthInput
        :cm="addWindowWidthCm"
        :unit="unit"
        :min-cm="10"
        :max-cm="MAX_OPENING_WIDTH_CM"
        :aria-label="t('result.toolbar.windowSizeAria', { unit: t(`common.${unit}`) })"
        input-class="fml-toolbelt__thickness-input"
        @update:cm="addWindowWidthCm = $event"
      />
    </div>
  </div>
  <div v-if="activeTool === 'add_window'" class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.floor') }}</span>
    <div class="fml-toolbelt__field-controls">
      <ScaleLengthInput
        :cm="addWindowSillZCm"
        :unit="unit"
        :min-cm="0"
        allow-zero
        :max-cm="400"
        :aria-label="t('result.toolbar.floorAria', { unit: t(`common.${unit}`) })"
        input-class="fml-toolbelt__thickness-input"
        @update:cm="addWindowSillZCm = $event"
      />
    </div>
  </div>
  <div v-if="activeTool === 'add_window'" class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.glass') }}</span>
    <div class="fml-toolbelt__field-controls">
      <ScaleLengthInput
        :cm="addWindowHeightCm"
        :unit="unit"
        :min-cm="MIN_OPENING_HEIGHT_CM"
        :max-cm="500"
        :aria-label="t('result.toolbar.glassAria', { unit: t(`common.${unit}`) })"
        input-class="fml-toolbelt__thickness-input"
        @update:cm="addWindowHeightCm = $event"
      />
    </div>
  </div>
</template>
