<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const emit = defineEmits<{
  fileInput: [e: Event]
}>()

const { t } = useI18n()
</script>

<template>
  <div class="welcome">
    <div class="welcome-header">
      <h2>{{ t('input.welcomeTitle') }}</h2>
      <p class="lead">{{ t('input.welcomeLead') }}</p>
    </div>

    <div class="upload-block">
      <label class="upload-btn">
        {{ t('input.chooseFile') }}
        <input
          type="file"
          accept="image/png,image/jpeg,image/jpg,application/pdf,.pdf"
          hidden
          @change="emit('fileInput', $event)"
        />
      </label>
      <p class="upload-hint">{{ t('input.welcomeHint') }}</p>
    </div>
  </div>
</template>

<style scoped>
.welcome {
  max-width: 920px;
  margin: 0 auto;
  padding: 32px 24px;
}

.welcome-header {
  margin-bottom: 24px;
}

.welcome-header h2 {
  margin: 0 0 8px;
  font-size: 22px;
  color: #0f172a;
}

.lead {
  margin: 0;
  color: #64748b;
  font-size: 14px;
  line-height: 1.5;
}

.upload-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.upload-btn {
  display: inline-block;
  padding: 10px 20px;
  border-radius: 6px;
  background: #2563eb;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.upload-btn:hover {
  background: #1d4ed8;
}

.upload-hint {
  margin: 0;
  font-size: 12px;
  color: #94a3b8;
}
</style>
