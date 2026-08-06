import { ref } from 'vue'

/** User-visible fatal/runtime error banner (no stack traces). */
export const appFatalError = ref<string | null>(null)

export function reportAppError(message: string): void {
  const trimmed = message.trim()
  if (!trimmed) return
  appFatalError.value = trimmed
}

export function clearAppError(): void {
  appFatalError.value = null
}

export function formatUnknownError(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.trim()) return err.message.trim()
  if (typeof err === 'string' && err.trim()) return err.trim()
  return fallback
}
