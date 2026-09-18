<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import ScaleLengthInput from './ScaleLengthInput.vue'
import OpeningFrameFields from './OpeningFrameFields.vue'
import ToolbeltActionButton from './canvas/ToolbeltActionButton.vue'
import ToolbeltIcon from './canvas/ToolbeltIcon.vue'
import './plan-toolbelt-settings-fields.css'
import { TOOLBELT_HOTKEY_PRIORITY } from '@/ui/composables/canvas/useToolbeltHotkey'

defineProps<{
  unit: ScaleInputUnit
  selectedItemPanel: {
    id: string
    label: string
    widthCm: number
    heightCm: number
    rotationDeg: number
    mirroredX: boolean
    mirroredY: boolean
    showFrame?: boolean
    showRoofPose?: boolean
    zCm?: number
    pitchDeg?: number
    frameLeftCm?: number
    frameRightCm?: number
    frameTopCm?: number
    frameBottomCm?: number
  }
}>()

const emit = defineEmits<{
  itemWidthCm: [cm: number]
  itemHeightCm: [cm: number]
  itemZCm: [cm: number]
  itemPitchInput: [event: Event]
  itemRotationInput: [event: Event]
  toggleItemMirrorX: []
  toggleItemMirrorY: []
  itemFrameLeft: [cm: number]
  itemFrameRight: [cm: number]
  itemFrameTop: [cm: number]
  itemFrameBottom: [cm: number]
  copyItem: []
  deleteItem: []
}>()

const { t } = useI18n()
</script>

<template>
  <div class="plan-toolbelt-stack">
    <div class="plan-toolbelt__row plan-toolbelt__row--primary">
  <label class="plan-toolbelt__field">
    <span class="plan-toolbelt__field-label">{{ t('viewer.itemWidth') }}</span>
    <span class="plan-toolbelt__field-controls">
      <ScaleLengthInput
        :cm="selectedItemPanel.widthCm"
        :unit="unit"
        :min-cm="1"
        :aria-label="t('viewer.itemWidth')"
        input-class="plan-toolbelt__thickness-input"
        @update:cm="emit('itemWidthCm', $event)"
      />
    </span>
  </label>
  <label class="plan-toolbelt__field">
    <span class="plan-toolbelt__field-label">{{ t('viewer.itemDepth') }}</span>
    <span class="plan-toolbelt__field-controls">
      <ScaleLengthInput
        :cm="selectedItemPanel.heightCm"
        :unit="unit"
        :min-cm="1"
        :aria-label="t('viewer.itemDepth')"
        input-class="plan-toolbelt__thickness-input"
        @update:cm="emit('itemHeightCm', $event)"
      />
    </span>
  </label>
  <label v-if="selectedItemPanel.showRoofPose" class="plan-toolbelt__field">
    <span class="plan-toolbelt__field-label">{{ t('viewer.itemZ') }}</span>
    <span class="plan-toolbelt__field-controls">
      <ScaleLengthInput
        :cm="selectedItemPanel.zCm ?? 0"
        :unit="unit"
        :min-cm="0"
        allow-zero
        :aria-label="t('viewer.itemZ')"
        input-class="plan-toolbelt__thickness-input"
        @update:cm="emit('itemZCm', $event)"
      />
    </span>
  </label>
  <label v-if="selectedItemPanel.showRoofPose" class="plan-toolbelt__field">
    <span class="plan-toolbelt__field-label">{{ t('viewer.itemPitch') }}</span>
    <span class="plan-toolbelt__field-controls">
      <input
        type="number"
        step="0.1"
        min="0"
        max="90"
        class="plan-toolbelt__thickness-input"
        :value="selectedItemPanel.pitchDeg ?? 0"
        :aria-label="t('viewer.itemPitch')"
        @change="emit('itemPitchInput', $event)"
      />
      <span class="plan-toolbelt__unit">°</span>
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
  <label class="plan-toolbelt__field">
    <span class="plan-toolbelt__field-label">{{ t('viewer.itemRotation') }}</span>
    <span class="plan-toolbelt__field-controls">
      <input
        type="number"
        step="1"
        class="plan-toolbelt__thickness-input"
        :value="selectedItemPanel.rotationDeg"
        :aria-label="t('viewer.itemRotation')"
        @change="emit('itemRotationInput', $event)"
      />
      <span class="plan-toolbelt__unit">°</span>
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
  <ToolbeltActionButton
    icon="delete"
    :title="t('viewer.itemDelete')"
    :aria-label="t('viewer.itemDelete')"
    hotkey="Delete"
    :hotkey-priority="TOOLBELT_HOTKEY_PRIORITY.object"
    @click="emit('deleteItem')"
  />
    </div>
    <div v-if="selectedItemPanel.showFrame" class="plan-toolbelt__row">
      <OpeningFrameFields
        :unit="unit"
        :left-cm="selectedItemPanel.frameLeftCm ?? 5"
        :right-cm="selectedItemPanel.frameRightCm ?? 5"
        :top-cm="selectedItemPanel.frameTopCm ?? 5"
        :bottom-cm="selectedItemPanel.frameBottomCm ?? 5"
        @left="emit('itemFrameLeft', $event)"
        @right="emit('itemFrameRight', $event)"
        @top="emit('itemFrameTop', $event)"
        @bottom="emit('itemFrameBottom', $event)"
      />
    </div>
  </div>
</template>
