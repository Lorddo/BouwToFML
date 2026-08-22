<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { OpeningType } from '@/core/fml/types'
import FmlOpeningEditFields from './FmlOpeningEditFields.vue'

const props = withDefaults(
  defineProps<{
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
  }>(),
  {
    bovenlicht: false,
    bovenlichtHeightCm: 40,
    bovenlichtGapCm: 10,
    bovenlichtPacked: true,
    hingeAtStart: true,
    swingRight: false,
    showMirrorButton: false,
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
}>()

const { t } = useI18n()

const kindLabel = computed(() =>
  props.type === 'window' ? t('result.toolbar.windowOne') : t('result.toolbar.doorOne'),
)

function emitWidth(cm: number | null): void {
  if (cm != null) emit('width', cm)
}
function emitHeight(cm: number | null): void {
  if (cm != null) emit('height', cm)
}
function emitSill(cm: number | null): void {
  if (cm != null) emit('sill', cm)
}
function emitBovenlichtHeight(cm: number | null): void {
  if (cm != null) emit('bovenlichtHeight', cm)
}
function emitBovenlichtGap(cm: number | null): void {
  if (cm != null) emit('bovenlichtGap', cm)
}
</script>

<template>
  <span class="fml-toolbelt__meta">{{ kindLabel }}</span>
  <FmlOpeningEditFields
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
    show-sill
    show-delete
    @width="emitWidth"
    @height="emitHeight"
    @sill="emitSill"
    @bovenlicht="emit('bovenlicht', ($event.target as HTMLInputElement).checked)"
    @bovenlicht-height="emitBovenlichtHeight"
    @bovenlicht-gap="emitBovenlichtGap"
    @toggle-hinge="emit('toggleHinge')"
    @toggle-swing="emit('toggleSwing')"
    @remove="emit('remove')"
  />
</template>
