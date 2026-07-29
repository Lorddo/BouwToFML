<script setup lang="ts">
import type { PreprocessConfig } from '@/core/extraction/types'

const preprocess = defineModel<PreprocessConfig>('preprocess', { required: true })
</script>

<template>
  <div class="panel">
    <h3>OCR dev</h3>
    <label>
      OCR modus
      <select v-model="preprocess.ocrMode">
        <option value="general">Algemeen (tekst + cijfers)</option>
        <option value="numbers">Getallen-focus (maatvoering)</option>
      </select>
    </label>
    <label>
      OCR talen
      <input v-model="preprocess.ocrLanguages" type="text" placeholder="eng+nld" />
    </label>
  </div>
</template>

<style scoped>
label {
  display: block;
  font-size: 12px;
  margin: 6px 0;
}

select,
input {
  width: 100%;
}
</style>
