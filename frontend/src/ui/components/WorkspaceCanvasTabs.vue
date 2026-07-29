<script setup lang="ts">
import {
  PREPROCESS_TAB_LABELS,
  TEMPLATE_TAB_LABELS,
  type PreprocessPanelLayer,
  type TemplateTab,
} from '@/cv/preprocess/layer-preprocess'
import type { ResultViewTab } from '@/cv/pipeline/merge-tab-outputs'
import { RESULT_TAB_LABELS, type WorkspaceFlowStep } from '../composables/workspace/constants'

defineProps<{
  flowStep: WorkspaceFlowStep
  preprocessLayerTabs: readonly PreprocessPanelLayer[]
  templateLayerTabs: readonly TemplateTab[]
  resultLayerTabs: readonly ResultViewTab[]
  ocrMaskedRegionCount: number
  tabOutputReady: (tab: TemplateTab | ResultViewTab) => boolean
  wallOverlayTogglesVisible: boolean
}>()

const preprocessTab = defineModel<PreprocessPanelLayer>('preprocessTab', { required: true })
const templateTab = defineModel<TemplateTab>('templateTab', { required: true })
const resultTab = defineModel<ResultViewTab>('resultTab', { required: true })
const showWallLines = defineModel<boolean>('showWallLines', { required: true })
const showLines = defineModel<boolean>('showLines', { required: true })
</script>

<template>
  <div
    v-if="
      flowStep === 'input' ||
      flowStep === 'preprocess' ||
      flowStep === 'templates' ||
      flowStep === 'result'
    "
    class="canvas-tabs"
  >
    <div v-if="flowStep === 'input'" class="layer-tabs">
      <button type="button" class="active">Origineel</button>
    </div>
    <div v-else-if="flowStep === 'preprocess'" class="layer-tabs">
      <button
        v-for="tab in preprocessLayerTabs"
        :key="tab"
        type="button"
        :class="{ active: preprocessTab === tab }"
        @click="preprocessTab = tab"
      >
        {{ PREPROCESS_TAB_LABELS[tab] }}
      </button>
    </div>
    <div v-else-if="flowStep === 'templates'" class="layer-tabs">
      <button
        v-for="tab in templateLayerTabs"
        :key="tab"
        type="button"
        :class="{
          active: templateTab === tab,
          detected: tab === 'ocr' ? ocrMaskedRegionCount > 0 : tabOutputReady(tab),
        }"
        @click="templateTab = tab"
      >
        {{ TEMPLATE_TAB_LABELS[tab] }}
      </button>
    </div>
    <div v-else-if="flowStep === 'result'" class="layer-tabs">
      <button
        v-for="tab in resultLayerTabs"
        :key="tab"
        type="button"
        :class="{
          active: resultTab === tab,
          detected: tab === 'vector' ? tabOutputReady('walls') : tabOutputReady(tab),
        }"
        @click="resultTab = tab"
      >
        {{ RESULT_TAB_LABELS[tab] }}
      </button>
    </div>
    <div v-if="wallOverlayTogglesVisible && flowStep !== 'result'" class="overlay-toggles">
      <span class="overlay-toggles-label">Muur-overlay</span>
      <label>
        <input v-model="showWallLines" type="checkbox" />
        Centerlines
      </label>
      <label v-if="flowStep === 'templates'">
        <input v-model="showLines" type="checkbox" />
        Ruwe Hough
      </label>
    </div>
  </div>
</template>

<style scoped>
.canvas-tabs {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 8px 12px;
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
}

.overlay-toggles {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
  font-size: 13px;
  color: #475569;
}

.overlay-toggles-label {
  font-weight: 600;
  color: #334155;
}

.overlay-toggles label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
}

.layer-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin: 0;
  padding: 0;
}

.layer-tabs button {
  flex: 0 1 auto;
  min-width: 72px;
  font-size: 13px;
  padding: 8px 14px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
}

.layer-tabs button.active {
  background: #0f172a;
  color: #fff;
  border-color: #0f172a;
}

.layer-tabs button.detected:not(.active) {
  border-color: #22c55e;
  color: #15803d;
}
</style>
