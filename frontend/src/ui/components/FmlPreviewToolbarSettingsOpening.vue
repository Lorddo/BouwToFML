<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  DOOR_ADD_SUBTYPES,
  WINDOW_ADD_SUBTYPES,
  type DoorAddSubtype,
  type WindowAddSubtype,
} from '@/core/fml/opening-add-presets'
import type { OpeningSubtypeDraft } from '@/ui/composables/fml-preview/fml-preview-opening-draft'
import type { FmlToolId } from './canvas/fmlToolbeltItems'
import FmlOpeningAddToolFields from './FmlOpeningAddToolFields.vue'
import FmlOpeningEditFields from './FmlOpeningEditFields.vue'
import ToolbeltIcon from './canvas/ToolbeltIcon.vue'
import './fml-toolbelt-settings-fields.css'

const { t } = useI18n()

const addDoorSubtype = defineModel<DoorAddSubtype>('addDoorSubtype', { default: 'standard' })
const addDoorWidthCm = defineModel<number>('addDoorWidthCm', { default: 90 })
const addWindowSubtype = defineModel<WindowAddSubtype>('addWindowSubtype', { default: 'single' })
const addWindowWidthCm = defineModel<number>('addWindowWidthCm', { default: 100 })
const addWindowSillZCm = defineModel<number>('addWindowSillZCm', { default: 70 })
const addWindowHeightCm = defineModel<number>('addWindowHeightCm', { default: 150 })

const props = defineProps<{
  selectedOpeningPanel: {
    openingIds: string[]
    count: number
    openingType: 'door' | 'window' | 'mixed'
    subtype: OpeningSubtypeDraft | null
    subtypeMixed: boolean
    widthCm: number | null
    widthMixed: boolean
    heightCm: number | null
    heightMixed: boolean
    sillZCm: number | null
    sillZMixed: boolean
    hingeAtStart: boolean | null
    hingeMixed: boolean
    swingRight: boolean | null
    swingMixed: boolean
  } | null
  activeTool: FmlToolId | null
  openingSubtypeDraft: OpeningSubtypeDraft
  openingSubtypeMixed: boolean
  openingWidthDraft: number
  openingWidthMixed: boolean
  openingHeightDraft: number
  openingHeightMixed: boolean
  openingSillZDraft: number
  openingSillZMixed: boolean
  openingHingeAtStartDraft: boolean
  openingHingeMixed: boolean
  openingSwingRightDraft: boolean
  openingSwingMixed: boolean
  openingBovenlichtDraft: boolean
  openingBovenlichtMixed: boolean
  openingBovenlichtHeightDraft: number
  openingBovenlichtHeightMixed: boolean
  openingBovenlichtGapDraft: number
  openingBovenlichtGapMixed: boolean
  /** Alleen packed-modus toont checkbox/gap/hoogte. Default true. */
  bovenlichtPacked?: boolean
}>()

const showPackedBovenlichtUi = computed(() => props.bovenlichtPacked !== false)

const emit = defineEmits<{
  commitOpeningSubtype: [subtype: OpeningSubtypeDraft]
  openingWidthInput: [event: Event]
  commitOpeningWidth: []
  openingHeightInput: [event: Event]
  commitOpeningHeight: []
  openingSillZInput: [event: Event]
  commitOpeningSillZ: []
  toggleOpeningHinge: []
  toggleOpeningSwing: []
  openingBovenlichtChange: [event: Event]
  openingBovenlichtHeightInput: [event: Event]
  commitOpeningBovenlichtHeight: []
  openingBovenlichtGapInput: [event: Event]
  commitOpeningBovenlichtGap: []
  copyOpening: []
  deleteOpenings: []
}>()

/** Focus loslaten na toolbar-interactie — voorkomt dat Space+pan geblokkeerd blijft. */
function releaseControlFocus(event: Event): void {
  const el = event.target
  if (el instanceof HTMLElement) el.blur()
}

function onOpeningWidthChange(): void {
  emit('commitOpeningWidth')
}

function onOpeningHeightChange(): void {
  emit('commitOpeningHeight')
}

function onOpeningSillZChange(): void {
  emit('commitOpeningSillZ')
}

function onOpeningSubtypeChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value as OpeningSubtypeDraft
  if (!value) return
  emit('commitOpeningSubtype', value)
  releaseControlFocus(event)
}

function onOpeningBovenlichtChange(event: Event): void {
  emit('openingBovenlichtChange', event)
  releaseControlFocus(event)
}

function onOpeningBovenlichtHeightChange(): void {
  emit('commitOpeningBovenlichtHeight')
}

function onOpeningBovenlichtGapChange(): void {
  emit('commitOpeningBovenlichtGap')
}

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

const openingKindLabel = computed(() => {
  const panel = props.selectedOpeningPanel
  if (!panel) return ''
  if (panel.openingType === 'window') {
    return panel.count === 1
      ? t('result.toolbar.windowOne')
      : t('result.toolbar.windowMany', { count: panel.count })
  }
  if (panel.openingType === 'mixed') {
    return t('result.toolbar.openingMany', { count: panel.count })
  }
  return panel.count === 1
    ? t('result.toolbar.doorOne')
    : t('result.toolbar.doorMany', { count: panel.count })
})

const isDoorSelection = computed(() => props.selectedOpeningPanel?.openingType === 'door')
const isWindowSelection = computed(() => props.selectedOpeningPanel?.openingType === 'window')
const canChangeOpeningSubtype = computed(() => isDoorSelection.value || isWindowSelection.value)
const selectedSubtypeOptions = computed(() =>
  isWindowSelection.value ? windowSubtypeOptions.value : doorSubtypeOptions.value,
)
const selectedSubtypeAria = computed(() =>
  isWindowSelection.value ? t('result.toolbar.windowType') : t('result.toolbar.doorType'),
)
const canCopyOpening = computed(() => props.selectedOpeningPanel?.count === 1)
const isMixedOpening = computed(() => props.selectedOpeningPanel?.openingType === 'mixed')
const showTriangleMirror = computed(
  () =>
    isWindowSelection.value &&
    props.openingSubtypeDraft === 'triangle' &&
    !props.openingSubtypeMixed,
)
</script>

<template>
  <span v-if="selectedOpeningPanel && !canChangeOpeningSubtype" class="fml-toolbelt__meta">
    {{ openingKindLabel }}
  </span>
  <div v-if="selectedOpeningPanel && canChangeOpeningSubtype" class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ selectedSubtypeAria }}</span>
    <div class="fml-toolbelt__field-controls">
      <select
        class="fml-toolbelt__select"
        :aria-label="selectedSubtypeAria"
        :value="openingSubtypeMixed ? '' : openingSubtypeDraft"
        @change="onOpeningSubtypeChange"
      >
        <option v-if="openingSubtypeMixed" value="" disabled>
          {{ t('result.toolbar.custom') }}
        </option>
        <option v-for="opt in selectedSubtypeOptions" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
    </div>
  </div>
  <FmlOpeningEditFields
    v-if="selectedOpeningPanel && (isDoorSelection || isWindowSelection)"
    :type="selectedOpeningPanel.openingType === 'window' ? 'window' : 'door'"
    :width-cm="openingWidthDraft"
    :height-cm="openingHeightDraft"
    :sill-z-cm="openingSillZDraft"
    :bovenlicht="openingBovenlichtDraft"
    :bovenlicht-height-cm="openingBovenlichtHeightDraft"
    :bovenlicht-gap-cm="openingBovenlichtGapDraft"
    :bovenlicht-packed="showPackedBovenlichtUi"
    :hinge-at-start="openingHingeAtStartDraft"
    :swing-right="openingSwingRightDraft"
    :width-mixed="openingWidthMixed"
    :height-mixed="openingHeightMixed"
    :sill-mixed="openingSillZMixed"
    :bovenlicht-mixed="openingBovenlichtMixed"
    :bovenlicht-height-mixed="openingBovenlichtHeightMixed"
    :bovenlicht-gap-mixed="openingBovenlichtGapMixed"
    :hinge-mixed="openingHingeMixed"
    :swing-mixed="openingSwingMixed"
    :show-mirror-button="showTriangleMirror"
    :show-copy="canCopyOpening"
    show-delete
    @width-input="emit('openingWidthInput', $event)"
    @width="onOpeningWidthChange"
    @height-input="emit('openingHeightInput', $event)"
    @height="onOpeningHeightChange"
    @sill-input="emit('openingSillZInput', $event)"
    @sill="onOpeningSillZChange"
    @bovenlicht="onOpeningBovenlichtChange"
    @bovenlicht-height-input="emit('openingBovenlichtHeightInput', $event)"
    @bovenlicht-height="onOpeningBovenlichtHeightChange"
    @bovenlicht-gap-input="emit('openingBovenlichtGapInput', $event)"
    @bovenlicht-gap="onOpeningBovenlichtGapChange"
    @toggle-hinge="emit('toggleOpeningHinge')"
    @toggle-swing="emit('toggleOpeningSwing')"
    @copy="emit('copyOpening')"
    @remove="emit('deleteOpenings')"
  />
  <button
    v-if="isMixedOpening"
    type="button"
    class="canvas-toolbelt__btn"
    :title="t('result.toolbar.deleteOpenings')"
    :aria-label="t('result.toolbar.deleteOpenings')"
    @click="emit('deleteOpenings')"
  >
    <ToolbeltIcon name="delete" />
  </button>
  <FmlOpeningAddToolFields
    v-model:add-door-subtype="addDoorSubtype"
    v-model:add-door-width-cm="addDoorWidthCm"
    v-model:add-window-subtype="addWindowSubtype"
    v-model:add-window-width-cm="addWindowWidthCm"
    v-model:add-window-sill-z-cm="addWindowSillZCm"
    v-model:add-window-height-cm="addWindowHeightCm"
    :active-tool="activeTool"
  />
</template>
