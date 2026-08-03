<script setup lang="ts">
import PreprocessPanel from './PreprocessPanel.vue'
import InputReferencePanel from './InputReferencePanel.vue'
import {
  isPreprocessLayerId,
  PREPROCESS_TAB_LABELS,
  type PreprocessPanelLayer,
} from '@/cv/preprocess/layer-preprocess'
import type { ElementClass, PreprocessConfig } from '@/core/extraction/types'
import type { SelectionRect } from '@/platform/selection'
import { computed } from 'vue'

const props = defineProps<{
  preprocessTab: PreprocessPanelLayer
  imageSrc: string | null
  preprocessPreviewLoading: boolean
  referenceWallThicknessPx?: number | null
  measuringReferenceWall?: boolean
  activeClass: ElementClass | null
  counts: Partial<Record<ElementClass, number>>
  scaleConfirmed: boolean
  rects: SelectionRect[]
  canCopyPreprocessRefs?: boolean
}>()

const preprocess = defineModel<PreprocessConfig>('preprocess', { required: true })

defineEmits<{
  resetPreview: []
  downloadPreprocessedUnderlay: []
  layerCopied: [target: PreprocessPanelLayer]
  setReferenceDrawMode: [type: 'wall' | 'door' | 'window']
  setReferencePanMode: []
  updateDoorFmlRefId: [id: string, fmlRefId: string]
  copyPreprocessRefs: []
}>()

const showTunePanel = computed(() => isPreprocessLayerId(props.preprocessTab))
const isInkWallTab = computed(() => props.preprocessTab === 'inkWall')
</script>

<template>
  <PreprocessPanel
    v-if="showTunePanel"
    v-model="preprocess"
    :active-layer="preprocessTab"
    @reset-preview="$emit('resetPreview')"
    @layer-copied="$emit('layerCopied', $event)"
  />

  <div v-else-if="isInkWallTab" class="panel">
    <h3>Int muur</h3>
    <p class="hint">
      Read-only B/W die bij muurclassificatie voor inktvergelijking op witte vlakken wordt gebruikt
      (Otsu-referentie). Dit is niet de B/W van Voorbewerking — die tune je op die tab.
    </p>
    <ul class="params">
      <li>Drempel: Otsu</li>
      <li>Helderheid: 150 · bridgeGaps: 8</li>
      <li>
        Hole-fill / thicken: geschaald op muurdikte
        <template v-if="referenceWallThicknessPx != null">
          ({{ referenceWallThicknessPx }}px)</template
        >
      </li>
    </ul>
  </div>

  <InputReferencePanel
    v-model:preprocess="preprocess"
    :active-class="activeClass"
    :counts="counts"
    :reference-wall-thickness-px="referenceWallThicknessPx ?? null"
    :measuring="measuringReferenceWall"
    :scale-confirmed="scaleConfirmed"
    :rects="rects"
    @set-draw-mode="$emit('setReferenceDrawMode', $event)"
    @deactivate-draw-mode="$emit('setReferencePanMode')"
    @update-door-fml-ref-id="(id, refId) => $emit('updateDoorFmlRefId', id, refId)"
  />

  <div class="panel">
    <button
      type="button"
      class="secondary"
      :disabled="!canCopyPreprocessRefs"
      @click="$emit('copyPreprocessRefs')"
    >
      B/W overnemen
    </button>
    <p v-if="canCopyPreprocessRefs" class="hint">
      Kopieert alleen B/W-tune (en gemeten muurdikte indien bekend). Referentievakken teken je
      opnieuw na crop — coordinaten van een andere verdieping kloppen niet.
    </p>
    <button
      type="button"
      class="primary"
      :disabled="!imageSrc || preprocessPreviewLoading"
      @click="$emit('downloadPreprocessedUnderlay')"
    >
      {{
        preprocessPreviewLoading
          ? 'Voorbewerken…'
          : `Download ${PREPROCESS_TAB_LABELS[preprocessTab]} PNG`
      }}
    </button>
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

.params {
  margin: 0;
  padding-left: 1.1em;
  font-size: 12px;
  color: #475569;
  line-height: 1.45;
}
</style>
