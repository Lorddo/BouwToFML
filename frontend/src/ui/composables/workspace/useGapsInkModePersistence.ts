import { ref, watch } from 'vue'
import type { GapsInkMode } from '@/cv/gaps'

const GAPS_INK_MODE_STORAGE_KEY = 'bouw-gaps-ink-mode'
const GAPS_INK_MODE_MANUAL_KEY = 'bouw-gaps-ink-mode-manual'

function loadGapsInkMode(): GapsInkMode {
  try {
    const stored = localStorage.getItem(GAPS_INK_MODE_STORAGE_KEY)
    return stored === 'detail' ? 'detail' : 'solid'
  } catch {
    return 'solid'
  }
}

function loadGapsInkModeManual(): boolean {
  try {
    return localStorage.getItem(GAPS_INK_MODE_MANUAL_KEY) === '1'
  } catch {
    return false
  }
}

/** LocalStorage-backed gaps ink mode (facade wiring helper). */
export function useGapsInkModePersistence() {
  const gapsInkMode = ref<GapsInkMode>(loadGapsInkMode())
  const gapsInkModeManual = ref(loadGapsInkModeManual())

  function setGapsInkModeManual(mode: GapsInkMode): void {
    gapsInkModeManual.value = true
    gapsInkMode.value = mode
    try {
      localStorage.setItem(GAPS_INK_MODE_MANUAL_KEY, '1')
      localStorage.setItem(GAPS_INK_MODE_STORAGE_KEY, mode)
    } catch {
      /* ignore */
    }
  }

  function clearGapsInkModeManual(): void {
    gapsInkModeManual.value = false
    try {
      localStorage.removeItem(GAPS_INK_MODE_MANUAL_KEY)
    } catch {
      /* ignore */
    }
  }

  function applyAutoGapsInkMode(mode: GapsInkMode): void {
    if (gapsInkModeManual.value) return
    gapsInkMode.value = mode
    try {
      localStorage.setItem(GAPS_INK_MODE_STORAGE_KEY, mode)
    } catch {
      /* ignore */
    }
  }

  watch(gapsInkMode, (mode) => {
    try {
      localStorage.setItem(GAPS_INK_MODE_STORAGE_KEY, mode)
    } catch {
      /* ignore quota / private mode */
    }
  })

  return {
    gapsInkMode,
    gapsInkModeManual,
    setGapsInkModeManual,
    clearGapsInkModeManual,
    applyAutoGapsInkMode,
  }
}
