<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  DOOR_ADD_SUBTYPES,
  WINDOW_ADD_SUBTYPES,
  type DoorAddSubtype,
  type WindowAddSubtype,
} from '@/core/fml/opening-add-presets'
import { MIN_OPENING_HEIGHT_CM } from '@/ui/components/fml-preview-openings'
import type { FmlToolId } from './canvas/fmlToolbeltItems'
import './fml-toolbelt-settings-fields.css'

const addDoorSubtype = defineModel<DoorAddSubtype>('addDoorSubtype', { default: 'standard' })
const addDoorWidthCm = defineModel<number>('addDoorWidthCm', { default: 90 })
const addWindowSubtype = defineModel<WindowAddSubtype>('addWindowSubtype', { default: 'single' })
const addWindowWidthCm = defineModel<number>('addWindowWidthCm', { default: 100 })
const addWindowSillZCm = defineModel<number>('addWindowSillZCm', { default: 70 })
const addWindowHeightCm = defineModel<number>('addWindowHeightCm', { default: 150 })

defineProps<{
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
      <input
        v-model.number="addDoorWidthCm"
        type="number"
        min="10"
        max="400"
        step="1"
        class="fml-toolbelt__thickness-input"
        :aria-label="t('result.toolbar.doorSizeAria')"
        @change="releaseControlFocus"
      />
      <span class="fml-toolbelt__unit">cm</span>
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
      <input
        v-model.number="addWindowWidthCm"
        type="number"
        min="10"
        max="400"
        step="1"
        class="fml-toolbelt__thickness-input"
        :aria-label="t('result.toolbar.windowSizeAria')"
        @change="releaseControlFocus"
      />
      <span class="fml-toolbelt__unit">cm</span>
    </div>
  </div>
  <div v-if="activeTool === 'add_window'" class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.floor') }}</span>
    <div class="fml-toolbelt__field-controls">
      <input
        v-model.number="addWindowSillZCm"
        type="number"
        min="0"
        max="400"
        step="1"
        class="fml-toolbelt__thickness-input"
        :aria-label="t('result.toolbar.floorAria')"
        @change="releaseControlFocus"
      />
      <span class="fml-toolbelt__unit">cm</span>
    </div>
  </div>
  <div v-if="activeTool === 'add_window'" class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.glass') }}</span>
    <div class="fml-toolbelt__field-controls">
      <input
        v-model.number="addWindowHeightCm"
        type="number"
        :min="MIN_OPENING_HEIGHT_CM"
        max="500"
        step="1"
        class="fml-toolbelt__thickness-input"
        :aria-label="t('result.toolbar.glassAria')"
        @change="releaseControlFocus"
      />
      <span class="fml-toolbelt__unit">cm</span>
    </div>
  </div>
</template>
