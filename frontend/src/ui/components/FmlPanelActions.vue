<script setup lang="ts">
withDefaults(
  defineProps<{
    scaleConfirmed: boolean
    hasCombinedOutput: boolean
    generatedFmlText?: string
    fmlLimitsDirty?: boolean
  }>(),
  {
    generatedFmlText: '',
    fmlLimitsDirty: false,
  },
)

const emit = defineEmits<{
  downloadGenerated: []
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
      Regenereren
    </button>
    <button type="button" :disabled="!generatedFmlText" @click="emit('downloadGenerated')">
      Download .fml
    </button>
  </div>
  <p v-if="fmlLimitsDirty" class="fml-hint fml-dirty-hint">
    Hoogte/dikte gewijzigd — klik Regenereren om de FML bij te werken.
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
