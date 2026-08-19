<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  MAX_BOVENLICHT_GAP_CM,
  MAX_BOVENLICHT_HEIGHT_CM,
  MIN_BOVENLICHT_GAP_CM,
  MIN_BOVENLICHT_HEIGHT_CM,
} from '@/core/fml/bovenlicht'
import type { DoorAddSubtype, WindowAddSubtype } from '@/core/fml/opening-add-presets'
import type { OpeningSubtypeDraft } from '@/ui/composables/fml-preview/fml-preview-opening-draft'
import type { FmlToolId } from './canvas/fmlToolbeltItems'
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
}>()

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

function onOpeningWidthChange(event: Event): void {
  emit('commitOpeningWidth')
  releaseControlFocus(event)
}

function onOpeningHeightChange(event: Event): void {
  emit('commitOpeningHeight')
  releaseControlFocus(event)
}

function onOpeningSillZChange(event: Event): void {
  emit('commitOpeningSillZ')
  releaseControlFocus(event)
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

function onOpeningBovenlichtHeightChange(event: Event): void {
  emit('commitOpeningBovenlichtHeight')
  releaseControlFocus(event)
}

function onOpeningBovenlichtGapChange(event: Event): void {
  emit('commitOpeningBovenlichtGap')
  releaseControlFocus(event)
}

const doorSubtypeOptions = computed(() =>
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

const windowSubtypeOptions = computed(() =>
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
const showBovenlichtMeasures = computed(
  () =>
    (isDoorSelection.value || isWindowSelection.value) &&
    (props.openingBovenlichtDraft || props.openingBovenlichtMixed),
)
const canChangeOpeningSubtype = computed(() => isDoorSelection.value || isWindowSelection.value)
const selectedSubtypeOptions = computed(() =>
  isWindowSelection.value ? windowSubtypeOptions.value : doorSubtypeOptions.value,
)
const selectedSubtypeAria = computed(() =>
  isWindowSelection.value ? t('result.toolbar.windowType') : t('result.toolbar.doorType'),
)
const canCopyOpening = computed(() => props.selectedOpeningPanel?.count === 1)

const openingHingeTitle = computed(() => {
  if (props.openingHingeMixed) return t('result.toolbar.hingeMixed')
  return props.openingHingeAtStartDraft
    ? t('result.toolbar.hingeAtStart')
    : t('result.toolbar.hingeAtEnd')
})

const openingSwingTitle = computed(() => {
  if (props.openingSwingMixed) return t('result.toolbar.swingMixed')
  return props.openingSwingRightDraft
    ? t('result.toolbar.swingRight')
    : t('result.toolbar.swingLeft')
})

const deleteOpeningTitle = computed(() => {
  const panel = props.selectedOpeningPanel
  if (!panel) return ''
  if (panel.count !== 1) return t('result.toolbar.deleteOpenings')
  return isWindowSelection.value ? t('result.toolbar.deleteWindow') : t('result.toolbar.deleteDoor')
})
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
  <div v-if="selectedOpeningPanel" class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.width') }}</span>
    <div class="fml-toolbelt__field-controls">
      <input
        type="number"
        min="10"
        max="400"
        step="1"
        class="fml-toolbelt__thickness-input"
        :aria-label="
          isWindowSelection
            ? t('result.toolbar.windowWidthAria')
            : t('result.toolbar.doorWidthAria')
        "
        :value="openingWidthMixed ? '' : openingWidthDraft"
        :placeholder="openingWidthMixed ? '—' : undefined"
        @input="emit('openingWidthInput', $event)"
        @change="onOpeningWidthChange"
      />
      <span class="fml-toolbelt__unit">cm</span>
    </div>
  </div>
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
        min="50"
        max="500"
        step="1"
        class="fml-toolbelt__thickness-input"
        :aria-label="t('result.toolbar.glassAria')"
        @change="releaseControlFocus"
      />
      <span class="fml-toolbelt__unit">cm</span>
    </div>
  </div>
  <div v-if="isDoorSelection" class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.height') }}</span>
    <div class="fml-toolbelt__field-controls">
      <input
        type="number"
        min="50"
        max="500"
        step="1"
        class="fml-toolbelt__thickness-input"
        :aria-label="t('result.toolbar.doorHeightAria')"
        :value="openingHeightMixed ? '' : openingHeightDraft"
        :placeholder="openingHeightMixed ? '—' : undefined"
        @input="emit('openingHeightInput', $event)"
        @change="onOpeningHeightChange"
      />
      <span class="fml-toolbelt__unit">cm</span>
    </div>
  </div>
  <label
    v-if="isDoorSelection || isWindowSelection"
    class="fml-toolbelt__field fml-toolbelt__field--checkbox"
    :title="t('result.toolbar.bovenlichtTitle')"
  >
    <input
      type="checkbox"
      :checked="openingBovenlichtDraft"
      :indeterminate.prop="openingBovenlichtMixed"
      :aria-label="t('result.toolbar.bovenlicht')"
      @change="onOpeningBovenlichtChange"
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
        :value="openingBovenlichtGapMixed ? '' : openingBovenlichtGapDraft"
        :placeholder="openingBovenlichtGapMixed ? '—' : undefined"
        @input="emit('openingBovenlichtGapInput', $event)"
        @change="onOpeningBovenlichtGapChange"
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
        :value="openingBovenlichtHeightMixed ? '' : openingBovenlichtHeightDraft"
        :placeholder="openingBovenlichtHeightMixed ? '—' : undefined"
        @input="emit('openingBovenlichtHeightInput', $event)"
        @change="onOpeningBovenlichtHeightChange"
      />
      <span class="fml-toolbelt__unit">cm</span>
    </div>
  </div>
  <div v-if="isWindowSelection" class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.floor') }}</span>
    <div class="fml-toolbelt__field-controls">
      <input
        type="number"
        min="0"
        max="400"
        step="1"
        class="fml-toolbelt__thickness-input"
        :aria-label="t('result.toolbar.floorAria')"
        :value="openingSillZMixed ? '' : openingSillZDraft"
        :placeholder="openingSillZMixed ? '—' : undefined"
        @input="emit('openingSillZInput', $event)"
        @change="onOpeningSillZChange"
      />
      <span class="fml-toolbelt__unit">cm</span>
    </div>
  </div>
  <div v-if="isWindowSelection" class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.glass') }}</span>
    <div class="fml-toolbelt__field-controls">
      <input
        type="number"
        min="50"
        max="500"
        step="1"
        class="fml-toolbelt__thickness-input"
        :aria-label="t('result.toolbar.glassAria')"
        :value="openingHeightMixed ? '' : openingHeightDraft"
        :placeholder="openingHeightMixed ? '—' : undefined"
        @input="emit('openingHeightInput', $event)"
        @change="onOpeningHeightChange"
      />
      <span class="fml-toolbelt__unit">cm</span>
    </div>
  </div>
  <button
    v-if="isDoorSelection"
    type="button"
    class="canvas-toolbelt__btn"
    :class="{ 'canvas-toolbelt__btn--active': !openingHingeMixed && !openingHingeAtStartDraft }"
    :title="openingHingeTitle"
    :aria-label="openingHingeTitle"
    @click="emit('toggleOpeningHinge')"
  >
    <ToolbeltIcon name="hinge" />
  </button>
  <button
    v-if="isDoorSelection"
    type="button"
    class="canvas-toolbelt__btn"
    :class="{ 'canvas-toolbelt__btn--active': !openingSwingMixed && openingSwingRightDraft }"
    :title="openingSwingTitle"
    :aria-label="openingSwingTitle"
    @click="emit('toggleOpeningSwing')"
  >
    <ToolbeltIcon name="swing" />
  </button>
  <button
    v-if="selectedOpeningPanel && canCopyOpening"
    type="button"
    class="canvas-toolbelt__btn"
    :title="t('result.toolbar.copyOpeningTitle')"
    :aria-label="t('result.toolbar.copyOpening')"
    @click="emit('copyOpening')"
  >
    <ToolbeltIcon name="copy" />
  </button>
  <button
    v-if="selectedOpeningPanel"
    type="button"
    class="canvas-toolbelt__btn"
    :title="deleteOpeningTitle"
    :aria-label="deleteOpeningTitle"
    @click="emit('deleteOpenings')"
  >
    <ToolbeltIcon name="delete" />
  </button>
</template>
