<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  closePdfSession,
  openPdfDocument,
  pdfLoadErrorMessage,
  renderPdfPagePreviewForFile,
} from '@/platform/upload'

const open = defineModel<boolean>('open', { required: true })

const props = defineProps<{
  file: File | null
  confirmBusy?: boolean
  confirmError?: string | null
}>()

const emit = defineEmits<{
  confirm: [pageNumber: number]
  cancel: []
}>()

const loading = ref(false)
const renderingPreview = ref(false)
const errorMessage = ref<string | null>(null)
const pdfReady = ref(false)
const numPages = ref(1)
const pageNumber = ref(1)
const previewUrl = ref('')
const fileName = ref('')

let previewRunId = 0
let previewObjectUrl: string | null = null

function revokePreviewUrl() {
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl)
    previewObjectUrl = null
  }
  previewUrl.value = ''
}

function resetState() {
  previewRunId += 1
  revokePreviewUrl()
  void closePdfSession()
  pdfReady.value = false
  numPages.value = 1
  pageNumber.value = 1
  loading.value = false
  renderingPreview.value = false
  errorMessage.value = null
  fileName.value = ''
}

async function loadPdf(file: File) {
  loading.value = true
  errorMessage.value = null
  try {
    const opened = await openPdfDocument(file)
    numPages.value = opened.numPages
    pageNumber.value = 1
    fileName.value = opened.fileName
    pdfReady.value = true
    loading.value = false
    await refreshPreview(file)
  } catch (error) {
    loading.value = false
    pdfReady.value = false
    errorMessage.value = pdfLoadErrorMessage(error)
  }
}

async function refreshPreview(file: File) {
  const runId = ++previewRunId
  renderingPreview.value = true
  errorMessage.value = null

  try {
    const nextUrl = await renderPdfPagePreviewForFile(file, pageNumber.value)
    if (runId !== previewRunId) {
      URL.revokeObjectURL(nextUrl)
      return
    }
    revokePreviewUrl()
    previewObjectUrl = nextUrl
    previewUrl.value = nextUrl
  } catch (error) {
    if (runId === previewRunId) {
      errorMessage.value = pdfLoadErrorMessage(error)
    }
  } finally {
    if (runId === previewRunId) {
      renderingPreview.value = false
    }
  }
}

let pageDebounceTimer: ReturnType<typeof setTimeout> | null = null

function schedulePreviewRefresh() {
  const file = props.file
  if (!file) return
  if (pageDebounceTimer) clearTimeout(pageDebounceTimer)
  pageDebounceTimer = setTimeout(() => {
    pageDebounceTimer = null
    void refreshPreview(file)
  }, 150)
}

function goToPreviousPage() {
  if (pageNumber.value <= 1) return
  pageNumber.value -= 1
  schedulePreviewRefresh()
}

function goToNextPage() {
  if (pageNumber.value >= numPages.value) return
  pageNumber.value += 1
  schedulePreviewRefresh()
}

function onPageInput(event: Event) {
  const raw = Number((event.target as HTMLInputElement).value)
  if (!Number.isFinite(raw)) return
  const clamped = Math.min(numPages.value, Math.max(1, Math.round(raw)))
  if (clamped === pageNumber.value) return
  pageNumber.value = clamped
  schedulePreviewRefresh()
}

function onCancel() {
  resetState()
  emit('cancel')
}

function onConfirm() {
  if (!pdfReady.value || loading.value || props.confirmBusy || errorMessage.value || renderingPreview.value) return
  emit('confirm', pageNumber.value)
}

const pageLabel = computed(() => `Pagina ${pageNumber.value} van ${numPages.value}`)
const canNavigatePages = computed(() => numPages.value > 1)
const confirmDisabled = computed(
  () =>
    loading.value ||
    !!props.confirmBusy ||
    !!errorMessage.value ||
    !pdfReady.value ||
    renderingPreview.value,
)

watch(
  () => [open.value, props.file] as const,
  ([isOpen, file]) => {
    if (!isOpen) {
      resetState()
      return
    }
    if (!file) {
      errorMessage.value = 'Geen PDF-bestand geselecteerd.'
      return
    }
    resetState()
    void loadPdf(file)
  },
  { immediate: true },
)
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-backdrop" @click.self="onCancel">
      <div class="dialog" role="dialog" aria-labelledby="pdf-page-select-title" aria-modal="true">
        <header class="dialog-header">
          <h2 id="pdf-page-select-title">PDF-pagina kiezen</h2>
          <p v-if="fileName" class="dialog-lead">{{ fileName }} — {{ pageLabel }}</p>
          <p v-else class="dialog-lead">Selecteer de pagina die je als onderlegger wilt gebruiken.</p>
        </header>

        <div v-if="loading" class="state-box">PDF laden…</div>
        <div v-else-if="errorMessage" class="state-box error">{{ errorMessage }}</div>

        <template v-else>
          <div class="preview-wrap">
            <img
              v-if="previewUrl"
              :src="previewUrl"
              alt="PDF preview"
              class="preview-image"
            />
            <div v-else class="state-box">Preview laden…</div>
            <div v-if="renderingPreview" class="preview-overlay">Preview bijwerken…</div>
          </div>

          <div v-if="canNavigatePages" class="page-controls">
            <button type="button" class="dialog-btn" :disabled="pageNumber <= 1" @click="goToPreviousPage">
              Vorige
            </button>
            <label class="page-input-label">
              Pagina
              <input
                type="number"
                class="page-input"
                :min="1"
                :max="numPages"
                :value="pageNumber"
                @change="onPageInput"
              />
            </label>
            <button
              type="button"
              class="dialog-btn"
              :disabled="pageNumber >= numPages"
              @click="goToNextPage"
            >
              Volgende
            </button>
          </div>
        </template>

        <p v-if="confirmError" class="confirm-error">{{ confirmError }}</p>

        <footer class="dialog-footer">
          <button type="button" class="dialog-btn" @click="onCancel">Annuleren</button>
          <button type="button" class="dialog-btn primary" :disabled="confirmDisabled" @click="onConfirm">
            {{ confirmBusy ? 'Pagina voorbereiden…' : 'Gebruik pagina' }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgb(15 23 42 / 0.45);
}

.dialog {
  width: min(760px, 100%);
  max-height: min(90vh, 900px);
  overflow-y: auto;
  padding: 20px 22px;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 20px 48px rgb(15 23 42 / 0.18);
}

.dialog-header {
  margin-bottom: 12px;
}

.dialog-header h2 {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
}

.dialog-lead {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: #64748b;
}

.preview-wrap {
  position: relative;
  min-height: 280px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.preview-image {
  display: block;
  max-width: 100%;
  max-height: min(52vh, 520px);
  object-fit: contain;
}

.preview-overlay {
  position: absolute;
  inset: auto 12px 12px auto;
  padding: 6px 10px;
  border-radius: 6px;
  background: rgb(15 23 42 / 0.72);
  color: #fff;
  font-size: 12px;
}

.page-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 14px;
}

.page-input-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #334155;
}

.page-input {
  width: 72px;
  padding: 6px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 13px;
}

.state-box {
  padding: 28px 16px;
  text-align: center;
  font-size: 14px;
  color: #64748b;
}

.state-box.error {
  color: #b91c1c;
}

.confirm-error {
  margin: 12px 0 0;
  font-size: 13px;
  color: #b91c1c;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid #e2e8f0;
}

.dialog-btn {
  padding: 10px 16px;
  font-size: 13px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
}

.dialog-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dialog-btn.primary {
  border-color: #2563eb;
  background: #2563eb;
  color: #fff;
  font-weight: 600;
}
</style>
