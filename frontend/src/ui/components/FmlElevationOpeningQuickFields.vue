<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { OpeningType } from '@/core/fml/types'
import { DOOR_ADD_SUBTYPES, WINDOW_ADD_SUBTYPES } from '@/core/fml/opening-add-presets'
import type { OpeningSubtypeDraft } from '@/ui/composables/fml-preview/fml-preview-opening-draft'
import ToolbeltIcon from './canvas/ToolbeltIcon.vue'
import './fml-toolbelt-settings-fields.css'

const props = withDefaults(
  defineProps<{
    type: OpeningType
    subtype: OpeningSubtypeDraft
    hingeAtStart?: boolean
    swingRight?: boolean
    showDoorButtons?: boolean
  }>(),
  {
    hingeAtStart: true,
    swingRight: false,
    showDoorButtons: true,
  },
)

const emit = defineEmits<{
  subtype: [subtype: OpeningSubtypeDraft]
  copy: []
  toggleHinge: []
  toggleSwing: []
}>()

const { t } = useI18n()

const doorOptions = computed(() =>
  DOOR_ADD_SUBTYPES.map((value) => ({
    value,
    label: t(`result.toolbar.doorSubtypes.${value}`),
  })),
)

const windowOptions = computed(() =>
  WINDOW_ADD_SUBTYPES.map((value) => ({
    value,
    label: t(`result.toolbar.windowSubtypes.${value}`),
  })),
)

const options = computed(() => (props.type === 'window' ? windowOptions.value : doorOptions.value))
const typeAria = computed(() =>
  props.type === 'window' ? t('result.toolbar.windowType') : t('result.toolbar.doorType'),
)
const isDoor = computed(() => props.type === 'door')
const showMirror = computed(() => props.subtype === 'triangle')
const hingeTitle = computed(() =>
  props.hingeAtStart ? t('result.toolbar.hingeAtStart') : t('result.toolbar.hingeAtEnd'),
)
const mirrorTitle = computed(() =>
  props.hingeAtStart
    ? t('result.toolbar.mirrorOpeningStart')
    : t('result.toolbar.mirrorOpeningEnd'),
)
const swingTitle = computed(() =>
  props.swingRight ? t('result.toolbar.swingRight') : t('result.toolbar.swingLeft'),
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
    v-if="showMirror && showDoorButtons"
    type="button"
    class="canvas-toolbelt__btn"
    :class="{ 'canvas-toolbelt__btn--active': !hingeAtStart }"
    :title="mirrorTitle"
    :aria-label="mirrorTitle"
    @click="emit('toggleHinge')"
  >
    <ToolbeltIcon name="mirror_h" />
  </button>
  <button
    v-if="isDoor && showDoorButtons"
    type="button"
    class="canvas-toolbelt__btn"
    :class="{ 'canvas-toolbelt__btn--active': !hingeAtStart }"
    :title="hingeTitle"
    :aria-label="hingeTitle"
    @click="emit('toggleHinge')"
  >
    <ToolbeltIcon name="hinge" />
  </button>
  <button
    v-if="isDoor && showDoorButtons"
    type="button"
    class="canvas-toolbelt__btn"
    :class="{ 'canvas-toolbelt__btn--active': swingRight }"
    :title="swingTitle"
    :aria-label="swingTitle"
    @click="emit('toggleSwing')"
  >
    <ToolbeltIcon name="swing" />
  </button>
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
