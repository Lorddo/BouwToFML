import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isAccessUnlocked, tryUnlockAccess } from '@/ui/access-gate'
import { EDITOR_PASSWORD, EDITOR_UNLOCK_STORAGE_KEY } from '@/ui/editor-gate'

const mockStorage = (() => {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
  }
})()

Object.defineProperty(globalThis, 'sessionStorage', {
  value: mockStorage,
  configurable: true,
})

beforeEach(() => {
  mockStorage.clear()
})

afterEach(() => {
  mockStorage.clear()
})

describe('editor-gate', () => {
  it('unlocks only with the hardcoded editor password on its own key', () => {
    expect(tryUnlockAccess('wrong', EDITOR_PASSWORD, EDITOR_UNLOCK_STORAGE_KEY)).toBe(false)
    expect(sessionStorage.getItem(EDITOR_UNLOCK_STORAGE_KEY)).toBeNull()

    expect(
      tryUnlockAccess(EDITOR_PASSWORD, EDITOR_PASSWORD, EDITOR_UNLOCK_STORAGE_KEY),
    ).toBe(true)
    expect(sessionStorage.getItem(EDITOR_UNLOCK_STORAGE_KEY)).toBe('1')
    expect(isAccessUnlocked(EDITOR_PASSWORD, EDITOR_UNLOCK_STORAGE_KEY)).toBe(true)
  })
})
