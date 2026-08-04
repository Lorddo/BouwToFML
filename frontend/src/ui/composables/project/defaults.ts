import {
  DEFAULT_FML_DOOR_HEIGHT_CM,
  DEFAULT_FML_WALL_HEIGHT_CM,
  DEFAULT_FML_WINDOW_HEIGHT_CM,
  DEFAULT_FML_WINDOW_SILL_Z_CM,
} from '@/core/fml/extraction-to-plan-types'
import { DEFAULT_FML_WALL_THICKNESS_LIMITS } from '@/core/fml/fml-wall-thickness-limits'
import { DEFAULT_FML_BAND_BOUNDARIES } from '@/core/fml/fml-wall-thickness-tiers'
import type { FloorMeta, ProjectFmlDefaults, ProjectMeta, ProjectState } from './types'

export function createDefaultFloorFmlDefaults(): ProjectFmlDefaults {
  return {
    wallHeightCm: DEFAULT_FML_WALL_HEIGHT_CM,
    doorHeightCm: DEFAULT_FML_DOOR_HEIGHT_CM,
    windowHeightCm: DEFAULT_FML_WINDOW_HEIGHT_CM,
    windowSillZCm: DEFAULT_FML_WINDOW_SILL_Z_CM,
    bovenlichtDefault: false,
    thicknessMinCm: DEFAULT_FML_WALL_THICKNESS_LIMITS.minCm,
    thicknessMidCm: DEFAULT_FML_WALL_THICKNESS_LIMITS.midCm,
    thicknessMaxCm: DEFAULT_FML_WALL_THICKNESS_LIMITS.maxCm,
    bandMidBoundaryCm: DEFAULT_FML_BAND_BOUNDARIES.midBoundaryCm,
    bandMaxBoundaryCm: DEFAULT_FML_BAND_BOUNDARIES.maxBoundaryCm,
  }
}

/** @deprecated alias — gebruik createDefaultFloorFmlDefaults */
export const createDefaultProjectFmlDefaults = createDefaultFloorFmlDefaults

export function createProjectId(): string {
  return `proj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function createFloorId(): string {
  return `floor-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function createDefaultFloorMeta(partial?: Partial<FloorMeta>): FloorMeta {
  return {
    id: partial?.id ?? createFloorId(),
    name: partial?.name ?? 'Begane grond',
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
      },
    },
    activeFloorId: floor.id,
  }
}
