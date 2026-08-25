<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { ElevationProjectionMode } from '@/core/fml/elevation-views'
import type { ElevationFloorGroup } from '@/core/fml/floor-stack'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import ScaleLengthInput from './ScaleLengthInput.vue'

defineProps<{
  unit: ScaleInputUnit
  dakThicknessCm: number
  floors: ElevationFloorGroup[]
  projection?: ElevationProjectionMode
}>()

const emit = defineEmits<{
  nok: [cm: number]
  story: [floorIndex: number, cm: number]
  slab: [floorIndex: number, cm: number]
  projection: [mode: ElevationProjectionMode]
}>()

const { t } = useI18n()
</script>

<template>
  <div class="elev-heights">
    <p class="elev-heights__hint">{{ t('viewer.elevationHeightsHint') }}</p>
    <label class="elev-heights__row elev-heights__row--select">
      <span>{{ t('viewer.elevationProjection') }}</span>
      <select
        :value="projection ?? 'architect'"
        @change="
          emit(
            'projection',
            ($event.target as HTMLSelectElement).value === 'projective'
              ? 'projective'
              : 'architect',
          )
        "
      >
        <option value="architect">{{ t('viewer.elevationProjectionArchitect') }}</option>
        <option value="projective">{{ t('viewer.elevationProjectionProjective') }}</option>
      </select>
    </label>
    <p class="elev-heights__hint">{{ t('viewer.elevationProjectionHint') }}</p>
    <label class="elev-heights__row">
      <span>{{ t('viewer.elevationNok') }}</span>
      <ScaleLengthInput
        block
        :cm="dakThicknessCm"
        :unit="unit"
        :min-cm="0"
        allow-zero
        @update:cm="emit('nok', $event)"
      />
    </label>
    <div v-for="floor in floors" :key="floor.floorIndex" class="elev-heights__floor">
      <p class="elev-heights__floor-name">{{ floor.name }}</p>
      <label class="elev-heights__row">
        <span>{{ t('viewer.elevationStory') }}</span>
        <ScaleLengthInput
          block
          :cm="floor.heightCm"
          :unit="unit"
          :min-cm="1"
          @update:cm="emit('story', floor.floorIndex, $event)"
        />
      </label>
      <label class="elev-heights__row">
        <span>{{ t('viewer.elevationSlabShort') }}</span>
        <ScaleLengthInput
          block
          :cm="floor.slabCm"
          :unit="unit"
          :min-cm="0"
          allow-zero
          @update:cm="emit('slab', floor.floorIndex, $event)"
        />
      </label>
    </div>
  </div>
</template>

<style scoped>
.elev-heights {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.elev-heights__hint {
  margin: 0 0 4px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.4;
}

.elev-heights__floor {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
}

.elev-heights__floor-name {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: #0f172a;
}

.elev-heights__row {
  display: grid;
  grid-template-columns: minmax(4.5rem, 1fr) minmax(8rem, 1.4fr);
  gap: 8px;
  align-items: center;
  font-size: 12px;
  color: #334155;
}

.elev-heights__row :deep(.scale-length-input) {
  width: 100%;
  min-width: 0;
}

.elev-heights__row select {
  width: 100%;
  box-sizing: border-box;
}

.elev-heights__row--select {
  grid-template-columns: 1fr minmax(110px, 1fr);
}
</style>
