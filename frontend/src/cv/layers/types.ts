import type { ExampleSample, PreprocessConfig, SegmentCandidate } from '@/core/extraction'
import type { OpenCV } from '@/cv/loadOpenCV'
import type { Segment } from '@/cv/port/wallGraph'
import type { InkBandMeasure } from '@/cv/port/wallKernel'
import type { WallMatchCandidate } from '@/core/extraction'
import type { CanvasLike } from '@/cv/port/canvasEnv'

export interface LayerContext {
  cv: OpenCV
  image: HTMLCanvasElement | HTMLImageElement | OffscreenCanvas
  preprocess: PreprocessConfig
  examples: ExampleSample[]
  eraserMask?: Uint8Array
}

export interface PreprocessResult {
  mat: OpenCV['Mat']
  previewCanvas: CanvasLike
  config: PreprocessConfig
}

export interface WallLayerDebug {
  afterClose: CanvasLike
  afterThickness?: CanvasLike
}

export interface WallLayerResult {
  segments: Segment[]
  segmentCandidates: SegmentCandidate[]
  /** Alleen gedetecteerde segmenten (zonder LBE-seeds) — voor mask-overlay. */
  detectedSegments: Segment[]
  /** Kernel per LBE-voorbeeld (gemeten inktband). */
  templateKernels: number[]
  /** Exacte inktband per LBE-voorbeeld (voor maskerdikte). */
  templateBands: InkBandMeasure[]
  wallMatches: WallMatchCandidate[]
  solidMat: OpenCV['Mat']
  previewCanvas: CanvasLike
  kernelPx: number
  debug: WallLayerDebug
}

export interface PipelineDebugResult {
  preprocess?: CanvasLike
  wall?: WallLayerDebug
  openings?: CanvasLike
}

export type PipelineOrder = 'walls-first' | 'openings-first' | 'priority'

export interface CvPipelineConfig {
  order: PipelineOrder
  maskOpeningsInWallPass: boolean
  wallKernelOverridePx?: number
  detectWalls?: boolean
}
