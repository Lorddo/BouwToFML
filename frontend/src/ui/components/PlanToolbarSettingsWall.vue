<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PlanToolId } from './canvas/planToolbeltItems'
import { sliderPercentFromDraft } from './plan-canvas-wall-edit'
import {
  formatScaleInputLabel,
  type ScaleInputUnit,
} from '@/ui/composables/settings/scale-input-unit'
import ScaleLengthInput from './ScaleLengthInput.vue'
import ToolbeltActionButton from './canvas/ToolbeltActionButton.vue'
import ToolbeltIcon from './canvas/ToolbeltIcon.vue'
import './plan-toolbelt-settings-fields.css'
import { TOOLBELT_HOTKEY_PRIORITY } from '@/ui/composables/canvas/useToolbeltHotkey'
import { facadeGroupDisplayName } from '@/ui/composables/plan-canvas/facade-group-label'

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
      mode?: 'quick' | 'full'
    } | null
    selectedJunctionPanel: {
      junctionId: string
      wallCount: number
      heightCm: number | null
      heightMixed: boolean
      ridgeCount?: number
    } | null
    activeTool: PlanToolId | null
    wallThicknessDraft: number
    wallThicknessMixed: boolean
    wallBalanceDraft: number
    wallBalanceMixed: boolean
    wallHeightDraft: number
    wallHeightMixed: boolean
    wallBottomZDraft?: number
    wallBottomZMixed?: boolean
    junctionHeightDraft: number
    junctionHeightMixed: boolean
    junctionBottomZDraft?: number
    junctionBottomZMixed?: boolean
    thicknessPresetCms?: number[]
    /** Gevelgroepen (alleen editor capability). */
    facadeGroupsEnabled?: boolean
    facadeGroupOptions?: Array<{ id: string; code: string; name: string }>
    /** Per groep-id: true / false / null (gemengd). */
    facadeGroupChecks?: Record<string, boolean | null>
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
    thicknessPresetCms: () => [10, 20, 30],
    facadeGroupsEnabled: false,
    facadeGroupOptions: () => [],
    facadeGroupChecks: () => ({}),
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
    wallBottomZDraft: 0,
    wallBottomZMixed: false,
    junctionBottomZDraft: 0,
    junctionBottomZMixed: false,
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
  wallBottomZCm: [cm: number]
  commitWallBottomZ: []
  junctionHeightCm: [cm: number]
  commitJunctionHeight: []
  junctionBottomZCm: [cm: number]
  commitJunctionBottomZ: []
  splitWall: []
  deleteWalls: []
  /** Dropdown: groupId | `__new__` | `__edit__`. */
  facadeGroupChange: [value: string]
  facadeGroupRemove: [groupId: string]
  selectFacadeMembers: [groupId: string]
  stampGroupChange: [enabled: boolean]
  selectStampMembers: []
  wallKindChange: [kind: 'wall' | 'ridge']
  ridgeZInput: [cm: number | null]
  ridgeFloorChange: [floorIndex: number]
}>()

const thicknessPresets = computed(() =>
  (props.thicknessPresetCms ?? [10, 20, 30]).map((cm) => ({
    id: String(Math.round(cm * 10) / 10),
    label: formatScaleInputLabel(cm, props.unit),
    cm,
  })),
)

const isDrawWallOrRoom = computed(
  () => props.activeTool === 'draw_wall' || props.activeTool === 'draw_room',
)

const isQuickWallPanel = computed(() => props.selectedWallPanel?.mode === 'quick')

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
    !isQuickWallPanel.value &&
    props.dakMode !== true &&
    (props.activeTool === 'draw_wall' || props.selectedWallPanel != null),
)
const showRidgeFloorSelect = computed(
  () =>
    !isQuickWallPanel.value &&
    props.dakMode === true &&
    (props.ridgeFloorOptions?.length ?? 0) > 1 &&
    (props.selectedWallPanel?.ridgeCount ?? 0) > 0,
)
const showThicknessFields = computed(() => !isRidgeMode.value)
const showFacadeStamp = computed(
  () =>
    !isQuickWallPanel.value && !!props.selectedWallPanel && selectedKind.value === 'wall',
)
const showAdvancedElevation = computed(
  () => !isQuickWallPanel.value && (props.selectedWallPanel != null || isDrawWallOrRoom.value),
)

/** Matcht draft op een catalogus-cm; leeg = handmatige overschrijving. */
const drawThicknessBand = computed(() => {
  if (props.wallThicknessMixed) return ''
  const cm = Math.round(props.wallThicknessDraft)
  const match = thicknessPresets.value.find((item) => Math.round(item.cm) === cm)
  return match?.id ?? ''
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

function facadeCheckState(groupId: string): boolean | null {
  return props.facadeGroupChecks[groupId] ?? false
}

/** Groepen waar (een deel van) de selectie lid van is. */
const memberFacadeGroups = computed(() =>
  props.facadeGroupOptions.filter((group) => facadeCheckState(group.id) !== false),
)

/** Groepen die nog niet volledig toegekend zijn (voor dropdown toevoegen). */
const addableFacadeGroups = computed(() =>
  props.facadeGroupOptions.filter((group) => facadeCheckState(group.id) !== true),
)

function groupLabel(group: { id: string; name: string }): string {
  return facadeGroupDisplayName(group, t)
}

function presetSizeLabel(cm: number): string {
  return formatScaleInputLabel(cm, props.unit)
}

function onFacadeGroupChange(event: Event): void {
  const select = event.target as HTMLSelectElement
  const value = select.value
  select.value = ''
  if (!value) return
  emit('facadeGroupChange', value)
  releaseControlFocus(event)
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
  const id = (event.target as HTMLSelectElement).value
  const preset = thicknessPresets.value.find((item) => item.id === id)
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
  <div class="plan-toolbelt-stack">
    <div class="plan-toolbelt__row plan-toolbelt__row--primary">
      <div v-if="showRidgeFloorSelect" class="plan-toolbelt__field">
        <span class="plan-toolbelt__field-label">{{ t('result.toolbar.ridgeFloor') }}</span>
        <div class="plan-toolbelt__field-controls">
          <select
            class="plan-toolbelt__select"
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
      <div v-if="showKindSelect" class="plan-toolbelt__field">
        <span class="plan-toolbelt__field-label">{{ t('result.toolbar.wallKind') }}</span>
        <div class="plan-toolbelt__field-controls">
          <select
            class="plan-toolbelt__select"
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
      <span v-if="selectedWallPanel && !isQuickWallPanel" class="plan-toolbelt__meta">
        {{ wallCountLabel }}
      </span>
      <span v-if="selectedJunctionPanel" class="plan-toolbelt__meta">
        {{ junctionCountLabel }}
      </span>
      <div v-if="isRidgeMode && !isQuickWallPanel" class="plan-toolbelt__field">
        <span class="plan-toolbelt__field-label">{{ t('result.toolbar.ridgeZ') }}</span>
        <div class="plan-toolbelt__field-controls">
          <ScaleLengthInput
            :cm="ridgeZCm ?? 0"
            :unit="unit"
            :min-cm="0"
            allow-zero
            :max-cm="2000"
            :aria-label="t('result.toolbar.ridgeZAria', { unit: t(`common.${unit}`) })"
            input-class="plan-toolbelt__thickness-input"
            @update:cm="onRidgeZCm"
          />
        </div>
      </div>
      <div
        v-if="showThicknessFields && (selectedWallPanel || isDrawWallOrRoom)"
        class="plan-toolbelt__field"
      >
        <span class="plan-toolbelt__field-label">{{
          isDrawWallOrRoom ? t('result.toolbar.wallType') : t('result.toolbar.thickness')
        }}</span>
        <div class="plan-toolbelt__field-controls">
          <select
            v-if="isDrawWallOrRoom"
            class="plan-toolbelt__select plan-toolbelt__select--thickness"
            :aria-label="t('result.toolbar.wallTypeAria')"
            :value="drawThicknessBand"
            @change="onDrawThicknessBandChange"
          >
            <option v-if="drawThicknessBand === ''" value="" disabled>
              {{ t('result.toolbar.custom') }}
            </option>
            <option v-for="preset in thicknessPresets" :key="preset.id" :value="preset.id">
              {{ preset.label }}
            </option>
          </select>
          <ScaleLengthInput
            :cm="wallThicknessDraft"
            :unit="unit"
            :min-cm="1"
            :max-cm="200"
            :mixed="wallThicknessMixed"
            :aria-label="t('result.toolbar.wallThicknessAria', { unit: t(`common.${unit}`) })"
            input-class="plan-toolbelt__thickness-input"
            @update:cm="emit('wallThicknessCm', $event)"
            @commit="emit('commitWallThickness')"
          />
          <div
            v-if="selectedWallPanel"
            class="plan-toolbelt__presets"
            role="group"
            :aria-label="t('result.toolbar.thicknessPresetsAria')"
          >
            <button
              v-for="preset in thicknessPresets"
              :key="preset.id"
              type="button"
              class="plan-toolbelt__preset-btn"
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
      <div v-if="selectedWallPanel && showThicknessFields" class="plan-toolbelt__field">
        <span class="plan-toolbelt__field-label" :title="t('result.toolbar.alignmentTitle')">{{
          t('result.toolbar.alignment')
        }}</span>
        <div class="plan-toolbelt__field-controls">
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            class="plan-toolbelt__balance-slider"
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
            class="plan-toolbelt__thickness-input plan-toolbelt__thickness-input--balance"
            :aria-label="t('result.toolbar.alignmentAria')"
            :value="wallBalanceMixed ? '' : wallBalanceDraft"
            :placeholder="wallBalanceMixed ? '—' : undefined"
            @input="emit('wallBalanceInput', $event)"
            @change="onWallBalanceChange"
          />
          <span class="plan-toolbelt__unit">%</span>
        </div>
      </div>
      <div
        v-if="showAdvancedElevation && !isRidgeMode"
        class="plan-toolbelt__field"
      >
        <span class="plan-toolbelt__field-label">{{ t('result.toolbar.floor') }}</span>
        <div class="plan-toolbelt__field-controls">
          <ScaleLengthInput
            :cm="wallBottomZDraft ?? 0"
            :unit="unit"
            :min-cm="0"
            allow-zero
            :max-cm="2000"
            :mixed="!!selectedWallPanel && wallBottomZMixed"
            :aria-label="t('result.toolbar.floorAria', { unit: t(`common.${unit}`) })"
            input-class="plan-toolbelt__thickness-input"
            @update:cm="emit('wallBottomZCm', $event)"
            @commit="emit('commitWallBottomZ')"
          />
        </div>
      </div>
      <div
        v-if="showAdvancedElevation && !isRidgeMode"
        class="plan-toolbelt__field"
      >
        <span class="plan-toolbelt__field-label">{{ t('result.toolbar.wallHeight') }}</span>
        <div class="plan-toolbelt__field-controls">
          <ScaleLengthInput
            :cm="wallHeightDraft"
            :unit="unit"
            :min-cm="1"
            :max-cm="1000"
            :mixed="!!selectedWallPanel && wallHeightMixed"
            :aria-label="t('result.toolbar.wallHeightAria', { unit: t(`common.${unit}`) })"
            input-class="plan-toolbelt__thickness-input"
            @update:cm="emit('wallHeightCm', $event)"
            @commit="emit('commitWallHeight')"
          />
        </div>
      </div>
      <div v-if="selectedJunctionPanel && !isRidgeJunction" class="plan-toolbelt__field">
        <span class="plan-toolbelt__field-label">{{ t('result.toolbar.floor') }}</span>
        <div class="plan-toolbelt__field-controls">
          <ScaleLengthInput
            :cm="junctionBottomZDraft ?? 0"
            :unit="unit"
            :min-cm="0"
            allow-zero
            :max-cm="2000"
            :mixed="junctionBottomZMixed"
            :aria-label="t('result.toolbar.floorAria', { unit: t(`common.${unit}`) })"
            input-class="plan-toolbelt__thickness-input"
            @update:cm="emit('junctionBottomZCm', $event)"
            @commit="emit('commitJunctionBottomZ')"
          />
        </div>
      </div>
      <div v-if="selectedJunctionPanel && !isRidgeJunction" class="plan-toolbelt__field">
        <span class="plan-toolbelt__field-label">{{ t('result.toolbar.junctionHeight') }}</span>
        <div class="plan-toolbelt__field-controls">
          <ScaleLengthInput
            :cm="junctionHeightDraft"
            :unit="unit"
            :min-cm="1"
            :max-cm="1000"
            :mixed="junctionHeightMixed"
            :aria-label="t('result.toolbar.junctionHeightAria', { unit: t(`common.${unit}`) })"
            input-class="plan-toolbelt__thickness-input"
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
      <ToolbeltActionButton
        v-if="selectedWallPanel"
        icon="delete"
        :title="deleteWallTitle"
        :aria-label="deleteWallTitle"
        hotkey="Delete"
        :hotkey-priority="TOOLBELT_HOTKEY_PRIORITY.object"
        @click="emit('deleteWalls')"
      />
      <slot name="trailing" />
    </div>
    <div
      v-if="showFacadeStamp && facadeGroupsEnabled"
      class="plan-toolbelt__field plan-toolbelt__field--row"
    >
      <div class="plan-toolbelt__pair">
        <div v-if="!facadeGroupsStampPreset" class="plan-toolbelt__pair-item">
          <span class="plan-toolbelt__field-label">{{ t('result.toolbar.facadeGroup') }}</span>
          <div class="plan-toolbelt__facade-stack">
            <div class="plan-toolbelt__field-controls">
              <select
                class="plan-toolbelt__select plan-toolbelt__select--facade"
                :aria-label="t('result.toolbar.facadeGroupAria')"
                value=""
                @change="onFacadeGroupChange"
              >
                <option value="" disabled>
                  {{ t('result.toolbar.facadeGroupAdd') }}
                </option>
                <option v-for="group in addableFacadeGroups" :key="group.id" :value="group.id">
                  {{ groupLabel(group) }}
                </option>
                <option value="__new__">{{ t('result.toolbar.facadeGroupNew') }}</option>
                <option value="__edit__">{{ t('result.toolbar.facadeGroupEditAll') }}</option>
              </select>
            </div>
            <div v-if="memberFacadeGroups.length > 0" class="plan-toolbelt__facade-chips">
              <div
                v-for="group in memberFacadeGroups"
                :key="group.id"
                class="plan-toolbelt__facade-chip"
                :class="{ 'is-mixed': facadeCheckState(group.id) === null }"
              >
                <span class="plan-toolbelt__facade-chip-name">{{
                  facadeCheckState(group.id) === null
                    ? `${groupLabel(group)} (${t('result.toolbar.facadeGroupMixedShort')})`
                    : groupLabel(group)
                }}</span>
                <button
                  type="button"
                  class="canvas-toolbelt__btn plan-toolbelt__facade-chip-btn"
                  :title="t('result.toolbar.facadeGroupSelectTitle')"
                  :aria-label="t('result.toolbar.facadeGroupSelect')"
                  @click="emit('selectFacadeMembers', group.id)"
                  @pointerup="releaseControlFocus"
                >
                  <ToolbeltIcon name="fit" />
                </button>
                <button
                  type="button"
                  class="canvas-toolbelt__btn plan-toolbelt__facade-chip-btn"
                  :title="t('result.toolbar.facadeGroupRemoveTitle')"
                  :aria-label="t('result.toolbar.facadeGroupRemove')"
                  @click="emit('facadeGroupRemove', group.id)"
                  @pointerup="releaseControlFocus"
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        </div>
        <div
          v-if="stampGroupEnabled"
          class="plan-toolbelt__pair-item plan-toolbelt__pair-item--stamp"
        >
          <span class="plan-toolbelt__field-label">{{ t('result.toolbar.stampGroup') }}</span>
          <div class="plan-toolbelt__field-controls">
            <label class="plan-toolbelt__checkbox">
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
