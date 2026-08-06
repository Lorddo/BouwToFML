import type { Floor, FloorPlan } from '@/core/fml/types'
import type { DevWorkspaceSession } from '@/platform/dev-workspace'
import type {
  FloorMeta,
  FloorWorkspaceBlob,
  PreviewUnderlayLayout,
  ProjectMeta,
  ProjectSourceUnderlay,
  ProjectState,
} from '@/ui/composables/project/types'

export const PERSISTED_PROJECT_SCHEMA_VERSION = 1 as const

export type PersistedProjectIndexEntry = {
  id: string
  name: string
  address: string
  floorCount: number
  updatedAt: string
}

/**
 * Opgeslagen DevSession: PNG + masks als Uint8Array i.p.v. data-URL / base64.
 * Overige velden gelijk aan DevWorkspaceSession.
 */
export type PersistedDevSession = Omit<
  DevWorkspaceSession,
  'workingImagePng' | 'eraserMaskBase64' | 'ocrMaskBase64' | 'wallStamp'
> & {
  workingImagePngBytes: Uint8Array
  eraserMaskBytes?: Uint8Array
  ocrMaskBytes?: Uint8Array
  wallStamp?: PersistedWallStamp
}

export type PersistedWallStamp = {
  donorFloorId: string
  bands: unknown
  baseBounds: unknown
  bounds: unknown
  wallsCm: unknown
  sourceWallsCm?: unknown
  originCm: unknown
  eraseMaskBytes?: Uint8Array
  stampBwBytes?: Uint8Array
  stampMaskBytes?: Uint8Array
  baked: boolean
}

export type PersistedSourceUnderlay = {
  pngBytes: Uint8Array
  name: string
  scale?: DevWorkspaceSession['scale']
}

export type PersistedFloorBlob = {
  session: PersistedDevSession | null
  generatedFloor: Floor | null
  previewPlan: FloorPlan | null
  previewUnderlayLayout: PreviewUnderlayLayout | null
  /** Per-floor bronscan (vóór crop); optioneel voor oude records. */
  sourceUnderlay?: PersistedSourceUnderlay | null
}

export type PersistedProject = {
  schemaVersion: typeof PERSISTED_PROJECT_SCHEMA_VERSION
  id: string
  updatedAt: string
  meta: ProjectMeta
  floors: FloorMeta[]
  activeFloorId: string
  sourceUnderlay: PersistedSourceUnderlay | null
  blobs: Record<string, PersistedFloorBlob>
}

/** Runtime ProjectState + helpers voor round-trip-tests. */
export type { ProjectState, FloorWorkspaceBlob, ProjectSourceUnderlay }
