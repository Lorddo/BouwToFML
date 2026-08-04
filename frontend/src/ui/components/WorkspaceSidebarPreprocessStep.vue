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
import { computed, ref, watch } from 'vue'

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
  canStartWallStamp?: boolean
  wallStampActive?: boolean
  wallStampBaked?: boolean
  wallStampBusy?: boolean
  wallStampError?: string | null
  wallStampBands?: { min: boolean; mid: boolean; max: boolean }
  wallStampGumMode?: 'off' | 'brush' | 'polygon'
  wallStampBrushRadius?: number
  wallStampDonorOptions?: Array<{ id: string; name: string; wallCount: number }>
  wallStampDonorFloorId?: string | null
}>()

const preprocess = defineModel<PreprocessConfig>('preprocess', { required: true })

const emit = defineEmits<{
  resetPreview: []
  downloadPreprocessedUnderlay: []
  layerCopied: [target: PreprocessPanelLayer]
  setReferenceDrawMode: [type: 'wall' | 'door' | 'window']
  setReferencePanMode: []
  updateDoorFmlRefId: [id: string, fmlRefId: string]
  copyPreprocessRefs: []
  startWallStamp: [donorFloorId: string]
  setWallStampBands: [bands: { min: boolean; mid: boolean; max: boolean }]
  setWallStampGumMode: [mode: 'off' | 'brush' | 'polygon']
  setWallStampBrushRadius: [radius: number]
  bakeWallStamp: []
  cancelWallStamp: []
  clearWallStamp: []
}>()

const showTunePanel = computed(() => isPreprocessLayerId(props.preprocessTab))
const isInkWallTab = computed(() => props.preprocessTab === 'inkWall')

const donorId = ref('')
watch(
  () => props.wallStampDonorOptions,
  (opts) => {
    if (!opts?.length) {
      donorId.value = ''
      return
    }
    if (!opts.some((o) => o.id === donorId.value)) {
      donorId.value = opts[0]?.id ?? ''
    }
  },
  { immediate: true },
)

const bands = computed(() => props.wallStampBands ?? { min: false, mid: true, max: true })

function toggleBand(key: 'min' | 'mid' | 'max') {
  emit('setWallStampBands', { ...bands.value, [key]: !bands.value[key] })
}

function onStartStamp() {
  if (!donorId.value) return
  emit('startWallStamp', donorId.value)
}
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
  </div>

  <details class="panel stamp-panel">
    <summary class="stamp-summary">
      Muurstempel
      <span v-if="wallStampActive || wallStampBaked" class="stamp-badge">
        {{ wallStampActive ? 'actief' : 'gebakken' }}
      </span>
    </summary>
    <p class="hint">
      FML-muren van een andere verdieping als stempel op deze B/W. Uitlijnen op canvas (handles),
      gummen, daarna bakken → adaptive B/W + zwarte Otsu-OR.
    </p>

    <label class="field">
      <span>Donor-verdieping</span>
      <select v-model="donorId" :disabled="!!wallStampActive">
        <option disabled value="">Kies verdieping…</option>
        <option v-for="opt in wallStampDonorOptions ?? []" :key="opt.id" :value="opt.id">
          {{ opt.name }} ({{ opt.wallCount }} muren)
        </option>
      </select>
    </label>

    <div class="bands">
      <label><input type="checkbox" :checked="bands.min" @change="toggleBand('min')" /> min</label>
      <label><input type="checkbox" :checked="bands.mid" @change="toggleBand('mid')" /> mid</label>
      <label><input type="checkbox" :checked="bands.max" @change="toggleBand('max')" /> max</label>
    </div>

    <div class="row">
      <button
        type="button"
        class="secondary"
        :disabled="!canStartWallStamp || !donorId || wallStampBusy"
        @click="onStartStamp"
      >
        {{ wallStampActive ? 'Stempel herstarten' : 'Stempel starten' }}
      </button>
    </div>

    <template v-if="wallStampActive || wallStampBaked">
      <p v-if="wallStampBusy" class="hint">Stempel herberekenen…</p>
      <p v-if="wallStampError" class="error">{{ wallStampError }}</p>

      <div v-if="wallStampActive" class="gum-tools">
        <span class="label">Gum (alleen stempel)</span>
        <div class="row">
          <button
            type="button"
            :class="wallStampGumMode === 'off' ? 'primary' : 'secondary'"
            @click="$emit('setWallStampGumMode', 'off')"
          >
            Uitlijnen
          </button>
          <button
            type="button"
            :class="wallStampGumMode === 'brush' ? 'primary' : 'secondary'"
            @click="$emit('setWallStampGumMode', 'brush')"
          >
            Penseel
          </button>
          <button
            type="button"
            :class="wallStampGumMode === 'polygon' ? 'primary' : 'secondary'"
            @click="$emit('setWallStampGumMode', 'polygon')"
          >
            Polygoon
          </button>
        </div>
        <label v-if="wallStampGumMode === 'brush'" class="field">
          <span>Penseelstraal {{ wallStampBrushRadius ?? 12 }}px</span>
          <input
            type="range"
            min="4"
            max="48"
            :value="wallStampBrushRadius ?? 12"
            @input="
              $emit('setWallStampBrushRadius', Number(($event.target as HTMLInputElement).value))
            "
          />
        </label>
      </div>

      <div class="row">
        <button
          v-if="wallStampActive"
          type="button"
          class="primary"
          :disabled="wallStampBusy"
          @click="$emit('bakeWallStamp')"
        >
          Stempel bakken
        </button>
        <button
          v-if="wallStampActive"
          type="button"
          class="secondary"
          @click="$emit('cancelWallStamp')"
        >
          Annuleren
        </button>
        <button
          v-if="wallStampBaked"
          type="button"
          class="secondary"
          @click="$emit('clearWallStamp')"
        >
          Stempel wissen
        </button>
      </div>
      <p v-if="wallStampBaked && !wallStampActive" class="hint">Stempel gebakken in B/W + Otsu.</p>
    </template>
  </details>

  <div class="panel">
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

.stamp-panel {
  padding: 8px 16px 12px;
}

.stamp-summary {
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
  list-style: none;
  display: flex;
  align-items: center;
  gap: 8px;
  user-select: none;
}

.stamp-summary::-webkit-details-marker {
  display: none;
}

.stamp-summary::before {
  content: '▸';
  font-size: 11px;
  color: #64748b;
}

.stamp-panel[open] > .stamp-summary {
  margin-bottom: 8px;
}

.stamp-panel[open] > .stamp-summary::before {
  content: '▾';
}

.stamp-badge {
  font-size: 11px;
  font-weight: 600;
  color: #0369a1;
  background: #e0f2fe;
  border-radius: 4px;
  padding: 1px 6px;
}

.hint {
  font-size: 12px;
  color: #64748b;
  margin: 0 0 10px;
  line-height: 1.4;
}

.error {
  font-size: 12px;
  color: #b91c1c;
  margin: 0 0 8px;
}

.params {
  margin: 0;
  padding-left: 1.1em;
  font-size: 12px;
  color: #475569;
  line-height: 1.45;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  margin-bottom: 8px;
}

.field select,
.field input[type='range'] {
  width: 100%;
}

.bands {
  display: flex;
  gap: 12px;
  font-size: 12px;
  margin-bottom: 8px;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.gum-tools .label {
  display: block;
  font-size: 12px;
  margin-bottom: 4px;
  color: #475569;
}

button.primary,
button.secondary {
  font-size: 12px;
}
</style>
