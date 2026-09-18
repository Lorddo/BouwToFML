/** IndexedDB / structured-clone fouten bij project-persist. */

export function persistErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message
  if (error && typeof error === 'object') {
    const e = error as { message?: unknown; name?: unknown }
    if (typeof e.message === 'string' && e.message.trim()) return e.message
    if (typeof e.name === 'string' && e.name.trim()) return e.name
  }
  return error == null ? '' : String(error)
}

export function isQuotaExceeded(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { name?: string; code?: number; message?: string }
  if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') return true
  if (e.code === 22 || e.code === 1014) return true
  const msg = typeof e.message === 'string' ? e.message.toLowerCase() : ''
  return msg.includes('quota') || (msg.includes('storage') && msg.includes('full'))
}

/** Eén IDB-record te groot of niet clonebaar — zelfde ladder als quota. */
export function isPersistSizeError(error: unknown): boolean {
  if (isQuotaExceeded(error)) return true
  const name = error && typeof error === 'object' ? String((error as { name?: string }).name ?? '') : ''
  if (name === 'DataCloneError' || name === 'UnknownError') return true
  const msg = persistErrorMessage(error).toLowerCase()
  return (
    msg.includes('too large') ||
    msg.includes('serialized value') ||
    msg.includes('dataclone') ||
    msg.includes('could not be cloned')
  )
}
