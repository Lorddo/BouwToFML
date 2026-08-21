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
      ridgeCount?: number
    } | null
    selectedJunctionPanel: {
      junctionId: string
      wallCount: number
      heightCm: number | null
      heightMixed: boolean
      ridgeCount?: number
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
    /** Gevelgroepen (alleen editor capability). */
    facadeGroupsEnabled?: boolean
    facadeGroupOptions?: Array<{ id: string; code: string; name: string }>
    /** '' = none, null = mixed, else group id. */
    facadeGroupDraft?: string | null
    facadeGroupMixed?: boolean
    /** True als niet alle groepsleden al geselecteerd zijn. */
    canSelectFacadeMembers?: boolean
    /** Workspace-detectie: Stempel-preset (geen nieuwe groep / rename). */
    facadeGroupsStampPreset?: boolean
    /** Editor: aparte Stempel-checkbox naast gevel. */
    stampGroupEnabled?: boolean
    /** true/false/null(mixed). */
    stampGroupDraft?: boolean | null
    stampGroupMixed?: boolean
    canSelectStampMembers?: boolean
    drawWallKind?: 'wall' | 'ridge'
    dakMode?: boolean
    ridgeFloorDraft?: number | null
    ridgeFloorMixed?: boolean
    ridgeFloorOptions?: ReadonlyArray<{ index: number; name: string }>
    ridgeZCm?: number | null
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
    facadeGroupsEnabled: false,
    facadeGroupOptions: () => [],
    facadeGroupDraft: '',
    facadeGroupMixed: false,
    canSelectFacadeMembers: false,
    facadeGroupsStampPreset: false,
    stampGroupEnabled: false,
    stampGroupDraft: false,
    stampGroupMixed: false,
    canSelectStampMembers: false,
    drawWallKind: 'wall',
    dakMode: false,
    ridgeFloorDraft: null,
    ridgeFloorMixed: false,
    ridgeFloorOptions: () => [],
    ridgeZCm: null,
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
  facadeGroupChange: [value: string]
  facadeGroupRename: [name: string]
  selectFacadeMembers: []
  stampGroupChange: [enabled: boolean]
  selectStampMembers: []
  wallKindChange: [kind: 'wall' | 'ridge']
  ridgeZInput: [cm: number | null]
  ridgeFloorChange: [floorIndex: number]
}>()

const thicknessPresets = computed(() => [
  { id: 'min' as const, label: t('result.toolbar.presetMin'), cm: props.thicknessMinCm },
  { id: 'mid' as const, label: t('result.toolbar.presetMid'), cm: props.thicknessMidCm },
  { id: 'max' as const, label: t('result.toolbar.presetMax'), cm: props.thicknessMaxCm },
])

const isDrawWallOrRoom = computed(
  () => props.activeTool === 'draw_wall' || props.activeTool === 'draw_room',
)

const selectedRidgeCount = computed(() => props.selectedWallPanel?.ridgeCount ?? 0)
const selectedKind = computed<'wall' | 'ridge' | ''>(() => {
  const panel = props.selectedWallPanel
  if (!panel) return props.drawWallKind ?? 'wall'
  if (selectedRidgeCount.value === panel.count) return 'ridge'
  if (selectedRidgeCount.value === 0) return 'wall'
  return ''
})
const isRidgeJunction = computed(() => {
  const panel = props.selectedJunctionPanel
  return panel != null && panel.wallCount > 0 && (panel.ridgeCount ?? 0) === panel.wallCount
})
const isRidgeMode = computed(
  () =>
    selectedKind.value === 'ridge' ||
    isRidgeJunction.value ||
    (props.activeTool === 'draw_wall' && props.drawWallKind === 'ridge'),
)
const showKindSelect = computed(
  () =>
    props.dakMode !== true && (props.activeTool === 'draw_wall' || props.selectedWallPanel != null),
)
const showRidgeFloorSelect = computed(
  () =>
    props.dakMode === true &&
    (props.ridgeFloorOptions?.length ?? 0) > 1 &&
    (props.selectedWallPanel?.ridgeCount ?? 0) > 0,
)
const showThicknessFields = computed(() => !isRidgeMode.value)
const showFacadeStamp = computed(() => !!props.selectedWallPanel && selectedKind.value === 'wall')

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

const facadeSelectValue = computed(() => {
  if (props.facadeGroupMixed) return ''
  return props.facadeGroupDraft ?? ''
})

const facadeRenameText = ref<string | null>(null)

watch(
  () => [props.facadeGroupDraft, props.facadeGroupMixed] as const,
  () => {
    facadeRenameText.value = null
  },
)

const facadeNameDisplay = computed(() => {
  if (facadeRenameText.value != null) return facadeRenameText.value
  if (props.facadeGroupMixed || !props.facadeGroupDraft) return ''
  const group = props.facadeGroupOptions.find((entry) => entry.id === props.facadeGroupDraft)
  return group?.name ?? ''
})

const showFacadeSelectButton = computed(
  () => !!props.facadeGroupDraft && !props.facadeGroupMixed && props.facadeGroupDraft.length > 0,
)

function onFacadeGroupChange(event: Event): void {
  const select = event.target as HTMLSelectElement
  const value = select.value
  if (value === '__new__') select.value = facadeSelectValue.value
  emit('facadeGroupChange', value)
  releaseControlFocus(event)
}

function onFacadeNameChange(event: Event): void {
  const raw = (event.target as HTMLInputElement).value
  facadeRenameText.value = raw
  emit('facadeGroupRename', raw)
  releaseControlFocus(event)
}

function onStampGroupChange(event: Event): void {
  emit('stampGroupChange', (event.target as HTMLInputElement).checked)
  releaseControlFocus(event)
}

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
  <div class="fml-toolbelt-stack">
    <div class="fml-toolbelt__row fml-toolbelt__row--primary">
      <div v-if="showRidgeFloorSelect" class="fml-toolbelt__field">
        <span class="fml-toolbelt__field-label">{{ t('result.toolbar.ridgeFloor') }}</span>
        <div class="fml-toolbelt__field-controls">
          <select
            class="fml-toolbelt__select"
            :aria-label="t('result.toolbar.ridgeFloorAria')"
            :value="ridgeFloorMixed ? '' : (ridgeFloorDraft ?? '')"
            @change="emit('ridgeFloorChange', Number(($event.target as HTMLSelectElement).value))"
          >
            <option v-if="ridgeFloorMixed || ridgeFloorDraft == null" value="" disabled>
              {{
                ridgeFloorMixed
                  ? t('result.toolbar.ridgeFloorMixed')
                  : t('result.toolbar.ridgeFloorAuto')
              }}
            </option>
            <option v-for="floor in ridgeFloorOptions" :key="floor.index" :value="floor.index">
              {{ floor.name }}
            </option>
          </select>
        </div>
      </div>
      <div v-if="showKindSelect" class="fml-toolbelt__field">
        <span class="fml-toolbelt__field-label">{{ t('result.toolbar.wallKind') }}</span>
        <div class="fml-toolbelt__field-controls">
          <select
            class="fml-toolbelt__select"
            :aria-label="t('result.toolbar.wallKindAria')"
            :value="selectedKind"
            @change="
              emit(
                'wallKindChange',
                (($event.target as HTMLSelectElement).value || 'wall') as 'wall' | 'ridge',
              )
            "
          >
            <option v-if="selectedKind === ''" value="" disabled>
              {{ t('result.toolbar.custom') }}
            </option>
            <option value="wall">{{ t('result.toolbar.wallKindWall') }}</option>
            <option value="ridge">{{ t('result.toolbar.wallKindRidge') }}</option>
          </select>
        </div>
      </div>
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
            :title="t('result.toolbar.acceptDrawDraft')"
            :aria-label="t('result.toolbar.acceptDrawDraft')"
            @click="emit('commitDrawWallMeasure')"
            @pointerup="releaseControlFocus"
          >
            <ToolbeltIcon name="check" />
          </button>
          <button
            type="button"
            class="canvas-toolbelt__btn"
            :title="t('result.toolbar.deactivateDrawTool')"
            :aria-label="t('result.toolbar.deactivateDrawTool')"
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
              :title="t('result.toolbar.acceptDrawDraft')"
              :aria-label="t('result.toolbar.acceptDrawDraft')"
              @click="emit('commitDrawRoomMeasure')"
              @pointerup="releaseControlFocus"
            >
              <ToolbeltIcon name="check" />
            </button>
            <button
              type="button"
              class="canvas-toolbelt__btn"
              :title="t('result.toolbar.deactivateDrawTool')"
              :aria-label="t('result.toolbar.deactivateDrawTool')"
              @click="emit('cancelDrawRoomDraft')"
              @pointerup="releaseControlFocus"
            >
              <ToolbeltIcon name="clear" />
            </button>
          </div>
        </div>
      </template>
      <div v-if="isRidgeMode" class="fml-toolbelt__field">
        <span class="fml-toolbelt__field-label">{{ t('result.toolbar.ridgeZ') }}</span>
        <div class="fml-toolbelt__field-controls">
          <input
            type="number"
            min="0"
            max="2000"
            step="1"
            class="fml-toolbelt__thickness-input"
            :aria-label="t('result.toolbar.ridgeZAria')"
            :value="ridgeZCm ?? ''"
            @change="
              emit(
                'ridgeZInput',
                Number.isFinite(Number(($event.target as HTMLInputElement).value))
                  ? Math.round(Number(($event.target as HTMLInputElement).value))
                  : null,
              )
            "
          />
          <span class="fml-toolbelt__unit">cm</span>
        </div>
      </div>
      <div
        v-if="showThicknessFields && (selectedWallPanel || isDrawWallOrRoom)"
        class="fml-toolbelt__field"
      >
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
      <div v-if="selectedWallPanel && showThicknessFields" class="fml-toolbelt__field">
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
      <div v-if="selectedWallPanel && !isRidgeMode" class="fml-toolbelt__field">
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
      <div v-if="selectedJunctionPanel && !isRidgeJunction" class="fml-toolbelt__field">
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
      <slot name="trailing" />
    </div>
    <div
      v-if="showFacadeStamp && facadeGroupsEnabled"
      class="fml-toolbelt__field fml-toolbelt__field--row"
    >
      <div class="fml-toolbelt__pair">
        <div v-if="!facadeGroupsStampPreset" class="fml-toolbelt__pair-item">
          <span class="fml-toolbelt__field-label">{{ t('result.toolbar.facadeGroup') }}</span>
          <div class="fml-toolbelt__field-controls">
            <select
              class="fml-toolbelt__select fml-toolbelt__select--facade"
              :aria-label="t('result.toolbar.facadeGroupAria')"
              :value="facadeSelectValue"
              @change="onFacadeGroupChange"
            >
              <option value="">
                {{
                  facadeGroupMixed
                    ? t('result.toolbar.facadeGroupMixed')
                    : t('result.toolbar.facadeGroupNone')
                }}
              </option>
              <option v-for="group in facadeGroupOptions" :key="group.id" :value="group.id">
                {{ group.id }}
              </option>
              <option value="__new__">{{ t('result.toolbar.facadeGroupNew') }}</option>
            </select>
            <input
              v-if="facadeGroupDraft && !facadeGroupMixed"
              type="text"
              class="fml-toolbelt__thickness-input fml-toolbelt__thickness-input--facade"
              :aria-label="t('result.toolbar.facadeGroupRenameAria')"
              :value="facadeNameDisplay"
              @input="facadeRenameText = ($event.target as HTMLInputElement).value"
              @change="onFacadeNameChange"
            />
            <button
              v-if="showFacadeSelectButton"
              type="button"
              class="canvas-toolbelt__btn canvas-toolbelt__btn--primary"
              :title="t('result.toolbar.facadeGroupSelectTitle')"
              :aria-label="t('result.toolbar.facadeGroupSelect')"
              :disabled="!canSelectFacadeMembers"
              @click="emit('selectFacadeMembers')"
              @pointerup="releaseControlFocus"
            >
              {{ t('result.toolbar.facadeGroupSelect') }}
            </button>
          </div>
        </div>
        <div
          v-if="stampGroupEnabled"
          class="fml-toolbelt__pair-item fml-toolbelt__pair-item--stamp"
        >
          <span class="fml-toolbelt__field-label">{{ t('result.toolbar.stampGroup') }}</span>
          <div class="fml-toolbelt__field-controls">
            <label class="fml-toolbelt__checkbox">
              <input
                type="checkbox"
                :checked="stampGroupDraft === true"
                :indeterminate.prop="stampGroupMixed === true"
                :aria-label="t('result.toolbar.stampGroupAria')"
                @change="onStampGroupChange"
              />
              <span>{{
                stampGroupMixed
                  ? t('result.toolbar.facadeGroupMixed')
                  : t('result.toolbar.stampGroup')
              }}</span>
            </label>
            <button
              v-if="stampGroupDraft === true || stampGroupMixed"
              type="button"
              class="canvas-toolbelt__btn canvas-toolbelt__btn--primary"
              :title="t('result.toolbar.stampGroupSelectTitle')"
              :aria-label="t('result.toolbar.stampGroupSelect')"
              :disabled="!canSelectStampMembers"
              @click="emit('selectStampMembers')"
              @pointerup="releaseControlFocus"
            >
              {{ t('result.toolbar.stampGroupSelect') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
