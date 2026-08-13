<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ElementClass, PreprocessConfig } from '@/core/extraction/types'
import {
  CLOSET_DOOR_REFID,
  DOOR_FML_TEMPLATE_OPTIONS,
  resolveDoorFmlTemplateRefId,
} from '@/core/fml/types'
import type { FmlThicknessBand } from '@/core/fml/fml-wall-thickness-tiers'
import { SELECTION_COLORS } from '@/platform/selection'
import type { SelectionRect } from '@/platform/selection'
import {
  resolveWallThicknessBand,
  wallThicknessBandOptions,
  type WallRefThicknessMeasure,
} from '@/platform/selection/wall-thickness-ref'
import type { FmlWallThicknessLimits } from '@/core/fml/fml-wall-thickness-limits'
import { DEFAULT_FML_WALL_THICKNESS_LIMITS } from '@/core/fml/fml-wall-thickness-limits'

const props = defineProps<{
  activeClass: ElementClass | null
  counts: Partial<Record<ElementClass, number>>
  referenceWallThicknessPx: number | null
  wallRefThicknessMeasures?: WallRefThicknessMeasure[]
  selectedRectId?: string | null
  measuring?: boolean
  scaleConfirmed: boolean
  rects: SelectionRect[]
  wallThicknessLimits?: FmlWallThicknessLimits
}>()

const preprocess = defineModel<PreprocessConfig>('preprocess', { required: true })

const emit = defineEmits<{
  setDrawMode: [type: 'wall' | 'door' | 'window']
  deactivateDrawMode: []
  updateDoorFmlRefId: [id: string, fmlRefId: string]
  updateWallThicknessBand: [id: string, band: FmlThicknessBand]
  updateWallThicknessCm: [band: FmlThicknessBand, cm: number]
  selectRect: [id: string]
}>()

const { t } = useI18n()

const REF_TYPES = computed(() => [
  {
    type: 'wall' as const,
    label: t('preprocess.refs.wall'),
    title: t('preprocess.refs.wallTitle'),
  },
  {
    type: 'door' as const,
    label: t('preprocess.refs.door'),
    title: t('preprocess.refs.doorTitle'),
  },
  {
    type: 'window' as const,
    label: t('preprocess.refs.window'),
    title: t('preprocess.refs.windowTitle'),
  },
])

const doorRects = computed(() => props.rects.filter((rect) => rect.type === 'door'))
const wallRects = computed(() => props.rects.filter((rect) => rect.type === 'wall'))

const thicknessOptions = computed(() =>
  wallThicknessBandOptions(props.wallThicknessLimits ?? DEFAULT_FML_WALL_THICKNESS_LIMITS),
)

const measuresByRectId = computed(() => {
  const map = new Map<string, number>()
  for (const m of props.wallRefThicknessMeasures ?? []) {
    if (m.rectId && m.thicknessPx > 0) map.set(m.rectId, m.thicknessPx)
  }
  return map
})

function doorTemplateLabel(refid: string): string {
  return refid === CLOSET_DOOR_REFID
    ? t('preprocess.refs.templateCloset')
    : t('preprocess.refs.templateStandard')
}

function bandName(band: FmlThicknessBand): string {
  return t(`preprocess.refs.band.${band}`)
}

function cmForBand(band: FmlThicknessBand): number {
  const limits = props.wallThicknessLimits ?? DEFAULT_FML_WALL_THICKNESS_LIMITS
  if (band === 'min') return limits.minCm
  if (band === 'mid') return limits.midCm
  return limits.maxCm
}

function onCmInput(band: FmlThicknessBand, raw: string) {
  const cm = Number(raw)
  if (!Number.isFinite(cm) || cm <= 0) return
  emit('updateWallThicknessCm', band, cm)
}

function measuredPxFor(rectId: string): number | null {
  return measuresByRectId.value.get(rectId) ?? null
}

function onEscapeKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (props.activeClass == null) return
  emit('deactivateDrawMode')
}

onMounted(() => {
  window.addEventListener('keydown', onEscapeKey)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onEscapeKey)
})
</script>

<template>
  <div class="panel">
    <h3>{{ t('preprocess.refs.title') }}</h3>
    <p class="hint">{{ t('preprocess.refs.hint') }}</p>

    <label class="ocr-toggle">
      <input v-model="preprocess.ocrEnabled" type="checkbox" />
      {{ t('preprocess.refs.ocrToggle') }}
    </label>
    <p v-if="!preprocess.ocrEnabled" class="hint subtle">{{ t('preprocess.refs.ocrOffHint') }}</p>
    <p v-else class="hint subtle">{{ t('preprocess.refs.ocrOnHint') }}</p>

    <div class="icon-row">
      <button
        v-for="item in REF_TYPES"
        :key="item.type"
        type="button"
        class="ref-btn"
        :class="{ active: activeClass === item.type }"
        :style="{
          '--ref-color': SELECTION_COLORS[item.type],
        }"
        :disabled="!scaleConfirmed"
        :title="item.title"
        @click="$emit('setDrawMode', item.type)"
      >
        <span class="swatch" />
        <span class="label">{{ item.label }}</span>
        <span class="count">{{ counts[item.type] ?? 0 }}</span>
      </button>
    </div>
    <p
      class="metric"
      :class="{ warning: referenceWallThicknessPx == null && (counts.wall ?? 0) > 0 }"
    >
      <template v-if="measuring">{{ t('preprocess.refs.measuringThickness') }}</template>
      <template v-else-if="referenceWallThicknessPx != null">
        {{
          t('preprocess.refs.measuredThickness', {
            px: Math.round(referenceWallThicknessPx),
          })
        }}
      </template>
      <template v-else>{{ t('preprocess.refs.noThicknessYet') }}</template>
    </p>

    <div v-if="wallRects.length > 0" class="door-list">
      <h4>{{ t('preprocess.refs.wallThicknessTitle') }}</h4>
      <p class="hint subtle">{{ t('preprocess.refs.wallThicknessHint') }}</p>
      <ul>
        <li
          v-for="(rect, index) in wallRects"
          :key="rect.id"
          class="ref-row"
          :class="{ selected: selectedRectId === rect.id }"
          @click="$emit('selectRect', rect.id)"
        >
          <span class="door-label">{{ t('preprocess.refs.wallN', { n: index + 1 }) }}</span>
          <select
            class="band-select"
            :value="resolveWallThicknessBand(rect)"
            :title="t('preprocess.refs.wallBandSelect')"
            @click.stop
            @change="
              $emit(
                'updateWallThicknessBand',
                rect.id,
                ($event.target as HTMLSelectElement).value as FmlThicknessBand,
              )
            "
          >
            <option v-for="opt in thicknessOptions" :key="opt.band" :value="opt.band">
              {{ bandName(opt.band) }}
            </option>
          </select>
          <input
            class="cm-input"
            type="number"
            min="1"
            step="0.1"
            :value="cmForBand(resolveWallThicknessBand(rect))"
            :title="t('preprocess.refs.wallThicknessCmOverride')"
            @click.stop
            @change="
              onCmInput(resolveWallThicknessBand(rect), ($event.target as HTMLInputElement).value)
            "
          />
          <span class="cm-unit">cm</span>
          <span v-if="measuredPxFor(rect.id) != null" class="px-badge">
            {{ measuredPxFor(rect.id) }}px
          </span>
        </li>
      </ul>
    </div>

    <div v-if="doorRects.length > 0" class="door-list">
      <h4>{{ t('preprocess.refs.doorTemplateTitle') }}</h4>
      <p class="hint subtle">{{ t('preprocess.refs.doorTemplateHint') }}</p>
      <ul>
        <li
          v-for="(rect, index) in doorRects"
          :key="rect.id"
          class="ref-row"
          :class="{ selected: selectedRectId === rect.id }"
          @click="$emit('selectRect', rect.id)"
        >
          <span class="door-label">{{ t('preprocess.refs.doorN', { n: index + 1 }) }}</span>
          <select
            :value="resolveDoorFmlTemplateRefId(rect.fmlRefId)"
            @click.stop
            @change="
              $emit('updateDoorFmlRefId', rect.id, ($event.target as HTMLSelectElement).value)
            "
          >
            <option v-for="opt in DOOR_FML_TEMPLATE_OPTIONS" :key="opt.refid" :value="opt.refid">
              {{ doorTemplateLabel(opt.refid) }}
            </option>
          </select>
        </li>
      </ul>
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

.hint.subtle {
  margin-top: 4px;
  margin-bottom: 8px;
}

.icon-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 10px 0 8px;
}

.ref-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  font-size: 12px;
}

.ref-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ref-btn.active {
  border-color: var(--ref-color, #2563eb);
  background: color-mix(in srgb, var(--ref-color, #2563eb) 12%, white);
  font-weight: 600;
}

.swatch {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  background: var(--ref-color);
  flex-shrink: 0;
}

.count {
  min-width: 1.2em;
  text-align: center;
  color: #64748b;
  font-variant-numeric: tabular-nums;
}

.metric {
  margin: 0 0 10px;
  font-size: 12px;
  color: #475569;
}

.metric.warning {
  color: #b45309;
}

.ocr-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  margin: 0;
}

.door-list {
  margin-top: 4px;
}

.door-list h4 {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}

.door-list ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.door-list li {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ref-row {
  padding: 4px 6px;
  border-radius: 4px;
  cursor: pointer;
}

.ref-row.selected {
  background: color-mix(in srgb, #2563eb 12%, white);
  outline: 1px solid #2563eb;
}

.door-label {
  flex: 0 0 4.5rem;
  font-size: 12px;
  color: #475569;
}

.band-select {
  flex: 0 0 5.5rem;
  font-size: 12px;
  padding: 4px 6px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: #fff;
}

.cm-input {
  flex: 0 0 4.5rem;
  width: 4.5rem;
  font-size: 12px;
  padding: 4px 6px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: #fff;
}

.cm-unit {
  flex: 0 0 auto;
  font-size: 11px;
  color: #64748b;
}

.door-list select:not(.band-select) {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  padding: 4px 6px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: #fff;
}

.px-badge {
  flex: 0 0 auto;
  font-size: 11px;
  color: #64748b;
  font-variant-numeric: tabular-nums;
  margin-left: auto;
}
</style>
