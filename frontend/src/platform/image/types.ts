export type { PreprocessConfig } from '@/core/extraction/types'
import type { PreprocessConfig } from '@/core/extraction/types'
import {
  createDefaultWallLayerTune,
  createDefaultOcrLayerTune,
  createDefaultGapsLayerTune,
} from '@/cv/preprocess/layer-preprocess'

const wallLayer = createDefaultWallLayerTune()

export const DEFAULT_PREPROCESS: PreprocessConfig = {
  rotate180: false,
  rotationDeg: 0,
  autoRotationDeg: 0,
  wallStyle: 'open',
  wallKernelOverridePx: 15,
  ocrEnabled: false,
  ocrMinConfidence: 85,
  ocrLanguages: 'eng+nld',
  ocrMode: 'general',
  ocrDetectVertical: false,
  wallLayer,
  ocrLayer: createDefaultOcrLayerTune(),
  gapsLayer: createDefaultGapsLayerTune(),
  // Legacy root-mirror (alleen voor oude code / export); pipeline leest wallLayer.
  brightness: wallLayer.brightness ?? 50,
  contrast: wallLayer.contrast ?? 1,
  threshold: wallLayer.threshold ?? 128,
  colorThresholdEnabled: wallLayer.colorThresholdEnabled,
  thresholdEnabled: wallLayer.thresholdEnabled,
  thresholdMode: wallLayer.thresholdMode,
  useAdaptive: wallLayer.useAdaptive ?? true,
  preBinarizeEnabled: wallLayer.preBinarizeEnabled ?? false,
  preBinarizeThreshold: wallLayer.preBinarizeThreshold ?? 150,
  adaptiveBlockSize: wallLayer.adaptiveBlockSize ?? 11,
  edgeAwareEdgeBoost: wallLayer.edgeAwareEdgeBoost ?? 0,
  adjustBrightnessContrastEnabled: wallLayer.adjustBrightnessContrastEnabled ?? true,
  adjustNegativeEnabled: wallLayer.adjustNegativeEnabled ?? false,
  finalNegativeEnabled: wallLayer.finalNegativeEnabled ?? false,
  smoothLinesEnabled: wallLayer.smoothLinesEnabled ?? false,
  smoothLines: wallLayer.smoothLines ?? 0,
  removeSpecklesEnabled: wallLayer.removeSpecklesEnabled ?? false,
  removeHolesEnabled: wallLayer.removeHolesEnabled ?? false,
  removeHolesMaxPx: wallLayer.removeHolesMaxPx ?? 0,
  thickenLinesEnabled: wallLayer.thickenLinesEnabled ?? false,
  thickenLinesPx: wallLayer.thickenLinesPx ?? 0,
  bridgeGapsEnabled: wallLayer.bridgeGapsEnabled ?? false,
  bridgeGaps: wallLayer.bridgeGaps ?? 0,
  noiseReduction: wallLayer.noiseReduction ?? 0,
  despeckleOpen: wallLayer.despeckleOpen ?? 0,
  despeckleMinPx: wallLayer.despeckleMinPx ?? 0,
}
