<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import type { RoofKind } from '@/core/plg/extension-types'
import { DEFAULT_FLOOR_THICKNESS_CM } from '@/core/plan/floor-stack'
import { roofVertexZMinCm } from '@/core/plan/roof-planes'
import ScaleLengthInput from './ScaleLengthInput.vue'
import ToolbeltActionButton from './canvas/ToolbeltActionButton.vue'
import './plan-toolbelt-settings-fields.css'
import { TOOLBELT_HOTKEY_PRIORITY } from '@/ui/composables/canvas/useToolbeltHotkey'

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    unit: ScaleInputUnit
    roofVertexZCm?: number | null
    roofVertexIndex?: number | null
    polyMutate?: boolean
    roofKind?: RoofKind
    roofParentId?: string | null
    parentRoofOptions?: ReadonlyArray<{ id: string; label: string }>
    slabThicknessCm?: number
  }>(),
  { slabThicknessCm: DEFAULT_FLOOR_THICKNESS_CM },
)

const roofZMinCm = computed(() => roofVertexZMinCm(props.slabThicknessCm))

const emit = defineEmits<{
  roofVertexZInput: [cm: number]
  beginSurfacePolygonEdit: []
  endSurfacePolygonEdit: []
  deleteTagged: []
  applyRoofKind: [kind: RoofKind]
  applyRoofParentId: [parentId: string | null]
}>()

function onKindChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  emit('applyRoofKind', value === 'dormer' ? 'dormer' : 'plane')
}

function onParentChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  emit('applyRoofParentId', value.trim() ? value : null)
}
</script>

<template>
  <span class="plan-toolbelt__meta">{{ t('result.toolbar.roofPlaneSelected') }}</span>
  <div class="plan-toolbelt__field">
    <span class="plan-toolbelt__field-label">{{ t('result.toolbar.roofKind') }}</span>
    <div class="plan-toolbelt__field-controls">
      <select
        class="plan-toolbelt__select"
        :aria-label="t('result.toolbar.roofKind')"
        :value="roofKind === 'dormer' ? 'dormer' : 'plane'"
        @change="onKindChange"
      >
        <option value="plane">{{ t('result.toolbar.roofKindPlane') }}</option>
        <option value="dormer">{{ t('result.toolbar.roofKindDormer') }}</option>
      </select>
    </div>
  </div>
  <div v-if="roofKind === 'dormer'" class="plan-toolbelt__field">
    <span class="plan-toolbelt__field-label">{{ t('result.toolbar.roofParent') }}</span>
    <div class="plan-toolbelt__field-controls">
      <select
        class="plan-toolbelt__select"
        :aria-label="t('result.toolbar.roofParent')"
        :value="roofParentId ?? ''"
        @change="onParentChange"
      >
        <option value="">{{ t('result.toolbar.roofParentNone') }}</option>
        <option v-for="opt in parentRoofOptions ?? []" :key="opt.id" :value="opt.id">
          {{ opt.label }}
        </option>
      </select>
    </div>
  </div>
  <div class="plan-toolbelt__field">
    <span class="plan-toolbelt__field-label">{{ t('result.toolbar.roofVertexZ') }}</span>
    <div class="plan-toolbelt__field-controls">
      <ScaleLengthInput
        :key="`roof-z-${roofVertexIndex ?? 'none'}`"
        :cm="roofVertexZCm ?? 0"
        :unit="unit"
        :min-cm="roofZMinCm"
        allow-zero
        allow-negative
        :disabled="roofVertexZCm == null"
        :aria-label="t('result.toolbar.roofVertexZAria', { unit: t(`common.${unit}`) })"
        input-class="plan-toolbelt__input"
        @update:cm="emit('roofVertexZInput', $event)"
      />
    </div>
  </div>
  <button
    v-if="!polyMutate"
    type="button"
    class="plan-toolbelt__btn"
    :title="t('result.toolbar.roofPolyMutateHint')"
    @click="emit('beginSurfacePolygonEdit')"
  >
    {{ t('result.toolbar.editSurfacePolygon') }}
  </button>
  <button
    v-else
    type="button"
    class="plan-toolbelt__btn"
    :title="t('result.toolbar.doneSurfacePolygon')"
    @click="emit('endSurfacePolygonEdit')"
  >
    {{ t('result.toolbar.doneSurfacePolygon') }}
  </button>
  <ToolbeltActionButton
    icon="delete"
    :title="t('result.toolbar.deleteSurface')"
    :aria-label="t('result.toolbar.deleteSurface')"
    hotkey="Delete"
    :hotkey-priority="TOOLBELT_HOTKEY_PRIORITY.object"
    @click="emit('deleteTagged')"
  />
</template>
