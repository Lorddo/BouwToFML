<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { listFixturePlaceOptions, type FixturePlaceOption } from '@/core/fml/fixture-refid-catalog'
import ToolbeltIcon from './canvas/ToolbeltIcon.vue'

const selected = defineModel<FixturePlaceOption | null>({ default: null })
const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()
const query = ref('')
const category = ref('all')

const options = listFixturePlaceOptions()
const categories = computed(() => {
  const set = new Set(options.map((item) => item.categorie))
  return ['all', ...[...set].sort((a, b) => a.localeCompare(b))]
})

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return options.filter((item) => {
    if (category.value !== 'all' && item.categorie !== category.value) return false
    if (!q) return true
    return item.label.toLowerCase().includes(q) || item.categorie.toLowerCase().includes(q)
  })
})
</script>

<template>
  <div class="fixture-palette" @pointerdown.stop @mousedown.stop @mousemove.stop>
    <div class="fixture-palette__row">
      <input
        v-model="query"
        type="search"
        class="fixture-palette__search"
        :placeholder="t('viewer.fixtureSearch')"
        :aria-label="t('viewer.fixtureSearch')"
      />
      <select
        v-model="category"
        class="fixture-palette__cat"
        :aria-label="t('viewer.fixtureCategory')"
      >
        <option v-for="cat in categories" :key="cat" :value="cat">
          {{ cat === 'all' ? t('viewer.fixtureAll') : cat }}
        </option>
      </select>
      <button
        type="button"
        class="fixture-palette__close"
        :title="t('result.toolbar.deactivateDrawTool')"
        :aria-label="t('result.toolbar.deactivateDrawTool')"
        @click="emit('close')"
      >
        <ToolbeltIcon name="clear" />
      </button>
    </div>
    <div class="fixture-palette__list" role="listbox">
      <button
        v-for="item in filtered"
        :key="`${item.categorie}-${item.kind}-${item.refid}`"
        type="button"
        class="fixture-palette__item"
        :class="{ 'is-active': selected?.refid === item.refid && selected?.label === item.label }"
        @click="selected = item"
      >
        <span class="fixture-palette__name">{{ item.label }}</span>
        <span class="fixture-palette__meta">{{ item.categorie }}</span>
      </button>
      <p v-if="filtered.length === 0" class="fixture-palette__empty">
        {{ t('viewer.fixtureEmpty') }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.fixture-palette {
  width: min(360px, calc(100vw - 24px));
  max-height: 280px;
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgb(15 23 42 / 0.12);
  overflow: hidden;
}
.fixture-palette__row {
  display: flex;
  gap: 6px;
  padding: 8px;
  border-bottom: 1px solid #e2e8f0;
}
.fixture-palette__search,
.fixture-palette__cat {
  font-size: 13px;
  padding: 6px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
}
.fixture-palette__search {
  flex: 1;
  min-width: 0;
}
.fixture-palette__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
  color: #0f172a;
}
.fixture-palette__close :deep(.canvas-toolbelt__icon) {
  width: 18px;
  height: 18px;
}
.fixture-palette__list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 4px;
}
.fixture-palette__item {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: transparent;
  text-align: left;
  border-radius: 4px;
  cursor: pointer;
}
.fixture-palette__item:hover,
.fixture-palette__item.is-active {
  background: #e0f2fe;
}
.fixture-palette__name {
  font-size: 13px;
  color: #0f172a;
}
.fixture-palette__meta {
  font-size: 11px;
  color: #64748b;
}
.fixture-palette__empty {
  margin: 12px;
  font-size: 13px;
  color: #64748b;
}
</style>
