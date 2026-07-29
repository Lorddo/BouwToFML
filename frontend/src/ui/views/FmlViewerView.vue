<script setup lang="ts">
import { computed, ref } from 'vue'
import FmlPreviewCanvas from '../components/FmlPreviewCanvas.vue'
import { buildFmlV3 } from '@/core/fml/buildFmlV3'
import { downloadFml } from '@/core/fml/downloadFml'
import { importFmlV3 } from '@/core/fml/importFmlV3'
import type { FloorPlan, ImportWarning } from '@/core/fml/types'

const plan = ref<FloorPlan | null>(null)
const warnings = ref<ImportWarning[]>([])
const error = ref<string | null>(null)
const fileName = ref<string | null>(null)

const stats = computed(() => {
  const floor = plan.value?.floors[0]
  if (!floor) return { walls: 0, doors: 0, windows: 0 }
  const openings = floor.walls.flatMap((wall) => wall.openings)
  return {
    walls: floor.walls.length,
    doors: openings.filter((item) => item.type === 'door').length,
    windows: openings.filter((item) => item.type === 'window').length,
  }
})

const fmlText = computed(() => {
  if (!plan.value) return ''
  return buildFmlV3(plan.value, { name: plan.value.name })
})

async function onFileInput(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  error.value = null
  try {
    const rawText = await file.text()
    const parsed = importFmlV3(rawText)
    plan.value = parsed.plan
    warnings.value = parsed.warnings
    fileName.value = file.name
  } catch (err) {
    plan.value = null
    warnings.value = []
    fileName.value = null
    error.value = err instanceof Error ? err.message : 'FML import mislukt.'
  }
}

function clearPlan(): void {
  plan.value = null
  warnings.value = []
  fileName.value = null
  error.value = null
}

function downloadCurrentFml(): void {
  if (!fmlText.value) return
  const base = fileName.value?.replace(/\.[^.]+$/i, '') || plan.value?.name || 'fml-export'
  downloadFml(fmlText.value, `${base}.fml`)
}

async function copyCurrentFml(): Promise<void> {
  if (!fmlText.value) return
  try {
    await navigator.clipboard.writeText(fmlText.value)
  } catch {
    error.value = 'Kopieren naar klembord is niet beschikbaar in deze browser/context.'
  }
}

function onPlanUpdate(next: FloorPlan): void {
  plan.value = next
}
</script>

<template>
  <div class="fml-viewer-layout">
    <aside class="sidebar">
      <div class="panel">
        <h3>FML viewer</h3>
        <p class="hint">Open een bestaand .fml-bestand om te bekijken en te bewerken.</p>
        <label class="upload-btn">
          FML uploaden
          <input type="file" accept=".fml,.json,.json.fml" @change="onFileInput" />
        </label>
        <button v-if="plan" type="button" class="link-btn" @click="clearPlan">Sluiten</button>
      </div>

      <div v-if="error" class="panel error-panel">{{ error }}</div>

      <div v-if="plan" class="panel">
        <p v-if="fileName" class="file-name">{{ fileName }}</p>
        <p class="stats">
          <strong>{{ stats.walls }}</strong> muren
          <template v-if="stats.doors > 0"> · {{ stats.doors }} deuren</template>
          <template v-if="stats.windows > 0"> · {{ stats.windows }} ramen</template>
        </p>
        <div v-if="warnings.length > 0" class="warnings">
          <p v-for="(warning, index) in warnings" :key="index">{{ warning.message }}</p>
        </div>
        <div class="actions">
          <button type="button" @click="downloadCurrentFml">Download .fml</button>
          <button type="button" @click="copyCurrentFml">Kopieer FML</button>
        </div>
      </div>
    </aside>

    <main class="viewer-main">
      <FmlPreviewCanvas v-if="plan" :plan="plan" @plan-update="onPlanUpdate" />
      <div v-else class="empty-state">
        <p>Upload een FML-bestand om de plattegrond te bekijken.</p>
        <label class="upload-btn primary">
          FML kiezen
          <input type="file" accept=".fml,.json,.json.fml" @change="onFileInput" />
        </label>
      </div>
    </main>
  </div>
</template>

<style scoped>
.fml-viewer-layout {
  display: flex;
  height: calc(100vh - 56px);
}

.sidebar {
  width: 300px;
  flex-shrink: 0;
  overflow-y: auto;
  border-right: 1px solid #e2e8f0;
  background: #f8fafc;
}

.viewer-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 12px;
  background: #f1f5f9;
}

.viewer-main > :deep(.fml-preview-wrap) {
  flex: 1;
  min-height: 0;
}

.panel {
  padding: 12px 16px;
  border-bottom: 1px solid #e2e8f0;
}

.panel h3 {
  margin: 0 0 8px;
  font-size: 14px;
}

.hint {
  margin: 0 0 12px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.45;
}

.file-name {
  margin: 0 0 6px;
  font-size: 12px;
  color: #334155;
  word-break: break-all;
}

.stats {
  margin: 0 0 8px;
  font-size: 12px;
  color: #475569;
}

.warnings {
  margin: 0 0 8px;
  font-size: 11px;
  color: #b45309;
}

.warnings p {
  margin: 0 0 4px;
}

.actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.upload-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  padding: 4px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: #fff;
  font-size: 12px;
  cursor: pointer;
}

.upload-btn input {
  display: none;
}

.upload-btn.primary {
  background: #2563eb;
  color: #fff;
  border-color: #2563eb;
}

.link-btn {
  display: block;
  margin-top: 8px;
  padding: 0;
  border: none;
  background: none;
  color: #2563eb;
  font-size: 12px;
  cursor: pointer;
}

.error-panel {
  color: #b91c1c;
  font-size: 12px;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #64748b;
  font-size: 14px;
}
</style>
