<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ToolbeltIcon from './canvas/ToolbeltIcon.vue'
import FmlPreviewToolbarLabelStyle from './FmlPreviewToolbarLabelStyle.vue'
import './fml-toolbelt-settings-fields.css'

const { t } = useI18n()

defineProps<{
  selectedLabelPanel: {
    id: string
    text: string
    fontSize: number
    fontColor: string
    outline: boolean
    bold: boolean
    italic: boolean
  } | null
}>()

const emit = defineEmits<{
  labelTextInput: [value: string]
  updateLabelText: [value: string]
  updateLabelFontSize: [value: number]
  updateLabelFontColor: [value: string]
  updateLabelOutline: [value: boolean]
  updateLabelBold: [value: boolean]
  updateLabelItalic: [value: boolean]
  deleteAnnotation: []
}>()

function onLabelTextInput(event: Event): void {
  emit('labelTextInput', (event.target as HTMLInputElement).value)
}

function onLabelTextChange(event: Event): void {
  emit('updateLabelText', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <span v-if="selectedLabelPanel" class="fml-toolbelt__meta">{{
    t('result.toolbar.labelSelected')
  }}</span>
  <div v-if="selectedLabelPanel" class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.labelText') }}</span>
    <div class="fml-toolbelt__field-controls">
      <input
        class="fml-toolbelt__input"
        type="text"
        :aria-label="t('result.toolbar.labelText')"
        :value="selectedLabelPanel.text"
        @input="onLabelTextInput"
        @change="onLabelTextChange"
      />
    </div>
  </div>
  <FmlPreviewToolbarLabelStyle
    v-if="selectedLabelPanel"
    :font-size="selectedLabelPanel.fontSize"
    :font-color="selectedLabelPanel.fontColor"
    :outline="selectedLabelPanel.outline"
    :bold="selectedLabelPanel.bold"
    :italic="selectedLabelPanel.italic"
    @update:font-size="emit('updateLabelFontSize', $event)"
    @update:font-color="emit('updateLabelFontColor', $event)"
    @update:outline="emit('updateLabelOutline', $event)"
    @update:bold="emit('updateLabelBold', $event)"
    @update:italic="emit('updateLabelItalic', $event)"
  />
  <button
    v-if="selectedLabelPanel"
    type="button"
    class="canvas-toolbelt__btn"
    :title="t('result.toolbar.deleteLabel')"
    :aria-label="t('result.toolbar.deleteLabel')"
    @click="emit('deleteAnnotation')"
  >
    <ToolbeltIcon name="delete" />
  </button>
</template>
