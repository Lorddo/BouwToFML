import type { PreprocessLayerTune } from '@/core/extraction/types'
import type { PreprocessLayerId } from './layer-preprocess-tabs'

/** Defaults: vooraf B/W 150 → adaptive; thicken uit; despeckle uit. */
export const WALL_LAYER_DEFAULTS: PreprocessLayerTune = {
  adjustBrightnessContrastEnabled: true,
  adjustNegativeEnabled: false,
  brightness: 50,
  contrast: 1,
  threshold: 128,
  colorThresholdEnabled: true,
  thresholdEnabled: true,
  thresholdMode: 'adaptive',
  useAdaptive: true,
  /** Vast 150 → puur B/W, daarna adaptive op dat beeld. */
  preBinarizeEnabled: true,
  preBinarizeThreshold: 150,
  adaptiveBlockSize: 11,
  edgeAwareEdgeBoost: 0,
  smoothLinesEnabled: false,
  smoothLines: 1,
  removeSpecklesEnabled: false,
  removeHolesEnabled: false,
  removeHolesMaxPx: 0,
  thickenLinesEnabled: false,
  thickenLinesPx: 1,
  bridgeGapsEnabled: false,
  /** Topologie tussen faces via resolveInkBetweenFaces — niet wallLayer bridgeGaps. */
  bridgeGaps: 1,
  erodeLinesEnabled: false,
  erodeLinesPx: 1,
  finalNegativeEnabled: false,
  noiseReduction: 0,
  despeckleOpen: 0,
  despeckleMinPx: 32,
}

/**
 * Legacy/storage-only defaults voor `ocrLayer`.
 * Runtime OCR-scan/preview gebruikt `wallLayer` via `resolveLayerPreprocess(..., 'ocr')`.
 */
export const OCR_LAYER_DEFAULTS: PreprocessLayerTune = {
  ...WALL_LAYER_DEFAULTS,
  removeSpecklesEnabled: false,
  despeckleMinPx: 0,
  thickenLinesEnabled: false,
  thickenLinesPx: 1,
  preBinarizeEnabled: false,
  preBinarizeThreshold: 150,
}

/** Openings-B/W: lichter dan muren — geen bridge/thicken die gaten dichtsmelt. */
export const GAPS_LAYER_DEFAULTS: PreprocessLayerTune = {
  adjustBrightnessContrastEnabled: true,
  adjustNegativeEnabled: false,
  brightness: 50,
  contrast: 1,
  threshold: 128,
  colorThresholdEnabled: true,
  thresholdEnabled: true,
  thresholdMode: 'adaptive',
  useAdaptive: true,
  preBinarizeEnabled: false,
  preBinarizeThreshold: 150,
  adaptiveBlockSize: 11,
  edgeAwareEdgeBoost: 0,
  smoothLinesEnabled: false,
  smoothLines: 1,
  removeSpecklesEnabled: false,
  removeHolesEnabled: false,
  removeHolesMaxPx: 0,
  thickenLinesEnabled: false,
  thickenLinesPx: 1,
  bridgeGapsEnabled: false,
  bridgeGaps: 1,
  erodeLinesEnabled: false,
  erodeLinesPx: 1,
  finalNegativeEnabled: false,
  noiseReduction: 0,
  despeckleOpen: 0,
  despeckleMinPx: 0,
}

/** Legacy storage only; runtime OCR deelt `wallLayer`. */
export function createDefaultOcrLayerTune(): PreprocessLayerTune {
  return { ...OCR_LAYER_DEFAULTS }
}

export function createDefaultWallLayerTune(): PreprocessLayerTune {
  return { ...WALL_LAYER_DEFAULTS }
}

export function createDefaultGapsLayerTune(): PreprocessLayerTune {
  return { ...GAPS_LAYER_DEFAULTS }
}

/**
 * Storage-key per preprocess-laag.
 * `'ocr'` → `ocrLayer` is legacy storage only; runtime B/W via `wallLayer`.
 */
export function layerTuneStorageKey(
  layer: PreprocessLayerId,
): 'wallLayer' | 'ocrLayer' | 'gapsLayer' {
  if (layer === 'walls') return 'wallLayer'
  if (layer === 'gaps') return 'gapsLayer'
  return 'ocrLayer'
}

export function defaultLayerTune(layer: PreprocessLayerId): PreprocessLayerTune {
  if (layer === 'walls') return createDefaultWallLayerTune()
  if (layer === 'gaps') return createDefaultGapsLayerTune()
  return createDefaultOcrLayerTune()
}
