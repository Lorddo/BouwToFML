<script setup lang="ts">
import { computed } from 'vue'
import type { WorkspaceFlowStep } from '@/ui/composables/workspace/constants'
import { WORKSPACE_FLOW_LABELS } from '@/ui/composables/workspace/constants'

const props = defineProps<{
  busy: boolean
  message: string | null
  hasStored: boolean
  sessions: Array<{ id: string; label: string }>
  selectedSessionId: string | null
  currentStep: WorkspaceFlowStep
}>()

const emit = defineEmits<{
  record: []
  restore: []
  selectSession: [sessionId: string | null]
}>()

const currentStepLabel = computed(() => WORKSPACE_FLOW_LABELS[props.currentStep])
</script>

<template>
  <div class="panel dev-session">
    <h3>Dev — workspace snapshot</h3>
    <p class="hint">
      Neem de huidige stap op (<strong>{{ currentStepLabel }}</strong
      >) en herstel exact tot dat punt. Snapshot op resultaat draait detectie opnieuw met dezelfde
      invoer (stap 1–3) en huidige code.
    </p>

    <label class="select-label" for="dev-session-select">Project / onderlegger</label>
    <select
      id="dev-session-select"
      class="session-select"
      :value="selectedSessionId ?? ''"
      :disabled="busy || !sessions.length"
      @change="emit('selectSession', ($event.target as HTMLSelectElement).value || null)"
    >
      <option value="" disabled>
        {{ sessions.length ? 'Kies snapshot' : 'Nog geen snapshots' }}
      </option>
      <option v-for="session in sessions" :key="session.id" :value="session.id">
        {{ session.label }}
      </option>
    </select>

    <div class="actions">
      <button type="button" :disabled="busy" @click="emit('record')">Opnemen (huidige stap)</button>
      <button type="button" :disabled="busy || !hasStored" @click="emit('restore')">
        Herstellen geselecteerde
      </button>
    </div>

    <p v-if="message" class="status">{{ message }}</p>
  </div>
</template>

<style scoped>
.dev-session {
  border: 1px dashed #94a3b8;
  background: #f8fafc;
}

.hint {
  font-size: 12px;
  color: #64748b;
  margin: 0 0 10px;
  line-height: 1.4;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.actions button {
  font-size: 12px;
  padding: 5px 10px;
}

.select-label {
  display: block;
  font-size: 12px;
  color: #334155;
  margin: 0 0 4px;
}

.session-select {
  width: 100%;
  font-size: 12px;
  padding: 6px 8px;
  margin-bottom: 8px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: #fff;
}

.status {
  font-size: 12px;
  margin: 0;
  color: #0f766e;
  word-break: break-word;
}
</style>
