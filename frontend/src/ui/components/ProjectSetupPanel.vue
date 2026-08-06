<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FloorMeta, ProjectFmlDefaults, ProjectMeta } from '../composables/project/types'
import type { PersistedProjectIndexEntry } from '@/platform/project-store'

const props = defineProps<{
  meta: ProjectMeta
  floors: FloorMeta[]
  activeFloorId: string
  /** Hoogtes voor de geselecteerde verdieping. */
  activeFloorDefaults: ProjectFmlDefaults
  /** Opgeslagen project in IndexedDB (stap 0 resume-kaart). */
  resumeCandidate?: PersistedProjectIndexEntry | null
}>()

const emit = defineEmits<{
  'update:meta': [patch: Partial<ProjectMeta>]
  'update:floorDefaults': [patch: Partial<ProjectFmlDefaults>]
  resetFloorDefaults: []
  addFloor: []
  removeFloor: [id: string]
  renameFloor: [id: string, name: string]
  selectFloor: [id: string]
  moveFloor: [orderedIds: string[]]
  resumeProject: []
  discardProject: []
}>()

const { t } = useI18n()
const activeFloor = computed(() => props.floors.find((f) => f.id === props.activeFloorId) ?? null)

const resumeUpdatedLabel = computed(() => {
  const iso = props.resumeCandidate?.updatedAt
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString()
})

function moveUp(index: number) {
  if (index <= 0) return
  const ids = props.floors.map((f) => f.id)
  const tmp = ids[index - 1]
  ids[index - 1] = ids[index]!
  ids[index] = tmp
  emit('moveFloor', ids)
}

function moveDown(index: number) {
  if (index >= props.floors.length - 1) return
  const ids = props.floors.map((f) => f.id)
  const tmp = ids[index + 1]
  ids[index + 1] = ids[index]!
  ids[index] = tmp
  emit('moveFloor', ids)
}

function onRenameInput(floorId: string, event: Event) {
  emit('renameFloor', floorId, (event.target as HTMLInputElement).value)
}

function onRenameBlur(floorId: string, event: Event) {
  const raw = (event.target as HTMLInputElement).value
  const trimmed = raw.trim()
  if (trimmed !== raw) emit('renameFloor', floorId, trimmed || raw)
}
</script>

<template>
  <div class="panel project-setup">
    <div v-if="resumeCandidate" class="resume-card">
      <h3>{{ t('project.resume.title') }}</h3>
      <p class="resume-name">
        {{ resumeCandidate.name.trim() || t('project.resume.untitled') }}
      </p>
      <p class="hint">
        {{
          t('project.resume.meta', {
            floors: resumeCandidate.floorCount,
            updated: resumeUpdatedLabel,
          })
        }}
      </p>
      <div class="resume-actions">
        <button type="button" class="primary" @click="emit('resumeProject')">
          {{ t('project.resume.continue') }}
        </button>
        <button type="button" class="secondary" @click="emit('discardProject')">
          {{ t('project.resume.newProject') }}
        </button>
      </div>
    </div>

    <h3>{{ t('project.title') }}</h3>
    <p class="hint">{{ t('project.hint') }}</p>

    <label class="field">
      <span>{{ t('project.name') }}</span>
      <input
        type="text"
        :value="meta.name"
        :placeholder="t('project.namePlaceholder')"
        @input="emit('update:meta', { name: ($event.target as HTMLInputElement).value })"
      />
    </label>

    <label class="field">
      <span
        >{{ t('project.address') }} <span class="optional">{{ t('common.optional') }}</span></span
      >
      <input
        type="text"
        :value="meta.address"
        :placeholder="t('project.addressPlaceholder')"
        @input="emit('update:meta', { address: ($event.target as HTMLInputElement).value })"
      />
    </label>

    <h4>{{ t('project.floors') }}</h4>
    <ul class="floor-list">
      <li
        v-for="(floor, index) in floors"
        :key="floor.id"
        class="floor-row"
        :class="{ active: floor.id === activeFloorId }"
      >
        <button
          type="button"
          class="floor-select"
          :title="t('project.selectFloor', { name: floor.name })"
          @click="emit('selectFloor', floor.id)"
        >
          <span class="floor-level">L{{ floor.level }}</span>
          <span class="floor-status">{{ floor.status }}</span>
        </button>
        <input
          type="text"
          class="floor-name"
          :value="floor.name"
          :placeholder="t('project.floorNamePlaceholder')"
          @click.stop
          @mousedown.stop
          @keydown.stop
          @keyup.stop
          @input="onRenameInput(floor.id, $event)"
          @blur="onRenameBlur(floor.id, $event)"
          @focus="emit('selectFloor', floor.id)"
        />
        <div class="floor-actions">
          <button
            type="button"
            :disabled="index === 0"
            :title="t('project.moveUp')"
            @click="moveUp(index)"
          >
            ↑
          </button>
          <button
            type="button"
            :disabled="index >= floors.length - 1"
            :title="t('project.moveDown')"
            @click="moveDown(index)"
          >
            ↓
          </button>
          <button
            type="button"
            class="danger"
            :disabled="floors.length <= 1"
            :title="t('project.removeFloor')"
            @click="emit('removeFloor', floor.id)"
          >
            ×
          </button>
        </div>
      </li>
    </ul>

    <div class="add-floor">
      <button type="button" class="primary" @click="emit('addFloor')">
        {{ t('project.addFloor') }}
      </button>
    </div>

    <h4 v-if="activeFloor">{{ t('project.heightsTitle', { name: activeFloor.name }) }}</h4>
    <p v-if="activeFloor" class="hint">{{ t('project.heightsHint') }}</p>
    <div v-if="activeFloor" class="defaults-grid">
      <label class="field compact">
        <span>{{ t('project.wallHeightCm') }}</span>
        <input
          type="number"
          :value="activeFloorDefaults.wallHeightCm"
          @change="
            emit('update:floorDefaults', {
              wallHeightCm: Number(($event.target as HTMLInputElement).value),
            })
          "
        />
      </label>
      <label class="field compact">
        <span>{{ t('project.doorHeightCm') }}</span>
        <input
          type="number"
          :value="activeFloorDefaults.doorHeightCm"
          @change="
            emit('update:floorDefaults', {
              doorHeightCm: Number(($event.target as HTMLInputElement).value),
            })
          "
        />
      </label>
      <label class="field compact">
        <span>{{ t('project.windowHeightCm') }}</span>
        <input
          type="number"
          :value="activeFloorDefaults.windowHeightCm"
          @change="
            emit('update:floorDefaults', {
              windowHeightCm: Number(($event.target as HTMLInputElement).value),
            })
          "
        />
      </label>
      <label class="field compact">
        <span>{{ t('project.sillZCm') }}</span>
        <input
          type="number"
          :value="activeFloorDefaults.windowSillZCm"
          @change="
            emit('update:floorDefaults', {
              windowSillZCm: Number(($event.target as HTMLInputElement).value),
            })
          "
        />
      </label>
      <label class="field compact check">
        <input
          type="checkbox"
          :checked="activeFloorDefaults.bovenlichtDefault"
          @change="
            emit('update:floorDefaults', {
              bovenlichtDefault: ($event.target as HTMLInputElement).checked,
            })
          "
        />
        <span>{{ t('project.bovenlicht') }}</span>
      </label>
    </div>
    <button v-if="activeFloor" type="button" class="secondary" @click="emit('resetFloorDefaults')">
      {{ t('project.resetDefaults') }}
    </button>
  </div>
</template>

<style scoped>
.project-setup h3,
.project-setup h4 {
  margin: 0 0 8px;
  font-size: 14px;
}
.project-setup h4 {
  margin-top: 16px;
}
.hint {
  margin: 0 0 12px;
  font-size: 12px;
  color: #64748b;
}
.resume-card {
  margin-bottom: 16px;
  padding: 12px;
  border: 1px solid #93c5fd;
  border-radius: 6px;
  background: #eff6ff;
}
.resume-name {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 600;
  color: #1e3a8a;
}
.resume-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
  font-size: 12px;
}
.optional {
  font-weight: 400;
  color: #94a3b8;
}
.field input[type='text'],
.field input[type='number'] {
  padding: 6px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
}
.field.compact {
  margin-bottom: 6px;
}
.field.check {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}
.defaults-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 10px;
}
.floor-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.floor-row {
  display: flex;
  gap: 4px;
  align-items: center;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  padding: 4px;
}
.floor-row.active {
  border-color: #3b82f6;
  background: #eff6ff;
}
.floor-select {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  padding: 4px;
  flex-shrink: 0;
}
.floor-level {
  font-size: 11px;
  color: #64748b;
}
.floor-name {
  flex: 1;
  min-width: 0;
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 3px;
  padding: 4px 6px;
  font-size: 13px;
}
.floor-name:focus {
  border-color: #3b82f6;
  outline: none;
}
.floor-status {
  font-size: 10px;
  color: #94a3b8;
}
.floor-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}
.floor-actions button {
  width: 24px;
  height: 24px;
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 3px;
  cursor: pointer;
  font-size: 12px;
}
.floor-actions button:disabled {
  opacity: 0.4;
  cursor: default;
}
.floor-actions .danger {
  color: #b91c1c;
}
.add-floor {
  margin-top: 8px;
}
.primary,
.secondary {
  padding: 6px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}
.primary {
  border: none;
  background: #2563eb;
  color: #fff;
}
.secondary {
  margin-top: 8px;
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #334155;
}
.resume-actions .secondary {
  margin-top: 0;
}
</style>
