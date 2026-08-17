<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { FML_ORIENT_CONTROLS_VISIBLE } from '@/ui/composables/workspace/constants'

const { t } = useI18n()

withDefaults(
  defineProps<{
    scaleConfirmed: boolean
    hasCombinedOutput: boolean
    fmlLimitsDirty?: boolean
    /** FML X-spiegel actief (toggle-uiterlijk). */
    fmlOrientFlipX?: boolean
    /** ≥1 floor heeft FML (project-spiegel). */
    hasAnyFloorFml?: boolean
    /** Alle FML-floors hebben flipX (project-spiegel toggle). */
    projectOrientFlipX?: boolean
  }>(),
  {
    fmlLimitsDirty: false,
    fmlOrientFlipX: false,
    hasAnyFloorFml: false,
    projectOrientFlipX: false,
  },
)

const emit = defineEmits<{
  regenerate: []
  mirrorVertical: []
  mirrorProject: []
  rotate90Cw: []
  rotate90Ccw: []
}>()
</script>

<template>
  <div class="fml-actions">
    <button
      v-if="FML_ORIENT_CONTROLS_VISIBLE"
      type="button"
      class="orient-btn"
      :class="{ 'orient-btn--active': fmlOrientFlipX }"
      :disabled="!hasCombinedOutput || !scaleConfirmed"
      :title="t('result.mirrorVerticalHint')"
      @click="emit('mirrorVertical')"
    >
      {{ t('result.mirrorVertical') }}
    </button>
    <button
      v-if="FML_ORIENT_CONTROLS_VISIBLE"
      type="button"
      class="orient-btn"
      :class="{ 'orient-btn--active': projectOrientFlipX }"
      :disabled="!hasAnyFloorFml"
      :title="t('result.mirrorProjectHint')"
      @click="emit('mirrorProject')"
    >
      {{ t('result.mirrorProject') }}
    </button>
    <button
      v-if="FML_ORIENT_CONTROLS_VISIBLE"
      type="button"
      class="orient-btn"
      :disabled="!hasCombinedOutput || !scaleConfirmed"
      :title="t('result.rotate90CcwHint')"
      @click="emit('rotate90Ccw')"
    >
      {{ t('result.rotate90Ccw') }}
    </button>
    <button
      v-if="FML_ORIENT_CONTROLS_VISIBLE"
      type="button"
      class="orient-btn"
      :disabled="!hasCombinedOutput || !scaleConfirmed"
      :title="t('result.rotate90CwHint')"
      @click="emit('rotate90Cw')"
    >
      {{ t('result.rotate90Cw') }}
    </button>
    <button
      type="button"
      class="regenerate-btn"
      :disabled="!hasCombinedOutput || !scaleConfirmed || !fmlLimitsDirty"
      @click="emit('regenerate')"
    >
      {{ t('result.regenerate') }}
    </button>
  </div>
  <p v-if="fmlLimitsDirty" class="fml-hint fml-dirty-hint">
    {{ t('result.dirtyHint') }}
  </p>
</template>

<style scoped>
.fml-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.orient-btn {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #334155;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 12px;
  cursor: pointer;
}

.orient-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.orient-btn--active {
  border-color: #3b82f6;
  background: #eff6ff;
  color: #1d4ed8;
}

.regenerate-btn:not(:disabled) {
  border-color: #f59e0b;
  background: #fffbeb;
  color: #92400e;
}

.fml-hint {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.4;
}

.fml-dirty-hint {
  color: #b45309;
}
</style>
