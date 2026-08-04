import type { Point2D } from './extraction-to-plan-geom'

export type { Point2D }

export interface Layer12DoorForFml {
  doorId: string
  segmentIndex: number
  fmlRefId: string
  mirrored: [number, number]
  /** Double-wide merge + overlays; niet naar Opening. */
  snappedBBox?: { x: number; y: number; width: number; height: number }
  openingStartPx: Point2D
  openingEndPx: Point2D
}

/**
 * FML-contract = L12/L14 openings (start/end, segmentIndex, fmlRefId[, mirrored]).
 * Niet L11 BoundDoor / BoundWindow-extras.
 */
export interface Layer14WindowForFml {
  windowId: string
  segmentIndex: number
  fmlRefId: string
  openingStartPx: Point2D
  openingEndPx: Point2D
}

export const DEFAULT_FML_WALL_HEIGHT_CM = 280
export const DEFAULT_FML_DOOR_HEIGHT_CM = 220
export const DEFAULT_FML_WINDOW_HEIGHT_CM = 150
export const DEFAULT_FML_WINDOW_SILL_Z_CM = 70

export interface ExtractionToPlanOptions {
  pxPerMmX: number
  pxPerMmY: number
  planName?: string
  floorName?: string
  /** FML `floors[].level` (default 0). */
  level?: number
  defaultThicknessCm?: number
  /** Verdiepingshoogte / muurhoogte in cm (default 280). */
  floorHeightCm?: number
  /** Standaard deurhoogte in cm (default 220); per opening overschrijfbaar via `z_height`. */
  defaultDoorHeightCm?: number
  /** Standaard glashoogte in cm (default 150); per raam overschrijfbaar via `z_height`. */
  defaultWindowHeightCm?: number
  /** Standaard afstand vloer→dorpel in cm (default 70); per raam overschrijfbaar via `z`. */
  defaultWindowSillZCm?: number
  /**
   * Twin→double_wide merge (X-10). Default true.
   * Uit = elke standaarddeur blijft een single opening.
   */
  mergeDoubleDoors?: boolean
  layer12Doors?: Layer12DoorForFml[]
  layer14Windows?: Layer14WindowForFml[]
}
