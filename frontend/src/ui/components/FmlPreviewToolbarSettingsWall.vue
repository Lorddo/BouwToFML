<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FmlToolId } from './canvas/fmlToolbeltItems'
import { sliderPercentFromDraft } from './fml-preview-wall-edit'
import {
  formatScaleInputLabel,
  type ScaleInputUnit,
} from '@/ui/composables/settings/scale-input-unit'
import ScaleLengthInput from './ScaleLengthInput.vue'
import ToolbeltIcon from './canvas/ToolbeltIcon.vue'
import './fml-toolbelt-settings-fields.css'

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    unit: ScaleInputUnit
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
  wallThicknessCm: [cm: number]
  commitWallThickness: []
  applyWallThickness: [thicknessCm: number]
  wallBalanceInput: [event: Event]
  commitWallBalance: []
  wallHeightCm: [cm: number]
  commitWallHeight: []
  junctionHeightCm: [cm: number]
  commitJunctionHeight: []
  splitWall: []
  deleteWalls: []
  facadeGroupChange: [value: string]
  facadeGroupRename: []
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

const showFacadeSelectButton = computed(
  () => !!props.facadeGroupDraft && !props.facadeGroupMixed && props.facadeGroupDraft.length > 0,
)

function presetSizeLabel(cm: number): string {
  return formatScaleInputLabel(cm, props.unit)
}

function onFacadeGroupChange(event: Event): void {
  const select = event.target as HTMLSelectElement
  const value = select.value
  if (value === '__new__') select.value = facadeSelectValue.value
  emit('facadeGroupChange', value)
  releaseControlFocus(event)
}

function onFacadeGroupEdit(): void {
  emit('facadeGroupRename')
}

function onStampGroupChange(event: Event): void {
  emit('stampGroupChange', (event.target as HTMLInputElement).checked)
  releaseControlFocus(event)
}

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

function onWallBalanceChange(event: Event): void {
  emit('commitWallBalance')
  releaseControlFocus(event)
}

function onRidgeZCm(cm: number): void {
  emit('ridgeZInput', cm)
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
      <div v-if="isRidgeMode" class="fml-toolbelt__field">
        <span class="fml-toolbelt__field-label">{{ t('result.toolbar.ridgeZ') }}</span>
        <div class="fml-toolbelt__field-controls">
          <ScaleLengthInput
            :cm="ridgeZCm ?? 0"
            :unit="unit"
            :min-cm="0"
            allow-zero
            :max-cm="2000"
            :aria-label="t('result.toolbar.ridgeZAria', { unit: t(`common.${unit}`) })"
            input-class="fml-toolbelt__thickness-input"
            @update:cm="onRidgeZCm"
          />
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
              {{ preset.label }} ({{ presetSizeLabel(preset.cm) }})
            </option>
          </select>
          <ScaleLengthInput
            :cm="wallThicknessDraft"
            :unit="unit"
            :min-cm="1"
            :max-cm="200"
            :mixed="wallThicknessMixed"
            :aria-label="t('result.toolbar.wallThicknessAria', { unit: t(`common.${unit}`) })"
            input-class="fml-toolbelt__thickness-input"
            @update:cm="emit('wallThicknessCm', $event)"
            @commit="emit('commitWallThickness')"
          />
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
              :title="
                t('result.toolbar.applyPresetTitle', {
                  label: preset.label,
                  cm: presetSizeLabel(preset.cm),
                })
              "
              :aria-label="
                t('result.toolbar.applyPresetAria', {
                  label: preset.label,
                  cm: presetSizeLabel(preset.cm),
                })
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
          <ScaleLengthInput
            :cm="wallHeightDraft"
            :unit="unit"
            :min-cm="1"
            :max-cm="1000"
            :mixed="wallHeightMixed"
            :aria-label="t('result.toolbar.wallHeightAria', { unit: t(`common.${unit}`) })"
            input-class="fml-toolbelt__thickness-input"
            @update:cm="emit('wallHeightCm', $event)"
            @commit="emit('commitWallHeight')"
          />
        </div>
      </div>
      <div v-if="selectedJunctionPanel && !isRidgeJunction" class="fml-toolbelt__field">
        <span class="fml-toolbelt__field-label">{{ t('result.toolbar.junctionHeight') }}</span>
        <div class="fml-toolbelt__field-controls">
          <ScaleLengthInput
            :cm="junctionHeightDraft"
            :unit="unit"
            :min-cm="1"
            :max-cm="1000"
            :mixed="junctionHeightMixed"
            :aria-label="t('result.toolbar.junctionHeightAria', { unit: t(`common.${unit}`) })"
            input-class="fml-toolbelt__thickness-input"
            @update:cm="emit('junctionHeightCm', $event)"
            @commit="emit('commitJunctionHeight')"
          />
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
                {{ group.name || group.id }}
              </option>
              <option value="__new__">{{ t('result.toolbar.facadeGroupNew') }}</option>
            </select>
            <button
              v-if="showFacadeSelectButton"
              type="button"
              class="canvas-toolbelt__btn"
              :title="t('result.toolbar.facadeGroupEditTitle')"
              :aria-label="t('result.toolbar.facadeGroupEdit')"
              @click="onFacadeGroupEdit"
              @pointerup="releaseControlFocus"
            >
              <ToolbeltIcon name="edit" />
            </button>
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
