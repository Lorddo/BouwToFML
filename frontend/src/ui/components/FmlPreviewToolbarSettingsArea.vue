<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import ToolbeltActionButton from './canvas/ToolbeltActionButton.vue'
import HexColorField from './HexColorField.vue'
import ScaleLengthInput from './ScaleLengthInput.vue'
import './fml-toolbelt-settings-fields.css'
import { TOOLBELT_HOTKEY_PRIORITY } from '@/ui/composables/canvas/useToolbeltHotkey'

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    unit: ScaleInputUnit
    selectedAreaPanel: {
      kind: 'area' | 'surface'
      id: string
      role: number | null
      name: string | null
      customName: string
      color: string
      showAreaLabel: boolean
      canEditPolygon: boolean
      isCutout?: boolean
    } | null
    roomTypes: ReadonlyArray<{ role: number; name: string; color: string }>
    surfaceEditActive?: boolean
    roofVertexZCm?: number | null
    roofVertexIndex?: number | null
  }>(),
  {
    roomTypes: () => [],
    surfaceEditActive: false,
    roofVertexZCm: null,
    roofVertexIndex: null,
  },
)

const emit = defineEmits<{
  applyRoomType: [role: number]
  areaCustomNameInput: [customName: string]
  applyAreaCustomName: [customName: string]
  applyAreaColor: [color: string]
  applyShowAreaLabel: [show: boolean]
  applySurfaceCutout: [isCutout: boolean]
  deleteTagged: []
  beginSurfacePolygonEdit: []
  endSurfacePolygonEdit: []
  roofVertexZInput: [cm: number]
}>()

const taggedKindLabel = computed(() => {
  if (!props.selectedAreaPanel) return ''
  return props.selectedAreaPanel.kind === 'surface'
    ? t('result.toolbar.surfaceSelected')
    : t('result.toolbar.areaSelected')
})

function onRoomTypeChange(event: Event): void {
  const raw = (event.target as HTMLSelectElement).value
  if (raw === '') return
  emit('applyRoomType', Number(raw))
}

function onCustomNameInput(event: Event): void {
  emit('areaCustomNameInput', (event.target as HTMLInputElement).value)
}

function onCustomNameChange(event: Event): void {
  emit('applyAreaCustomName', (event.target as HTMLInputElement).value)
}

function onAreaColorInput(color: string): void {
  emit('applyAreaColor', color)
}

function onHideLabelChange(event: Event): void {
  emit('applyShowAreaLabel', !(event.target as HTMLInputElement).checked)
}

function onCutoutChange(event: Event): void {
  emit('applySurfaceCutout', (event.target as HTMLInputElement).checked)
}
</script>

<template>
  <span v-if="selectedAreaPanel" class="fml-toolbelt__meta">{{ taggedKindLabel }}</span>
  <div v-if="selectedAreaPanel" class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.roomType') }}</span>
    <div class="fml-toolbelt__field-controls">
      <select
        class="fml-toolbelt__select"
        :aria-label="t('result.toolbar.roomType')"
        :value="selectedAreaPanel.role ?? ''"
        @change="onRoomTypeChange"
      >
        <option value="">{{ t('result.toolbar.roomTypeNone') }}</option>
        <option v-for="rt in roomTypes" :key="rt.role" :value="rt.role">
          {{ rt.name }}
        </option>
      </select>
    </div>
  </div>
  <div v-if="selectedAreaPanel" class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.customName') }}</span>
    <div class="fml-toolbelt__field-controls">
      <input
        class="fml-toolbelt__input"
        type="text"
        :aria-label="t('result.toolbar.customName')"
        :value="selectedAreaPanel.customName"
        @input="onCustomNameInput"
        @change="onCustomNameChange"
      />
    </div>
  </div>
  <div v-if="selectedAreaPanel" class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.areaColor') }}</span>
    <div class="fml-toolbelt__field-controls">
      <HexColorField
        :model-value="selectedAreaPanel.color"
        :aria-label="t('result.toolbar.areaColor')"
        @update:model-value="onAreaColorInput"
      />
    </div>
  </div>
  <div v-if="selectedAreaPanel" class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.areaLabel') }}</span>
    <div class="fml-toolbelt__field-controls">
      <label class="fml-toolbelt__checkbox">
        <input
          type="checkbox"
          :checked="selectedAreaPanel.showAreaLabel === false"
          :aria-label="t('result.toolbar.hideAreaLabel')"
          @change="onHideLabelChange"
        />
        <span>{{ t('result.toolbar.hideAreaLabel') }}</span>
      </label>
    </div>
  </div>
  <div v-if="selectedAreaPanel?.kind === 'surface'" class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.surfaceCutout') }}</span>
    <div class="fml-toolbelt__field-controls">
      <label class="fml-toolbelt__checkbox">
        <input
          type="checkbox"
          :checked="selectedAreaPanel.isCutout === true"
          :aria-label="t('result.toolbar.surfaceCutout')"
          @change="onCutoutChange"
        />
        <span>{{ t('result.toolbar.surfaceCutoutActive') }}</span>
      </label>
    </div>
  </div>
  <div v-if="selectedAreaPanel?.canEditPolygon && surfaceEditActive" class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.roofVertexZ') }}</span>
    <div class="fml-toolbelt__field-controls">
      <ScaleLengthInput
        :key="`roof-z-${roofVertexIndex ?? 'none'}`"
        :cm="roofVertexZCm ?? 0"
        :unit="unit"
        :min-cm="0"
        allow-zero
        :disabled="roofVertexZCm == null"
        :aria-label="t('result.toolbar.roofVertexZAria', { unit: t(`common.${unit}`) })"
        input-class="fml-toolbelt__input"
        @update:cm="emit('roofVertexZInput', Math.max(0, $event))"
      />
    </div>
  </div>
  <button
    v-if="selectedAreaPanel?.canEditPolygon && !surfaceEditActive"
    type="button"
    class="fml-toolbelt__btn"
    :title="t('result.toolbar.editSurfacePolygon')"
    @click="emit('beginSurfacePolygonEdit')"
  >
    {{ t('result.toolbar.editSurfacePolygon') }}
  </button>
  <button
    v-if="selectedAreaPanel?.canEditPolygon && surfaceEditActive"
    type="button"
    class="fml-toolbelt__btn"
    :title="t('result.toolbar.doneSurfacePolygon')"
    @click="emit('endSurfacePolygonEdit')"
  >
    {{ t('result.toolbar.doneSurfacePolygon') }}
  </button>
  <ToolbeltActionButton
    v-if="selectedAreaPanel"
    icon="delete"
    :title="
      selectedAreaPanel.kind === 'surface'
        ? t('result.toolbar.deleteSurface')
        : t('result.toolbar.deleteArea')
    "
    :aria-label="
      selectedAreaPanel.kind === 'surface'
        ? t('result.toolbar.deleteSurface')
        : t('result.toolbar.deleteArea')
    "
    hotkey="Delete"
    :hotkey-priority="TOOLBELT_HOTKEY_PRIORITY.object"
    @click="emit('deleteTagged')"
  />
</template>
