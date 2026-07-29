import type { ExtractionOutput } from '@/core/extraction'
import type { ElementClass } from '@/core/extraction/types'
import { type DetectionLayerId, type TemplateTab } from '@/cv/preprocess/layer-preprocess'

/** Volgorde stap 2: muren → int muur → gaten (OCR deelt muur-tune; gaten UI vaak verborgen). */
export const WORKSPACE_PREPROCESS_LAYER_ORDER = ['walls', 'inkWall', 'gaps'] as const
/** Volgorde stap 3: OCR → muren → gaten → deuren → ramen (openingen = face-overlays op muurstate). */
export const WORKSPACE_TEMPLATE_LAYER_ORDER = ['ocr', 'walls', 'gaps', 'doors', 'windows'] as const
/** Volgorde detectie-resultaten (zonder OCR / gaten / openingen). */
export const WORKSPACE_DETECTION_LAYER_ORDER = ['walls'] as const

export function isGeometryDetectionLayer(layer: string): layer is DetectionLayerId {
  return isDetectionLayerId(layer)
}

export function isDetectionLayerId(layer: string): layer is DetectionLayerId {
  return (WORKSPACE_DETECTION_LAYER_ORDER as readonly string[]).includes(layer)
}

export function detectTargetsForTab(tab: TemplateTab): {
  walls?: boolean
  wallJunctionStrategy?: 'room_first'
} {
  if (tab === 'ocr' || tab === 'gaps' || tab === 'doors' || tab === 'windows') return {}
  return {
    walls: true,
    wallJunctionStrategy: 'room_first',
  }
}

export function elementClassToDetectionLayer(cls: ElementClass): DetectionLayerId {
  if (cls === 'wall') return 'walls'
  throw new Error(`Niet-ondersteunde elementClass in walls-only flow: ${cls}`)
}

const VALID_EXTRACTOR_IDS = new Set(['geometry-lbe'])

/** Pipeline-output is echt gedraaid (niet noop-stub). */
export function isValidTabOutput(output: ExtractionOutput | null | undefined): boolean {
  if (!output?.meta) return false
  const id = output.meta.extractorId
  if (!VALID_EXTRACTOR_IDS.has(id)) return false
  return (output.meta.elapsedMs ?? 0) > 0.5
}

/** Afgeronde muur-detectie (finalize-fase) met classify-state. */
export function isFinalizeTabOutput(output: ExtractionOutput | null | undefined): boolean {
  const hasPipelineDebug = !!output?.pipelineV3Debug?.layers.layer1
  return (
    isValidTabOutput(output) &&
    output!.meta!.roomPipelinePhase === 'finalize' &&
    !!output!.meta!.roomClassifyState &&
    hasPipelineDebug
  )
}
