<script setup lang="ts">
defineProps<{
  mmX: number
  mmY: number
  pxX: number
  pxY: number
  canConfirm: boolean
  confirmed: boolean
  open: boolean
}>()

const emit = defineEmits<{
  updateMmX: [value: number]
  updateMmY: [value: number]
  confirm: []
  cancel: []
  toggleOpen: []
}>()
</script>

<template>
  <div class="panel">
    <h3>Schalen</h3>
    <template v-if="open">
      <div class="scale-grid">
        <label>
          <span>H (mm)</span>
          <div class="row">
            <input
              type="number"
              min="1"
              :value="mmX"
              @input="emit('updateMmX', Number(($event.target as HTMLInputElement).value))"
            />
            <span class="px">{{ pxX.toFixed(1) }}px</span>
          </div>
        </label>
        <label>
          <span>V (mm)</span>
          <div class="row">
            <input
              type="number"
              min="1"
              :value="mmY"
              @input="emit('updateMmY', Number(($event.target as HTMLInputElement).value))"
            />
            <span class="px">{{ pxY.toFixed(1) }}px</span>
          </div>
        </label>
      </div>
      <div class="actions">
        <button type="button" class="primary" :disabled="!canConfirm" @click="emit('confirm')">
          ✓ Toepassen
        </button>
        <button type="button" @click="emit('cancel')">✕ Annuleren</button>
      </div>
    </template>
    <template v-else>
      <button type="button" class="primary" @click="emit('toggleOpen')">
        Schalen openen
      </button>
    </template>
  </div>
</template>

<style scoped>
label {
  display: block;
  margin: 4px 0;
  font-size: 12px;
}

.row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.scale-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.row input {
  width: 72px;
}

.px {
  font-size: 11px;
  color: #64748b;
}
.actions {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}
</style>
