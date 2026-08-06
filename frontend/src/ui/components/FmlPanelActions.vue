<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

withDefaults(
  defineProps<{
    scaleConfirmed: boolean
    hasCombinedOutput: boolean
    fmlLimitsDirty?: boolean
  }>(),
  {
    fmlLimitsDirty: false,
  },
)

const emit = defineEmits<{
  regenerate: []
}>()
</script>

<template>
  <div class="fml-actions">
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
