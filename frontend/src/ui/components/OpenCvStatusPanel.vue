<script setup lang="ts">
defineProps<{
  loading: boolean
  error: string | null
}>()

const emit = defineEmits<{
  reset: []
}>()
</script>

<template>
  <div v-if="loading || error" class="panel">
    <div v-if="loading" class="status-loading">
      <p class="status">OpenCV laden...</p>
    </div>

    <p v-if="error" class="error">{{ error }}</p>

    <button
      v-if="error"
      type="button"
      class="clear-btn"
      @click="emit('reset')"
    >
      Reset loader
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
