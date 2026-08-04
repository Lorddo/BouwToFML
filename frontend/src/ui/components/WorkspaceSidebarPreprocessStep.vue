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
import { useI18n } from 'vue-i18n'

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

const { t } = useI18n()

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
    <h3>{{ t('preprocess.inkWallTitle') }}</h3>
    <p class="hint">{{ t('preprocess.inkWallHint') }}</p>
    <ul class="params">
      <li>{{ t('preprocess.inkWallParams.thresholdOtsu') }}</li>
      <li>{{ t('preprocess.inkWallParams.brightnessBridge') }}</li>
      <li>
        {{ t('preprocess.inkWallParams.holeFill') }}
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
      {{ t('preprocess.copyBw') }}
    </button>
    <p v-if="canCopyPreprocessRefs" class="hint">{{ t('preprocess.copyBwHint') }}</p>
  </div>

  <details class="panel stamp-panel">
    <summary class="stamp-summary">
      {{ t('preprocess.stamp.title') }}
      <span v-if="wallStampActive || wallStampBaked" class="stamp-badge">
        {{ wallStampActive ? t('preprocess.stamp.badgeActive') : t('preprocess.stamp.badgeBaked') }}
      </span>
    </summary>
    <p class="hint">{{ t('preprocess.stamp.hint') }}</p>

    <label class="field">
      <span>{{ t('preprocess.stamp.donor') }}</span>
      <select v-model="donorId" :disabled="!!wallStampActive">
        <option disabled value="">{{ t('preprocess.stamp.donorPlaceholder') }}</option>
        <option v-for="opt in wallStampDonorOptions ?? []" :key="opt.id" :value="opt.id">
          {{ t('preprocess.stamp.donorOption', { name: opt.name, count: opt.wallCount }) }}
        </option>
      </select>
    </label>

    <div class="bands">
      <label
        ><input type="checkbox" :checked="bands.min" @change="toggleBand('min')" />
        {{ t('preprocess.stamp.bandMin') }}</label
      >
      <label
        ><input type="checkbox" :checked="bands.mid" @change="toggleBand('mid')" />
        {{ t('preprocess.stamp.bandMid') }}</label
      >
      <label
        ><input type="checkbox" :checked="bands.max" @change="toggleBand('max')" />
        {{ t('preprocess.stamp.bandMax') }}</label
      >
    </div>

    <div class="row">
      <button
        type="button"
        class="secondary"
        :disabled="!canStartWallStamp || !donorId || wallStampBusy"
        @click="onStartStamp"
      >
        {{ wallStampActive ? t('preprocess.stamp.restart') : t('preprocess.stamp.start') }}
      </button>
    </div>

    <template v-if="wallStampActive || wallStampBaked">
      <p v-if="wallStampBusy" class="hint">{{ t('preprocess.stamp.recomputing') }}</p>
      <p v-if="wallStampError" class="error">{{ wallStampError }}</p>

      <div v-if="wallStampActive" class="gum-tools">
        <span class="label">{{ t('preprocess.stamp.gumLabel') }}</span>
        <div class="row">
          <button
            type="button"
            :class="wallStampGumMode === 'off' ? 'primary' : 'secondary'"
            @click="$emit('setWallStampGumMode', 'off')"
          >
            {{ t('preprocess.stamp.align') }}
          </button>
          <button
            type="button"
            :class="wallStampGumMode === 'brush' ? 'primary' : 'secondary'"
            @click="$emit('setWallStampGumMode', 'brush')"
          >
            {{ t('preprocess.stamp.brush') }}
          </button>
          <button
            type="button"
            :class="wallStampGumMode === 'polygon' ? 'primary' : 'secondary'"
            @click="$emit('setWallStampGumMode', 'polygon')"
          >
            {{ t('preprocess.stamp.polygon') }}
          </button>
        </div>
        <label v-if="wallStampGumMode === 'brush'" class="field">
          <span>{{ t('preprocess.stamp.brushRadius', { px: wallStampBrushRadius ?? 12 }) }}</span>
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
          {{ t('preprocess.stamp.bake') }}
        </button>
        <button
          v-if="wallStampActive"
          type="button"
          class="secondary"
          @click="$emit('cancelWallStamp')"
        >
          {{ t('preprocess.stamp.cancel') }}
        </button>
        <button
          v-if="wallStampBaked"
          type="button"
          class="secondary"
          @click="$emit('clearWallStamp')"
        >
          {{ t('preprocess.stamp.clear') }}
        </button>
      </div>
      <p v-if="wallStampBaked && !wallStampActive" class="hint">
        {{ t('preprocess.stamp.bakedHint') }}
      </p>
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
          ? t('preprocess.downloading')
          : t('preprocess.downloadPng', { tab: PREPROCESS_TAB_LABELS[preprocessTab] })
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
