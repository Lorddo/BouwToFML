<script setup lang="ts">
import { computed } from 'vue'
import type { ResultViewTab } from '@/cv/pipeline/merge-tab-outputs'
import {
  PREPROCESS_TAB_LABELS,
  TEMPLATE_TAB_LABELS,
  type PreprocessPanelLayer,
  type TemplateTab,
} from '@/cv/preprocess/layer-preprocess'
import { RESULT_TAB_LABELS, type WorkspaceFlowStep } from '@/ui/composables/workspace/constants'

const props = defineProps<{
  flowStep: WorkspaceFlowStep
  ocrEnabled?: boolean
}>()

const preprocessTab = defineModel<PreprocessPanelLayer>('preprocessTab', { required: true })
const templateTab = defineModel<TemplateTab>('templateTab', { required: true })
const resultTab = defineModel<ResultViewTab>('resultTab', { required: true })

type PreprocessDevView = 'walls' | 'inkWall'
type TemplateDevView = 'ocr' | 'walls' | 'doors' | 'windows'
type ResultDevView = 'vector' | 'walls'

/** Dev-only labels; Otsu-inkt expliciet zodat de verborgen Int-muur-tab vindbaar blijft. */
const preprocessOptions: Array<{ id: PreprocessDevView; label: string }> = [
  { id: 'walls', label: PREPROCESS_TAB_LABELS.walls },
  { id: 'inkWall', label: 'Otsu inkt' },
]

const templateOptions = computed((): Array<{ id: TemplateDevView; label: string }> => {
  const opts: Array<{ id: TemplateDevView; label: string }> = [
    { id: 'walls', label: TEMPLATE_TAB_LABELS.walls },
    { id: 'doors', label: TEMPLATE_TAB_LABELS.doors },
    { id: 'windows', label: TEMPLATE_TAB_LABELS.windows },
  ]
  if (props.ocrEnabled) {
    opts.unshift({ id: 'ocr', label: TEMPLATE_TAB_LABELS.ocr })
  }
  return opts
})

const resultOptions: Array<{ id: ResultDevView; label: string }> = [
  { id: 'vector', label: RESULT_TAB_LABELS.vector },
  { id: 'walls', label: RESULT_TAB_LABELS.walls },
]

function pickPreprocess(id: PreprocessDevView) {
  preprocessTab.value = id
}

function pickTemplate(id: TemplateDevView) {
  templateTab.value = id
}

function pickResult(id: ResultDevView) {
  resultTab.value = id
}

function isPreprocessActive(id: PreprocessDevView): boolean {
  return props.flowStep === 'preprocess' && preprocessTab.value === id
}

function isTemplateActive(id: TemplateDevView): boolean {
  return props.flowStep === 'templates' && templateTab.value === id
}

function isResultActive(id: ResultDevView): boolean {
  return props.flowStep === 'result' && resultTab.value === id
}
</script>

<template>
  <div class="panel">
    <h3>Dev view</h3>
    <p class="hint">
      Verborgen canvas-tabs: intern schakelen voor overlays / sidebars. Op stap 2: «Otsu inkt» =
      Int-muur-referentie (classify). OCR via Dev wanneer aangezet op stap 2.
    </p>

    <div
      v-if="flowStep === 'preprocess'"
      class="mode-row"
      role="group"
      aria-label="Dev view stap 2"
    >
      <button
        v-for="opt in preprocessOptions"
        :key="opt.id"
        type="button"
        class="mode-btn"
        :class="{ active: isPreprocessActive(opt.id) }"
        :aria-pressed="isPreprocessActive(opt.id)"
        @click="pickPreprocess(opt.id)"
      >
        {{ opt.label }}
      </button>
    </div>

    <div
      v-else-if="flowStep === 'templates'"
      class="mode-row"
      role="group"
      aria-label="Dev view stap 3"
    >
      <button
        v-for="opt in templateOptions"
        :key="opt.id"
        type="button"
        class="mode-btn"
        :class="{ active: isTemplateActive(opt.id) }"
        :aria-pressed="isTemplateActive(opt.id)"
        @click="pickTemplate(opt.id)"
      >
        {{ opt.label }}
      </button>
    </div>

    <div
      v-else-if="flowStep === 'result'"
      class="mode-row"
      role="group"
      aria-label="Dev view stap 4"
    >
      <button
        v-for="opt in resultOptions"
        :key="opt.id"
        type="button"
        class="mode-btn"
        :class="{ active: isResultActive(opt.id) }"
        :aria-pressed="isResultActive(opt.id)"
        @click="pickResult(opt.id)"
      >
        {{ opt.label }}
      </button>
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
  margin: 0 0 10px;
  line-height: 1.4;
}

.mode-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.mode-btn {
  padding: 6px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
  color: #334155;
  font-size: 13px;
  line-height: 1.2;
  cursor: pointer;
}

.mode-btn:hover {
  border-color: #94a3b8;
  background: #f8fafc;
}

.mode-btn.active {
  border-color: #0f766e;
  background: #ccfbf1;
  color: #115e59;
  font-weight: 600;
}
</style>
