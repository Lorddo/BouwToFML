<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ToolbeltIcon from './canvas/ToolbeltIcon.vue'

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
    <label class="sidebar-icon-btn sidebar-icon-btn--primary file-btn">
      <ToolbeltIcon name="upload" />
      <span>{{ t('input.chooseFile') }}</span>
      <input
        type="file"
        accept="image/png,image/jpeg,image/jpg,application/pdf,.pdf"
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
  margin-top: 4px;
}
</style>
