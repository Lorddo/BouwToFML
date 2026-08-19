<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FmlToolId } from './canvas/fmlToolbeltItems'
import {
  formatDrawLengthMeters,
  parseDrawLengthToCm,
} from '@/ui/composables/fml-preview/fml-preview-draw-measure'
import { sliderPercentFromDraft } from './fml-preview-wall-edit'
import ToolbeltIcon from './canvas/ToolbeltIcon.vue'
import './fml-toolbelt-settings-fields.css'

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    selectedWallPanel: {
      wallIds: string[]
      count: number
      thicknessMixed: boolean
      balanceMixed: boolean
      heightMixed?: boolean
      canSplit: boolean
    } | null
    selectedJunctionPanel: {
      junctionId: string
      wallCount: number
      heightCm: number | null
      heightMixed: boolean
    } | null
    activeTool: FmlToolId | null
    wallThicknessDraft: number
    wallThicknessMixed: boolean
    wallBalanceDraft: number
    wallBalanceMixed: boolean
    wallHeightDraft: number
    wallHeightMixed: boolean
    junctionHeightDraft: number
    junctionHeightMixed: boolean
    thicknessMinCm?: number
    thicknessMidCm?: number
    thicknessMaxCm?: number
    /** Actieve muur-draft: live lengte (cm). */
    drawWallDrafting?: boolean
    drawWallMeasureLengthCm?: number
    /** Actieve kamer-draft: live H/V (cm). */
    drawRoomDrafting?: boolean
    drawRoomMeasureHCm?: number
    drawRoomMeasureVCm?: number
  }>(),
  {
    thicknessMinCm: 10,
    thicknessMidCm: 20,
    thicknessMaxCm: 30,
    drawWallDrafting: false,
    drawWallMeasureLengthCm: 0,
    drawRoomDrafting: false,
    drawRoomMeasureHCm: 0,
    drawRoomMeasureVCm: 0,
  },
)

const emit = defineEmits<{
  wallThicknessInput: [event: Event]
  commitWallThickness: []
  applyWallThickness: [thicknessCm: number]
  wallBalanceInput: [event: Event]
  commitWallBalance: []
  wallHeightInput: [event: Event]
  commitWallHeight: []
  junctionHeightInput: [event: Event]
  commitJunctionHeight: []
  splitWall: []
  deleteWalls: []
  drawWallLengthInput: [cm: number | null]
  commitDrawWallMeasure: []
  cancelDrawWallDraft: []
  drawRoomHInput: [cm: number | null]
  drawRoomVInput: [cm: number | null]
  commitDrawRoomMeasure: []
  cancelDrawRoomDraft: []
}>()

const thicknessPresets = computed(() => [
  { id: 'min' as const, label: t('result.toolbar.presetMin'), cm: props.thicknessMinCm },
  { id: 'mid' as const, label: t('result.toolbar.presetMid'), cm: props.thicknessMidCm },
  { id: 'max' as const, label: t('result.toolbar.presetMax'), cm: props.thicknessMaxCm },
])

const isDrawWallOrRoom = computed(
  () => props.activeTool === 'draw_wall' || props.activeTool === 'draw_room',
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

const wallCountLabel = computed(() => {
  const panel = props.selectedWallPanel
  if (!panel) return ''
  return panel.count === 1
    ? t('result.toolbar.wallOne')
    : t('result.toolbar.wallMany', { count: panel.count })
})

const junctionCountLabel = computed(() => {
  const panel = props.selectedJunctionPanel
  if (!panel) return ''
  return panel.wallCount === 1
    ? t('result.toolbar.junctionOne')
    : t('result.toolbar.junctionMany', { count: panel.wallCount })
})

const deleteWallTitle = computed(() =>
  props.selectedWallPanel?.count === 1
    ? t('result.toolbar.deleteWall')
    : t('result.toolbar.deleteWalls'),
)

const wallBalanceSliderValue = computed(() =>
  props.wallBalanceMixed ? 50 : sliderPercentFromDraft(props.wallBalanceDraft),
)

/** Lokale typ-drafts: null = volg live preview. */
const lengthEditText = ref<string | null>(null)
const hEditText = ref<string | null>(null)
const vEditText = ref<string | null>(null)

watch(
  () => props.drawWallDrafting,
  (on) => {
    if (!on) lengthEditText.value = null
  },
)
watch(
  () => props.drawRoomDrafting,
  (on) => {
    if (!on) {
      hEditText.value = null
      vEditText.value = null
    }
  },
)

const wallLengthDisplay = computed(
  () => lengthEditText.value ?? formatDrawLengthMeters(props.drawWallMeasureLengthCm),
)
const roomHDisplay = computed(
  () => hEditText.value ?? formatDrawLengthMeters(props.drawRoomMeasureHCm),
)
const roomVDisplay = computed(
  () => vEditText.value ?? formatDrawLengthMeters(props.drawRoomMeasureVCm),
)

/** Focus loslaten na toolbar-interactie — voorkomt dat Space+pan geblokkeerd blijft. */
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

function onWallHeightChange(event: Event): void {
  emit('commitWallHeight')
  releaseControlFocus(event)
}

function onJunctionHeightChange(event: Event): void {
  emit('commitJunctionHeight')
  releaseControlFocus(event)
}

function parseOrNull(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  return parseDrawLengthToCm(trimmed)
}

function onWallLengthInput(event: Event): void {
  const raw = (event.target as HTMLInputElement).value
  lengthEditText.value = raw
  emit('drawWallLengthInput', parseOrNull(raw))
}

function onWallLengthEnter(event: KeyboardEvent): void {
  event.preventDefault()
  event.stopPropagation()
  emit('commitDrawWallMeasure')
  if (event.target instanceof HTMLElement) event.target.blur()
}

function onWallLengthEscape(event: KeyboardEvent): void {
  event.preventDefault()
  event.stopPropagation()
  lengthEditText.value = null
  emit('cancelDrawWallDraft')
  if (event.target instanceof HTMLElement) event.target.blur()
}

function onRoomHInput(event: Event): void {
  const raw = (event.target as HTMLInputElement).value
  hEditText.value = raw
  emit('drawRoomHInput', parseOrNull(raw))
}

function onRoomVInput(event: Event): void {
  const raw = (event.target as HTMLInputElement).value
  vEditText.value = raw
  emit('drawRoomVInput', parseOrNull(raw))
}

function onRoomMeasureEnter(event: KeyboardEvent): void {
  event.preventDefault()
  event.stopPropagation()
  emit('commitDrawRoomMeasure')
  if (event.target instanceof HTMLElement) event.target.blur()
}

function onRoomMeasureEscape(event: KeyboardEvent): void {
  event.preventDefault()
  event.stopPropagation()
  hEditText.value = null
  vEditText.value = null
  emit('cancelDrawRoomDraft')
  if (event.target instanceof HTMLElement) event.target.blur()
}
</script>

<template>
  <span v-if="selectedWallPanel" class="fml-toolbelt__meta">
    {{ wallCountLabel }}
  </span>
  <span v-if="selectedJunctionPanel" class="fml-toolbelt__meta">
    {{ junctionCountLabel }}
  </span>
  <div v-if="drawWallDrafting" class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.drawLength') }}</span>
    <div class="fml-toolbelt__field-controls">
      <input
        type="text"
        inputmode="decimal"
        class="fml-toolbelt__thickness-input fml-toolbelt__thickness-input--measure"
        :aria-label="t('result.toolbar.drawLengthAria')"
        :value="wallLengthDisplay"
        @input="onWallLengthInput"
        @keydown.enter="onWallLengthEnter"
        @keydown.escape="onWallLengthEscape"
        @blur="lengthEditText = null"
      />
      <span class="fml-toolbelt__unit">m</span>
      <button
        type="button"
        class="canvas-toolbelt__btn"
        :title="t('result.toolbar.cancelDrawDraft')"
        :aria-label="t('result.toolbar.cancelDrawDraft')"
        @click="emit('cancelDrawWallDraft')"
        @pointerup="releaseControlFocus"
      >
        <ToolbeltIcon name="clear" />
      </button>
    </div>
  </div>
  <template v-if="drawRoomDrafting">
    <div class="fml-toolbelt__field">
      <span class="fml-toolbelt__field-label">{{ t('result.toolbar.drawWidth') }}</span>
      <div class="fml-toolbelt__field-controls">
        <input
          type="text"
          inputmode="decimal"
          class="fml-toolbelt__thickness-input fml-toolbelt__thickness-input--measure"
          :aria-label="t('result.toolbar.drawWidthAria')"
          :value="roomHDisplay"
          @input="onRoomHInput"
          @keydown.enter="onRoomMeasureEnter"
          @keydown.escape="onRoomMeasureEscape"
          @blur="hEditText = null"
        />
        <span class="fml-toolbelt__unit">m</span>
      </div>
    </div>
    <div class="fml-toolbelt__field">
      <span class="fml-toolbelt__field-label">{{ t('result.toolbar.drawDepth') }}</span>
      <div class="fml-toolbelt__field-controls">
        <input
          type="text"
          inputmode="decimal"
          class="fml-toolbelt__thickness-input fml-toolbelt__thickness-input--measure"
          :aria-label="t('result.toolbar.drawDepthAria')"
          :value="roomVDisplay"
          @input="onRoomVInput"
          @keydown.enter="onRoomMeasureEnter"
          @keydown.escape="onRoomMeasureEscape"
          @blur="vEditText = null"
        />
        <span class="fml-toolbelt__unit">m</span>
        <button
          type="button"
          class="canvas-toolbelt__btn"
          :title="t('result.toolbar.cancelDrawDraft')"
          :aria-label="t('result.toolbar.cancelDrawDraft')"
          @click="emit('cancelDrawRoomDraft')"
          @pointerup="releaseControlFocus"
        >
          <ToolbeltIcon name="clear" />
        </button>
      </div>
    </div>
  </template>
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
          :aria-label="t('result.toolbar.applyPresetAria', { label: preset.label, cm: preset.cm })"
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
        max="100"
        step="1"
        class="fml-toolbelt__balance-slider"
        :aria-label="t('result.toolbar.alignmentAria')"
        :value="wallBalanceSliderValue"
        :disabled="wallBalanceMixed"
        @input="emit('wallBalanceInput', $event)"
        @change="onWallBalanceChange"
        @pointerup="releaseControlFocus"
      />
      <input
        type="number"
        min="-1000"
        max="1000"
        step="1"
        class="fml-toolbelt__thickness-input fml-toolbelt__thickness-input--balance"
        :aria-label="t('result.toolbar.alignmentAria')"
        :value="wallBalanceMixed ? '' : wallBalanceDraft"
        :placeholder="wallBalanceMixed ? '—' : undefined"
        @input="emit('wallBalanceInput', $event)"
        @change="onWallBalanceChange"
      />
      <span class="fml-toolbelt__unit">%</span>
    </div>
  </div>
  <div v-if="selectedWallPanel" class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.wallHeight') }}</span>
    <div class="fml-toolbelt__field-controls">
      <input
        type="number"
        min="1"
        max="1000"
        step="1"
        class="fml-toolbelt__thickness-input"
        :aria-label="t('result.toolbar.wallHeightAria')"
        :value="wallHeightMixed ? '' : wallHeightDraft"
        :placeholder="wallHeightMixed ? '—' : undefined"
        @input="emit('wallHeightInput', $event)"
        @change="onWallHeightChange"
      />
      <span class="fml-toolbelt__unit">cm</span>
    </div>
  </div>
  <div v-if="selectedJunctionPanel" class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.junctionHeight') }}</span>
    <div class="fml-toolbelt__field-controls">
      <input
        type="number"
        min="1"
        max="1000"
        step="1"
        class="fml-toolbelt__thickness-input"
        :aria-label="t('result.toolbar.junctionHeightAria')"
        :value="junctionHeightMixed ? '' : junctionHeightDraft"
        :placeholder="junctionHeightMixed ? '—' : undefined"
        @input="emit('junctionHeightInput', $event)"
        @change="onJunctionHeightChange"
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
    v-if="selectedWallPanel"
    type="button"
    class="canvas-toolbelt__btn"
    :title="deleteWallTitle"
    :aria-label="deleteWallTitle"
    @click="emit('deleteWalls')"
  >
    <ToolbeltIcon name="delete" />
  </button>
</template>
