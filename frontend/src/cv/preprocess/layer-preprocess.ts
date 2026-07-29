/**
 * Layer-preprocess barrel — stabiel importpad `@/cv/preprocess/layer-preprocess`.
 * Implementatie: tabs / defaults / normalize.
 */

export type {
  PreprocessLayerId,
  WallTechniqueTab,
  DetectionLayerId,
  OpeningTemplateTab,
  PreprocessPanelLayer,
  TemplateTab,
} from './layer-preprocess-tabs'
export {
  TEMPLATE_TAB_LABELS,
  PREPROCESS_TAB_LABELS,
  isPreprocessLayerId,
  templateTabToElementClass,
  isWallTechniqueTab,
  usesWallBwUnderlay,
  usesGapsFaceOverlay,
  usesDoorSwingOverlay,
  usesWindowOverlay,
  usesWallDetectionOverlays,
} from './layer-preprocess-tabs'

export {
  createDefaultOcrLayerTune,
  createDefaultWallLayerTune,
  createDefaultGapsLayerTune,
  layerTuneStorageKey,
  defaultLayerTune,
} from './layer-preprocess-defaults'

export {
  mirrorWallTuneToRoot,
  copyLayerTuneBetween,
  underlayPreviewFingerprint,
  layerTuneFingerprintParts,
  normalizeStoredPreprocess,
  migratePreprocessConfig,
  isColorThresholdEnabled,
  resolveLayerPreprocess,
  resolveWallPreprocessThickenPx,
} from './layer-preprocess-normalize'
