<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { FLOOR_LINE_TYPES, type FloorLineType } from '@/core/fml/types'
import HexColorField from './HexColorField.vue'
import FmlPreviewToolbarLabelStyle from './FmlPreviewToolbarLabelStyle.vue'
import type { FmlToolId } from './canvas/fmlToolbeltItems'
import './fml-toolbelt-settings-fields.css'

const { t } = useI18n()

const drawSurfaceRole = defineModel<number | null>('drawSurfaceRole', { default: null })
const drawLineThickness = defineModel<number>('drawLineThickness', { default: 2 })
const drawLineType = defineModel<FloorLineType>('drawLineType', { default: 'solid_line' })
const drawLineColor = defineModel<string>('drawLineColor', { default: '#000000' })
const drawLabelText = defineModel<string>('drawLabelText', { default: 'Tekst' })
const drawLabelFontSize = defineModel<number>('drawLabelFontSize', { default: 16 })
const drawLabelFontColor = defineModel<string>('drawLabelFontColor', { default: '#000000' })
const drawLabelOutline = defineModel<boolean>('drawLabelOutline', { default: false })
const drawLabelBold = defineModel<boolean>('drawLabelBold', { default: false })
const drawLabelItalic = defineModel<boolean>('drawLabelItalic', { default: false })

withDefaults(
  defineProps<{
    activeTool: FmlToolId | null
    roomTypes: ReadonlyArray<{ role: number; name: string; color: string }>
    dakMode?: boolean
  }>(),
  { dakMode: false },
)

function onRoleChange(event: Event): void {
  const raw = (event.target as HTMLSelectElement).value
  drawSurfaceRole.value = raw === '' ? null : Number(raw)
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
  <div v-if="activeTool === 'draw_surface' && !dakMode" class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.roomType') }}</span>
    <div class="fml-toolbelt__field-controls">
      <select
        class="fml-toolbelt__select"
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
  <template v-if="activeTool === 'draw_line'">
    <div class="fml-toolbelt__field">
      <span class="fml-toolbelt__field-label">{{ t('result.toolbar.lineType') }}</span>
      <div class="fml-toolbelt__field-controls">
        <select
          class="fml-toolbelt__select"
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
    <div class="fml-toolbelt__field">
      <span class="fml-toolbelt__field-label">{{ t('result.toolbar.lineThickness') }}</span>
      <div class="fml-toolbelt__field-controls">
        <input
          type="text"
          inputmode="numeric"
          class="fml-toolbelt__thickness-input"
          :aria-label="t('result.toolbar.lineThickness')"
          :value="drawLineThickness"
          @input="onThicknessInput"
        />
        <span class="fml-toolbelt__unit">{{ t('common.px') }}</span>
      </div>
    </div>
    <div class="fml-toolbelt__field">
      <span class="fml-toolbelt__field-label">{{ t('result.toolbar.lineColor') }}</span>
      <div class="fml-toolbelt__field-controls">
        <HexColorField v-model="drawLineColor" :aria-label="t('result.toolbar.lineColor')" />
      </div>
    </div>
  </template>
  <template v-if="activeTool === 'draw_label'">
    <div class="fml-toolbelt__field">
      <span class="fml-toolbelt__field-label">{{ t('result.toolbar.labelText') }}</span>
      <div class="fml-toolbelt__field-controls">
        <input
          type="text"
          class="fml-toolbelt__input fml-toolbelt__input--wide"
          :aria-label="t('result.toolbar.labelText')"
          :value="drawLabelText"
          @input="onLabelInput"
        />
      </div>
    </div>
    <FmlPreviewToolbarLabelStyle
      v-model:font-size="drawLabelFontSize"
      v-model:font-color="drawLabelFontColor"
      v-model:outline="drawLabelOutline"
      v-model:bold="drawLabelBold"
      v-model:italic="drawLabelItalic"
    />
  </template>
</template>
