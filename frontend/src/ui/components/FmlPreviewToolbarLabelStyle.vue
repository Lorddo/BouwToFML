<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import HexColorField from './HexColorField.vue'
import ToolbeltIcon from './canvas/ToolbeltIcon.vue'
import { clampLabelFontSize } from '@/ui/composables/fml-preview/fml-preview-render-annotations'
import './fml-toolbelt-settings-fields.css'

const { t } = useI18n()

const fontSize = defineModel<number>('fontSize', { default: 16 })
const fontColor = defineModel<string>('fontColor', { default: '#000000' })
const outline = defineModel<boolean>('outline', { default: false })
const bold = defineModel<boolean>('bold', { default: false })
const italic = defineModel<boolean>('italic', { default: false })

function onSizeInput(event: Event): void {
  const raw = Number((event.target as HTMLInputElement).value)
  fontSize.value = clampLabelFontSize(raw)
}
</script>

<template>
  <div class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.labelSize') }}</span>
    <div class="fml-toolbelt__field-controls">
      <input
        type="text"
        inputmode="numeric"
        class="fml-toolbelt__thickness-input"
        :aria-label="t('result.toolbar.labelSize')"
        :value="fontSize"
        @input="onSizeInput"
      />
      <span class="fml-toolbelt__unit">{{ t('common.px') }}</span>
    </div>
  </div>
  <div class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.labelColor') }}</span>
    <div class="fml-toolbelt__field-controls">
      <HexColorField v-model="fontColor" :aria-label="t('result.toolbar.labelColor')" />
    </div>
  </div>
  <div class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.labelStyle') }}</span>
    <div class="fml-toolbelt__field-controls">
      <button
        type="button"
        class="canvas-toolbelt__btn"
        :class="{ 'canvas-toolbelt__btn--active': outline }"
        :title="t('result.toolbar.labelOutline')"
        :aria-label="t('result.toolbar.labelOutline')"
        :aria-pressed="outline"
        @click="outline = !outline"
      >
        <ToolbeltIcon name="text_outline" />
      </button>
      <button
        type="button"
        class="canvas-toolbelt__btn"
        :class="{ 'canvas-toolbelt__btn--active': bold }"
        :title="t('result.toolbar.labelBold')"
        :aria-label="t('result.toolbar.labelBold')"
        :aria-pressed="bold"
        @click="bold = !bold"
      >
        <ToolbeltIcon name="text_bold" />
      </button>
      <button
        type="button"
        class="canvas-toolbelt__btn"
        :class="{ 'canvas-toolbelt__btn--active': italic }"
        :title="t('result.toolbar.labelItalic')"
        :aria-label="t('result.toolbar.labelItalic')"
        :aria-pressed="italic"
        @click="italic = !italic"
      >
        <ToolbeltIcon name="text_italic" />
      </button>
    </div>
  </div>
</template>
