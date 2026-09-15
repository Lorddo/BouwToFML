<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  MAX_THICKNESS_CATALOG,
  MIN_THICKNESS_CATALOG,
  normalizeThicknessCatalog,
} from '@/core/plan/wall-thickness-catalog'
import type { ScaleInputUnit, UnitSystem } from '@/ui/composables/settings/scale-input-unit'
import ScaleLengthInput from './ScaleLengthInput.vue'
import { createThicknessCatalogEditSession } from './thickness-catalog-draft'

type CatalogRow = { id: number; cm: number | null }

const props = withDefaults(
  defineProps<{
    cms: number[]
    unit: ScaleInputUnit
    unitSystem?: UnitSystem
    disabled?: boolean
    hideSuffix?: boolean
    block?: boolean
  }>(),
  {
    disabled: false,
    hideSuffix: false,
    block: false,
  },
)

const emit = defineEmits<{
  'update:cms': [cms: number[]]
}>()

const { t } = useI18n()

let nextRowId = 1
const rows = ref<CatalogRow[]>([])
const fieldRefs = ref<Array<{ focus: () => void }>>([])
const editSession = createThicknessCatalogEditSession()

function catalogSignature(cms: readonly number[]): string {
  return normalizeThicknessCatalog(cms).slice().reverse().join(',')
}

function rowsFromCatalog(cms: readonly number[]): void {
  const nextCms = normalizeThicknessCatalog(cms).slice().reverse()
  const prev = rows.value
  const used = new Set<number>()
  const next = nextCms.map((cm) => {
    const existing = prev.find((row) => !used.has(row.id) && row.cm === cm)
    if (existing) {
      used.add(existing.id)
      return existing
    }
    return { id: nextRowId++, cm }
  })
  const drafts = prev.filter((row) => row.cm == null)
  rows.value = drafts.length > 0 ? [...next, ...drafts] : next
}

watch(
  () => catalogSignature(props.cms),
  (sig, prev) => {
    if (sig === prev && rows.value.length > 0) return
    rowsFromCatalog(props.cms)
  },
  { immediate: true },
)

const committedCount = computed(
  () => rows.value.filter((row) => row.cm != null && row.cm > 0).length,
)
const canAdd = computed(() => rows.value.length < MAX_THICKNESS_CATALOG)
const canRemoveCommitted = computed(() => committedCount.value > MIN_THICKNESS_CATALOG)

function committedCms(): number[] {
  return rows.value.map((row) => row.cm).filter((cm): cm is number => cm != null && cm > 0)
}

function emitCommitted(): void {
  const values = committedCms()
  if (values.length < MIN_THICKNESS_CATALOG) return
  emit('update:cms', normalizeThicknessCatalog(values))
}

function setAt(id: number, cm: number): void {
  editSession.type(id, cm)
}

function onRowCommit(id: number): void {
  const row = rows.value.find((item) => item.id === id)
  const typed = editSession.take(id)
  if (row && typed != null) row.cm = typed
  emitCommitted()
}

function addRow(): void {
  if (!canAdd.value) return
  rows.value = [...rows.value, { id: nextRowId++, cm: null }]
  void nextTick(() => {
    fieldRefs.value[fieldRefs.value.length - 1]?.focus()
  })
}

function removeAt(id: number): void {
  const row = rows.value.find((item) => item.id === id)
  if (!row) return
  const remainingCommitted = rows.value.filter(
    (item) => item.id !== id && item.cm != null && item.cm > 0,
  )
  if (row.cm != null && remainingCommitted.length < MIN_THICKNESS_CATALOG) return
  rows.value = rows.value.filter((item) => item.id !== id)
  emitCommitted()
}

function canRemoveRow(row: CatalogRow): boolean {
  if (row.cm == null) return true
  return canRemoveCommitted.value
}
</script>

<template>
  <div class="thickness-catalog" :class="{ 'thickness-catalog--with-bands': $slots.bands }">
    <div class="thickness-catalog__rows">
      <div v-for="(row, index) in rows" :key="row.id" class="thickness-catalog__row">
        <ScaleLengthInput
          ref="fieldRefs"
          :cm="row.cm ?? 0"
          :mixed="row.cm == null"
          :unit="unit"
          :unit-system="unitSystem"
          :min-cm="1"
          :disabled="disabled"
          :hide-suffix="hideSuffix"
          :block="block"
          :aria-label="t('settings.thicknessRowAria', { n: index + 1 })"
          @update:cm="setAt(row.id, $event)"
          @commit="onRowCommit(row.id)"
        />
        <button
          type="button"
          class="thickness-catalog__remove"
          :disabled="disabled || !canRemoveRow(row)"
          :title="t('settings.thicknessRemove')"
          :aria-label="t('settings.thicknessRemove')"
          @click="removeAt(row.id)"
        >
          −
        </button>
      </div>
      <button
        type="button"
        class="thickness-catalog__add"
        :disabled="disabled || !canAdd"
        :title="t('settings.thicknessAdd')"
        @click="addRow"
      >
        +
      </button>
    </div>
    <div v-if="$slots.bands" class="thickness-catalog__bands">
      <slot name="bands" />
    </div>
  </div>
</template>

<style scoped>
.thickness-catalog {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.thickness-catalog--with-bands {
  flex-direction: row;
  align-items: stretch;
  gap: 10px;
}

.thickness-catalog__rows {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1 1 auto;
  min-width: 0;
}

.thickness-catalog__bands {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 6px;
  flex: 0 0 auto;
  padding-bottom: 32px; /* align with last catalog row above the + button */
}

.thickness-catalog__row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.thickness-catalog__remove,
.thickness-catalog__add {
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

.thickness-catalog__add {
  width: auto;
  padding: 0 10px;
  align-self: flex-start;
}

.thickness-catalog__remove:hover:not(:disabled),
.thickness-catalog__add:hover:not(:disabled) {
  border-color: #2563eb;
  color: #2563eb;
}

.thickness-catalog__remove:disabled,
.thickness-catalog__add:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
