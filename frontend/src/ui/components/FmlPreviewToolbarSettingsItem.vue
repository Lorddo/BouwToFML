<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ToolbeltIcon from './canvas/ToolbeltIcon.vue'
import './fml-toolbelt-settings-fields.css'

defineProps<{
  selectedItemPanel: {
    id: string
    label: string
    widthCm: number
    heightCm: number
    rotationDeg: number
    mirroredX: boolean
    mirroredY: boolean
  }
}>()

const emit = defineEmits<{
  itemWidthInput: [event: Event]
  itemHeightInput: [event: Event]
  itemRotationInput: [event: Event]
  toggleItemMirrorX: []
  toggleItemMirrorY: []
  copyItem: []
  deleteItem: []
}>()

const { t } = useI18n()
</script>

<template>
  <label class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('viewer.itemWidth') }}</span>
    <span class="fml-toolbelt__field-controls">
      <input
        type="number"
        min="1"
        class="fml-toolbelt__thickness-input"
        :value="selectedItemPanel.widthCm"
        @change="emit('itemWidthInput', $event)"
      />
      <span class="fml-toolbelt__unit">{{ t('common.cm') }}</span>
    </span>
  </label>
  <label class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('viewer.itemDepth') }}</span>
    <span class="fml-toolbelt__field-controls">
      <input
        type="number"
        min="1"
        class="fml-toolbelt__thickness-input"
        :value="selectedItemPanel.heightCm"
        @change="emit('itemHeightInput', $event)"
      />
      <span class="fml-toolbelt__unit">{{ t('common.cm') }}</span>
    </span>
  </label>
  <button
    type="button"
    class="canvas-toolbelt__btn"
    :class="{ 'canvas-toolbelt__btn--active': selectedItemPanel.mirroredX }"
    :title="t('viewer.itemMirrorH')"
    :aria-label="t('viewer.itemMirrorH')"
    :aria-pressed="selectedItemPanel.mirroredX"
    @click="emit('toggleItemMirrorX')"
  >
    <ToolbeltIcon name="mirror_h" />
  </button>
  <button
    type="button"
    class="canvas-toolbelt__btn"
    :class="{ 'canvas-toolbelt__btn--active': selectedItemPanel.mirroredY }"
    :title="t('viewer.itemMirrorV')"
    :aria-label="t('viewer.itemMirrorV')"
    :aria-pressed="selectedItemPanel.mirroredY"
    @click="emit('toggleItemMirrorY')"
  >
    <ToolbeltIcon name="mirror_v" />
  </button>
  <label class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('viewer.itemRotation') }}</span>
    <span class="fml-toolbelt__field-controls">
      <input
        type="number"
        step="1"
        class="fml-toolbelt__thickness-input"
        :value="selectedItemPanel.rotationDeg"
        :aria-label="t('viewer.itemRotation')"
        @change="emit('itemRotationInput', $event)"
      />
      <span class="fml-toolbelt__unit">°</span>
    </span>
  </label>
  <button
    type="button"
    class="canvas-toolbelt__btn"
    :title="t('viewer.itemCopy')"
    :aria-label="t('viewer.itemCopy')"
    @click="emit('copyItem')"
  >
    <ToolbeltIcon name="copy" />
  </button>
  <button
    type="button"
    class="canvas-toolbelt__btn"
    :title="t('viewer.itemDelete')"
    :aria-label="t('viewer.itemDelete')"
    @click="emit('deleteItem')"
  >
    <ToolbeltIcon name="delete" />
  </button>
</template>
