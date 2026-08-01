import { ref } from 'vue'
import {
  closePdfSession,
  formatPdfPageImageName,
  isPdfFile,
  openPdfDocument,
  pdfLoadErrorMessage,
  renderPdfPageToBlobUrlForFile,
} from '@/platform/upload'

export function useWorkspacePdfUpload(deps: {
  loadFile: (file: File) => void
  setImageSource: (src: string, name: string) => void
  applyNewUnderlayReset: () => void
}) {
  const showPdfPageDialog = ref(false)
  const pendingPdfFile = ref<File | null>(null)
  const pdfPageConfirmBusy = ref(false)
  const pdfPageConfirmError = ref<string | null>(null)

  function onFileInput(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return

    if (isPdfFile(file)) {
      pendingPdfFile.value = file
      pdfPageConfirmError.value = null
      showPdfPageDialog.value = true
      return
    }

    // Eerst sessie resetten, daarna nieuwe src — voorkomt dat reset de verse load wist.
    deps.applyNewUnderlayReset()
    deps.loadFile(file)
  }

  async function confirmPdfPage(pageNumber: number) {
    const file = pendingPdfFile.value
    if (!file) return

    pdfPageConfirmBusy.value = true
    pdfPageConfirmError.value = null

    try {
      const { numPages, fileName } = await openPdfDocument(file)
      const blobUrl = await renderPdfPageToBlobUrlForFile(file, pageNumber)
      await closePdfSession()

      deps.applyNewUnderlayReset()
      deps.setImageSource(blobUrl, formatPdfPageImageName(fileName, pageNumber, numPages))
      showPdfPageDialog.value = false
      pendingPdfFile.value = null
    } catch (error) {
      pdfPageConfirmError.value = pdfLoadErrorMessage(error)
    } finally {
      pdfPageConfirmBusy.value = false
    }
  }

  function cancelPdfPage() {
    void closePdfSession()
    showPdfPageDialog.value = false
    pendingPdfFile.value = null
    pdfPageConfirmBusy.value = false
    pdfPageConfirmError.value = null
  }

  return {
    showPdfPageDialog,
    pendingPdfFile,
    pdfPageConfirmBusy,
    pdfPageConfirmError,
    onFileInput,
    confirmPdfPage,
    cancelPdfPage,
  }
}
