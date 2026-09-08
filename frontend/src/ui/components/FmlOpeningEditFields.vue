<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  MAX_BOVENLICHT_GAP_CM,
  MAX_BOVENLICHT_HEIGHT_CM,
  MIN_BOVENLICHT_GAP_CM,
  MIN_BOVENLICHT_HEIGHT_CM,
} from '@/core/fml/bovenlicht'
import type { OpeningType } from '@/core/fml/types'
import { MAX_OPENING_WIDTH_CM, MIN_OPENING_HEIGHT_CM } from '@/ui/components/fml-preview-openings'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import ScaleLengthInput from './ScaleLengthInput.vue'
import ToolbeltActionButton from './canvas/ToolbeltActionButton.vue'
import ToolbeltIcon from './canvas/ToolbeltIcon.vue'
import './fml-toolbelt-settings-fields.css'
import { TOOLBELT_HOTKEY_PRIORITY } from '@/ui/composables/canvas/useToolbeltHotkey'

const props = withDefaults(
  defineProps<{
    unit: ScaleInputUnit
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
    /** Alleen breedte/hoogte/vloer (gewone klik); geen type-extra's. */
    compact?: boolean
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
    compact: false,
  },
)

const emit = defineEmits<{
  widthInput: [cm: number]
  width: [cm: number]
  heightInput: [cm: number]
  height: [cm: number]
  sillInput: [cm: number]
  sill: [cm: number]
  bovenlicht: [event: Event]
  bovenlichtHeightInput: [cm: number]
  bovenlichtHeight: [cm: number]
  bovenlichtGapInput: [cm: number]
  bovenlichtGap: [cm: number]
  toggleHinge: []
  toggleSwing: []
  copy: []
  remove: []
}>()

const { t } = useI18n()

const isDoor = computed(() => props.type === 'door')
const isWindow = computed(() => props.type === 'window')
const showSillField = computed(() => props.showSill ?? (isWindow.value || isDoor.value))
const showPacked = computed(() => !props.compact && props.bovenlichtPacked !== false)
const showBovenlichtMeasures = computed(
  () => !props.compact && showPacked.value && (props.bovenlicht || props.bovenlichtMixed),
)
const showExtras = computed(() => !props.compact)
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

const lastWidthCm = ref(props.widthCm)
const lastHeightCm = ref(props.heightCm)
const lastSillCm = ref(props.sillZCm)
const lastBovenlichtHeightCm = ref(props.bovenlichtHeightCm)
const lastBovenlichtGapCm = ref(props.bovenlichtGapCm)

watch(
  () => props.widthCm,
  (v) => {
    lastWidthCm.value = v
  },
)
watch(
  () => props.heightCm,
  (v) => {
    lastHeightCm.value = v
  },
)
watch(
  () => props.sillZCm,
  (v) => {
    lastSillCm.value = v
  },
)
watch(
  () => props.bovenlichtHeightCm,
  (v) => {
    lastBovenlichtHeightCm.value = v
  },
)
watch(
  () => props.bovenlichtGapCm,
  (v) => {
    lastBovenlichtGapCm.value = v
  },
)

function releaseFocus(event: Event): void {
  const el = event.target
  if (el instanceof HTMLElement) el.blur()
}

function onWidthCm(cm: number): void {
  lastWidthCm.value = cm
  emit('widthInput', cm)
}
function onWidthCommit(): void {
  emit('width', lastWidthCm.value)
}

function onHeightCm(cm: number): void {
  lastHeightCm.value = cm
  emit('heightInput', cm)
}
function onHeightCommit(): void {
  emit('height', lastHeightCm.value)
}

function onSillCm(cm: number): void {
  lastSillCm.value = cm
  emit('sillInput', cm)
}
function onSillCommit(): void {
  emit('sill', lastSillCm.value)
}

function onBovenlicht(event: Event): void {
  emit('bovenlicht', event)
  releaseFocus(event)
}

function onBovenlichtHeightCm(cm: number): void {
  lastBovenlichtHeightCm.value = cm
  emit('bovenlichtHeightInput', cm)
}
function onBovenlichtHeightCommit(): void {
  emit('bovenlichtHeight', lastBovenlichtHeightCm.value)
}

function onBovenlichtGapCm(cm: number): void {
  lastBovenlichtGapCm.value = cm
  emit('bovenlichtGapInput', cm)
}
function onBovenlichtGapCommit(): void {
  emit('bovenlichtGap', lastBovenlichtGapCm.value)
}
</script>

<template>
  <div class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.width') }}</span>
    <div class="fml-toolbelt__field-controls">
      <ScaleLengthInput
        :cm="widthCm"
        :unit="unit"
        :min-cm="10"
        :max-cm="MAX_OPENING_WIDTH_CM"
        :mixed="widthMixed"
        :aria-label="
          isWindow
            ? t('result.toolbar.windowWidthAria', { unit: t(`common.${unit}`) })
            : t('result.toolbar.doorWidthAria', { unit: t(`common.${unit}`) })
        "
        input-class="fml-toolbelt__thickness-input"
        @update:cm="onWidthCm"
        @commit="onWidthCommit"
      />
    </div>
  </div>
  <div v-if="isDoor || isWindow" class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{
      isWindow ? t('result.toolbar.glass') : t('result.toolbar.height')
    }}</span>
    <div class="fml-toolbelt__field-controls">
      <ScaleLengthInput
        :cm="heightCm"
        :unit="unit"
        :min-cm="MIN_OPENING_HEIGHT_CM"
        :max-cm="500"
        :mixed="heightMixed"
        :aria-label="
          isWindow
            ? t('result.toolbar.glassAria', { unit: t(`common.${unit}`) })
            : t('result.toolbar.doorHeightAria', { unit: t(`common.${unit}`) })
        "
        input-class="fml-toolbelt__thickness-input"
        @update:cm="onHeightCm"
        @commit="onHeightCommit"
      />
    </div>
  </div>
  <div v-if="showSillField" class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.floor') }}</span>
    <div class="fml-toolbelt__field-controls">
      <ScaleLengthInput
        :cm="sillZCm"
        :unit="unit"
        :min-cm="0"
        allow-zero
        :max-cm="400"
        :mixed="sillMixed"
        :aria-label="t('result.toolbar.floorAria', { unit: t(`common.${unit}`) })"
        input-class="fml-toolbelt__thickness-input"
        @update:cm="onSillCm"
        @commit="onSillCommit"
      />
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
      <ScaleLengthInput
        :cm="bovenlichtGapCm"
        :unit="unit"
        :min-cm="MIN_BOVENLICHT_GAP_CM"
        :max-cm="MAX_BOVENLICHT_GAP_CM"
        :allow-zero="MIN_BOVENLICHT_GAP_CM <= 0"
        :mixed="bovenlichtGapMixed"
        :aria-label="t('result.toolbar.bovenlichtGapAria', { unit: t(`common.${unit}`) })"
        input-class="fml-toolbelt__thickness-input"
        @update:cm="onBovenlichtGapCm"
        @commit="onBovenlichtGapCommit"
      />
    </div>
  </div>
  <div v-if="showBovenlichtMeasures" class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.bovenlichtHeight') }}</span>
    <div class="fml-toolbelt__field-controls">
      <ScaleLengthInput
        :cm="bovenlichtHeightCm"
        :unit="unit"
        :min-cm="MIN_BOVENLICHT_HEIGHT_CM"
        :max-cm="MAX_BOVENLICHT_HEIGHT_CM"
        :mixed="bovenlichtHeightMixed"
        :aria-label="t('result.toolbar.bovenlichtHeightAria', { unit: t(`common.${unit}`) })"
        input-class="fml-toolbelt__thickness-input"
        @update:cm="onBovenlichtHeightCm"
        @commit="onBovenlichtHeightCommit"
      />
    </div>
  </div>
  <button
    v-if="showExtras && showMirrorButton"
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
    v-if="showExtras && isDoor && showDoorButtons"
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
    v-if="showExtras && isDoor && showDoorButtons"
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
    v-if="showExtras && showCopy"
    type="button"
    class="canvas-toolbelt__btn"
    :title="t('result.toolbar.copyOpeningTitle')"
    :aria-label="t('result.toolbar.copyOpening')"
    @click="emit('copy')"
  >
    <ToolbeltIcon name="copy" />
  </button>
  <ToolbeltActionButton
    v-if="showExtras && showDelete"
    icon="delete"
    :title="deleteTitle"
    :aria-label="deleteTitle"
    hotkey="Delete"
    :hotkey-priority="TOOLBELT_HOTKEY_PRIORITY.object"
    @click="emit('remove')"
  />
</template>
