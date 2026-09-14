<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { FLOOR_LINE_TYPES, type FloorLineType } from '@/core/plan/types'
import HexColorField from './HexColorField.vue'
import PlanToolbarLabelStyle from './PlanToolbarLabelStyle.vue'
import type { PlanToolId } from './canvas/planToolbeltItems'
import './plan-toolbelt-settings-fields.css'

const { t } = useI18n()

const drawSurfaceRole = defineModel<number | null>('drawSurfaceRole', { default: null })
const drawSurfaceCutout = defineModel<boolean>('drawSurfaceCutout', { default: false })
const drawRoofKind = defineModel<'plane' | 'dormer'>('drawRoofKind')
const drawLineThickness = defineModel<number>('drawLineThickness', { default: 2 })
const drawLineType = defineModel<FloorLineType>('drawLineType', { default: 'solid_line' })
const drawLineColor = defineModel<string>('drawLineColor', { default: '#000000' })
const drawLabelText = defineModel<string>('drawLabelText', { default: 'Tekst' })
const drawLabelFontSize = defineModel<number>('drawLabelFontSize', { default: 16 })
const drawLabelFontColor = defineModel<string>('drawLabelFontColor', { default: '#000000' })
const drawLabelOutline = defineModel<boolean>('drawLabelOutline', { default: false })
const drawLabelBold = defineModel<boolean>('drawLabelBold', { default: false })
const drawLabelItalic = defineModel<boolean>('drawLabelItalic', { default: false })

const props = withDefaults(
  defineProps<{
    activeTool: PlanToolId | null
    roomTypes: ReadonlyArray<{ role: number; name: string; color: string }>
    dakMode?: boolean
  }>(),
  { dakMode: false },
)

const drawingRoof = computed(
  () => props.dakMode === true || props.activeTool === 'draw_roof',
)

function onRoleChange(event: Event): void {
  const raw = (event.target as HTMLSelectElement).value
  drawSurfaceRole.value = raw === '' ? null : Number(raw)
}

function onCutoutChange(event: Event): void {
  drawSurfaceCutout.value = (event.target as HTMLInputElement).checked
}

function onThicknessInput(event: Event): void {
  const raw = Number((event.target as HTMLInputElement).value)
  drawLineThickness.value = Number.isFinite(raw) ? Math.max(1, Math.round(raw)) : 2
}

function onLineTypeChange(event: Event): void {
  const raw = (event.target as HTMLSelectElement).value
  if (FLOOR_LINE_TYPES.includes(raw as FloorLineType)) {
    drawLineType.value = raw as FloorLineType
  }
}

function onLabelInput(event: Event): void {
  drawLabelText.value = (event.target as HTMLInputElement).value
}
</script>

<template>
  <div v-if="drawingRoof" class="plan-toolbelt__field">
    <span class="plan-toolbelt__field-label">{{ t('result.toolbar.roofKind') }}</span>
    <div class="plan-toolbelt__field-controls">
      <select
        class="plan-toolbelt__select"
        :aria-label="t('result.toolbar.roofKind')"
        v-model="drawRoofKind"
      >
        <option value="plane">{{ t('result.toolbar.roofKindPlane') }}</option>
        <option value="dormer">{{ t('result.toolbar.roofKindDormer') }}</option>
      </select>
    </div>
  </div>
  <div v-if="activeTool === 'draw_surface' && !drawingRoof" class="plan-toolbelt__field">
    <span class="plan-toolbelt__field-label">{{ t('result.toolbar.roomType') }}</span>
    <div class="plan-toolbelt__field-controls">
      <select
        class="plan-toolbelt__select"
        :aria-label="t('result.toolbar.roomType')"
        :value="drawSurfaceRole ?? ''"
        @change="onRoleChange"
      >
        <option value="">{{ t('result.toolbar.roomTypeNone') }}</option>
        <option v-for="rt in roomTypes" :key="rt.role" :value="rt.role">
          {{ rt.name }}
        </option>
      </select>
    </div>
  </div>
  <div v-if="activeTool === 'draw_surface' && !drawingRoof" class="plan-toolbelt__field">
    <span class="plan-toolbelt__field-label">{{ t('result.toolbar.surfaceCutout') }}</span>
    <div class="plan-toolbelt__field-controls">
      <label class="plan-toolbelt__checkbox">
        <input
          type="checkbox"
          :checked="drawSurfaceCutout"
          :aria-label="t('result.toolbar.surfaceCutout')"
          @change="onCutoutChange"
        />
        <span>{{ t('result.toolbar.surfaceCutoutActive') }}</span>
      </label>
    </div>
  </div>
  <template v-if="activeTool === 'draw_line'">
    <div class="plan-toolbelt__field">
      <span class="plan-toolbelt__field-label">{{ t('result.toolbar.lineType') }}</span>
      <div class="plan-toolbelt__field-controls">
        <select
          class="plan-toolbelt__select"
          :aria-label="t('result.toolbar.lineType')"
          :value="drawLineType"
          @change="onLineTypeChange"
        >
          <option v-for="type in FLOOR_LINE_TYPES" :key="type" :value="type">
            {{ t(`result.toolbar.lineTypes.${type}`) }}
          </option>
        </select>
      </div>
    </div>
    <div class="plan-toolbelt__field">
      <span class="plan-toolbelt__field-label">{{ t('result.toolbar.lineThickness') }}</span>
      <div class="plan-toolbelt__field-controls">
        <input
          type="text"
          inputmode="numeric"
          class="plan-toolbelt__thickness-input"
          :aria-label="t('result.toolbar.lineThickness')"
          :value="drawLineThickness"
          @input="onThicknessInput"
        />
        <span class="plan-toolbelt__unit">{{ t('common.px') }}</span>
      </div>
    </div>
    <div class="plan-toolbelt__field">
      <span class="plan-toolbelt__field-label">{{ t('result.toolbar.lineColor') }}</span>
      <div class="plan-toolbelt__field-controls">
        <HexColorField v-model="drawLineColor" :aria-label="t('result.toolbar.lineColor')" />
      </div>
    </div>
  </template>
  <template v-if="activeTool === 'draw_label'">
    <div class="plan-toolbelt__field">
      <span class="plan-toolbelt__field-label">{{ t('result.toolbar.labelText') }}</span>
      <div class="plan-toolbelt__field-controls">
        <input
          type="text"
          class="plan-toolbelt__input plan-toolbelt__input--wide"
          :aria-label="t('result.toolbar.labelText')"
          :value="drawLabelText"
          @input="onLabelInput"
        />
      </div>
    </div>
    <PlanToolbarLabelStyle
      v-model:font-size="drawLabelFontSize"
      v-model:font-color="drawLabelFontColor"
      v-model:outline="drawLabelOutline"
      v-model:bold="drawLabelBold"
      v-model:italic="drawLabelItalic"
    />
  </template>
</template>
