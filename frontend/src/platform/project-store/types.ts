import type { Floor, FloorPlan } from '@/core/fml/types'
import type { DevWorkspaceSession } from '@/platform/dev-workspace'
import type {
  FloorMeta,
  FloorOrientPersist,
  FloorWorkspaceBlob,
  PreviewUnderlayLayout,
  ProjectMeta,
  ProjectSourceUnderlay,
  ProjectState,
} from '@/ui/composables/project/types'

/**
 * IDB-schema v2: floor-blob = plan-helft (`.plg`-vorm) + converter-sidecar (CV).
 * Geen migratie van v1 — schema-gate wist het oude record (afgesproken cutover).
 */
export const PERSISTED_PROJECT_SCHEMA_VERSION = 2 as const

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
  injectWalls?: unknown
  originCm: unknown
  eraseMaskBytes?: Uint8Array
  stampBwBytes?: Uint8Array
  stampMaskBytes?: Uint8Array
  baked: boolean
  skipBandFilter?: boolean
  bakeNulpuntImageCm?: { x: number; y: number }
}

export type PersistedSourceUnderlay = {
  pngBytes: Uint8Array
  name: string
  scale?: DevWorkspaceSession['scale']
  /** PDF page identity (no bytes). */
  pdf?: {
    pageNumber: number
    fileName: string
    pageRenderScale: number
    pageWidthPx: number
    pageHeightPx: number
  }
}

/** One shared PDF page for reuse/ROI (bytes + page). Omitted on quota retry. */
export type PersistedPdfUnderlay = {
  bytes: Uint8Array
  pageNumber: number
  fileName: string
  pageRenderScale: number
  pageWidthPx: number
  pageHeightPx: number
}

/**
 * Plan-helft van één floor in IDB (geen CV-bytes).
 * Schaal hoort hier — kalibratie is planeigendom.
 */
export type PlgFloorDocument = {
  generatedFloor: Floor | null
  previewPlan: FloorPlan | null
  previewUnderlayLayout: PreviewUnderlayLayout | null
  /** Gebruikers-nulpunt in scant-cm; optioneel voor oude records. */
  fmlNulpuntImageCm?: { x: number; y: number } | null
  /** FML-oriëntatie; optioneel voor oude records. */
  fmlOrient?: FloorOrientPersist | null
  /** Schaalkalibratie (was `session.scale`). */
  scale: PersistedDevSession['scale'] | null
  /** Per-floor bronscan (vóór crop); optioneel. */
  sourceUnderlay?: PersistedSourceUnderlay | null
}

/**
 * Converter-sidecar: CV-werkstaat (scan, maskers, refs, detectie).
 * Nooit in `.plg`-download; alleen IDB / BouwToFML.
 */
export type ConverterSidecar = Omit<PersistedDevSession, 'scale'>

/** Floor-blob v2: plan + optionele CV-sidecar. */
export type PersistedFloorBlob = {
  plan: PlgFloorDocument
  cv: ConverterSidecar | null
}

export type PersistedProject = {
  schemaVersion: typeof PERSISTED_PROJECT_SCHEMA_VERSION
  id: string
  updatedAt: string
  meta: ProjectMeta
  floors: FloorMeta[]
  activeFloorId: string
  sourceUnderlay: PersistedSourceUnderlay | null
  /** Shared PDF bytes for «Onderlegger overnemen»; optional on oude records. */
  sourcePdfUnderlay?: PersistedPdfUnderlay | null
  blobs: Record<string, PersistedFloorBlob>
}

/** Runtime ProjectState + helpers voor round-trip-tests. */
export type { ProjectState, FloorWorkspaceBlob, ProjectSourceUnderlay }
