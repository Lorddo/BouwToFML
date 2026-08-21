/** Ctrl/Cmd+Z without Shift (Shift+Z is redo). */
export function isUndoKey(event: KeyboardEvent): boolean {
  return (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z'
}

/** Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y. */
export function isRedoKey(event: KeyboardEvent): boolean {
  if (!(event.ctrlKey || event.metaKey)) return false
  const key = event.key.toLowerCase()
  if (key === 'y') return true
  return key === 'z' && event.shiftKey
}
