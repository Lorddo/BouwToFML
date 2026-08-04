<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { WorkspaceFlowStep } from '../composables/workspace/constants'

defineProps<{
  flowOrder: WorkspaceFlowStep[]
  flowStepIndex: number
  flowNextBlockedHint: string | null
  canGoBack: boolean
  canGoNext: boolean
  flowStep: WorkspaceFlowStep
  nextStepButtonLabel: string
}>()

const emit = defineEmits<{
  back: []
  next: []
}>()

const { t } = useI18n()
</script>

<template>
  <div class="sidebar-footer">
    <div class="flow-progress" aria-hidden="true">
      <span
        v-for="(step, index) in flowOrder"
        :key="step"
        class="flow-progress-dot"
        :class="{
          done: index < flowStepIndex,
          active: index === flowStepIndex,
        }"
      />
    </div>
    <p v-if="flowNextBlockedHint" class="flow-footer-hint">{{ flowNextBlockedHint }}</p>
    <div class="flow-nav">
      <button type="button" class="flow-nav-back" :disabled="!canGoBack" @click="emit('back')">
        {{ t('flow.previous') }}
      </button>
      <button
        type="button"
        class="flow-nav-next primary"
        :disabled="!canGoNext || flowStep === 'result'"
        @click="emit('next')"
      >
        {{ nextStepButtonLabel }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.sidebar-footer {
  flex-shrink: 0;
  padding: 8px 10px;
  border-top: 1px solid #e2e8f0;
  background: #fff;
  box-shadow: 0 -2px 8px rgb(15 23 42 / 0.04);
}

.flow-progress {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
}

.flow-progress-dot {
  flex: 1;
  height: 4px;
  border-radius: 999px;
  background: #e2e8f0;
}

.flow-progress-dot.done,
.flow-progress-dot.active {
  background: #2563eb;
}

.flow-footer-hint {
  margin: 0 0 6px;
  font-size: 11px;
  color: #b45309;
  line-height: 1.2;
}

.flow-nav {
  display: flex;
  gap: 8px;
}

.flow-nav-back,
.flow-nav-next {
  flex: 1;
  padding: 6px 8px;
  font-size: 12px;
}

.flow-nav-next {
  font-weight: 600;
}
</style>
