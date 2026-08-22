<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  MAX_BOVENLICHT_GAP_CM,
  MAX_BOVENLICHT_HEIGHT_CM,
  MIN_BOVENLICHT_GAP_CM,
  MIN_BOVENLICHT_HEIGHT_CM,
} from '@/core/fml/bovenlicht'
import type { OpeningType } from '@/core/fml/types'
import { MIN_OPENING_HEIGHT_CM } from '@/ui/components/fml-preview-openings'
import ToolbeltIcon from './canvas/ToolbeltIcon.vue'
import './fml-toolbelt-settings-fields.css'

const props = withDefaults(
  defineProps<{
    type: OpeningType
    widthCm: number
    heightCm: number
    sillZCm: number
    bovenlicht: boolean
    bovenlichtHeightCm: number
    bovenlichtGapCm: number
    bovenlichtPacked?: boolean
    hingeAtStart?: boolean
    swingRight?: boolean
    widthMixed?: boolean
    heightMixed?: boolean
    sillMixed?: boolean
    bovenlichtMixed?: boolean
    bovenlichtHeightMixed?: boolean
    bovenlichtGapMixed?: boolean
    hingeMixed?: boolean
    swingMixed?: boolean
    /** Dorpel altijd tonen (aanzicht) of alleen bij raam. */
    showSill?: boolean
    showDelete?: boolean
    showCopy?: boolean
    showDoorButtons?: boolean
    /** Driehoekraam: één spiegelknop (mirrored[0]), geen scharnier/draai. */
    showMirrorButton?: boolean
  }>(),
  {
    bovenlicht: false,
    bovenlichtHeightCm: 40,
    bovenlichtGapCm: 10,
    bovenlichtPacked: true,
    hingeAtStart: true,
    swingRight: false,
    widthMixed: false,
    heightMixed: false,
    sillMixed: false,
    bovenlichtMixed: false,
    bovenlichtHeightMixed: false,
    bovenlichtGapMixed: false,
    hingeMixed: false,
    swingMixed: false,
    showSill: undefined,
    showDelete: false,
    showCopy: false,
    showDoorButtons: true,
    showMirrorButton: false,
  },
)

const emit = defineEmits<{
  widthInput: [event: Event]
  width: [cm: number | null]
  heightInput: [event: Event]
  height: [cm: number | null]
  sillInput: [event: Event]
  sill: [cm: number | null]
  bovenlicht: [event: Event]
  bovenlichtHeightInput: [event: Event]
  bovenlichtHeight: [cm: number | null]
  bovenlichtGapInput: [event: Event]
  bovenlichtGap: [cm: number | null]
  toggleHinge: []
  toggleSwing: []
  copy: []
  remove: []
}>()

const { t } = useI18n()

const isDoor = computed(() => props.type === 'door')
const isWindow = computed(() => props.type === 'window')
const showSillField = computed(() => props.showSill ?? isWindow.value)
const showPacked = computed(() => props.bovenlichtPacked !== false)
const showBovenlichtMeasures = computed(
  () => showPacked.value && (props.bovenlicht || props.bovenlichtMixed),
)
const hingeTitle = computed(() => {
  if (props.hingeMixed) return t('result.toolbar.hingeMixed')
  return props.hingeAtStart ? t('result.toolbar.hingeAtStart') : t('result.toolbar.hingeAtEnd')
})
const swingTitle = computed(() => {
  if (props.swingMixed) return t('result.toolbar.swingMixed')
  return props.swingRight ? t('result.toolbar.swingRight') : t('result.toolbar.swingLeft')
})
const deleteTitle = computed(() =>
  isWindow.value ? t('result.toolbar.deleteWindow') : t('result.toolbar.deleteDoor'),
)
const mirrorTitle = computed(() => {
  if (props.hingeMixed) return t('result.toolbar.mirrorOpeningMixed')
  return props.hingeAtStart
    ? t('result.toolbar.mirrorOpeningStart')
    : t('result.toolbar.mirrorOpeningEnd')
})

function parseCm(event: Event): number | null {
  const raw = Number((event.target as HTMLInputElement).value)
  if (!Number.isFinite(raw)) return null
  return Math.round(raw)
}

function releaseFocus(event: Event): void {
  const el = event.target
  if (el instanceof HTMLElement) el.blur()
}

function onWidthChange(event: Event): void {
  emit('width', parseCm(event))
  releaseFocus(event)
}

function onHeightChange(event: Event): void {
  emit('height', parseCm(event))
  releaseFocus(event)
}

function onSillChange(event: Event): void {
  emit('sill', parseCm(event))
  releaseFocus(event)
}

function onBovenlicht(event: Event): void {
  emit('bovenlicht', event)
  releaseFocus(event)
}

function onBovenlichtHeightChange(event: Event): void {
  emit('bovenlichtHeight', parseCm(event))
  releaseFocus(event)
}

function onBovenlichtGapChange(event: Event): void {
  emit('bovenlichtGap', parseCm(event))
  releaseFocus(event)
}
</script>

<template>
  <div class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.width') }}</span>
    <div class="fml-toolbelt__field-controls">
      <input
        type="number"
        min="10"
        max="400"
        step="1"
        class="fml-toolbelt__thickness-input"
        :aria-label="
          isWindow ? t('result.toolbar.windowWidthAria') : t('result.toolbar.doorWidthAria')
        "
        :value="widthMixed ? '' : widthCm"
        :placeholder="widthMixed ? '—' : undefined"
        @input="emit('widthInput', $event)"
        @change="onWidthChange"
      />
      <span class="fml-toolbelt__unit">cm</span>
    </div>
  </div>
  <div v-if="isDoor || isWindow" class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{
      isWindow ? t('result.toolbar.glass') : t('result.toolbar.height')
    }}</span>
    <div class="fml-toolbelt__field-controls">
      <input
        type="number"
        :min="MIN_OPENING_HEIGHT_CM"
        max="500"
        step="1"
        class="fml-toolbelt__thickness-input"
        :aria-label="isWindow ? t('result.toolbar.glassAria') : t('result.toolbar.doorHeightAria')"
        :value="heightMixed ? '' : heightCm"
        :placeholder="heightMixed ? '—' : undefined"
        @input="emit('heightInput', $event)"
        @change="onHeightChange"
      />
      <span class="fml-toolbelt__unit">cm</span>
    </div>
  </div>
  <div v-if="showSillField" class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.floor') }}</span>
    <div class="fml-toolbelt__field-controls">
      <input
        type="number"
        min="0"
        max="400"
        step="1"
        class="fml-toolbelt__thickness-input"
        :aria-label="t('result.toolbar.floorAria')"
        :value="sillMixed ? '' : sillZCm"
        :placeholder="sillMixed ? '—' : undefined"
        @input="emit('sillInput', $event)"
        @change="onSillChange"
      />
      <span class="fml-toolbelt__unit">cm</span>
    </div>
  </div>
  <label
    v-if="showPacked && (isDoor || isWindow)"
    class="fml-toolbelt__field fml-toolbelt__field--checkbox"
    :title="t('result.toolbar.bovenlichtTitle')"
  >
    <input
      type="checkbox"
      :checked="bovenlicht"
      :indeterminate.prop="bovenlichtMixed"
      :aria-label="t('result.toolbar.bovenlicht')"
      @change="onBovenlicht"
    />
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.bovenlicht') }}</span>
  </label>
  <div v-if="showBovenlichtMeasures" class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.bovenlichtGap') }}</span>
    <div class="fml-toolbelt__field-controls">
      <input
        type="number"
        :min="MIN_BOVENLICHT_GAP_CM"
        :max="MAX_BOVENLICHT_GAP_CM"
        step="1"
        class="fml-toolbelt__thickness-input"
        :aria-label="t('result.toolbar.bovenlichtGapAria')"
        :value="bovenlichtGapMixed ? '' : bovenlichtGapCm"
        :placeholder="bovenlichtGapMixed ? '—' : undefined"
        @input="emit('bovenlichtGapInput', $event)"
        @change="onBovenlichtGapChange"
      />
      <span class="fml-toolbelt__unit">cm</span>
    </div>
  </div>
  <div v-if="showBovenlichtMeasures" class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.bovenlichtHeight') }}</span>
    <div class="fml-toolbelt__field-controls">
      <input
        type="number"
        :min="MIN_BOVENLICHT_HEIGHT_CM"
        :max="MAX_BOVENLICHT_HEIGHT_CM"
        step="1"
        class="fml-toolbelt__thickness-input"
        :aria-label="t('result.toolbar.bovenlichtHeightAria')"
        :value="bovenlichtHeightMixed ? '' : bovenlichtHeightCm"
        :placeholder="bovenlichtHeightMixed ? '—' : undefined"
        @input="emit('bovenlichtHeightInput', $event)"
        @change="onBovenlichtHeightChange"
      />
      <span class="fml-toolbelt__unit">cm</span>
    </div>
  </div>
  <button
    v-if="showMirrorButton"
    type="button"
    class="canvas-toolbelt__btn"
    :class="{ 'canvas-toolbelt__btn--active': !hingeMixed && !hingeAtStart }"
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
    :class="{ 'canvas-toolbelt__btn--active': !hingeMixed && !hingeAtStart }"
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
    :class="{ 'canvas-toolbelt__btn--active': !swingMixed && swingRight }"
    :title="swingTitle"
    :aria-label="swingTitle"
    @click="emit('toggleSwing')"
  >
    <ToolbeltIcon name="swing" />
  </button>
  <button
    v-if="showCopy"
    type="button"
    class="canvas-toolbelt__btn"
    :title="t('result.toolbar.copyOpeningTitle')"
    :aria-label="t('result.toolbar.copyOpening')"
    @click="emit('copy')"
  >
    <ToolbeltIcon name="copy" />
  </button>
  <button
    v-if="showDelete"
    type="button"
    class="canvas-toolbelt__btn"
    :title="deleteTitle"
    :aria-label="deleteTitle"
    @click="emit('remove')"
  >
    <ToolbeltIcon name="delete" />
  </button>
</template>
