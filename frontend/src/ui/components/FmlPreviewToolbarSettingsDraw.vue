<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { FmlToolId } from './canvas/fmlToolbeltItems'
import './fml-toolbelt-settings-fields.css'

const { t } = useI18n()

const drawSurfaceRole = defineModel<number | null>('drawSurfaceRole', { default: null })
const drawLineThickness = defineModel<number>('drawLineThickness', { default: 2 })
const drawLabelText = defineModel<string>('drawLabelText', { default: 'Tekst' })

defineProps<{
  activeTool: FmlToolId | null
  roomTypes: ReadonlyArray<{ role: number; name: string; color: string }>
}>()

function onRoleChange(event: Event): void {
  const raw = (event.target as HTMLSelectElement).value
  drawSurfaceRole.value = raw === '' ? null : Number(raw)
}

function onThicknessInput(event: Event): void {
  const raw = Number((event.target as HTMLInputElement).value)
  drawLineThickness.value = Number.isFinite(raw) ? Math.max(1, Math.round(raw)) : 2
}

function onLabelInput(event: Event): void {
  drawLabelText.value = (event.target as HTMLInputElement).value
}
</script>

<template>
  <div v-if="activeTool === 'draw_surface'" class="fml-toolbelt__field">
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
  <div v-if="activeTool === 'draw_line'" class="fml-toolbelt__field">
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
    </div>
  </div>
  <div v-if="activeTool === 'draw_label'" class="fml-toolbelt__field">
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
</template>
