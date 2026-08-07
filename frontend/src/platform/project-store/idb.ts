import { openBouwDb, PROJECT_INDEX_STORE, PROJECTS_STORE } from '@/platform/idb/bouw-db'
import {
  fromPersistedProject,
  isPersistedProject,
  toPersistedProject,
  toProjectIndexEntry,
  type PersistProjectOptions,
} from './serialize'
import type { PersistedProject, PersistedProjectIndexEntry } from './types'
import type { ProjectState } from '@/ui/composables/project/types'

export async function saveProject(
  state: ProjectState,
  options?: PersistProjectOptions,
): Promise<PersistedProject> {
  const record = toPersistedProject(state, new Date().toISOString(), options)
  const index = toProjectIndexEntry(record)
  const db = await openBouwDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([PROJECTS_STORE, PROJECT_INDEX_STORE], 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB project schrijven mislukt.'))
    tx.objectStore(PROJECTS_STORE).put(record, record.id)
    tx.objectStore(PROJECT_INDEX_STORE).put(index, index.id)
  })
  return record
}

export async function loadProject(id: string): Promise<ProjectState | null> {
  const db = await openBouwDb()
  const value = await new Promise<unknown>((resolve, reject) => {
    const tx = db.transaction(PROJECTS_STORE, 'readonly')
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB project lezen mislukt.'))
    const request = tx.objectStore(PROJECTS_STORE).get(id)
    request.onsuccess = () => resolve(request.result ?? null)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB project lezen mislukt.'))
  })
  if (!isPersistedProject(value)) {
    if (value != null) {
      // Schema-mismatch: opruimen zodat de resume-kaart niet blijft hangen.
      await deleteProject(id).catch(() => undefined)
    }
    return null
  }
  return fromPersistedProject(value)
}

export async function listProjectIndex(): Promise<PersistedProjectIndexEntry[]> {
  const db = await openBouwDb()
  const entries = await new Promise<PersistedProjectIndexEntry[]>((resolve, reject) => {
    const tx = db.transaction(PROJECT_INDEX_STORE, 'readonly')
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB project-index lezen mislukt.'))
    const request = tx.objectStore(PROJECT_INDEX_STORE).getAll()
    request.onsuccess = () => {
      const rows = (request.result ?? []) as PersistedProjectIndexEntry[]
      rows.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
      resolve(rows)
    }
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB project-index lezen mislukt.'))
  })
  return entries
}

export async function deleteProject(id: string): Promise<void> {
  const db = await openBouwDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([PROJECTS_STORE, PROJECT_INDEX_STORE], 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB project verwijderen mislukt.'))
    tx.objectStore(PROJECTS_STORE).delete(id)
    tx.objectStore(PROJECT_INDEX_STORE).delete(id)
  })
}

export async function deleteAllProjects(): Promise<void> {
  const db = await openBouwDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([PROJECTS_STORE, PROJECT_INDEX_STORE], 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB projecten wissen mislukt.'))
    tx.objectStore(PROJECTS_STORE).clear()
    tx.objectStore(PROJECT_INDEX_STORE).clear()
  })
}

/** Oudere index-entries opruimen (quota-recovery); houdt `keepId` aan. */
export async function deleteOtherProjects(keepId: string): Promise<number> {
  const index = await listProjectIndex()
  let removed = 0
  for (const entry of index) {
    if (entry.id === keepId) continue
    await deleteProject(entry.id)
    removed += 1
  }
  return removed
}
