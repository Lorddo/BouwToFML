import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ACCESS_UNLOCK_STORAGE_KEY,
  checkAccessPassword,
  isAccessPasswordRequired,
  isAccessUnlocked,
  tryUnlockAccess,
  unlockAccess,
} from '@/ui/access-gate'

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

describe('access-gate', () => {
  it('isAccessPasswordRequired is false when password empty', () => {
    expect(isAccessPasswordRequired('')).toBe(false)
    expect(isAccessPasswordRequired('   ')).toBe(false)
  })

  it('isAccessPasswordRequired is true when password set', () => {
    expect(isAccessPasswordRequired('secret')).toBe(true)
  })

  it('checkAccessPassword accepts empty expected', () => {
    expect(checkAccessPassword('anything', '')).toBe(true)
  })

  it('checkAccessPassword compares exact candidate', () => {
    expect(checkAccessPassword('secret', 'secret')).toBe(true)
    expect(checkAccessPassword('wrong', 'secret')).toBe(false)
  })

  it('isAccessUnlocked is true when no password required', () => {
    expect(isAccessUnlocked('')).toBe(true)
  })

  it('isAccessUnlocked follows sessionStorage when password required', () => {
    expect(isAccessUnlocked('secret')).toBe(false)
    unlockAccess()
    expect(isAccessUnlocked('secret')).toBe(true)
  })

  it('tryUnlockAccess writes sessionStorage on success', () => {
    expect(tryUnlockAccess('wrong', 'secret')).toBe(false)
    expect(sessionStorage.getItem(ACCESS_UNLOCK_STORAGE_KEY)).toBeNull()

    expect(tryUnlockAccess('secret', 'secret')).toBe(true)
    expect(sessionStorage.getItem(ACCESS_UNLOCK_STORAGE_KEY)).toBe('1')
    expect(isAccessUnlocked('secret')).toBe(true)
  })
})
