import type { GeometricSignature, WallRenderStyle } from './geometric-signature'
import type { WallGraph } from '@/cv/port/wallJunctionGraph'

/** Uitbreidbaar elementtype — V2 start met wall/door/window. */
export type ElementClass =
  'wall' | 'door' | 'window' | 'stair' | 'column' | 'sanitary' | 'furniture' | 'electrical'

export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

export interface ExampleSample {
  id: string
  type: ElementClass
  bbox: BoundingBox
  signature?: GeometricSignature
  /** Embedding-vector (DINOv2) */
  embedding?: Float32Array
}

export interface DetectionCandidate {
  type: ElementClass
  confidence: number
  bbox: BoundingBox
  /** Welk LBE-voorbeeld deze hit opleverde (pixel-template scan). */
  sourceExampleId?: string
}

export interface SegmentCandidate {
  type: ElementClass
  a: { x: number; y: number }
  b: { x: number; y: number }
  confidence?: number
  thicknessPx?: number
  /** LBE-voorbeeldindex (muurdetectie). */
  templateIndex?: number
}

export interface RoomWallJunctionDebug {
  x: number
  y: number
  kind: 'I' | 'L' | 'T' | 'X'
  angleDeg: number
}

/**
 * Face-metadata op layer-1 debug zodat een E2E-fixture
 * `PipelineV3Layer1Result.facesRaw` kan herbouwen via index-ranges
 * in `segments` / `junctions` (aaneengesloten per blob, L1-push-volgorde).
 * Bestaande rapporten lezen dit veld niet.
 */
export interface PipelineLayer1FaceDebug {
  rootLabel: number
  bbox: BoundingBox
  areaPx: number
  inkCoverageRatio: number
  /** Half-open range in `layers.layer1.segments`. */
  segmentStart: number
  segmentEnd: number
  /** Half-open range in `layers.layer1.junctions`. */
  junctionStart: number
  junctionEnd: number
}

export interface PipelineLayerDebug {
  segments: SegmentCandidate[]
  junctions: RoomWallJunctionDebug[]
  /** Alleen gevuld op `layers.layer1` (E2E-export / layer1-injectie). */
  faces?: PipelineLayer1FaceDebug[]
}

export interface PipelineV3Debug {
  pipelineVersion: 'v3'
  layers: {
    layer1?: PipelineLayerDebug
    layer2?: PipelineLayerDebug
    layer3?: PipelineLayerDebug
    layer4?: PipelineLayerDebug
    layer5?: PipelineLayerDebug
    layer6?: PipelineLayerDebug
    layer7?: PipelineLayerDebug
    layer8?: PipelineLayerDebug
    layer9?: PipelineLayerDebug
    layer10?: PipelineLayerDebug
  }
  summary?: {
    segmentCounts?: Record<string, number>
    junctionCounts?: Record<string, number>
    junctionKindCounts?: Record<string, Record<'I' | 'L' | 'T' | 'X', number>>
    incompleteLayers?: number[]
    /** Progressive stop marker (always native after V3 scaffold cutover). */
    bridgeMode?: 'native'
    completedThroughLayer?: number
    fmlReady?: boolean
  }
}

export type PipelineWallDebug = PipelineV3Debug

/** @deprecated Use PipelineLayerDebug */
export type PipelineV2LayerDebug = PipelineLayerDebug

export interface RoomWallMaskRle {
  width: number
  height: number
  /** Run-length encoded: [value, count, value, count, ...] */
  runs: number[]
}

export interface SemanticWallSegment {
  a: { x: number; y: number }
  b: { x: number; y: number }
  thicknessPxMax: number
  /**
   * Robuuste typische dikte (mediaan van DT-samples).
   * Prefereren voor FML-export; `thicknessPxMax` blijft bovengrens voor opening-snap.
   */
  thicknessPxTypical?: number
  /** p90 van DT-samples — ruismaat voor diagnose/grootboek. */
  thicknessPxP90?: number
  /** 0..1 verdeling van dikte rond centerline (0.5 = gecentreerd). */
  balancePx?: number
  /** Absolute plus-normal extent vanaf centerline (px). */
  facePlusPx?: number
  /** Absolute minus-normal extent vanaf centerline (px). */
  faceMinusPx?: number
  junctionAId?: string
  junctionBId?: string
}

export interface SemanticWallJunction {
  id: string
  x: number
  y: number
  kind: 'I' | 'L' | 'T' | 'X'
  anglesDeg: number[]
  source?: 'raw' | 'cornerCluster' | 'lineIntersect'
}

export interface RoomWallSemanticGraph {
  segments: SemanticWallSegment[]
  junctions: SemanticWallJunction[]
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
    /**
     * Post-conditie "1 muurdikte = ≥1 D-segment": aantal Laag-A muurbanden
     * (aaneengesloten inktbanden) die in Laag D géén overeenkomstig segment
     * meer hebben. 0 = invariant gehaald. >0 = muren verdwenen tussen A en D.
     */
    lostWallBandCount?: number
  }
  /** Dev: tussenstappen semantic pipeline (Laag C = pre-filter, Laag D = final = segments/junctions hierboven). */
  debugLayers?: {
    layerC?: {
      segments: Array<{ a: { x: number; y: number }; b: { x: number; y: number } }>
      junctions: RoomWallJunctionDebug[]
    }
    /** Laag-A muurbanden zonder Laag-D dekking (post-conditie schendingen). */
    lostWalls?: Array<{ x: number; y: number; lengthPx: number }>
  }
}

export interface PreprocessVectorCacheInput {
  workScale: number
  rawInk: Array<{
    a: { x: number; y: number }
    b: { x: number; y: number }
    templateIndex?: number
  }>
  simplifiedInk: Array<{
    a: { x: number; y: number }
    b: { x: number; y: number }
    templateIndex?: number
  }>
  skeleton: Array<{
    a: { x: number; y: number }
    b: { x: number; y: number }
    templateIndex?: number
  }>
  meta?: {
    rawInkCount?: number
    simplifiedInkCount?: number
    skeletonCount?: number
  }
}

export interface GapCandidate extends BoundingBox {
  gapLengthPx: number
}

export interface OcrTextCandidate extends BoundingBox {
  text: string
  confidence: number
}

/** Template-match bbox inclusief muurdikte — voor debug-overlay per LBE-masker. */
export interface WallMatchCandidate {
  bbox: BoundingBox
  templateIndex: number
  confidence?: number
}

export interface SegmentationMask {
  type: ElementClass
  /** Polygon in tekening-pixels */
  contour: Array<{ x: number; y: number }>
  confidence?: number
}

/** Per-laag tuning (deuren/ramen) — merge op shared rotatie + wall-basis. */
export interface PreprocessLayerTune {
  adjustBrightnessContrastEnabled?: boolean
  /** Vroege invert op grijswaarden (vóór drempel/opschonen). */
  adjustNegativeEnabled?: boolean
  brightness?: number
  contrast?: number
  threshold?: number
  colorThresholdEnabled?: boolean
  thresholdEnabled?: boolean
  thresholdMode?: 'fixed' | 'adaptive' | 'otsu' | 'edgeAware'
  useAdaptive?: boolean
  /**
   * Stap 1 vóór de gekozen drempelmodus: vaste B/W (geen grijs bewaren),
   * daarna adaptive/otsu/… op puur B/W.
   */
  preBinarizeEnabled?: boolean
  /** Drempel voor vooraf-B/W (default 150). */
  preBinarizeThreshold?: number
  /** Adaptive block size (oneven, ≥3). OpenCV `adaptiveThreshold` buurt. */
  adaptiveBlockSize?: number
  edgeAwareEdgeBoost?: number
  smoothLinesEnabled?: boolean
  smoothLines?: number
  removeSpecklesEnabled?: boolean
  removeHolesEnabled?: boolean
  removeHolesMaxPx?: number
  thickenLinesEnabled?: boolean
  thickenLinesPx?: number
  bridgeGapsEnabled?: boolean
  bridgeGaps?: number
  /** Lijnen afschaven — elke lijn wordt N px dunner (dunne lijnen verdwijnen). */
  erodeLinesEnabled?: boolean
  erodeLinesPx?: number
  /** Late invert op de bewerkte B/W-plattegrond (ná alle opschoonstappen). */
  finalNegativeEnabled?: boolean
  /** @deprecated Gebruik smoothLines/bridgeGaps i.p.v. noiseReduction. */
  noiseReduction?: number
  despeckleOpen?: number
  despeckleMinPx?: number
}

export interface PreprocessConfig {
  adjustBrightnessContrastEnabled?: boolean
  /** Vroege invert op grijswaarden (vóór drempel/opschonen). */
  adjustNegativeEnabled?: boolean
  brightness: number
  contrast: number
  threshold: number
  colorThresholdEnabled?: boolean
  thresholdEnabled?: boolean
  thresholdMode?: 'fixed' | 'adaptive' | 'otsu' | 'edgeAware'
  useAdaptive: boolean
  /** Zie PreprocessLayerTune.preBinarizeEnabled. */
  preBinarizeEnabled?: boolean
  preBinarizeThreshold?: number
  /** Adaptive block size (oneven, ≥3). OpenCV `adaptiveThreshold` buurt. */
  adaptiveBlockSize?: number
  edgeAwareEdgeBoost?: number
  rotate180: boolean
  rotationDeg?: number
  autoRotationDeg?: number
  smoothLinesEnabled?: boolean
  smoothLines?: number
  removeSpecklesEnabled?: boolean
  removeHolesEnabled?: boolean
  removeHolesMaxPx?: number
  thickenLinesEnabled?: boolean
  thickenLinesPx?: number
  bridgeGapsEnabled?: boolean
  bridgeGaps?: number
  erodeLinesEnabled?: boolean
  erodeLinesPx?: number
  /** Late invert op de bewerkte B/W-plattegrond (ná alle opschoonstappen). */
  finalNegativeEnabled?: boolean
  /** @deprecated Gebruik smoothLines/bridgeGaps i.p.v. noiseReduction. */
  noiseReduction?: number
  despeckleOpen?: number
  despeckleMinPx?: number
  wallStyle?: 'solid' | 'open'
  wallKernelOverridePx?: number
  ocrEnabled?: boolean
  ocrMinConfidence?: number
  ocrLanguages?: string
  ocrMode?: 'general' | 'numbers'
  ocrDetectVertical?: boolean
  /** Per-laag voorbewerking (muren). */
  wallLayer?: PreprocessLayerTune
  /**
   * Legacy storage only — roundtrip/DevSession.
   * Runtime OCR-scan/preview deelt `wallLayer` via `resolveLayerPreprocess(..., 'ocr')`.
   */
  ocrLayer?: PreprocessLayerTune
  /** Per-laag voorbewerking (gaten / openings-B/W). */
  gapsLayer?: PreprocessLayerTune
}

export interface ExtractionInput {
  image: HTMLImageElement | HTMLCanvasElement | OffscreenCanvas
  examples: ExampleSample[]
  preprocess?: PreprocessConfig
  workMaxDimension?: number
  /** Verhouding werkcanvas → origineel (≤1). */
  workScale?: number
  originalWidth?: number
  originalHeight?: number
  eraserMask?: Uint8Array
  /** Al gecomposeerde muur-B/W — skip wall-rethreshold in geometry-pipeline. */
  precomposedWallBw?: Uint8Array
  /** Pure zwarte muurstempel voor Otsu OR. */
  wallStampMask?: Uint8Array
  detectTargets?: {
    walls?: boolean
    doors?: boolean
    windows?: boolean
    wallJunctionStrategy?: WallJunctionStrategy
  }
  pipelineOptions?: {
    suppressTextLikeRegions?: boolean
    preprocessVectorCache?: PreprocessVectorCacheInput
    pixelMatch?: {
      pixelMatchThreshold: number
    }
    /** @deprecated Vervangen door wallJunctionStrategy. */
    wallVectorizationMode?: 'centerline' | 'contour'
    wallJunctionStrategy?: WallJunctionStrategy
    expectedWallStyles?: WallRenderStyle[]
    expectDoorArc?: boolean
    roomInkCoverageThreshold?: number
    wallStyle?: 'solid' | 'open'
    referenceWallThicknessPx?: number
    /** Absolute meetbandgrenzen (multi muur-ref) voor L7/L9/L10. */
    bandBoundariesPx?: { midBoundaryPx: number; maxBoundaryPx: number }
    /** Meet dikte uit wall B/W in worker (voorkomt dubbele preprocess op main thread). */
    referenceWallMeasureRect?: { x: number; y: number; width: number; height: number }
    roomPipelinePhase?: 'classify' | 'recalculate' | 'finalize' | 'full'
    wallPipelineVersion?: import('@/platform/wall-pipeline-version').WallPipelineVersion
    roomClassifyState?: import('@/cv/walls/strategies/room-first').SerializedRoomClassifyState
    faceOverrides?: Array<
      [number, 'wall' | 'surface' | 'unknown' | 'outside' | 'door' | 'window' | 'doorframe']
    >
    pinnedRoots?: number[]
  }
}

export type WallJunctionStrategy = 'room_first'

export interface ExtractionOutput {
  candidates: DetectionCandidate[]
  segments?: SegmentCandidate[]
  wallGraph?: WallGraph
  debugRawInk?: SegmentCandidate[]
  debugSkeleton?: SegmentCandidate[]
  debugLines?: SegmentCandidate[]
  debugGaps?: GapCandidate[]
  pipelineV3Debug?: PipelineV3Debug
  roomWallMaskRle?: RoomWallMaskRle
  semanticWallGraph?: RoomWallSemanticGraph
  /** True als Laag C leeg was en de semantic-graaf op Laag B (gepolijst) draaide. */
  semanticUsedLayerBFallback?: boolean
  wallMatches?: WallMatchCandidate[]
  masks?: SegmentationMask[]
  meta?: {
    extractorId: string
    elapsedMs: number
    workScale?: number
    /** Gemeten kernel per LBE-muurvoorbeeld (px). */
    templateKernels?: number[]
    lineCount?: number
    houghCount?: number
    lsdCount?: number
    mergedCount?: number
    lsdAvailable?: boolean
    truncated?: boolean
    gapCount?: number
    textSuppressedCount?: number
    ocrWordCount?: number
    wallSignatureCount?: number
    wallFingerprintCount?: number
    doorSignatureCount?: number
    windowSignatureCount?: number
    /** @deprecated Vervangen door wallJunctionStrategy. */
    wallVectorizationMode?: string
    wallJunctionStrategy?: string
    signaturesJson?: string
    /** @deprecated Niet meer gegenereerd — B/W uit stap-2 preprocess preview. */
    debugStagePngs?: {
      preprocessBw?: string
      afterClose?: string
      afterThickness?: string
      roomWallMergedClose?: string
      roomWallSkeleton?: string
    }
    rawLineSegmentCount?: number
    mergedLineSegmentCount?: number
    inkLineSegmentCount?: number
    simplifiedInkSegmentCount?: number
    ribbonPairCount?: number
    ribbonRejectedInk?: number
    ribbonRejectedConnectivity?: number
    rawInkVectorCount?: number
    roomFaceCount?: number
    roomSurfaceCount?: number
    roomWallCount?: number
    roomUnknownCount?: number
    roomGraphEdgeCount?: number
    roomInkCoverageThreshold?: number
    wallStyle?: 'solid' | 'open'
    referenceWallThicknessPx?: number
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
    roomPipelinePhase?: 'classify' | 'recalculate' | 'finalize' | 'full'
    wallPipelineVersion?: import('@/platform/wall-pipeline-version').WallPipelineVersion
    roomClassifyState?: import('@/cv/walls/strategies/room-first').SerializedRoomClassifyState
  }
}

export interface ExtractorCapabilities {
  id: string
  name: string
  supports: ElementClass[]
  needsExamples: boolean
}

export interface ExtractorPlugin {
  readonly capabilities: ExtractorCapabilities
  extract(input: ExtractionInput): Promise<ExtractionOutput>
}
