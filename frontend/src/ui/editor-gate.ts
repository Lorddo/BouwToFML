/** Soft gate for `/editor` only. Password is in the bundle — not real security. */

export const EDITOR_PASSWORD = 'J0rd!'
export const EDITOR_UNLOCK_STORAGE_KEY = 'bouwToFml.editorUnlocked'
const EDITOR_UNLOCK_STORAGE_KEY_LEGACY = 'bouwToFml.fmlEditorUnlocked'

export function readEditorUnlockFlag(storage: Pick<Storage, 'getItem'>): boolean {
  try {
    return (
      storage.getItem(EDITOR_UNLOCK_STORAGE_KEY) === '1' ||
      storage.getItem(EDITOR_UNLOCK_STORAGE_KEY_LEGACY) === '1'
    )
  } catch {
    return false
  }
}

export function writeEditorUnlockFlag(storage: Pick<Storage, 'setItem'>): void {
  try {
    storage.setItem(EDITOR_UNLOCK_STORAGE_KEY, '1')
  } catch {
    // Private mode / blocked storage.
  }
}
