<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ElementClass, PreprocessConfig } from '@/core/extraction/types'
import {
  CLOSET_DOOR_REFID,
  DOOR_FML_TEMPLATE_OPTIONS,
  resolveDoorFmlTemplateRefId,
} from '@/core/fml/types'
import { SELECTION_COLORS } from '@/platform/selection'
import type { SelectionRect } from '@/platform/selection'

const props = defineProps<{
  activeClass: ElementClass | null
  counts: Partial<Record<ElementClass, number>>
  referenceWallThicknessPx: number | null
  measuring?: boolean
  scaleConfirmed: boolean
  rects: SelectionRect[]
}>()

const preprocess = defineModel<PreprocessConfig>('preprocess', { required: true })

const emit = defineEmits<{
  setDrawMode: [type: 'wall' | 'door' | 'window']
  deactivateDrawMode: []
  updateDoorFmlRefId: [id: string, fmlRefId: string]
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

function doorTemplateLabel(refid: string): string {
  return refid === CLOSET_DOOR_REFID
    ? t('preprocess.refs.templateCloset')
    : t('preprocess.refs.templateStandard')
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
        {{ t('preprocess.refs.measuredThickness', { px: referenceWallThicknessPx }) }}
      </template>
      <template v-else>{{ t('preprocess.refs.noThicknessYet') }}</template>
    </p>

    <div v-if="doorRects.length > 0" class="door-list">
      <h4>{{ t('preprocess.refs.doorTemplateTitle') }}</h4>
      <p class="hint subtle">{{ t('preprocess.refs.doorTemplateHint') }}</p>
      <ul>
        <li v-for="(rect, index) in doorRects" :key="rect.id">
          <span class="door-label">{{ t('preprocess.refs.doorN', { n: index + 1 }) }}</span>
          <select
            :value="resolveDoorFmlTemplateRefId(rect.fmlRefId)"
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

.door-label {
  flex: 0 0 4.5rem;
  font-size: 12px;
  color: #475569;
}

.door-list select {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  padding: 4px 6px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: #fff;
}
</style>
