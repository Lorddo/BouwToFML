<script setup lang="ts">
defineProps<{
  showSkeleton: boolean
  showSkeletonLayerB: boolean
  showSemanticLayerC: boolean
  showLayer4: boolean
  showLayer5: boolean
  showLayer6: boolean
  showLayer7: boolean
  showLayer8: boolean
  showLayer9: boolean
  showLayer10: boolean
  showLayer11: boolean
  showLayer12: boolean
  showLayer14: boolean
  showWallLines: boolean
  showLines: boolean
}>()

const emit = defineEmits<{
  toggleSkeleton: [value: boolean]
  toggleSkeletonLayerB: [value: boolean]
  toggleSemanticLayerC: [value: boolean]
  toggleLayer4: [value: boolean]
  toggleLayer5: [value: boolean]
  toggleLayer6: [value: boolean]
  toggleLayer7: [value: boolean]
  toggleLayer8: [value: boolean]
  toggleLayer9: [value: boolean]
  toggleLayer10: [value: boolean]
  toggleLayer11: [value: boolean]
  toggleLayer12: [value: boolean]
  toggleLayer14: [value: boolean]
  toggleWallLines: [value: boolean]
  toggleLines: [value: boolean]
}>()
</script>

<template>
  <div class="panel layers-panel">
    <p class="section-label">Eindlagen</p>
    <label>
      <input :checked="showLayer10" type="checkbox" @change="emit('toggleLayer10', ($event.target as HTMLInputElement).checked)" />
      Laag 10 (muren FML)
    </label>
    <label>
      <input :checked="showLayer12" type="checkbox" @change="emit('toggleLayer12', ($event.target as HTMLInputElement).checked)" />
      Laag 12 (deur swing)
    </label>
    <label>
      <input :checked="showLayer14" type="checkbox" @change="emit('toggleLayer14', ($event.target as HTMLInputElement).checked)" />
      Laag 14 (raam bind)
    </label>

    <details class="intermediate-details">
      <summary>Tussenlagen</summary>
      <label>
        <input :checked="showSkeleton" type="checkbox" @change="emit('toggleSkeleton', ($event.target as HTMLInputElement).checked)" />
        Laag 1
      </label>
      <label>
        <input :checked="showSkeletonLayerB" type="checkbox" @change="emit('toggleSkeletonLayerB', ($event.target as HTMLInputElement).checked)" />
        Laag 2
      </label>
      <label>
        <input :checked="showSemanticLayerC" type="checkbox" @change="emit('toggleSemanticLayerC', ($event.target as HTMLInputElement).checked)" />
        Laag 3
      </label>
      <label>
        <input :checked="showLayer4" type="checkbox" @change="emit('toggleLayer4', ($event.target as HTMLInputElement).checked)" />
        Laag 4
      </label>
      <label>
        <input :checked="showLayer5" type="checkbox" @change="emit('toggleLayer5', ($event.target as HTMLInputElement).checked)" />
        Laag 5
      </label>
      <label>
        <input :checked="showLayer6" type="checkbox" @change="emit('toggleLayer6', ($event.target as HTMLInputElement).checked)" />
        Laag 6
      </label>
      <label>
        <input :checked="showLayer7" type="checkbox" @change="emit('toggleLayer7', ($event.target as HTMLInputElement).checked)" />
        Laag 7
      </label>
      <label>
        <input :checked="showLayer8" type="checkbox" @change="emit('toggleLayer8', ($event.target as HTMLInputElement).checked)" />
        Laag 8
      </label>
      <label>
        <input :checked="showLayer9" type="checkbox" @change="emit('toggleLayer9', ($event.target as HTMLInputElement).checked)" />
        Laag 9 (dissolve)
      </label>
      <label>
        <input :checked="showLayer11" type="checkbox" @change="emit('toggleLayer11', ($event.target as HTMLInputElement).checked)" />
        Laag 11 (deur snap)
      </label>
    </details>

    <label>
      <input :checked="showWallLines" type="checkbox" @change="emit('toggleWallLines', ($event.target as HTMLInputElement).checked)" />
      Centerlines
    </label>
    <label>
      <input :checked="showLines" type="checkbox" @change="emit('toggleLines', ($event.target as HTMLInputElement).checked)" />
      Ruwe lijnen
    </label>
  </div>
</template>

<style scoped>
.layers-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 4px;
}

.section-label {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.layers-panel label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  min-height: 24px;
}

.intermediate-details {
  display: grid;
  gap: 4px;
  margin: 4px 0;
  font-size: 12px;
}

.intermediate-details summary {
  cursor: pointer;
  color: #64748b;
  margin-bottom: 2px;
}

.intermediate-details label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  min-height: 24px;
}
</style>
