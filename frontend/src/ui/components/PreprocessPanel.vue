<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PreprocessConfig, PreprocessLayerTune } from '@/core/extraction/types'
import {
  copyLayerTuneBetween,
  createDefaultGapsLayerTune,
  createDefaultOcrLayerTune,
  createDefaultWallLayerTune,
  defaultLayerTune,
  isColorThresholdEnabled,
  isPreprocessLayerId,
  layerTuneStorageKey,
  mirrorWallTuneToRoot,
  PREPROCESS_TAB_LABELS,
  type PreprocessLayerId,
  type PreprocessPanelLayer,
} from '@/cv/preprocess/layer-preprocess'
import { WORKSPACE_PREPROCESS_LAYER_ORDER } from '@/cv/workspace/layer-flow'
import { GAPS_TAB_VISIBLE } from '@/ui/composables/workspace/constants'
import {
  UI_BRIGHTNESS_MAX,
  UI_BRIGHTNESS_MIN,
  DEFAULT_PRE_BINARIZE_THRESHOLD,
} from '@/cv/port/preprocess'
import PreprocessActionGroup from '@/ui/components/PreprocessActionGroup.vue'

const model = defineModel<PreprocessConfig>({ required: true })
const props = withDefaults(defineProps<{ activeLayer?: PreprocessPanelLayer }>(), {
  activeLayer: 'walls',
})
const emit = defineEmits<{ resetPreview: []; layerCopied: [target: PreprocessLayerId] }>()

const advancedOpen = ref(false)

const layer = computed(() => props.activeLayer)
const currentLayerId = computed<PreprocessLayerId>(() => {
  const tab = layer.value
  if (!isPreprocessLayerId(tab)) return 'walls'
  return tab
})

type TuneField = keyof PreprocessLayerTune

function activeStorageKey(): 'wallLayer' | 'ocrLayer' | 'gapsLayer' {
  return layerTuneStorageKey(currentLayerId.value)
}

function readActiveTune(): PreprocessLayerTune {
  const key = activeStorageKey()
  return model.value[key] ?? defaultLayerTune(currentLayerId.value)
}

/** Eén write — geen dubbele model-assign (defineModel + mirror race). */
function patchActiveTune(patch: Partial<PreprocessLayerTune>): void {
  const key = activeStorageKey()
  const layerId = currentLayerId.value
  const current = model.value[key] ?? defaultLayerTune(layerId)
  const next = { ...current, ...patch }
  if (layerId === 'walls') {
    model.value = mirrorWallTuneToRoot({ ...model.value, wallLayer: next }, next)
    return
  }
  model.value = { ...model.value, [key]: next }
}

function readField<T>(field: TuneField, fallback: T): T {
  return (readActiveTune()[field] as T | undefined) ?? fallback
}
function writeField(field: TuneField, value: number | boolean | string): void {
  patchActiveTune({ [field]: value })
}
function setEnabledWithDefaults(
  enabledField: TuneField,
  enabled: boolean,
  defaults: Partial<PreprocessLayerTune> = {},
): void {
  const current = readActiveTune()
  const patch: Partial<PreprocessLayerTune> = {
    [enabledField]: enabled,
  }
  if (enabled) {
    for (const [key, value] of Object.entries(defaults) as Array<
      [TuneField, number | boolean | string]
    >) {
      const currentValue = current[key]
      if (currentValue == null || (typeof currentValue === 'number' && currentValue <= 0)) {
        ;(patch as Record<string, unknown>)[key] = value
      }
    }
  }
  patchActiveTune(patch)
}
function readColorThresholdEnabled(): boolean {
  return isColorThresholdEnabled(readActiveTune())
}
function writeColorThresholdEnabled(next: boolean): void {
  patchActiveTune({
    colorThresholdEnabled: next,
    thresholdEnabled: next,
    useAdaptive: next,
    thresholdMode: 'adaptive',
  })
}
function setChecked(field: TuneField, event: Event): void {
  writeField(field, (event.target as HTMLInputElement).checked)
}
function setNumber(field: TuneField, event: Event): void {
  writeField(field, Number((event.target as HTMLInputElement).value))
}

/** Stap 2 toont ook `inkWall`, dat geen eigen B/W-tune heeft en dus niet kopieerbaar is. */
type CopyTargetLayer = Extract<PreprocessLayerId, (typeof WORKSPACE_PREPROCESS_LAYER_ORDER)[number]>

const copyTargetLayers = computed(() =>
  WORKSPACE_PREPROCESS_LAYER_ORDER.filter(
    (id): id is CopyTargetLayer =>
      isPreprocessLayerId(id) && id !== currentLayerId.value && (GAPS_TAB_VISIBLE || id !== 'gaps'),
  ),
)

function copyTuneTo(target: PreprocessLayerId): void {
  model.value = copyLayerTuneBetween(model.value, currentLayerId.value, target)
  emit('layerCopied', target)
}

function ensureLayerRecords(): void {
  const next = { ...model.value }
  let changed = false
  if (!next.wallLayer) {
    next.wallLayer = createDefaultWallLayerTune()
    changed = true
  }
  // ocrLayer blijft vullen voor roundtrip/DevSession — geen aparte OCR-B/W-tab.
  if (!next.ocrLayer) {
    next.ocrLayer = createDefaultOcrLayerTune()
    changed = true
  }
  if (!next.gapsLayer) {
    next.gapsLayer = createDefaultGapsLayerTune()
    changed = true
  }
  // Muur-tab: 2e pass altijd adaptive (modus-UI is weg).
  if (
    next.wallLayer &&
    (next.wallLayer.thresholdMode !== 'adaptive' || next.wallLayer.useAdaptive !== true)
  ) {
    next.wallLayer = {
      ...next.wallLayer,
      thresholdMode: 'adaptive',
      useAdaptive: true,
    }
    changed = true
  }
  if (changed) {
    model.value = next.wallLayer ? mirrorWallTuneToRoot(next, next.wallLayer) : next
  }
}
ensureLayerRecords()

const { t } = useI18n()
</script>

<template>
  <div class="panel">
    <!-- Eenvoudige flow: één slider (vooraf vast B/W). -->
    <section class="simple-section">
      <div class="setting-row">
        <span class="setting-label">{{ t('preprocess.bwThreshold') }}</span>
        <div class="field-row">
          <input
            :value="readField('preBinarizeThreshold', DEFAULT_PRE_BINARIZE_THRESHOLD)"
            type="range"
            min="0"
            max="255"
            step="1"
            @input="setNumber('preBinarizeThreshold', $event)"
          />
          <input
            :value="readField('preBinarizeThreshold', DEFAULT_PRE_BINARIZE_THRESHOLD)"
            type="number"
            min="0"
            max="255"
            step="1"
            class="num-input"
            @input="setNumber('preBinarizeThreshold', $event)"
          />
        </div>
      </div>
      <p class="hint">{{ t('preprocess.bwHint') }}</p>
    </section>

    <button type="button" class="advanced-toggle" @click="advancedOpen = !advancedOpen">
      {{ advancedOpen ? t('preprocess.advancedHide') : t('preprocess.advancedShow') }}
    </button>

    <div v-show="advancedOpen" class="advanced-panel">
      <PreprocessActionGroup
        :title="t('preprocess.groups.colorZw')"
        :model-value="readColorThresholdEnabled()"
        @update:model-value="writeColorThresholdEnabled"
      >
        <label class="check-row">
          <input
            :checked="readField('preBinarizeEnabled', true)"
            type="checkbox"
            @change="setChecked('preBinarizeEnabled', $event)"
          />
          {{ t('preprocess.preBinarizeCheck') }}
        </label>
      </PreprocessActionGroup>

      <PreprocessActionGroup
        :title="t('preprocess.groups.adjust')"
        :model-value="readField('adjustBrightnessContrastEnabled', true)"
        @update:model-value="(next) => writeField('adjustBrightnessContrastEnabled', next)"
      >
        <div class="setting-row">
          <span class="setting-label">{{ t('preprocess.brightness') }}</span>
          <div class="field-row">
            <input
              :value="readField('brightness', 50)"
              type="range"
              :min="UI_BRIGHTNESS_MIN"
              :max="UI_BRIGHTNESS_MAX"
              @input="setNumber('brightness', $event)"
            />
            <input
              :value="readField('brightness', 50)"
              type="number"
              :min="UI_BRIGHTNESS_MIN"
              :max="UI_BRIGHTNESS_MAX"
              step="1"
              class="num-input"
              @input="setNumber('brightness', $event)"
            />
          </div>
        </div>
        <div class="setting-row">
          <span class="setting-label">{{ t('preprocess.contrast') }}</span>
          <div class="field-row">
            <input
              :value="readField('contrast', 1)"
              type="range"
              min="0.6"
              max="1.6"
              step="0.02"
              @input="setNumber('contrast', $event)"
            />
            <input
              :value="readField('contrast', 1)"
              type="number"
              min="0.6"
              max="1.6"
              step="0.02"
              class="num-input"
              @input="setNumber('contrast', $event)"
            />
          </div>
        </div>
        <label class="check-row"
          ><input
            :checked="readField('adjustNegativeEnabled', false)"
            type="checkbox"
            @change="setChecked('adjustNegativeEnabled', $event)"
          />
          {{ t('preprocess.invertBeforeThreshold') }}</label
        >
      </PreprocessActionGroup>

      <PreprocessActionGroup
        :title="t('preprocess.groups.removeSpeckles')"
        :model-value="readField('removeSpecklesEnabled', false)"
        @update:model-value="
          (next) => setEnabledWithDefaults('removeSpecklesEnabled', next, { despeckleMinPx: 32 })
        "
      >
        <div class="setting-row">
          <span class="setting-label">{{ t('preprocess.minAreaPx') }}</span>
          <div class="field-row">
            <input
              :value="readField('despeckleMinPx', 0)"
              type="range"
              min="0"
              max="32"
              step="1"
              @input="setNumber('despeckleMinPx', $event)"
            />
            <input
              :value="readField('despeckleMinPx', 0)"
              type="number"
              min="0"
              max="32"
              step="1"
              class="num-input"
              @input="setNumber('despeckleMinPx', $event)"
            />
          </div>
        </div>
      </PreprocessActionGroup>

      <PreprocessActionGroup
        :title="t('preprocess.groups.fillHoles')"
        :model-value="readField('removeHolesEnabled', false)"
        @update:model-value="
          (next) => setEnabledWithDefaults('removeHolesEnabled', next, { removeHolesMaxPx: 4 })
        "
      >
        <div class="setting-row">
          <span class="setting-label">{{ t('preprocess.fillBlackPx') }}</span>
          <div class="field-row">
            <input
              :value="readField('removeHolesMaxPx', 0)"
              type="range"
              min="0"
              max="24"
              step="1"
              @input="setNumber('removeHolesMaxPx', $event)"
            />
            <input
              :value="readField('removeHolesMaxPx', 0)"
              type="number"
              min="0"
              max="24"
              step="1"
              class="num-input"
              @input="setNumber('removeHolesMaxPx', $event)"
            />
          </div>
        </div>
        <div class="setting-row">
          <span class="setting-label">{{ t('preprocess.openWhitePx') }}</span>
          <div class="field-row">
            <input
              :value="readField('despeckleOpen', 0)"
              type="range"
              min="0"
              max="6"
              step="1"
              @input="setNumber('despeckleOpen', $event)"
            />
            <input
              :value="readField('despeckleOpen', 0)"
              type="number"
              min="0"
              max="6"
              step="1"
              class="num-input"
              @input="setNumber('despeckleOpen', $event)"
            />
          </div>
        </div>
      </PreprocessActionGroup>

      <PreprocessActionGroup
        :title="t('preprocess.groups.bridgeGaps')"
        :model-value="readField('bridgeGapsEnabled', false)"
        @update:model-value="
          (next) => setEnabledWithDefaults('bridgeGapsEnabled', next, { bridgeGaps: 1 })
        "
      >
        <div class="setting-row">
          <span class="setting-label">{{ t('preprocess.bridgePx') }}</span>
          <div class="field-row">
            <input
              :value="readField('bridgeGaps', 1)"
              type="range"
              min="1"
              max="10"
              step="1"
              @input="setNumber('bridgeGaps', $event)"
            />
            <input
              :value="readField('bridgeGaps', 1)"
              type="number"
              min="1"
              max="10"
              step="1"
              class="num-input"
              @input="setNumber('bridgeGaps', $event)"
            />
          </div>
        </div>
      </PreprocessActionGroup>

      <PreprocessActionGroup
        :title="t('preprocess.groups.smoothEdges')"
        :model-value="readField('smoothLinesEnabled', false)"
        @update:model-value="
          (next) => setEnabledWithDefaults('smoothLinesEnabled', next, { smoothLines: 1 })
        "
      >
        <div class="setting-row">
          <span class="setting-label">{{ t('preprocess.smoothStrengthPx') }}</span>
          <div class="field-row">
            <input
              :value="readField('smoothLines', 1)"
              type="range"
              min="1"
              max="8"
              step="1"
              @input="setNumber('smoothLines', $event)"
            />
            <input
              :value="readField('smoothLines', 1)"
              type="number"
              min="1"
              max="8"
              step="1"
              class="num-input"
              @input="setNumber('smoothLines', $event)"
            />
          </div>
        </div>
      </PreprocessActionGroup>

      <PreprocessActionGroup
        :title="t('preprocess.groups.thickenLines')"
        :model-value="readField('thickenLinesEnabled', false)"
        @update:model-value="
          (next) => setEnabledWithDefaults('thickenLinesEnabled', next, { thickenLinesPx: 1 })
        "
      >
        <div class="setting-row">
          <span class="setting-label">{{ t('preprocess.thicknessPx') }}</span>
          <div class="field-row">
            <input
              :value="readField('thickenLinesPx', 1)"
              type="range"
              min="1"
              max="8"
              step="1"
              @input="setNumber('thickenLinesPx', $event)"
            />
            <input
              :value="readField('thickenLinesPx', 1)"
              type="number"
              min="1"
              max="8"
              step="1"
              class="num-input"
              @input="setNumber('thickenLinesPx', $event)"
            />
          </div>
        </div>
      </PreprocessActionGroup>

      <PreprocessActionGroup
        :title="t('preprocess.groups.erodeLines')"
        :model-value="readField('erodeLinesEnabled', false)"
        @update:model-value="
          (next) => setEnabledWithDefaults('erodeLinesEnabled', next, { erodeLinesPx: 1 })
        "
      >
        <div class="setting-row">
          <span class="setting-label">{{ t('preprocess.erodePx') }}</span>
          <div class="field-row">
            <input
              :value="readField('erodeLinesPx', 1)"
              type="range"
              min="0"
              max="6"
              step="1"
              @input="setNumber('erodeLinesPx', $event)"
            />
            <input
              :value="readField('erodeLinesPx', 1)"
              type="number"
              min="0"
              max="6"
              step="1"
              class="num-input"
              @input="setNumber('erodeLinesPx', $event)"
            />
          </div>
        </div>
      </PreprocessActionGroup>

      <PreprocessActionGroup
        :title="t('preprocess.groups.negative')"
        :model-value="readField('finalNegativeEnabled', false)"
        @update:model-value="(next) => writeField('finalNegativeEnabled', next)"
      >
        <p class="hint">{{ t('preprocess.negativeHint') }}</p>
      </PreprocessActionGroup>

      <section v-if="copyTargetLayers.length > 0" class="copy-section">
        <h4>{{ t('preprocess.copySettings') }}</h4>
        <div class="copy-buttons">
          <button
            v-for="target in copyTargetLayers"
            :key="target"
            type="button"
            @click="copyTuneTo(target)"
          >
            {{ t('preprocess.copyTo', { tab: PREPROCESS_TAB_LABELS[target] }) }}
          </button>
        </div>
      </section>

      <div class="actions">
        <button type="button" @click="emit('resetPreview')">
          {{ t('preprocess.resetPreview') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.simple-section {
  margin-bottom: 8px;
}

.advanced-toggle {
  display: block;
  width: 100%;
  margin: 4px 0 8px;
  padding: 6px 10px;
  font-size: 12px;
  text-align: left;
  color: #334155;
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  cursor: pointer;
}

.advanced-toggle:hover {
  background: #e2e8f0;
}

.advanced-panel {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.copy-section {
  margin-top: 12px;
}
.copy-section h4 {
  margin: 0 0 4px;
  font-size: 12px;
}
.copy-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.actions {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}
.field-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 64px;
  gap: 8px;
  align-items: center;
  width: 100%;
}
.field-row input[type='range'] {
  width: 100%;
  min-width: 0;
}
.num-input {
  width: 64px;
  min-width: 64px;
}

.setting-row {
  display: grid;
  grid-template-columns: 108px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  margin: 4px 0;
}

.setting-label {
  min-width: 0;
  font-size: 12px;
  color: #0f172a;
}

.setting-row select {
  width: 100%;
  min-width: 0;
}

.setting-row .field-row {
  width: 100%;
}

.check-row {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  margin: 4px 0;
}

.hint {
  margin: 2px 0 0;
  font-size: 12px;
  color: #475569;
  line-height: 1.35;
}
</style>
