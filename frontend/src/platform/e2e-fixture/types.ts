import type { RoomWallMaskRle, PipelineLayer1FaceDebug } from '@/core/extraction/types'
import type { ResolvedDoorCandidate } from '@/cv/doors'
import type { ResolvedWindowCandidate } from '@/cv/windows'
import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import type { FmlWallThicknessLimits } from '@/core/fml/fml-wall-thickness-limits'
import type { FmlThicknessBandBoundaries } from '@/core/fml/fml-wall-thickness-tiers'

/** Int32-raster als run-length + base64 (waarde/count-paren, little-endian Int32). */
export interface EncodedInt32Raster {
  width: number
  height: number
  rleBase64: string
}

export interface E2eFixtureLayer1Face {
  rootLabel: number
  bbox: { x: number; y: number; width: number; height: number }
  areaPx: number
  inkCoverageRatio: number
  segments: Array<{
    a: { x: number; y: number }
    b: { x: number; y: number }
    templateIndex?: number
  }>
  junctions: Array<{
    rootLabel: number
    x: number
    y: number
    kind: 'I' | 'L' | 'T' | 'X'
    angleDeg: number
  }>
  stats: { segmentCount: number; junctionCount: number; elapsedMs: number }
}

export interface E2eFixtureLayer1 {
  facesRaw: E2eFixtureLayer1Face[]
  allSegmentsRaw: E2eFixtureLayer1Face['segments']
  allJunctionsRaw: E2eFixtureLayer1Face['junctions']
  totalSegmentsRaw: number
  totalJunctionsRaw: number
  /**
   * Index-ranges zoals in `PipelineV3Debug.layers.layer1.faces` —
   * handig voor round-trip zonder facesRaw opnieuw te slicen.
   */
  faceDebug?: PipelineLayer1FaceDebug[]
}

export interface E2eFixtureFmlSettings {
  thicknessLimits: FmlWallThicknessLimits
  bandBoundaries: FmlThicknessBandBoundaries
  wallHeightCm: number
  doorHeightCm: number
  windowHeightCm: number
  windowSillZCm: number
}

/**
 * Één fixture.json per tekening. `maskRle` is de enige maskerbron voor de harness;
 * `mask.png` is alleen voor menselijke inspectie en deelt dezelfde checksum.
 */
export interface E2eFixture {
  version: 1
  slug: string
  width: number
  height: number
  pxPerMmX: number
  pxPerMmY: number
  referenceWallThicknessPx: number
  /** Gefinaliseerd muurmasker (zelfde vorm als `roomWallMaskRle`). */
  maskRle: RoomWallMaskRle
  layer1: E2eFixtureLayer1
  labelsRle: EncodedInt32Raster
  rawLabelsRle: EncodedInt32Raster
  parentMap: Array<[number, number]>
  classificationByLabel: Array<[number, RoomRasterClass]>
  resolvedDoors: ResolvedDoorCandidate[]
  stage4ResolvedWindows: ResolvedWindowCandidate[]
  fml: E2eFixtureFmlSettings
  /** FNV-1a over mask-runs + labels + rawLabels (hex). */
  checksum: string
}

export type E2eFixtureBuildInput = {
  slug: string
  maskRle: RoomWallMaskRle
  layer1: E2eFixtureLayer1
  labelsData: Int32Array
  rawLabelsData: Int32Array
  width: number
  height: number
  parentMap: Array<[number, number]>
  classificationByLabel: Array<[number, RoomRasterClass]>
  resolvedDoors: ResolvedDoorCandidate[]
  stage4ResolvedWindows: ResolvedWindowCandidate[]
  pxPerMmX: number
  pxPerMmY: number
  referenceWallThicknessPx: number
  fml: E2eFixtureFmlSettings
}
