<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ElementClass, PreprocessConfig } from '@/core/extraction/types'
import {
  DOOR_TEMPLATE_KIND_OPTIONS,
  resolveDoorTemplateKind,
} from '@/core/plan/types'
import { SELECTION_COLORS } from '@/platform/selection'
import type { SelectionRect } from '@/platform/selection'
import {
  findWallRectForCm,
  type WallRefThicknessMeasure,
} from '@/platform/selection/wall-thickness-ref'
import {
  addThicknessToCatalog,
  MAX_THICKNESS_CATALOG,
  MIN_THICKNESS_CATALOG,
  normalizeThicknessCatalog,
  removeThicknessFromCatalog,
} from '@/core/plan/wall-thickness-catalog'
import ToolbeltIcon from './canvas/ToolbeltIcon.vue'
import type { WallThicknessLimits } from '@/core/plan/wall-thickness-limits'
import { DEFAULT_WALL_THICKNESS_LIMITS } from '@/core/plan/wall-thickness-limits'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import ScaleLengthInput from './ScaleLengthInput.vue'
import { createThicknessCatalogEditSession } from './thickness-catalog-draft'
import {
  TOOLBELT_HOTKEY_PRIORITY,
  useToolbeltHotkey,
} from '@/ui/composables/canvas/useToolbeltHotkey'

const props = defineProps<{
  activeClass: ElementClass | null
  counts: Partial<Record<ElementClass, number>>
  referenceWallThicknessPx: number | null
  wallRefThicknessMeasures?: WallRefThicknessMeasure[]
  selectedRectId?: string | null
  pendingWallThicknessCm?: number | null
  measuring?: boolean
  scaleConfirmed: boolean
  rects: SelectionRect[]
  wallThicknessLimits?: WallThicknessLimits
  unit: ScaleInputUnit
}>()

const preprocess = defineModel<PreprocessConfig>('preprocess', { required: true })

const emit = defineEmits<{
  setDrawMode: [type: 'wall' | 'door' | 'window', cm?: number]
  deactivateDrawMode: []
  updateDoorFmlRefId: [id: string, fmlRefId: string]
  updateCatalogThickness: [oldCm: number, newCm: number]
  setCatalogCms: [cms: number[]]
  selectRect: [id: string]
}>()

type CatalogDraftRow = { id: number; cm: number | null }

const { t } = useI18n()

const OPENING_REF_TYPES = computed(() => [
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

const catalogCms = computed(() => {
  const limits = props.wallThicknessLimits ?? DEFAULT_WALL_THICKNESS_LIMITS
  return normalizeThicknessCatalog(
    limits.thicknessCms ?? [limits.minCm, limits.midCm, limits.maxCm],
  )
})

const catalogDisplayCms = computed(() => catalogCms.value.slice().reverse())

let nextRowId = 1
const draftRows = ref<CatalogDraftRow[]>([])
const fieldRefs = ref<Array<{ focus: () => void }>>([])
const newRowIds = new Set<number>()
const editSession = createThicknessCatalogEditSession()

function catalogSignature(cms: readonly number[]): string {
  return [...cms].slice().reverse().join(',')
}

function rowsFromCatalog(cms: readonly number[]): void {
  const prev = draftRows.value
  const used = new Set<number>()
  const next = cms.map((cm) => {
    const existing = prev.find(
      (row) => !used.has(row.id) && !newRowIds.has(row.id) && row.cm === cm,
    )
    if (existing) {
      used.add(existing.id)
      return existing
    }
    return { id: nextRowId++, cm }
  })
  const drafts = prev.filter((row) => newRowIds.has(row.id))
  draftRows.value = drafts.length > 0 ? [...next, ...drafts] : next
}

watch(
  () => catalogSignature(catalogDisplayCms.value),
  (sig, prev) => {
    if (sig === prev && draftRows.value.length > 0) return
    rowsFromCatalog(catalogDisplayCms.value)
  },
  { immediate: true },
)

const catalogRows = computed(() =>
  draftRows.value.map((row, index) => {
    const rect = row.cm != null ? findWallRectForCm(wallRects.value, row.cm) : null
    return {
      id: row.id,
      cm: row.cm,
      index,
      rect,
      drawn: rect != null,
      drawing:
        row.cm != null && props.activeClass === 'wall' && props.pendingWallThicknessCm === row.cm,
      selected: rect != null && props.selectedRectId === rect.id,
    }
  }),
)

const canAdd = computed(() => draftRows.value.length < MAX_THICKNESS_CATALOG)
const canRemoveCommitted = computed(
  () =>
    draftRows.value.filter((row) => row.cm != null && row.cm > 0).length > MIN_THICKNESS_CATALOG,
)

const measuresByRectId = computed(() => {
  const map = new Map<string, number>()
  for (const m of props.wallRefThicknessMeasures ?? []) {
    if (m.rectId && m.thicknessPx > 0) map.set(m.rectId, m.thicknessPx)
  }
  return map
})

function doorTemplateLabel(kind: string): string {
  return kind === 'door.closet'
    ? t('preprocess.refs.templateCloset')
    : t('preprocess.refs.templateStandard')
}

function onCatalogCm(rowId: number, cm: number) {
  editSession.type(rowId, cm)
}

function onDraftCommit(rowId: number) {
  const row = draftRows.value.find((item) => item.id === rowId)
  if (!row) return
  if (newRowIds.has(rowId)) {
    const added = editSession.commitNew(rowId, catalogCms.value)
    if (added?.kind !== 'add') return
    row.cm = added.cm
    newRowIds.delete(rowId)
    emit('setCatalogCms', addThicknessToCatalog(catalogCms.value, added.cm))
    return
  }
  const replaced = editSession.commitExisting(rowId, row.cm)
  if (replaced?.kind !== 'replace') return
  row.cm = replaced.newCm
  emit('updateCatalogThickness', replaced.oldCm, replaced.newCm)
}

function onCatalogRowClick(row: (typeof catalogRows.value)[number]) {
  if (!props.scaleConfirmed || row.cm == null) return
  emit('setDrawMode', 'wall', row.cm)
}

function addCatalogRow() {
  if (!canAdd.value) return
  const id = nextRowId++
  newRowIds.add(id)
  draftRows.value = [...draftRows.value, { id, cm: null }]
  void nextTick(() => {
    fieldRefs.value[fieldRefs.value.length - 1]?.focus()
  })
}

function canRemoveRow(row: (typeof catalogRows.value)[number]): boolean {
  if (row.cm == null || newRowIds.has(row.id)) return true
  return canRemoveCommitted.value
}

function removeCatalogRow(event: Event, row: (typeof catalogRows.value)[number]) {
  event.stopPropagation()
  if (!canRemoveRow(row)) return
  if (row.cm == null || newRowIds.has(row.id)) {
    newRowIds.delete(row.id)
    draftRows.value = draftRows.value.filter((item) => item.id !== row.id)
    return
  }
  emit('setCatalogCms', removeThicknessFromCatalog(catalogCms.value, row.cm))
}

function onSelectDrawn(event: Event, rectId: string) {
  event.stopPropagation()
  emit('selectRect', rectId)
}

function measuredPxFor(rectId: string): number | null {
  return measuresByRectId.value.get(rectId) ?? null
}

useToolbeltHotkey('Escape', () => emit('deactivateDrawMode'), {
  enabled: () => props.activeClass != null,
  priority: TOOLBELT_HOTKEY_PRIORITY.tool,
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
      <span
        class="ref-btn ref-btn--status"
        :class="{ active: activeClass === 'wall' }"
        :style="{ '--ref-color': SELECTION_COLORS.wall }"
        :title="t('preprocess.refs.wallTitle')"
      >
        <span class="swatch" />
        <span class="label">{{ t('preprocess.refs.wall') }}</span>
        <span class="count">{{ wallRects.length }}/{{ catalogDisplayCms.length }}</span>
      </span>
      <button
        v-for="item in OPENING_REF_TYPES"
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

    <div class="door-list">
      <h4>{{ t('preprocess.refs.wallThicknessTitle') }}</h4>
      <p class="hint subtle">{{ t('preprocess.refs.wallThicknessHint') }}</p>
      <ul>
        <li
          v-for="row in catalogRows"
          :key="row.id"
          class="ref-row"
          :class="{
            selected: row.selected,
            drawing: row.drawing,
            'has-ref': row.drawn && !row.drawing && !row.selected,
            disabled: !scaleConfirmed && row.cm != null,
            draft: row.cm == null,
          }"
          :title="
            row.cm == null
              ? t('settings.thicknessAdd')
              : row.drawn
                ? t('preprocess.refs.wallRowRedrawTitle')
                : t('preprocess.refs.wallRowDrawTitle')
          "
          @click="onCatalogRowClick(row)"
        >
          <span class="door-label">{{ t('preprocess.refs.wallN', { n: row.index + 1 }) }}</span>
          <ScaleLengthInput
            ref="fieldRefs"
            input-class="cm-input"
            :cm="row.cm ?? 0"
            :mixed="row.cm == null"
            :unit="unit"
            :min-cm="1"
            hide-suffix
            :aria-label="t('preprocess.refs.wallThicknessCmOverride')"
            @click.stop
            @update:cm="onCatalogCm(row.id, $event)"
            @commit="onDraftCommit(row.id)"
          />
          <span v-if="unit !== 'ft-in'" class="cm-unit">{{ t(`common.${unit}`) }}</span>
          <span v-if="row.rect && measuredPxFor(row.rect.id) != null" class="px-badge">
            {{ measuredPxFor(row.rect.id) }}px
          </span>
          <button
            v-if="row.rect"
            type="button"
            class="drawn-mark"
            :title="t('preprocess.refs.wallSelectRef')"
            :aria-label="t('preprocess.refs.wallSelectRef')"
            @click="onSelectDrawn($event, row.rect.id)"
          >
            <ToolbeltIcon name="check" />
          </button>
          <button
            type="button"
            class="catalog-remove"
            :disabled="!canRemoveRow(row)"
            :title="t('settings.thicknessRemove')"
            :aria-label="t('settings.thicknessRemove')"
            @click="removeCatalogRow($event, row)"
          >
            −
          </button>
        </li>
      </ul>
      <button
        type="button"
        class="catalog-add"
        :disabled="!canAdd"
        :title="t('settings.thicknessAdd')"
        @click="addCatalogRow"
      >
        +
      </button>
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
            :value="resolveDoorTemplateKind(rect.fmlRefId)"
            @click.stop
            @change="
              $emit('updateDoorFmlRefId', rect.id, ($event.target as HTMLSelectElement).value)
            "
          >
            <option v-for="opt in DOOR_TEMPLATE_KIND_OPTIONS" :key="opt.kind" :value="opt.kind">
              {{ doorTemplateLabel(opt.kind) }}
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

.ref-btn--status {
  cursor: default;
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

.ref-row.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ref-row.draft {
  cursor: default;
}

.catalog-remove,
.catalog-add {
  flex: 0 0 26px;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: #fff;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  color: #475569;
}

.catalog-add {
  width: auto;
  padding: 0 10px;
  margin-top: 8px;
}

.catalog-remove:hover:not(:disabled),
.catalog-add:hover:not(:disabled) {
  border-color: #2563eb;
  color: #2563eb;
}

.catalog-remove:disabled,
.catalog-add:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ref-row.selected {
  background: color-mix(in srgb, #2563eb 12%, white);
  outline: 1px solid #2563eb;
}

.ref-row.drawing {
  background: color-mix(in srgb, #2563eb 16%, white);
  outline: 2px solid #2563eb;
}

.ref-row.has-ref {
  background: color-mix(in srgb, #16a34a 10%, white);
  outline: 1.5px solid #16a34a;
}

.drawn-mark {
  flex: 0 0 22px;
  width: 22px;
  height: 22px;
  margin-left: auto;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: #16a34a;
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.drawn-mark :deep(svg) {
  width: 12px;
  height: 12px;
}

.door-label {
  flex: 0 0 4.5rem;
  font-size: 12px;
  color: #475569;
}

.cm-input {
  flex: 0 0 7.25rem;
  width: 7.25rem;
  height: 26px;
}

.cm-unit {
  flex: 0 0 auto;
  font-size: 11px;
  color: #64748b;
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

.px-badge {
  flex: 0 0 auto;
  font-size: 11px;
  color: #64748b;
  font-variant-numeric: tabular-nums;
}
</style>
