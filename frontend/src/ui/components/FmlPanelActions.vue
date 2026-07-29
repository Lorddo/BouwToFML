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
  importFile: [file: File]
  downloadGenerated: []
  copyGenerated: []
  regenerate: []
}>()

function onFileInput(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  emit('importFile', file)
  input.value = ''
}
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
    <button type="button" :disabled="!generatedFmlText" @click="emit('copyGenerated')">
      Kopieer FML
    </button>
    <label class="upload-btn" :class="{ disabled: !scaleConfirmed || !hasCombinedOutput }">
      Upload FML
      <input
        type="file"
        accept=".fml,.json,.json.fml"
        :disabled="!scaleConfirmed || !hasCombinedOutput"
        @change="onFileInput"
      />
    </label>
  </div>
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

.upload-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  padding: 4px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: #fff;
  font-size: 12px;
  cursor: pointer;
}

.upload-btn input {
  display: none;
}

.upload-btn.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
