<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { OpeningType } from '@/core/fml/types'
import type { DoorAddSubtype, WindowAddSubtype } from '@/core/fml/opening-add-presets'
import type { OpeningSubtypeDraft } from '@/ui/composables/fml-preview/fml-preview-opening-draft'
import ToolbeltIcon from './canvas/ToolbeltIcon.vue'
import './fml-toolbelt-settings-fields.css'

const props = defineProps<{
  type: OpeningType
  subtype: OpeningSubtypeDraft
}>()

const emit = defineEmits<{
  subtype: [subtype: OpeningSubtypeDraft]
  copy: []
}>()

const { t } = useI18n()

const doorOptions = computed(() =>
  (
    [
      'standard',
      'closet',
      'double',
      'double_solid',
      'pocket',
      'sliding_single',
      'sliding',
    ] as const satisfies readonly DoorAddSubtype[]
  ).map((value) => ({
    value,
    label: t(`result.toolbar.doorSubtypes.${value}`),
  })),
)

const windowOptions = computed(() =>
  (
    [
      'single',
      'double',
      'triple',
      'round',
      'half_round',
    ] as const satisfies readonly WindowAddSubtype[]
  ).map((value) => ({
    value,
    label: t(`result.toolbar.windowSubtypes.${value}`),
  })),
)

const options = computed(() => (props.type === 'window' ? windowOptions.value : doorOptions.value))
const typeAria = computed(() =>
  props.type === 'window' ? t('result.toolbar.windowType') : t('result.toolbar.doorType'),
)

function onSubtype(event: Event): void {
  const value = (event.target as HTMLSelectElement).value as OpeningSubtypeDraft
  if (!value) return
  emit('subtype', value)
  if (event.target instanceof HTMLElement) event.target.blur()
}
</script>

<template>
  <span class="fml-toolbelt__meta">
    {{ type === 'window' ? t('result.toolbar.windowOne') : t('result.toolbar.doorOne') }}
  </span>
  <div class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ typeAria }}</span>
    <div class="fml-toolbelt__field-controls">
      <select
        class="fml-toolbelt__select"
        :aria-label="typeAria"
        :value="subtype"
        @change="onSubtype"
      >
        <option v-for="opt in options" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
    </div>
  </div>
  <button
    type="button"
    class="canvas-toolbelt__btn"
    :title="t('result.toolbar.copyOpeningTitle')"
    :aria-label="t('result.toolbar.copyOpening')"
    @click="emit('copy')"
  >
    <ToolbeltIcon name="copy" />
  </button>
</template>
