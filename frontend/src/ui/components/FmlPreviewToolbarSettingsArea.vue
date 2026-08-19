<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ToolbeltIcon from './canvas/ToolbeltIcon.vue'
import './fml-toolbelt-settings-fields.css'

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    selectedAreaPanel: {
      kind: 'area' | 'surface'
      id: string
      role: number | null
      name: string | null
      customName: string
      color: string
      canEditPolygon: boolean
    } | null
    roomTypes: ReadonlyArray<{ role: number; name: string; color: string }>
    surfaceEditActive?: boolean
  }>(),
  {
    roomTypes: () => [],
    surfaceEditActive: false,
  },
)

const emit = defineEmits<{
  applyRoomType: [role: number]
  areaCustomNameInput: [customName: string]
  applyAreaCustomName: [customName: string]
  applyAreaColor: [color: string]
  deleteTagged: []
  beginSurfacePolygonEdit: []
  endSurfacePolygonEdit: []
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

function onAreaColorInput(event: Event): void {
  emit('applyAreaColor', (event.target as HTMLInputElement).value)
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
      <input
        type="color"
        :aria-label="t('result.toolbar.areaColor')"
        :value="selectedAreaPanel.color"
        @input="onAreaColorInput"
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
  <button
    v-if="selectedAreaPanel"
    type="button"
    class="canvas-toolbelt__btn"
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
    @click="emit('deleteTagged')"
  >
    <ToolbeltIcon name="delete" />
  </button>
</template>
