import type { ExampleSample, OcrTextCandidate } from '@/core/extraction'
import type {
  GeometricSignature,
  OpeningLineFingerprint,
} from '@/core/extraction/geometric-signature'
import type { PreprocessConfig } from '@/platform/image'
import type { ExtractionOutput } from '@/core/extraction'

export interface SegmentRecord {
  a: { x: number; y: number }
  b: { x: number; y: number }
  /** Optioneel — semantic segments laten dit weg (afleidbaar uit a/b). */
  lengthPx?: number
}

export interface RoomJunctionRecord {
  x: number
  y: number
  kind: 'I' | 'L' | 'T' | 'X'
  angleDeg: number
}

export interface RoomWallFaceSkeletonRecord {
  rootLabel: number
  bbox: { x: number; y: number; width: number; height: number }
  areaPx: number
  inkCoverageRatio: number
  segments: SegmentRecord[]
  junctions: RoomJunctionRecord[]
}

export interface SemanticWallJunctionRecord {
  id: string
  x: number
  y: number
  kind: 'I' | 'L' | 'T' | 'X'
  anglesDeg: number[]
  source?: 'raw' | 'cornerCluster' | 'lineIntersect'
}

export interface SemanticWallSegmentRecord {
  a: { x: number; y: number }
  b: { x: number; y: number }
  thicknessPxMax: number
  balancePx?: number
  junctionAId?: string
  junctionBId?: string
}

export interface SemanticWallGraphRecord {
  segments: SemanticWallSegmentRecord[]
  junctions: SemanticWallJunctionRecord[]
  meta: {
    rawJunctionCount: number
    semanticJunctionCount: number
    cornerClustersMerged: number
    collinearSegmentsMerged: number
    angleAtLeast25Count: number
    layerARawICount?: number
    layerAEndpointCount?: number
    layerAAnchorCount?: number
    parallelDuplicatesMerged?: number
    parallelTResolvedPairs?: number
    parallelTJunctionCount?: number
  }
  debugLayers?: {
    layerC?: {
      segments: SegmentRecord[]
      junctions: RoomJunctionRecord[]
    }
  }
}

/** Eén muur-overlaylaag in het HTML-rapport (uitbreidbaar tot Z). */
export interface WallLayerExport {
  id: string
  title: string
  description: string
  color: string
  dashed: boolean
  segments: SegmentRecord[]
  junctions?: RoomJunctionRecord[]
  semanticJunctions?: SemanticWallJunctionRecord[]
  fmlText?: string
  statsLine?: string
  json?: unknown
}

export interface FmlPreviewExport {
  fmlText: string
  wallCount: number
  segments: SegmentRecord[]
}

export interface DetectionHitRecord {
  kind: 'segment' | 'opening'
  a?: { x: number; y: number }
  b?: { x: number; y: number }
  bbox?: { x: number; y: number; width: number; height: number }
  lengthPx?: number
  confidence?: number
}

export interface ExampleExportDiagnostics {
  lineFingerprint?: OpeningLineFingerprint
  rawInkVectorCountInExample?: number
  /** Alleen voor voorbeeld-diagnostiek: ruwe inkt-vectoren die door het voorbeeldvak lopen. */
  rawInkVectorsInExample?: SegmentRecord[]
  /** Detectiehits op de plattegrond voor dit template (indien tab-output beschikbaar). */
  detectedHits?: DetectionHitRecord[]
  templateCropPng?: string
  inkCropPng?: string
  /** Inkt-silhouet (mask) van originele template — geen rotatie/spiegel varianten. */
  inkMaskPreviewPng?: string
}

export interface EnrichedExampleExport extends ExampleSample {
  geometrySignature: GeometricSignature | null
  diagnostics?: ExampleExportDiagnostics
}

export interface WallVariantExport {
  tabKey: 'walls'
  strategy: 'room_first'
  available: boolean
  summary?: {
    extractorId?: string
    elapsedMs?: number
    wallSegments?: number
    wallMasks?: number
    skeletonDebugCount?: number
    faceCount?: number
    roomWallCount?: number
    roomSurfaceCount?: number
    roomInkCoverageThreshold?: number
    roomWallSkeletonSegmentCount?: number
    roomWallSkeletonWasmSegmentCount?: number
    roomWallSkeletonLayerAInputCount?: number
    roomWallSkeletonPolishedUnfilteredCount?: number
    roomWallSkeletonRawSegmentCount?: number
    roomWallSkeletonFilteredSegmentCount?: number
    roomWallSkeletonLayerCSegmentCount?: number
    roomWallJunctionCount?: number
    roomWallJunctionRawCount?: number
    roomWallJunctionFilteredCount?: number
    roomWallEndpointCount?: number
    roomWallConnectedBlobCount?: number
    roomWallSpeckleRemovedCount?: number
    roomWallDemotedRootCount?: number
    roomUnknownCount?: number
    semanticWallSegmentCount?: number
    semanticWallJunctionCount?: number
    semanticLayerCSegmentCount?: number
    semanticUsedLayerBFallback?: boolean
    fmlWallCount?: number
    balanceNonDefault?: number
  }
  segments?: SegmentRecord[]
  skeletonDebug?: SegmentRecord[]
  roomWallFaceSkeletons?: RoomWallFaceSkeletonRecord[]
  roomWallFaceSkeletonsFiltered?: RoomWallFaceSkeletonRecord[]
  roomWallFaceSkeletonsLayerC?: RoomWallFaceSkeletonRecord[]
  faceColorMaskPng?: string
  roomReferencePng?: string
  roomWallMergedClosePng?: string
  roomWallSkeletonOverlayPng?: string
  semanticWallGraph?: SemanticWallGraphRecord
  fmlPreview?: FmlPreviewExport
  wallLayers?: WallLayerExport[]
  meta?: Omit<ExtractionOutput['meta'], 'signaturesJson' | 'debugStagePngs'>
}

export interface SharedPipelineExport {
  planSize?: { width: number; height: number }
  workScale?: number
  preprocessWallPng?: string
  stagePngs?: {
    preprocessBw?: string
    afterClose?: string
    afterThickness?: string
    roomWallSkeleton?: string
    roomWallMergedClose?: string
  }
  rawLines?: SegmentRecord[]
  rawVectorCount?: number
  signaturesJson?: string
}

export interface ExamplesExportPayload {
  drawing: string | null
  preprocess: PreprocessConfig
  examples: EnrichedExampleExport[]
  reportContext?: {
    sharedPipeline?: SharedPipelineExport
    wallVariants?: WallVariantExport[]
    tabSummary?: {
      walls?: {
        extractorId?: string
        elapsedMs?: number
        wallSegments?: number
        wallMasks?: number
        skeletonSegments?: number
        wallVectorizationMode?: string
      }
    }
    combined?: {
      wallSegments?: number
      wallMasks?: number
      skeletonSegments?: number
      meta?: ExtractionOutput['meta']
    }
    enabledFeatures?: {
      wallProximityFilter: boolean
      crossTypeNms: boolean
      scoreFiniteGuard: boolean
      scoreClamp01: boolean
    }
    ocr?: {
      enabled: boolean
      maskedWordCount: number
      words: OcrTextCandidate[]
      previewPng?: string
    }
  }
  exportedAt: string
}
