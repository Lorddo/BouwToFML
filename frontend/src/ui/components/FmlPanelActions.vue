<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { FML_ORIENT_CONTROLS_VISIBLE } from '@/ui/composables/workspace/constants'
import ToolbeltIcon from './canvas/ToolbeltIcon.vue'

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
  <div class="fml-actions sidebar-icon-row">
    <button
      v-if="FML_ORIENT_CONTROLS_VISIBLE"
      type="button"
      class="sidebar-icon-btn"
      :class="{ 'is-on': fmlOrientFlipX }"
      :disabled="!hasCombinedOutput || !scaleConfirmed"
      :title="t('result.mirrorVerticalHint')"
      @click="emit('mirrorVertical')"
    >
      <ToolbeltIcon name="mirror_plan" />
      <span>{{ t('result.mirrorVertical') }}</span>
    </button>
    <button
      v-if="FML_ORIENT_CONTROLS_VISIBLE"
      type="button"
      class="sidebar-icon-btn"
      :class="{ 'is-on': projectOrientFlipX }"
      :disabled="!hasAnyFloorFml"
      :title="t('result.mirrorProjectHint')"
      @click="emit('mirrorProject')"
    >
      <ToolbeltIcon name="mirror_plan" />
      <span>{{ t('result.mirrorProject') }}</span>
    </button>
    <button
      v-if="FML_ORIENT_CONTROLS_VISIBLE"
      type="button"
      class="sidebar-icon-btn"
      :disabled="!hasCombinedOutput || !scaleConfirmed"
      :title="t('result.rotate90CcwHint')"
      @click="emit('rotate90Ccw')"
    >
      <ToolbeltIcon name="rotate_plan_ccw" />
      <span>{{ t('result.rotate90Ccw') }}</span>
    </button>
    <button
      v-if="FML_ORIENT_CONTROLS_VISIBLE"
      type="button"
      class="sidebar-icon-btn"
      :disabled="!hasCombinedOutput || !scaleConfirmed"
      :title="t('result.rotate90CwHint')"
      @click="emit('rotate90Cw')"
    >
      <ToolbeltIcon name="rotate_plan_cw" />
      <span>{{ t('result.rotate90Cw') }}</span>
    </button>
    <button
      type="button"
      class="sidebar-icon-btn sidebar-icon-btn--primary"
      :disabled="!hasCombinedOutput || !scaleConfirmed || !fmlLimitsDirty"
      @click="emit('regenerate')"
    >
      <ToolbeltIcon name="check" />
      <span>{{ t('result.regenerate') }}</span>
    </button>
  </div>
  <p v-if="fmlLimitsDirty" class="fml-hint fml-dirty-hint">
    {{ t('result.dirtyHint') }}
  </p>
</template>

<style scoped>
.fml-actions {
  margin-top: 8px;
  margin-bottom: 0;
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
