/** Soft client-side gate for hosted test builds. Not real security — password is in the bundle. */

export const ACCESS_UNLOCK_STORAGE_KEY = 'bouwToFml.accessUnlocked'

export function getConfiguredAccessPassword(): string {
  const raw = import.meta.env.VITE_APP_ACCESS_PASSWORD
  return typeof raw === 'string' ? raw.trim() : ''
}

export function isAccessPasswordRequired(
  password: string = getConfiguredAccessPassword(),
): boolean {
  return password.trim().length > 0
}

function storageGet(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

function storageSet(storage: Storage, key: string, value: string): void {
  try {
    storage.setItem(key, value)
  } catch {
    // Private mode / blocked storage — caller still holds unlock in memory.
  }
}

export function isAccessUnlocked(
  password: string = getConfiguredAccessPassword(),
  storageKey: string = ACCESS_UNLOCK_STORAGE_KEY,
): boolean {
  if (!isAccessPasswordRequired(password)) return true
  if (storageGet(localStorage, storageKey) === '1') return true
  if (storageGet(sessionStorage, storageKey) === '1') {
    storageSet(localStorage, storageKey, '1')
    return true
  }
  return false
}

export function checkAccessPassword(
  candidate: string,
  expected: string = getConfiguredAccessPassword(),
): boolean {
  const want = expected.trim()
  if (!want) return true
  return candidate === want
}

export function unlockAccess(storageKey: string = ACCESS_UNLOCK_STORAGE_KEY): void {
  storageSet(localStorage, storageKey, '1')
  storageSet(sessionStorage, storageKey, '1')
}

export function tryUnlockAccess(
  candidate: string,
  expected: string = getConfiguredAccessPassword(),
  storageKey: string = ACCESS_UNLOCK_STORAGE_KEY,
): boolean {
  if (!checkAccessPassword(candidate, expected)) return false
  unlockAccess(storageKey)
  return true
}
