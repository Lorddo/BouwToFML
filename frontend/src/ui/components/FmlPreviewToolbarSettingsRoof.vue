<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ToolbeltIcon from './canvas/ToolbeltIcon.vue'
import './fml-toolbelt-settings-fields.css'

const { t } = useI18n()

defineProps<{
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
      <input
        class="fml-toolbelt__input"
        type="number"
        min="0"
        step="1"
        :disabled="roofVertexZCm == null"
        :aria-label="t('result.toolbar.roofVertexZAria')"
        :placeholder="t('result.toolbar.roofVertexZHint')"
        :value="roofVertexZCm ?? ''"
        @input="
          emit(
            'roofVertexZInput',
            Math.max(0, Math.round(Number(($event.target as HTMLInputElement).value) || 0)),
          )
        "
        @change="
          emit(
            'roofVertexZInput',
            Math.max(0, Math.round(Number(($event.target as HTMLInputElement).value) || 0)),
          )
        "
      />
      <span class="fml-toolbelt__suffix">cm</span>
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
