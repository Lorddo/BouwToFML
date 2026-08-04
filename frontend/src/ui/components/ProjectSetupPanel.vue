<script setup lang="ts">
import { computed } from 'vue'
import type { FloorMeta, ProjectFmlDefaults, ProjectMeta } from '../composables/project/types'

const props = defineProps<{
  meta: ProjectMeta
  floors: FloorMeta[]
  activeFloorId: string
  /** Hoogtes voor de geselecteerde verdieping. */
  activeFloorDefaults: ProjectFmlDefaults
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
}>()

const activeFloor = computed(() => props.floors.find((f) => f.id === props.activeFloorId) ?? null)

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
    <h3>Project</h3>
    <p class="hint">
      Projectnaam en verdiepingen. Adres is optioneel. Daarna per verdieping de detectie-flow.
    </p>

    <label class="field">
      <span>Projectnaam</span>
      <input
        type="text"
        :value="meta.name"
        placeholder="Bijv. Kinderdijkstraat 53"
        @input="emit('update:meta', { name: ($event.target as HTMLInputElement).value })"
      />
    </label>

    <label class="field">
      <span>Adres <span class="optional">(optioneel)</span></span>
      <input
        type="text"
        :value="meta.address"
        placeholder="Straat, plaats"
        @input="emit('update:meta', { address: ($event.target as HTMLInputElement).value })"
      />
    </label>

    <h4>Verdiepingen</h4>
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
          :title="`Selecteer ${floor.name}`"
          @click="emit('selectFloor', floor.id)"
        >
          <span class="floor-level">L{{ floor.level }}</span>
          <span class="floor-status">{{ floor.status }}</span>
        </button>
        <input
          type="text"
          class="floor-name"
          :value="floor.name"
          placeholder="Naam verdieping"
          @click.stop
          @mousedown.stop
          @keydown.stop
          @keyup.stop
          @input="onRenameInput(floor.id, $event)"
          @blur="onRenameBlur(floor.id, $event)"
          @focus="emit('selectFloor', floor.id)"
        />
        <div class="floor-actions">
          <button type="button" :disabled="index === 0" title="Omhoog" @click="moveUp(index)">
            ↑
          </button>
          <button
            type="button"
            :disabled="index >= floors.length - 1"
            title="Omlaag"
            @click="moveDown(index)"
          >
            ↓
          </button>
          <button
            type="button"
            class="danger"
            :disabled="floors.length <= 1"
            title="Verwijderen"
            @click="emit('removeFloor', floor.id)"
          >
            ×
          </button>
        </div>
      </li>
    </ul>

    <div class="add-floor">
      <button type="button" class="primary" @click="emit('addFloor')">+ Verdieping</button>
    </div>

    <h4 v-if="activeFloor">Hoogtes — {{ activeFloor.name }}</h4>
    <p v-if="activeFloor" class="hint">
      Per verdieping. Nieuwe verdiepingen starten met de waarden van de actieve verdieping.
    </p>
    <div v-if="activeFloor" class="defaults-grid">
      <label class="field compact">
        <span>Muurhoogte cm</span>
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
        <span>Deurhoogte cm</span>
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
        <span>Raamhoogte cm</span>
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
        <span>Dorpel z cm</span>
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
        <span>Bovenlicht</span>
      </label>
    </div>
    <button v-if="activeFloor" type="button" class="secondary" @click="emit('resetFloorDefaults')">
      Reset naar standaard
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
</style>
