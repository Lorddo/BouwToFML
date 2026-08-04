<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{
  loading: boolean
  error: string | null
}>()

const emit = defineEmits<{
  reset: []
}>()

const { t } = useI18n()
</script>

<template>
  <div v-if="loading || error" class="panel">
    <div v-if="loading" class="status-loading">
      <p class="status">{{ t('input.opencvLoading') }}</p>
    </div>

    <p v-if="error" class="error">{{ error }}</p>

    <button v-if="error" type="button" class="clear-btn" @click="emit('reset')">
      {{ t('input.opencvReset') }}
    </button>
  </div>
</template>

<style scoped>
.status-loading .status {
  margin: 0 0 4px;
}

.clear-btn {
  margin-top: 6px;
  font-size: 12px;
  color: #64748b;
  border-color: #e2e8f0;
}
</style>
