<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FloorMeta, ProjectFmlDefaults, ProjectMeta } from '../composables/project/types'
import type { PersistedProjectIndexEntry } from '@/platform/project-store'
import ToolbeltIcon from './canvas/ToolbeltIcon.vue'

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

/** Gap/hoogte alleen tonen als minstens één bovenlicht-default aan staat. */
const showBovenlichtMeasures = computed(
  () =>
    props.activeFloorDefaults.bovenlichtDefault === true ||
    props.activeFloorDefaults.windowBovenlichtDefault === true,
)

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
      <div class="resume-actions sidebar-icon-row">
        <button
          type="button"
          class="sidebar-icon-btn sidebar-icon-btn--primary"
          @click="emit('resumeProject')"
        >
          <ToolbeltIcon name="check" />
          <span>{{ t('project.resume.continue') }}</span>
        </button>
        <button type="button" class="sidebar-icon-btn" @click="emit('discardProject')">
          <ToolbeltIcon name="clear" />
          <span>{{ t('project.resume.newProject') }}</span>
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
      <button
        type="button"
        class="sidebar-icon-btn sidebar-icon-btn--primary"
        @click="emit('addFloor')"
      >
        <ToolbeltIcon name="add" />
        <span>{{ t('project.addFloor') }}</span>
      </button>
    </div>

    <template v-if="activeFloor">
      <h4>{{ t('project.thicknessesTitle', { name: activeFloor.name }) }}</h4>
      <p class="hint">{{ t('project.thicknessesHint') }}</p>
      <div class="triple-measure">
        <label class="measure-cell">
          <span class="measure-cell__label">{{ t('project.thicknessMinCm') }}</span>
          <input
            type="number"
            min="1"
            :value="activeFloorDefaults.thicknessMinCm"
            @change="
              emit('update:floorDefaults', {
                thicknessMinCm: Number(($event.target as HTMLInputElement).value),
              })
            "
          />
          <span class="measure-cell__unit">cm</span>
        </label>
        <label class="measure-cell">
          <span class="measure-cell__label">{{ t('project.thicknessMidCm') }}</span>
          <input
            type="number"
            min="1"
            :value="activeFloorDefaults.thicknessMidCm"
            @change="
              emit('update:floorDefaults', {
                thicknessMidCm: Number(($event.target as HTMLInputElement).value),
              })
            "
          />
          <span class="measure-cell__unit">cm</span>
        </label>
        <label class="measure-cell">
          <span class="measure-cell__label">{{ t('project.thicknessMaxCm') }}</span>
          <input
            type="number"
            min="1"
            :value="activeFloorDefaults.thicknessMaxCm"
            @change="
              emit('update:floorDefaults', {
                thicknessMaxCm: Number(($event.target as HTMLInputElement).value),
              })
            "
          />
          <span class="measure-cell__unit">cm</span>
        </label>
      </div>

      <h4>{{ t('project.heightsTitle', { name: activeFloor.name }) }}</h4>
      <p class="hint">{{ t('project.heightsHint') }}</p>

      <div class="measure-category">
        <h5 class="measure-category__title">{{ t('project.categoryWall') }}</h5>
        <label class="measure-row">
          <span class="measure-row__label">{{ t('project.wallHeightCm') }}</span>
          <input
            type="number"
            :value="activeFloorDefaults.wallHeightCm"
            @change="
              emit('update:floorDefaults', {
                wallHeightCm: Number(($event.target as HTMLInputElement).value),
              })
            "
          />
          <span class="measure-row__unit">cm</span>
        </label>
      </div>

      <div class="measure-category">
        <h5 class="measure-category__title">{{ t('project.categoryDoor') }}</h5>
        <label class="measure-row">
          <span class="measure-row__label">{{ t('project.doorHeightCm') }}</span>
          <input
            type="number"
            :value="activeFloorDefaults.doorHeightCm"
            @change="
              emit('update:floorDefaults', {
                doorHeightCm: Number(($event.target as HTMLInputElement).value),
              })
            "
          />
          <span class="measure-row__unit">cm</span>
        </label>
      </div>

      <div class="measure-category">
        <h5 class="measure-category__title">{{ t('project.categoryWindow') }}</h5>
        <label class="measure-row">
          <span class="measure-row__label">{{ t('project.windowKozijnHeightCm') }}</span>
          <input
            type="number"
            :value="activeFloorDefaults.windowSillZCm"
            @change="
              emit('update:floorDefaults', {
                windowSillZCm: Number(($event.target as HTMLInputElement).value),
              })
            "
          />
          <span class="measure-row__unit">cm</span>
        </label>
        <label class="measure-row">
          <span class="measure-row__label">{{ t('project.windowGlassHeightCm') }}</span>
          <input
            type="number"
            :value="activeFloorDefaults.windowHeightCm"
            @change="
              emit('update:floorDefaults', {
                windowHeightCm: Number(($event.target as HTMLInputElement).value),
              })
            "
          />
          <span class="measure-row__unit">cm</span>
        </label>
      </div>

      <div class="measure-category">
        <h5 class="measure-category__title">{{ t('project.categoryBovenlicht') }}</h5>
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
          <span>{{ t('project.bovenlichtDoors') }}</span>
        </label>
        <label class="field compact check">
          <input
            type="checkbox"
            :checked="activeFloorDefaults.windowBovenlichtDefault"
            @change="
              emit('update:floorDefaults', {
                windowBovenlichtDefault: ($event.target as HTMLInputElement).checked,
              })
            "
          />
          <span>{{ t('project.bovenlichtWindows') }}</span>
        </label>
        <template v-if="showBovenlichtMeasures">
          <label class="measure-row">
            <span class="measure-row__label" :title="t('project.bovenlichtGapTitle')">{{
              t('project.bovenlichtGapCm')
            }}</span>
            <input
              type="number"
              min="0"
              :value="activeFloorDefaults.bovenlichtGapCm"
              @change="
                emit('update:floorDefaults', {
                  bovenlichtGapCm: Number(($event.target as HTMLInputElement).value),
                })
              "
            />
            <span class="measure-row__unit">cm</span>
          </label>
          <label class="measure-row">
            <span class="measure-row__label" :title="t('project.bovenlichtHeightTitle')">{{
              t('project.bovenlichtHeightCm')
            }}</span>
            <input
              type="number"
              min="1"
              :value="activeFloorDefaults.bovenlichtHeightCm"
              @change="
                emit('update:floorDefaults', {
                  bovenlichtHeightCm: Number(($event.target as HTMLInputElement).value),
                })
              "
            />
            <span class="measure-row__unit">cm</span>
          </label>
        </template>
      </div>

      <button type="button" class="secondary" @click="emit('resetFloorDefaults')">
        {{ t('project.resetDefaults') }}
      </button>
    </template>
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
.field input[type='number'],
.measure-cell input,
.measure-row input {
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
.triple-measure {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 4px;
}
.measure-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  text-align: center;
}
.measure-cell__label {
  color: #475569;
  font-weight: 500;
}
.measure-cell input {
  width: 100%;
  box-sizing: border-box;
  text-align: center;
}
.measure-cell__unit {
  color: #94a3b8;
  font-size: 11px;
}
.measure-category {
  margin-bottom: 12px;
  padding: 8px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #f8fafc;
}
.measure-category__title {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 600;
  color: #334155;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.measure-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 12px;
}
.measure-row:last-child {
  margin-bottom: 0;
}
.measure-row__label {
  color: #475569;
}
.measure-row input {
  width: 72px;
  text-align: right;
}
.measure-row__unit {
  color: #94a3b8;
  font-size: 11px;
  min-width: 1.5em;
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
