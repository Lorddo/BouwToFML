import { loadUserSettings } from '@/ui/composables/settings/user-settings'
import type { FloorMeta, ProjectFmlDefaults, ProjectMeta, ProjectState } from './types'

/** Project-/floor-defaults uit user settings (localStorage), anders fabriekswaarden. */
export function createDefaultFloorFmlDefaults(): ProjectFmlDefaults {
  return { ...loadUserSettings().defaults }
}

export function createProjectId(): string {
  return `proj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function createFloorId(): string {
  return `floor-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** Floor-namen blijven NL: eindgebruiker (FML), niet UI-locale. */
export const DEFAULT_FLOOR_NAME_NL = 'Begane grond'

export function floorNameIndexedNl(n: number): string {
  return `Verdieping ${n}`
}

export function createDefaultFloorMeta(partial?: Partial<FloorMeta>): FloorMeta {
  return {
    id: partial?.id ?? createFloorId(),
    name: partial?.name ?? DEFAULT_FLOOR_NAME_NL,
    level: partial?.level ?? 0,
    status: partial?.status ?? 'empty',
    defaults: partial?.defaults ? { ...partial.defaults } : createDefaultFloorFmlDefaults(),
  }
}

export function createEmptyProjectState(meta?: Partial<ProjectMeta>): ProjectState {
  const floor = createDefaultFloorMeta()
  return {
    meta: {
      id: meta?.id ?? createProjectId(),
      name: meta?.name ?? '',
      address: meta?.address ?? '',
    },
    sourceUnderlay: null,
    floors: [floor],
    blobs: {
      [floor.id]: {
        session: null,
        generatedFloor: null,
        previewPlan: null,
        previewUnderlayLayout: null,
        sourceUnderlay: null,
      },
    },
    activeFloorId: floor.id,
  }
}
