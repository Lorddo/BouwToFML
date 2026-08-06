/**
 * Coalescing + debounce helper for project persistence.
 * Pure logic — inject `save` zodat tests zonder IndexedDB kunnen.
 */
export type ProjectPersistControllerOptions = {
  save: () => Promise<void>
  /** Skip write (running / switching / restoring). */
  shouldSkip?: () => boolean
  onError?: (error: unknown) => void
  debounceMs?: number
}

export function createProjectPersistController(options: ProjectPersistControllerOptions) {
  const debounceMs = options.debounceMs ?? 500
  let inFlight = false
  let pending = false
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  async function flush(): Promise<void> {
    if (options.shouldSkip?.()) return
    if (inFlight) {
      pending = true
      return
    }
    inFlight = true
    pending = false
    try {
      await options.save()
    } catch (error) {
      options.onError?.(error)
    } finally {
      inFlight = false
      if (pending) {
        pending = false
        void flush()
      }
    }
  }

  /** Immediate checkpoint (floor-switch, stap-overgang, afronden). */
  function persistNow(): void {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    void flush()
  }

  /** Gedebouncede checkpoint (typen projectnaam / floor-rename). */
  function persistDebounced(): void {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      void flush()
    }, debounceMs)
  }

  function dispose(): void {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
  }

  return {
    persistNow,
    persistDebounced,
    dispose,
    /** Test-helper. */
    get _debug() {
      return { inFlight, pending }
    },
  }
}
