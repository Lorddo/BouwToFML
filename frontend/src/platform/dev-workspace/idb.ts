import { openBouwDb, SESSIONS_STORE } from '@/platform/idb/bouw-db'
import { toStorableDevSession } from './storable'

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

export async function saveDevSession(sessionId: string, session: unknown): Promise<void> {
  const storable = toStorableDevSession(session)
  const db = await openBouwDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SESSIONS_STORE, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB schrijven mislukt.'))
    const store = tx.objectStore(SESSIONS_STORE)
    store.put(storable, toStoreKey(sessionId))
    // Backward compatible pointer: laatst opgeslagen snapshot.
    store.put(storable, LAST_SESSION_KEY)
  })
}

export async function loadLastDevSession<T>(): Promise<T | null> {
  return loadDevSessionById<T>(LEGACY_SESSION_ID)
}

export async function loadDevSessionById<T>(sessionId: string): Promise<T | null> {
  const db = await openBouwDb()
  const value = await new Promise<unknown>((resolve, reject) => {
    const tx = db.transaction(SESSIONS_STORE, 'readonly')
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB lezen mislukt.'))
    const request = tx.objectStore(SESSIONS_STORE).get(toStoreKey(sessionId))
    request.onsuccess = () => resolve(request.result ?? null)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB lezen mislukt.'))
  })
  return (value as T | null) ?? null
}

/** Quota-recovery: wis DevSession-snapshots (niet ProjectState). */
export async function clearDevSessionsStore(): Promise<void> {
  const db = await openBouwDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SESSIONS_STORE, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB sessions wissen mislukt.'))
    tx.objectStore(SESSIONS_STORE).clear()
  })
}

export async function listDevSessions<T>(): Promise<Array<{ id: string; session: T }>> {
  const db = await openBouwDb()
  const entries = await new Promise<Array<{ id: string; session: T }>>((resolve, reject) => {
    const tx = db.transaction(SESSIONS_STORE, 'readonly')
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB lezen mislukt.'))
    const request = tx.objectStore(SESSIONS_STORE).openCursor()
    const results: Array<{ id: string; session: T }> = []
    request.onerror = () => reject(request.error ?? new Error('IndexedDB cursor lezen mislukt.'))
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        resolve(results)
        return
      }
      const key = cursor.key
      if (typeof key !== 'string') {
        cursor.continue()
        return
      }
      const id = fromStoreKey(key)
      if (id) {
        results.push({ id, session: cursor.value as T })
      }
      cursor.continue()
    }
  })
  return entries
}
