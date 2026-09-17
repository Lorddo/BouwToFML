<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { OpeningType } from '@/core/plan/types'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import PlanOpeningEditFields from './PlanOpeningEditFields.vue'

const props = withDefaults(
  defineProps<{
    unit: ScaleInputUnit
    type: OpeningType
    widthCm: number
    heightCm: number
    sillZCm: number
    bovenlicht: boolean
    bovenlichtHeightCm: number
    bovenlichtGapCm: number
    bovenlichtPacked?: boolean
    hingeAtStart?: boolean
    swingRight?: boolean
    showMirrorButton?: boolean
    showFrame?: boolean
    frameLeftCm?: number
    frameRightCm?: number
    frameTopCm?: number
    frameBottomCm?: number
  }>(),
  {
    bovenlicht: false,
    bovenlichtHeightCm: 40,
    bovenlichtGapCm: 10,
    bovenlichtPacked: true,
    hingeAtStart: true,
    swingRight: false,
    showMirrorButton: false,
    showFrame: false,
    frameLeftCm: 5,
    frameRightCm: 5,
    frameTopCm: 5,
    frameBottomCm: 0,
  },
)

const emit = defineEmits<{
  width: [cm: number]
  height: [cm: number]
  sill: [cm: number]
  bovenlicht: [on: boolean]
  bovenlichtHeight: [cm: number]
  bovenlichtGap: [cm: number]
  toggleHinge: []
  toggleSwing: []
  remove: []
  frameLeft: [cm: number]
  frameRight: [cm: number]
  frameTop: [cm: number]
  frameBottom: [cm: number]
}>()

const { t } = useI18n()

const kindLabel = computed(() =>
  props.type === 'window' ? t('result.toolbar.windowOne') : t('result.toolbar.doorOne'),
)

function emitWidth(cm: number): void {
  emit('width', cm)
}
function emitHeight(cm: number): void {
  emit('height', cm)
}
function emitSill(cm: number): void {
  emit('sill', cm)
}
function emitBovenlichtHeight(cm: number): void {
  emit('bovenlichtHeight', cm)
}
function emitBovenlichtGap(cm: number): void {
  emit('bovenlichtGap', cm)
}
</script>

<template>
  <PlanOpeningEditFields
    :unit="unit"
    :type="type"
    :width-cm="widthCm"
    :height-cm="heightCm"
    :sill-z-cm="sillZCm"
    :bovenlicht="bovenlicht"
    :bovenlicht-height-cm="bovenlichtHeightCm"
    :bovenlicht-gap-cm="bovenlichtGapCm"
    :bovenlicht-packed="bovenlichtPacked"
    :hinge-at-start="hingeAtStart"
    :swing-right="swingRight"
    :show-mirror-button="showMirrorButton"
    :show-frame="showFrame"
    :frame-left-cm="frameLeftCm"
    :frame-right-cm="frameRightCm"
    :frame-top-cm="frameTopCm"
    :frame-bottom-cm="frameBottomCm"
    show-sill
    show-delete
    @width="emitWidth"
    @height="emitHeight"
    @sill="emitSill"
    @bovenlicht="emit('bovenlicht', ($event.target as HTMLInputElement).checked)"
    @bovenlicht-height="emitBovenlichtHeight"
    @bovenlicht-gap="emitBovenlichtGap"
    @frame-left="emit('frameLeft', $event)"
    @frame-right="emit('frameRight', $event)"
    @frame-top="emit('frameTop', $event)"
    @frame-bottom="emit('frameBottom', $event)"
    @toggle-hinge="emit('toggleHinge')"
    @toggle-swing="emit('toggleSwing')"
    @remove="emit('remove')"
  >
    <template #leading>
      <span class="plan-toolbelt__meta">{{ kindLabel }}</span>
    </template>
  </PlanOpeningEditFields>
</template>
