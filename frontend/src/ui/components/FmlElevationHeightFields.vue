<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { ElevationStackRow } from '@/core/fml/floor-stack'

defineProps<{
  rows: ElevationStackRow[]
}>()

const emit = defineEmits<{
  nok: [cm: number]
  story: [floorIndex: number, cm: number]
  slab: [floorIndex: number, cm: number]
}>()

const { t } = useI18n()

function onNumber(event: Event): number | null {
  const raw = Number((event.target as HTMLInputElement).value)
  if (!Number.isFinite(raw) || raw < 0) return null
  return Math.round(raw)
}
</script>

<template>
  <div class="elev-heights">
    <p class="elev-heights__hint">{{ t('viewer.elevationHeightsHint') }}</p>
    <label v-for="(row, index) in rows" :key="`${row.kind}-${index}`" class="elev-heights__row">
      <span v-if="row.kind === 'nok'">{{ t('viewer.elevationNok') }}</span>
      <span v-else-if="row.kind === 'story'">{{ row.name }}</span>
      <span v-else>{{ t('viewer.elevationSlab', { name: row.name }) }}</span>
      <input
        v-if="row.kind === 'nok'"
        type="number"
        min="0"
        :value="row.thicknessCm"
        @change="
          (event) => {
            const cm = onNumber(event)
            if (cm != null) emit('nok', cm)
          }
        "
      />
      <input
        v-else-if="row.kind === 'story'"
        type="number"
        min="1"
        :value="row.heightCm"
        @change="
          (event) => {
            const cm = onNumber(event)
            if (cm != null) emit('story', row.floorIndex, cm)
          }
        "
      />
      <input
        v-else
        type="number"
        min="0"
        :value="row.thicknessCm"
        @change="
          (event) => {
            const cm = onNumber(event)
            if (cm != null) emit('slab', row.floorIndex, cm)
          }
        "
      />
    </label>
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

.elev-heights__row {
  display: grid;
  grid-template-columns: 1fr 72px;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  color: #334155;
}

.elev-heights__row input {
  width: 100%;
  box-sizing: border-box;
}
</style>
