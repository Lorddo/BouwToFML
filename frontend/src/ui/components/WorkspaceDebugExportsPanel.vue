<script setup lang="ts">
defineProps<{
  canExportReport: boolean
  hasUsedWallMask: boolean
  canExportReferenceAnalysis?: boolean
  canExportDoorSwingReport?: boolean
  canExportWindowFaceReport?: boolean
}>()

defineEmits<{
  exportReport: []
  downloadUsedWallMask: []
  exportReferenceAnalysis: []
  exportDoorSwingReport: []
  exportWindowFaceReport: []
}>()
</script>

<template>
  <div class="panel debug-exports">
    <h3>Debug exports</h3>
    <p class="hint">Layer-debug, referentie-analyse en fase-reports voor regressie.</p>
    <button type="button" :disabled="!hasUsedWallMask" @click="$emit('downloadUsedWallMask')">
      Download gebruikt muurmask (PNG)
    </button>
    <button type="button" :disabled="!canExportReport" @click="$emit('exportReport')">
      Exporteer layer-debug (JSON + MD)
    </button>
    <button
      type="button"
      :disabled="!canExportReferenceAnalysis"
      title="Stap-1 muur/deur/raam-refs → HTML met blob, lijnen, vlakken, primitives"
      @click="$emit('exportReferenceAnalysis')"
    >
      Exporteer referentie-analyse (HTML)
    </button>
    <button
      type="button"
      :disabled="!canExportDoorSwingReport"
      title="Deuren fase-1 hypotheses + overlay (JSON/HTML)"
      @click="$emit('exportDoorSwingReport')"
    >
      Exporteer deuren fase-1 report (JSON + HTML)
    </button>
    <button
      type="button"
      :disabled="!canExportWindowFaceReport"
      title="Ramen fase-1 face-pattern hypotheses + redenen (JSON/HTML)"
      @click="$emit('exportWindowFaceReport')"
    >
      Exporteer ramen fase-1 report (JSON + HTML)
    </button>
  </div>
</template>

<style scoped>
.panel {
  padding: 12px 16px;
  border-bottom: 1px solid #e2e8f0;
}

.hint {
  margin: 0 0 10px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.4;
}

button {
  display: block;
  width: 100%;
  margin-bottom: 6px;
}

button:last-of-type {
  margin-bottom: 0;
}
</style>
