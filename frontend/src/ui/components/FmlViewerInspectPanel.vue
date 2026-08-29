<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ToolbeltIcon from './canvas/ToolbeltIcon.vue'
import { inspectKindLabel, type FmlInspectKind } from '@/ui/composables/fml-preview/fml-inspect'

export interface InspectHit {
  kind: FmlInspectKind
  id: string
  wallId?: string
  ids?: string[]
  floorIndex: number
}

export interface FacadeGroup {
  id: string
  name: string
}

defineProps<{
  lastInspectHit: InspectHit | null
  inspectColors: Record<string, string>
  memberFacadeGroups: FacadeGroup[]
  addableFacadeGroups: FacadeGroup[]
}>()

const emit = defineEmits<{
  facadeChange: [event: Event]
  facadeRemove: [groupId: string]
  facadeSelectMembers: [groupId: string]
}>()

const { t } = useI18n()
</script>

<template>
  <div class="inspect-panel">
    <p class="inspect-hint">
      Tik cyclet de statuskleur: uit → open (oranje) → klaar (groen) → uit. Muur in een gevelgroep
      selecteert alle leden op deze verdieping.
    </p>
    <dl v-if="lastInspectHit" class="inspect-hit">
      <div>
        <dt>Type</dt>
        <dd>{{ inspectKindLabel(lastInspectHit.kind) }}</dd>
      </div>
      <div>
        <dt>Id</dt>
        <dd class="inspect-id">{{ lastInspectHit.id }}</dd>
      </div>
      <div v-if="lastInspectHit.wallId">
        <dt>Muur</dt>
        <dd class="inspect-id">{{ lastInspectHit.wallId }}</dd>
      </div>
      <div v-if="lastInspectHit.ids?.length">
        <dt>Gevel-leden</dt>
        <dd class="inspect-id">{{ lastInspectHit.ids.length }}</dd>
      </div>
      <div>
        <dt>Kleur</dt>
        <dd>
          <span
            v-if="inspectColors[lastInspectHit.id]"
            class="inspect-swatch"
            :style="{ background: inspectColors[lastInspectHit.id] }"
          />
          {{ inspectColors[lastInspectHit.id] ?? 'geen' }}
        </dd>
      </div>
    </dl>
    <div v-if="lastInspectHit?.kind === 'wall'" class="inspect-facade">
      <span class="inspect-facade-label">{{ t('result.toolbar.facadeGroup') }}</span>
      <div class="inspect-facade-stack">
        <select
          class="inspect-facade-select"
          :aria-label="t('result.toolbar.facadeGroupAria')"
          value=""
          @change="emit('facadeChange', $event)"
        >
          <option value="" disabled>
            {{ t('result.toolbar.facadeGroupAdd') }}
          </option>
          <option v-for="group in addableFacadeGroups" :key="group.id" :value="group.id">
            {{ group.name || group.id }}
          </option>
          <option value="__new__">{{ t('result.toolbar.facadeGroupNew') }}</option>
          <option value="__edit__">{{ t('result.toolbar.facadeGroupEditAll') }}</option>
        </select>
        <div v-if="memberFacadeGroups.length > 0" class="inspect-facade-chips">
          <div v-for="group in memberFacadeGroups" :key="group.id" class="inspect-facade-chip">
            <span class="inspect-facade-chip-name">{{ group.name || group.id }}</span>
            <button
              type="button"
              class="inspect-facade-chip-btn"
              :title="t('result.toolbar.facadeGroupInspectSelectTitle')"
              :aria-label="t('result.toolbar.facadeGroupSelect')"
              @click="emit('facadeSelectMembers', group.id)"
            >
              <ToolbeltIcon name="fit" />
            </button>
            <button
              type="button"
              class="inspect-facade-chip-btn"
              :title="t('result.toolbar.facadeGroupRemoveTitle')"
              :aria-label="t('result.toolbar.facadeGroupRemove')"
              @click="emit('facadeRemove', group.id)"
            >
              ×
            </button>
          </div>
        </div>
      </div>
    </div>
    <p v-else-if="!lastInspectHit" class="inspect-empty">
      Nog geen selectie — tik op de plattegrond.
    </p>
  </div>
</template>

<style scoped>
.inspect-panel {
  margin: 0 0 10px;
  padding: 8px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
}

.inspect-hint,
.inspect-empty {
  margin: 0;
  font-size: 11px;
  color: #64748b;
  line-height: 1.4;
}

.inspect-hit {
  margin: 8px 0 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.inspect-hit div {
  display: grid;
  grid-template-columns: 48px 1fr;
  gap: 8px;
  align-items: start;
}

.inspect-hit dt {
  margin: 0;
  font-size: 11px;
  color: #64748b;
}

.inspect-hit dd {
  margin: 0;
  font-size: 12px;
  color: #0f172a;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.inspect-id {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  word-break: break-all;
}

.inspect-swatch {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  border: 1px solid rgb(15 23 42 / 0.2);
  flex-shrink: 0;
}

.inspect-facade {
  margin: 10px 0 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.inspect-facade-label {
  font-size: 11px;
  color: #64748b;
}

.inspect-facade-stack {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.inspect-facade-select {
  min-width: 140px;
  max-width: 100%;
  height: 28px;
  font-size: 12px;
  padding: 1px 4px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: #fff;
  color: #334155;
  flex: 0 0 auto;
}

.inspect-facade-chips {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  min-width: 0;
  flex: 1 1 auto;
}

.inspect-facade-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  max-width: 100%;
  padding: 1px 2px 1px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 999px;
  background: #f8fafc;
  color: #0f172a;
  font-size: 11px;
  line-height: 1.2;
}

.inspect-facade-chip-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 120px;
}

.inspect-facade-chip-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  min-height: 24px;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  background: transparent;
  font-size: 14px;
  line-height: 1;
  color: #64748b;
  cursor: pointer;
}

.inspect-facade-chip-btn:hover {
  color: #0f172a;
}
</style>
