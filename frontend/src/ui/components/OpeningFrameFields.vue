<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import ScaleLengthInput from './ScaleLengthInput.vue'
import './plan-toolbelt-settings-fields.css'

const props = withDefaults(
  defineProps<{
    unit: ScaleInputUnit
    leftCm: number
    rightCm: number
    topCm: number
    bottomCm: number
    leftMixed?: boolean
    rightMixed?: boolean
    topMixed?: boolean
    bottomMixed?: boolean
  }>(),
  {
    leftMixed: false,
    rightMixed: false,
    topMixed: false,
    bottomMixed: false,
  },
)

const emit = defineEmits<{
  leftInput: [cm: number]
  left: [cm: number]
  rightInput: [cm: number]
  right: [cm: number]
  topInput: [cm: number]
  top: [cm: number]
  bottomInput: [cm: number]
  bottom: [cm: number]
}>()

const { t } = useI18n()

const lastLeftCm = ref(props.leftCm)
const lastRightCm = ref(props.rightCm)
const lastTopCm = ref(props.topCm)
const lastBottomCm = ref(props.bottomCm)

watch(
  () => props.leftCm,
  (v) => {
    lastLeftCm.value = v
  },
)
watch(
  () => props.rightCm,
  (v) => {
    lastRightCm.value = v
  },
)
watch(
  () => props.topCm,
  (v) => {
    lastTopCm.value = v
  },
)
watch(
  () => props.bottomCm,
  (v) => {
    lastBottomCm.value = v
  },
)

function onLeftCm(cm: number): void {
  lastLeftCm.value = cm
  emit('leftInput', cm)
}
function onLeftCommit(): void {
  emit('left', lastLeftCm.value)
}
function onRightCm(cm: number): void {
  lastRightCm.value = cm
  emit('rightInput', cm)
}
function onRightCommit(): void {
  emit('right', lastRightCm.value)
}
function onTopCm(cm: number): void {
  lastTopCm.value = cm
  emit('topInput', cm)
}
function onTopCommit(): void {
  emit('top', lastTopCm.value)
}
function onBottomCm(cm: number): void {
  lastBottomCm.value = cm
  emit('bottomInput', cm)
}
function onBottomCommit(): void {
  emit('bottom', lastBottomCm.value)
}
</script>

<template>
  <div class="plan-toolbelt__field">
    <span class="plan-toolbelt__field-label">{{ t('result.toolbar.frameLeft') }}</span>
    <div class="plan-toolbelt__field-controls">
      <ScaleLengthInput
        :cm="leftCm"
        :unit="unit"
        :min-cm="0"
        allow-zero
        :max-cm="200"
        :mixed="leftMixed"
        :aria-label="t('result.toolbar.frameLeftAria', { unit: t(`common.${unit}`) })"
        input-class="plan-toolbelt__thickness-input"
        @update:cm="onLeftCm"
        @commit="onLeftCommit"
      />
    </div>
  </div>
  <div class="plan-toolbelt__field">
    <span class="plan-toolbelt__field-label">{{ t('result.toolbar.frameRight') }}</span>
    <div class="plan-toolbelt__field-controls">
      <ScaleLengthInput
        :cm="rightCm"
        :unit="unit"
        :min-cm="0"
        allow-zero
        :max-cm="200"
        :mixed="rightMixed"
        :aria-label="t('result.toolbar.frameRightAria', { unit: t(`common.${unit}`) })"
        input-class="plan-toolbelt__thickness-input"
        @update:cm="onRightCm"
        @commit="onRightCommit"
      />
    </div>
  </div>
  <div class="plan-toolbelt__field">
    <span class="plan-toolbelt__field-label">{{ t('result.toolbar.frameTop') }}</span>
    <div class="plan-toolbelt__field-controls">
      <ScaleLengthInput
        :cm="topCm"
        :unit="unit"
        :min-cm="0"
        allow-zero
        :max-cm="200"
        :mixed="topMixed"
        :aria-label="t('result.toolbar.frameTopAria', { unit: t(`common.${unit}`) })"
        input-class="plan-toolbelt__thickness-input"
        @update:cm="onTopCm"
        @commit="onTopCommit"
      />
    </div>
  </div>
  <div class="plan-toolbelt__field">
    <span class="plan-toolbelt__field-label">{{ t('result.toolbar.frameBottom') }}</span>
    <div class="plan-toolbelt__field-controls">
      <ScaleLengthInput
        :cm="bottomCm"
        :unit="unit"
        :min-cm="0"
        allow-zero
        :max-cm="200"
        :mixed="bottomMixed"
        :aria-label="t('result.toolbar.frameBottomAria', { unit: t(`common.${unit}`) })"
        input-class="plan-toolbelt__thickness-input"
        @update:cm="onBottomCm"
        @commit="onBottomCommit"
      />
    </div>
  </div>
</template>
