/** Gedeelde IndexedDB voor DevSessions + ProjectState. */
export const BOUW_DB_NAME = 'bouw-dev-workspace'
export const BOUW_DB_VERSION = 2

export const SESSIONS_STORE = 'sessions'
export const PROJECTS_STORE = 'projects'
export const PROJECT_INDEX_STORE = 'projectIndex'

let dbPromise: Promise<IDBDatabase> | null = null

function ensureStores(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
    db.createObjectStore(SESSIONS_STORE)
  }
  if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
    db.createObjectStore(PROJECTS_STORE)
  }
  if (!db.objectStoreNames.contains(PROJECT_INDEX_STORE)) {
    db.createObjectStore(PROJECT_INDEX_STORE)
  }
}

/** Open (of hergebruik) de gedeelde BouwToFML IndexedDB. */
export function openBouwDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(BOUW_DB_NAME, BOUW_DB_VERSION)
    request.onerror = () => {
      dbPromise = null
      reject(request.error ?? new Error('IndexedDB open mislukt.'))
    }
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      ensureStores(request.result)
    }
  })
  return dbPromise
}

/** Test-helper: reset de gedeelde promise (na deleteDatabase e.d.). */
export function resetBouwDbPromise(): void {
  dbPromise = null
}
