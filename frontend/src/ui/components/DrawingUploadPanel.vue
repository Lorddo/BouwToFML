<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{
  imageName: string
}>()

const emit = defineEmits<{
  fileInput: [e: Event]
}>()

const { t } = useI18n()
</script>

<template>
  <div class="panel">
    <h3>{{ t('input.drawingTitle') }}</h3>
    <p class="filename">{{ imageName }}</p>
    <label class="file-btn">
      {{ t('input.chooseFile') }}
      <input
        type="file"
        accept="image/png,image/jpeg,image/jpg,application/pdf,.pdf"
        hidden
        @change="emit('fileInput', $event)"
      />
    </label>
  </div>
</template>

<style scoped>
.filename {
  font-size: 13px;
  font-weight: 600;
  margin: 0 0 8px;
  word-break: break-all;
}

.file-btn {
  display: inline-block;
  padding: 6px 12px;
  border: 1px solid #2563eb;
  border-radius: 4px;
  color: #2563eb;
  cursor: pointer;
  font-size: 13px;
}

.file-btn:hover {
  background: #eff6ff;
}
</style>
