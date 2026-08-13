<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DoorAddSubtype, WindowAddSubtype } from '@/core/fml/opening-add-presets'
import type { OpeningSubtypeDraft } from '@/ui/composables/fml-preview/fml-preview-opening-draft'
import type { FmlToolId } from './canvas/fmlToolbeltItems'
import ToolbeltIcon from './canvas/ToolbeltIcon.vue'
import './canvas/canvas-toolbelt.css'

const { t } = useI18n()

const activeTool = defineModel<FmlToolId | null>('activeTool', { default: null })
const addDoorSubtype = defineModel<DoorAddSubtype>('addDoorSubtype', { default: 'standard' })
const addDoorWidthCm = defineModel<number>('addDoorWidthCm', { default: 90 })
const addWindowSubtype = defineModel<WindowAddSubtype>('addWindowSubtype', { default: 'single' })
const addWindowWidthCm = defineModel<number>('addWindowWidthCm', { default: 100 })
const addWindowSillZCm = defineModel<number>('addWindowSillZCm', { default: 70 })
const addWindowHeightCm = defineModel<number>('addWindowHeightCm', { default: 150 })

const props = withDefaults(
  defineProps<{
    selectedWallPanel: {
      wallIds: string[]
      count: number
      thicknessMixed: boolean
      balanceMixed: boolean
      canSplit: boolean
    } | null
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
    wallThicknessDraft: number
    wallThicknessMixed: boolean
    wallBalanceDraft: number
    wallBalanceMixed: boolean
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
    thicknessMinCm?: number
    thicknessMidCm?: number
    thicknessMaxCm?: number
    measureLineCount?: number
  }>(),
  {
    thicknessMinCm: 10,
    thicknessMidCm: 20,
    thicknessMaxCm: 30,
    measureLineCount: 0,
  },
)

const emit = defineEmits<{
  wallThicknessInput: [event: Event]
  commitWallThickness: []
  applyWallThickness: [thicknessCm: number]
  wallBalanceInput: [event: Event]
  commitWallBalance: []
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
  copyOpening: []
  deleteOpenings: []
  splitWall: []
  deleteWalls: []
  clearSelection: []
  clearMeasures: []
}>()

const thicknessPresets = computed(() => [
  { id: 'min' as const, label: t('result.toolbar.presetMin'), cm: props.thicknessMinCm },
  { id: 'mid' as const, label: t('result.toolbar.presetMid'), cm: props.thicknessMidCm },
  { id: 'max' as const, label: t('result.toolbar.presetMax'), cm: props.thicknessMaxCm },
])

const isDrawWallOrRoom = computed(
  () => activeTool.value === 'draw_wall' || activeTool.value === 'draw_room',
)

/** Matcht draft op min/mid/max; leeg = handmatige overschrijving. */
const drawThicknessBand = computed<'min' | 'mid' | 'max' | ''>(() => {
  if (props.wallThicknessMixed) return ''
  const cm = Math.round(props.wallThicknessDraft)
  if (cm === Math.round(props.thicknessMinCm)) return 'min'
  if (cm === Math.round(props.thicknessMidCm)) return 'mid'
  if (cm === Math.round(props.thicknessMaxCm)) return 'max'
  return ''
})

/** Focus loslaten na toolbar-interactie — voorkomt dat Space+pan geblokkeerd blijft (zoals opacity-slider). */
function releaseControlFocus(event: Event): void {
  const el = event.target
  if (el instanceof HTMLElement) el.blur()
}

function onDrawThicknessBandChange(event: Event): void {
  const band = (event.target as HTMLSelectElement).value as 'min' | 'mid' | 'max' | ''
  const preset = thicknessPresets.value.find((item) => item.id === band)
  if (!preset) return
  emit('applyWallThickness', preset.cm)
  releaseControlFocus(event)
}

function onWallThicknessChange(event: Event): void {
  emit('commitWallThickness')
  releaseControlFocus(event)
}

function onWallBalanceChange(event: Event): void {
  emit('commitWallBalance')
  releaseControlFocus(event)
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

const wallCountLabel = computed(() => {
  const panel = props.selectedWallPanel
  if (!panel) return ''
  return panel.count === 1
    ? t('result.toolbar.wallOne')
    : t('result.toolbar.wallMany', { count: panel.count })
})

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

const deleteWallTitle = computed(() =>
  props.selectedWallPanel?.count === 1
    ? t('result.toolbar.deleteWall')
    : t('result.toolbar.deleteWalls'),
)

const deleteOpeningTitle = computed(() => {
  const panel = props.selectedOpeningPanel
  if (!panel) return ''
  if (panel.count !== 1) return t('result.toolbar.deleteOpenings')
  return isWindowSelection.value ? t('result.toolbar.deleteWindow') : t('result.toolbar.deleteDoor')
})

const measureCountLabel = computed(() => {
  const count = props.measureLineCount ?? 0
  return count === 1
    ? t('result.toolbar.measureCountOne', { count })
    : t('result.toolbar.measureCountMany', { count })
})

const showSettings = computed(
  () =>
    props.selectedWallPanel != null ||
    props.selectedOpeningPanel != null ||
    activeTool.value === 'draw_wall' ||
    activeTool.value === 'draw_room' ||
    activeTool.value === 'add_door' ||
    activeTool.value === 'add_window',
)

const showMeasureStrip = computed(
  () => activeTool.value === 'measure' && (props.measureLineCount ?? 0) > 0,
)
</script>

<template>
  <template v-if="showSettings">
    <div class="canvas-toolbelt-dock__sep" aria-hidden="true" />
    <div class="canvas-toolbelt-dock__section canvas-toolbelt-dock__section--fml">
      <span v-if="selectedWallPanel" class="fml-toolbelt__meta">
        {{ wallCountLabel }}
      </span>
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
      <div v-if="selectedWallPanel || isDrawWallOrRoom" class="fml-toolbelt__field">
        <span class="fml-toolbelt__field-label">{{
          isDrawWallOrRoom ? t('result.toolbar.wallType') : t('result.toolbar.thickness')
        }}</span>
        <div class="fml-toolbelt__field-controls">
          <select
            v-if="isDrawWallOrRoom"
            class="fml-toolbelt__select fml-toolbelt__select--thickness"
            :aria-label="t('result.toolbar.wallTypeAria')"
            :value="drawThicknessBand"
            @change="onDrawThicknessBandChange"
          >
            <option v-if="drawThicknessBand === ''" value="" disabled>
              {{ t('result.toolbar.custom') }}
            </option>
            <option v-for="preset in thicknessPresets" :key="preset.id" :value="preset.id">
              {{ preset.label }} ({{ preset.cm }} cm)
            </option>
          </select>
          <input
            type="number"
            min="1"
            max="200"
            step="1"
            class="fml-toolbelt__thickness-input"
            :aria-label="t('result.toolbar.wallThicknessAria')"
            :value="wallThicknessMixed ? '' : wallThicknessDraft"
            :placeholder="wallThicknessMixed ? '—' : undefined"
            @input="emit('wallThicknessInput', $event)"
            @change="onWallThicknessChange"
          />
          <span class="fml-toolbelt__unit">cm</span>
          <div
            v-if="selectedWallPanel"
            class="fml-toolbelt__presets"
            role="group"
            :aria-label="t('result.toolbar.thicknessPresetsAria')"
          >
            <button
              v-for="preset in thicknessPresets"
              :key="preset.id"
              type="button"
              class="fml-toolbelt__preset-btn"
              :title="t('result.toolbar.applyPresetTitle', { label: preset.label, cm: preset.cm })"
              :aria-label="
                t('result.toolbar.applyPresetAria', { label: preset.label, cm: preset.cm })
              "
              @click="emit('applyWallThickness', preset.cm)"
              @pointerup="releaseControlFocus"
            >
              {{ preset.label }}
            </button>
          </div>
        </div>
      </div>
      <div v-if="selectedWallPanel" class="fml-toolbelt__field">
        <span class="fml-toolbelt__field-label" :title="t('result.toolbar.alignmentTitle')">{{
          t('result.toolbar.alignment')
        }}</span>
        <div class="fml-toolbelt__field-controls">
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            class="fml-toolbelt__balance-slider"
            :aria-label="t('result.toolbar.alignmentAria')"
            :value="wallBalanceMixed ? 0.5 : wallBalanceDraft"
            :disabled="wallBalanceMixed"
            @input="emit('wallBalanceInput', $event)"
            @change="onWallBalanceChange"
            @pointerup="releaseControlFocus"
          />
          <input
            type="number"
            min="0"
            max="1"
            step="0.01"
            class="fml-toolbelt__thickness-input"
            :aria-label="t('result.toolbar.alignmentAria')"
            :value="wallBalanceMixed ? '' : wallBalanceDraft"
            :placeholder="wallBalanceMixed ? '—' : undefined"
            @input="emit('wallBalanceInput', $event)"
            @change="onWallBalanceChange"
          />
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
        v-if="selectedWallPanel?.count === 1"
        type="button"
        class="canvas-toolbelt__btn"
        :title="t('result.toolbar.splitWall')"
        :aria-label="t('result.toolbar.splitWall')"
        :disabled="!selectedWallPanel?.canSplit"
        @click="emit('splitWall')"
      >
        <ToolbeltIcon name="split" />
      </button>
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
        v-if="selectedWallPanel"
        type="button"
        class="canvas-toolbelt__btn"
        :title="deleteWallTitle"
        :aria-label="deleteWallTitle"
        @click="emit('deleteWalls')"
      >
        <ToolbeltIcon name="delete" />
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
      <button
        v-if="selectedWallPanel || selectedOpeningPanel"
        type="button"
        class="canvas-toolbelt__btn"
        :title="t('result.toolbar.deselectTitle')"
        :aria-label="t('result.toolbar.deselect')"
        @click="emit('clearSelection')"
      >
        <ToolbeltIcon name="clear" />
      </button>
    </div>
  </template>

  <template v-if="showMeasureStrip">
    <div class="canvas-toolbelt-dock__sep" aria-hidden="true" />
    <div class="canvas-toolbelt-dock__section canvas-toolbelt-dock__section--fml">
      <span class="fml-toolbelt__meta">{{ measureCountLabel }}</span>
      <button
        type="button"
        class="canvas-toolbelt__btn"
        :title="t('result.toolbar.clearMeasures')"
        :aria-label="t('result.toolbar.clearMeasures')"
        @click="emit('clearMeasures')"
      >
        <ToolbeltIcon name="clear" />
      </button>
    </div>
  </template>
</template>

<style scoped>
.fml-toolbelt__field {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 0 4px;
  border-left: 1px solid #e2e8f0;
  margin-left: 2px;
}

.fml-toolbelt__field:first-of-type {
  border-left: none;
  margin-left: 0;
}

.fml-toolbelt__field-label {
  font-size: 10px;
  line-height: 1.2;
  color: #64748b;
}

.fml-toolbelt__field-controls {
  display: flex;
  align-items: center;
  gap: 3px;
}

.fml-toolbelt__thickness-input {
  width: 44px;
  font-size: 12px;
  padding: 1px 3px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
}

.fml-toolbelt__balance-slider {
  width: 72px;
}

.fml-toolbelt__select {
  min-width: 108px;
  height: 24px;
  font-size: 12px;
  padding: 1px 4px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: #fff;
  color: #334155;
}

.fml-toolbelt__select--thickness {
  min-width: 118px;
}

.fml-toolbelt__unit {
  font-size: 10px;
  color: #64748b;
  min-width: 18px;
}

.fml-toolbelt__field--checkbox {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  user-select: none;
}

.fml-toolbelt__field--checkbox input[type='checkbox'] {
  margin: 0;
}

.fml-toolbelt__presets {
  display: flex;
  gap: 2px;
  margin-left: 2px;
}

.fml-toolbelt__preset-btn {
  min-width: 28px;
  height: 22px;
  padding: 0 5px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: #f8fafc;
  color: #334155;
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
}

.fml-toolbelt__preset-btn:hover {
  background: #e0f2fe;
  border-color: #7dd3fc;
  color: #0369a1;
}

.canvas-toolbelt__btn--active {
  background: #e0f2fe;
  border-color: #7dd3fc;
  color: #0369a1;
}
</style>
