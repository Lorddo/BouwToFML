import type { Segment } from '@/cv/port/wallGraph'
import type { RasterBBox } from './room-raster-merge'

export type RoomWallJunctionKind = 'I' | 'L' | 'T' | 'X'

export interface RoomWallJunction {
  rootLabel: number
  x: number
  y: number
  kind: RoomWallJunctionKind
  /** Draaihoek op knooppunt: 0° = recht door, 90° = rechte hoek. */
  angleDeg: number
}

export interface RoomWallFaceSkeleton {
  rootLabel: number
  bbox: RasterBBox
  areaPx: number
  inkCoverageRatio: number
  segments: Segment[]
  junctions: RoomWallJunction[]
  stats: { segmentCount: number; junctionCount: number; elapsedMs: number }
}

export interface RoomWallFaceSkeletonResult {
  /** Laag A: ruwe WASM-skeleton (alleen offset, geen filter). */
  facesRaw: RoomWallFaceSkeleton[]
  /** Laag B: gepolijst (collinear + snijpunten + parallel/T + ortho, geen prune). */
  facesFiltered: RoomWallFaceSkeleton[]
  /** Laag C: gepruned (spur + lengte-filter) — input voor semantic graph. */
  facesLayerC: RoomWallFaceSkeleton[]
  allSegmentsWasmRaw: Segment[]
  allSegmentsLayerAInput: Segment[]
  allSegmentsPolishedUnfiltered: Segment[]
  allSegmentsRaw: Segment[]
  allSegmentsFiltered: Segment[]
  allSegmentsLayerC: Segment[]
  allJunctionsRaw: RoomWallJunction[]
  allJunctionsFiltered: RoomWallJunction[]
  allJunctionsLayerC: RoomWallJunction[]
  totalSegmentsWasmRaw: number
  totalSegmentsLayerAInput: number
  totalSegmentsPolishedUnfiltered: number
  totalSegmentsRaw: number
  totalSegmentsFiltered: number
  totalSegmentsLayerC: number
  totalJunctionsRaw: number
  totalJunctionsFiltered: number
  totalJunctionsLayerC: number
  totalEndpoints: number
}
