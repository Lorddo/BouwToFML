<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import ScaleLengthInput from './ScaleLengthInput.vue'
import ToolbeltIcon from './canvas/ToolbeltIcon.vue'
import './fml-toolbelt-settings-fields.css'

const { t } = useI18n()

defineProps<{
  unit: ScaleInputUnit
  roofVertexZCm?: number | null
  polyMutate?: boolean
}>()

const emit = defineEmits<{
  roofVertexZInput: [cm: number]
  beginSurfacePolygonEdit: []
  endSurfacePolygonEdit: []
  deleteTagged: []
}>()
</script>

<template>
  <span class="fml-toolbelt__meta">{{ t('result.toolbar.roofPlaneSelected') }}</span>
  <div class="fml-toolbelt__field">
    <span class="fml-toolbelt__field-label">{{ t('result.toolbar.roofVertexZ') }}</span>
    <div class="fml-toolbelt__field-controls">
      <ScaleLengthInput
        :cm="roofVertexZCm ?? 0"
        :unit="unit"
        :min-cm="0"
        allow-zero
        :disabled="roofVertexZCm == null"
        :aria-label="t('result.toolbar.roofVertexZAria', { unit: t(`common.${unit}`) })"
        input-class="fml-toolbelt__input"
        @update:cm="emit('roofVertexZInput', Math.max(0, $event))"
      />
    </div>
  </div>
  <button
    v-if="!polyMutate"
    type="button"
    class="fml-toolbelt__btn"
    :title="t('result.toolbar.roofPolyMutateHint')"
    @click="emit('beginSurfacePolygonEdit')"
  >
    {{ t('result.toolbar.editSurfacePolygon') }}
  </button>
  <button
    v-else
    type="button"
    class="fml-toolbelt__btn"
    :title="t('result.toolbar.doneSurfacePolygon')"
    @click="emit('endSurfacePolygonEdit')"
  >
    {{ t('result.toolbar.doneSurfacePolygon') }}
  </button>
  <button
    type="button"
    class="canvas-toolbelt__btn"
    :title="t('result.toolbar.deleteSurface')"
    :aria-label="t('result.toolbar.deleteSurface')"
    @click="emit('deleteTagged')"
  >
    <ToolbeltIcon name="delete" />
  </button>
</template>
