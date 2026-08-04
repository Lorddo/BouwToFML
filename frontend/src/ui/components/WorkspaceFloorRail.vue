<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { FloorMeta } from '../composables/project/types'

defineProps<{
  floors: FloorMeta[]
  activeFloorId: string
  busy?: boolean
}>()

defineEmits<{
  selectFloor: [id: string]
  addFloor: []
}>()

const { t } = useI18n()
</script>

<template>
  <div class="floor-rail" :aria-busy="busy ? 'true' : undefined">
    <span class="rail-label">{{ t('project.railLabel') }}</span>
    <div class="rail-floors">
      <button
        v-for="floor in floors"
        :key="floor.id"
        type="button"
        class="floor-chip"
        :class="{ active: floor.id === activeFloorId }"
        :disabled="busy"
        :title="`${floor.name} (${floor.status})`"
        @click="$emit('selectFloor', floor.id)"
      >
        {{ floor.name }}
      </button>
      <button type="button" class="floor-chip add" :disabled="busy" @click="$emit('addFloor')">
        +
      </button>
    </div>
  </div>
</template>

<style scoped>
.floor-rail {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
  flex-shrink: 0;
}
.rail-label {
  font-size: 11px;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}
.rail-floors {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  min-width: 0;
}
.floor-chip {
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 12px;
  cursor: pointer;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.floor-chip.active {
  border-color: #2563eb;
  background: #dbeafe;
  color: #1e3a8a;
  font-weight: 600;
}
.floor-chip.add {
  min-width: 28px;
  font-weight: 600;
}
.floor-chip:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
