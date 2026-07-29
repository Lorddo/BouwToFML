const DB_NAME = 'bouw-dev-workspace'
const DB_VERSION = 1
const STORE = 'sessions'
const LAST_SESSION_KEY = 'last'
const SESSION_KEY_PREFIX = 'session:'
const LEGACY_SESSION_ID = 'legacy:last'

function toStoreKey(sessionId: string): string {
  return sessionId === LEGACY_SESSION_ID ? LAST_SESSION_KEY : `${SESSION_KEY_PREFIX}${sessionId}`
}

function fromStoreKey(key: string): string | null {
  if (key === LAST_SESSION_KEY) return null
  if (!key.startsWith(SESSION_KEY_PREFIX)) return null
  return key.slice(SESSION_KEY_PREFIX.length)
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open mislukt.'))
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
  })
}

async function saveLastDevSession(session: unknown): Promise<void> {
  await saveDevSession(LEGACY_SESSION_ID, session)
}

import { toStorableDevSession } from './storable'

export async function saveDevSession(sessionId: string, session: unknown): Promise<void> {
  const storable = toStorableDevSession(session)
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB schrijven mislukt.'))
    const store = tx.objectStore(STORE)
    store.put(storable, toStoreKey(sessionId))
    // Backward compatible pointer: laatst opgeslagen snapshot.
    store.put(storable, LAST_SESSION_KEY)
  })
  db.close()
}

export async function loadLastDevSession<T>(): Promise<T | null> {
  return loadDevSessionById<T>(LEGACY_SESSION_ID)
}

export async function loadDevSessionById<T>(sessionId: string): Promise<T | null> {
  const db = await openDb()
  const value = await new Promise<unknown>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB lezen mislukt.'))
    const request = tx.objectStore(STORE).get(toStoreKey(sessionId))
    request.onsuccess = () => resolve(request.result ?? null)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB lezen mislukt.'))
  })
  db.close()
  return (value as T | null) ?? null
}

export async function listDevSessions<T>(): Promise<Array<{ id: string; session: T }>> {
  const db = await openDb()
  const entries = await new Promise<Array<{ id: string; session: T }>>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB lezen mislukt.'))
    const request = tx.objectStore(STORE).openCursor()
    const results: Array<{ id: string; session: T }> = []
    request.onerror = () => reject(request.error ?? new Error('IndexedDB cursor lezen mislukt.'))
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        resolve(results)
        return
      }
      const rawKey = String(cursor.key)
      const id = fromStoreKey(rawKey)
      if (id) {
        results.push({ id, session: cursor.value as T })
      }
      cursor.continue()
    }
  })
  db.close()
  return entries
}
