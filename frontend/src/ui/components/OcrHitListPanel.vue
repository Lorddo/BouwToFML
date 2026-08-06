<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { OcrTextCandidate } from '@/core/extraction'
import { ocrHitKey } from '@/cv/port/ocrHitKey'

defineProps<{
  hits: OcrTextCandidate[]
}>()

const emit = defineEmits<{
  remove: [key: string]
}>()

const { t } = useI18n()
const open = ref(false)
</script>

<template>
  <div v-if="hits.length > 0" class="ocr-hit-list">
    <button type="button" class="toggle" :aria-expanded="open" @click="open = !open">
      <span class="toggle-label">{{
        t('templates.ocrHits.foundWords', { count: hits.length })
      }}</span>
      <span class="chevron" aria-hidden="true">{{ open ? '▾' : '▸' }}</span>
    </button>
    <p v-show="open" class="hint">{{ t('templates.ocrHits.shiftClickHint') }}</p>
    <ul v-show="open" class="hits">
      <li v-for="hit in hits" :key="ocrHitKey(hit)" class="hit-row">
        <span class="hit-text" :title="hit.text">{{ hit.text }}</span>
        <span class="hit-conf">{{ Math.round(hit.confidence) }}%</span>
        <button
          type="button"
          class="hit-remove"
          :title="t('templates.ocrHits.removeFromMask')"
          :aria-label="t('templates.ocrHits.removeFromMask')"
          @click="emit('remove', ocrHitKey(hit))"
        >
          ×
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.ocr-hit-list {
  margin-top: 10px;
  border-top: 1px solid #e2e8f0;
  padding-top: 10px;
}

.toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 4px 0;
  border: none;
  background: transparent;
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  text-align: left;
}

.toggle:hover {
  background: transparent;
  color: #0f172a;
}

.chevron {
  color: #64748b;
  font-size: 12px;
}

.hits {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  max-height: 240px;
  overflow-y: auto;
}

.hint {
  margin: 0 0 6px;
  font-size: 11px;
  color: #64748b;
}

.hit-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 8px;
  align-items: center;
  padding: 4px 0;
  border-bottom: 1px solid #f1f5f9;
  font-size: 12px;
}

.hit-row:last-child {
  border-bottom: none;
}

.hit-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #1e293b;
}

.hit-conf {
  font-variant-numeric: tabular-nums;
  color: #64748b;
  min-width: 36px;
  text-align: right;
}

.hit-remove {
  width: 24px;
  height: 24px;
  padding: 0;
  line-height: 1;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  color: #dc2626;
  background: #fff;
  font-size: 16px;
}

.hit-remove:hover {
  background: #fef2f2;
  border-color: #fecaca;
}
</style>
