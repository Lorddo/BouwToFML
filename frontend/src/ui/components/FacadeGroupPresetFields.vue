<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  DEFAULT_FACADE_GROUP_NAMES,
  isDefaultFacadeGroupId,
  MAX_FACADE_GROUP_PRESETS,
  type FacadeGroupPreset,
} from '@/core/fml/facade-groups'
import { facadeGroupDisplayName } from '@/ui/composables/fml-preview/facade-group-label'

const props = withDefaults(
  defineProps<{
    groups: FacadeGroupPreset[]
    disabled?: boolean
  }>(),
  { disabled: false },
)

const emit = defineEmits<{
  'update:groups': [groups: FacadeGroupPreset[]]
}>()

const { t } = useI18n()

const canAdd = computed(() => props.groups.length < MAX_FACADE_GROUP_PRESETS)

function displayName(group: FacadeGroupPreset): string {
  return facadeGroupDisplayName(group, t)
}

function storeName(id: string, typed: string): string {
  const trimmed = typed.trim()
  if (
    isDefaultFacadeGroupId(id) &&
    (trimmed.length === 0 || trimmed === t(`result.toolbar.facadeGroupNames.${id}`))
  ) {
    return DEFAULT_FACADE_GROUP_NAMES[id]
  }
  return trimmed.length > 0 ? trimmed : id
}

function nextId(existing: readonly FacadeGroupPreset[]): string {
  let max = 0
  for (const group of existing) {
    const match = /^G(\d+)$/i.exec(group.id)
    if (!match) continue
    max = Math.max(max, Number(match[1]))
  }
  return `G${max + 1}`
}

function setName(id: string, typed: string): void {
  emit(
    'update:groups',
    props.groups.map((group) => (group.id === id ? { ...group, name: storeName(id, typed) } : group)),
  )
}

function removeAt(id: string): void {
  emit(
    'update:groups',
    props.groups.filter((group) => group.id !== id),
  )
}

function addRow(): void {
  if (!canAdd.value) return
  const id = nextId(props.groups)
  emit('update:groups', [...props.groups, { id, name: id }])
}
</script>

<template>
  <div class="facade-presets">
    <div v-for="(group, index) in groups" :key="group.id" class="facade-presets__row">
      <input
        class="facade-presets__input"
        type="text"
        :value="displayName(group)"
        :disabled="disabled"
        :aria-label="t('settings.facadeGroupRowAria', { n: index + 1 })"
        @change="setName(group.id, ($event.target as HTMLInputElement).value)"
      />
      <button
        type="button"
        class="facade-presets__remove"
        :disabled="disabled"
        :title="t('settings.facadeGroupRemove')"
        :aria-label="t('settings.facadeGroupRemove')"
        @click="removeAt(group.id)"
      >
        −
      </button>
    </div>
    <button
      type="button"
      class="facade-presets__add"
      :disabled="disabled || !canAdd"
      :title="t('settings.facadeGroupAdd')"
      @click="addRow"
    >
      +
    </button>
  </div>
</template>

<style scoped>
.facade-presets {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.facade-presets__row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.facade-presets__input {
  flex: 1;
  min-width: 0;
  height: 32px;
  padding: 0 8px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  box-sizing: border-box;
  font-size: 14px;
  color: #0f172a;
}

.facade-presets__remove,
.facade-presets__add {
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

.facade-presets__add {
  width: auto;
  padding: 0 10px;
  align-self: flex-start;
}

.facade-presets__remove:hover:not(:disabled),
.facade-presets__add:hover:not(:disabled) {
  border-color: #2563eb;
  color: #2563eb;
}

.facade-presets__remove:disabled,
.facade-presets__add:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
