<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ToolbeltActionButton from './canvas/ToolbeltActionButton.vue'
import PlanToolbarLabelStyle from './PlanToolbarLabelStyle.vue'
import './plan-toolbelt-settings-fields.css'
import { TOOLBELT_HOTKEY_PRIORITY } from '@/ui/composables/canvas/useToolbeltHotkey'

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
  <span v-if="selectedLabelPanel" class="plan-toolbelt__meta">{{
    t('result.toolbar.labelSelected')
  }}</span>
  <div v-if="selectedLabelPanel" class="plan-toolbelt__field">
    <span class="plan-toolbelt__field-label">{{ t('result.toolbar.labelText') }}</span>
    <div class="plan-toolbelt__field-controls">
      <input
        class="plan-toolbelt__input"
        type="text"
        :aria-label="t('result.toolbar.labelText')"
        :value="selectedLabelPanel.text"
        @input="onLabelTextInput"
        @change="onLabelTextChange"
      />
    </div>
  </div>
  <PlanToolbarLabelStyle
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
  <ToolbeltActionButton
    v-if="selectedLabelPanel"
    icon="delete"
    :title="t('result.toolbar.deleteLabel')"
    :aria-label="t('result.toolbar.deleteLabel')"
    hotkey="Delete"
    :hotkey-priority="TOOLBELT_HOTKEY_PRIORITY.object"
    @click="emit('deleteAnnotation')"
  />
</template>
