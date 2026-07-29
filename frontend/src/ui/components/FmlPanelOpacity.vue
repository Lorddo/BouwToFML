<script setup lang="ts">
withDefaults(
  defineProps<{
    underlayOpacity?: number
    fmlOpacity?: number
    underlayAvailable?: boolean
  }>(),
  {
    underlayOpacity: 25,
    fmlOpacity: 80,
    underlayAvailable: false,
  },
)

const emit = defineEmits<{
  'update:underlayOpacity': [value: number]
  'update:fmlOpacity': [value: number]
}>()
</script>

<template>
  <div v-if="underlayAvailable" class="underlay-opacity">
    <div class="underlay-opacity__label">
      <span>Onderlegger</span>
      <span>{{ underlayOpacity }}%</span>
    </div>
    <input
      type="range"
      min="0"
      max="100"
      step="1"
      :value="underlayOpacity"
      aria-label="Onderlegger opacity"
      @input="emit('update:underlayOpacity', Number(($event.target as HTMLInputElement).value))"
    />
  </div>
  <div class="underlay-opacity">
    <div class="underlay-opacity__label">
      <span>FML</span>
      <span>{{ fmlOpacity }}%</span>
    </div>
    <input
      type="range"
      min="0"
      max="100"
      step="1"
      :value="fmlOpacity"
      aria-label="FML opacity"
      @input="emit('update:fmlOpacity', Number(($event.target as HTMLInputElement).value))"
    />
  </div>
</template>

<style scoped>
.underlay-opacity {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0 0 8px;
  font-size: 12px;
  color: #334155;
  user-select: none;
}

.underlay-opacity__label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.underlay-opacity input[type='range'] {
  width: 100%;
  min-width: 0;
}
</style>
