import { ref } from 'vue'
import { waitForOpenCV, resetOpenCvLoader } from '@/cv/loadOpenCV'
import { formatCvError } from '@/cv/formatCvError'

export function useOpenCvLoader() {
  const ready = ref(false)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function ensureOpenCv(): Promise<void> {
    if (ready.value || loading.value) return
    loading.value = true
    error.value = null
    try {
      await waitForOpenCV()
      ready.value = true
    } catch (e) {
      error.value = formatCvError(e)
    } finally {
      loading.value = false
    }
  }

  function resetOpenCv(): void {
    resetOpenCvLoader()
    ready.value = false
    error.value = null
  }

  return {
    ready,
    loading,
    error,
    ensureOpenCv,
    resetOpenCv,
  }
}
