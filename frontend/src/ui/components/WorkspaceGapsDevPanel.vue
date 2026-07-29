<script setup lang="ts">
import type { GapsInkMode } from '@/cv/gaps'

const gapsInkMode = defineModel<GapsInkMode>('gapsInkMode', { required: true })

defineProps<{
  gapsInkModeManual: boolean
}>()

const emit = defineEmits<{
  setManual: [mode: GapsInkMode]
}>()

function onPick(mode: GapsInkMode) {
  emit('setManual', mode)
}
</script>

<template>
  <div class="panel">
    <h3>Gaten — inktmodus</h3>
    <p class="hint">
      Auto uit muur-ref (≤5 faces = solid, &gt;5 = detail). Solid = alleen Gaten-B/W.
      Detail = Otsu (Int muur) wit alleen in zwart van de gaten-laag carveën.
      Handmatig wijzigen blijft staan tot je opnieuw een muur-ref tekent.
    </p>
    <p v-if="gapsInkModeManual" class="source">Bron: handmatig</p>
    <p v-else class="source">Bron: muur-referentie (auto)</p>
    <div class="mode-row" role="group" aria-label="Gaten inktmodus">
      <label class="mode-option">
        <input
          type="radio"
          value="solid"
          :checked="gapsInkMode === 'solid'"
          @change="onPick('solid')"
        />
        Solid
      </label>
      <label class="mode-option">
        <input
          type="radio"
          value="detail"
          :checked="gapsInkMode === 'detail'"
          @change="onPick('detail')"
        />
        Detail
      </label>
    </div>
  </div>
</template>

<style scoped>
.panel {
  padding: 12px 16px;
  border-bottom: 1px solid #e2e8f0;
}

.hint {
  font-size: 12px;
  color: #64748b;
  margin: 0 0 8px;
  line-height: 1.4;
}

.source {
  font-size: 11px;
  color: #94a3b8;
  margin: 0 0 10px;
}

.mode-row {
  display: flex;
  gap: 12px;
}

.mode-option {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #334155;
  cursor: pointer;
}
</style>
