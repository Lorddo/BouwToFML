/** Ctrl/Cmd+Z without other modifiers beyond meta/ctrl. */
export function isUndoKey(event: KeyboardEvent): boolean {
  return (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z'
}
