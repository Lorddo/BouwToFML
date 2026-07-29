import type { PreprocessConfig, PreprocessLayerTune } from '@/core/extraction/types'
import {
  createDefaultGapsLayerTune,
  createDefaultOcrLayerTune,
  defaultLayerTune,
  GAPS_LAYER_DEFAULTS,
  layerTuneStorageKey,
  OCR_LAYER_DEFAULTS,
  WALL_LAYER_DEFAULTS,
} from './layer-preprocess-defaults'
import type { PreprocessLayerId } from './layer-preprocess-tabs'

/** Velden per laag-tab — volledig onafhankelijk. */
const LAYER_TUNE_FIELD_KEYS: (keyof PreprocessLayerTune)[] = [
  'adjustBrightnessContrastEnabled',
  'adjustNegativeEnabled',
  'brightness',
  'contrast',
  'colorThresholdEnabled',
  'thresholdEnabled',
  'thresholdMode',
  'useAdaptive',
  'threshold',
  'preBinarizeEnabled',
  'preBinarizeThreshold',
  'adaptiveBlockSize',
  'edgeAwareEdgeBoost',
  'smoothLinesEnabled',
  'smoothLines',
  'removeSpecklesEnabled',
  'removeHolesEnabled',
  'removeHolesMaxPx',
  'thickenLinesEnabled',
  'thickenLinesPx',
  'bridgeGapsEnabled',
  'bridgeGaps',
  'erodeLinesEnabled',
  'erodeLinesPx',
  'finalNegativeEnabled',
  'noiseReduction',
  'despeckleOpen',
  'despeckleMinPx',
]

const SHARED_PREPROCESS_KEYS = [
  'rotate180',
  'rotationDeg',
  'autoRotationDeg',
  'wallStyle',
  'wallKernelOverridePx',
  'ocrEnabled',
  'ocrMinConfidence',
  'ocrLanguages',
  'ocrMode',
  'ocrDetectVertical',
] as const satisfies ReadonlyArray<keyof PreprocessConfig>

function pickLayerTuneFields(source: PreprocessLayerTune): PreprocessLayerTune {
  const picked: PreprocessLayerTune = {}
  for (const key of LAYER_TUNE_FIELD_KEYS) {
    if (source[key] !== undefined) {
      ;(picked as Record<string, unknown>)[key] = source[key]
    }
  }
  return picked
}

/** Legacy root-mirror van wallLayer (export / oude paden). */
export function mirrorWallTuneToRoot(
  config: PreprocessConfig,
  tune: PreprocessLayerTune = config.wallLayer ?? defaultLayerTune('walls'),
): PreprocessConfig {
  return {
    ...config,
    wallLayer: tune,
    brightness: tune.brightness ?? 50,
    contrast: tune.contrast ?? 1,
    threshold: tune.threshold ?? 128,
    colorThresholdEnabled: tune.colorThresholdEnabled,
    thresholdEnabled: tune.thresholdEnabled,
    thresholdMode: tune.thresholdMode,
    useAdaptive: tune.useAdaptive ?? true,
    preBinarizeEnabled: tune.preBinarizeEnabled ?? false,
    preBinarizeThreshold: tune.preBinarizeThreshold ?? 150,
    adaptiveBlockSize: tune.adaptiveBlockSize ?? 11,
    edgeAwareEdgeBoost: tune.edgeAwareEdgeBoost ?? 0,
    adjustBrightnessContrastEnabled: tune.adjustBrightnessContrastEnabled,
    adjustNegativeEnabled: tune.adjustNegativeEnabled,
    smoothLinesEnabled: tune.smoothLinesEnabled,
    smoothLines: tune.smoothLines,
    removeSpecklesEnabled: tune.removeSpecklesEnabled,
    removeHolesEnabled: tune.removeHolesEnabled,
    removeHolesMaxPx: tune.removeHolesMaxPx,
    thickenLinesEnabled: tune.thickenLinesEnabled,
    thickenLinesPx: tune.thickenLinesPx,
    bridgeGapsEnabled: tune.bridgeGapsEnabled,
    bridgeGaps: tune.bridgeGaps,
    erodeLinesEnabled: tune.erodeLinesEnabled,
    erodeLinesPx: tune.erodeLinesPx,
    finalNegativeEnabled: tune.finalNegativeEnabled,
    despeckleOpen: tune.despeckleOpen,
    despeckleMinPx: tune.despeckleMinPx,
  }
}

/** Kopieer B/W-tuning van één preprocess-tab naar een andere (stap 2). */
export function copyLayerTuneBetween(
  config: PreprocessConfig,
  from: PreprocessLayerId,
  to: PreprocessLayerId,
): PreprocessConfig {
  if (from === to) return config
  const stored = normalizeStoredPreprocess(config)
  const sourceKey = layerTuneStorageKey(from)
  const targetKey = layerTuneStorageKey(to)
  const sourceTune = stored[sourceKey] ?? defaultLayerTune(from)
  const nextTune = applyLegacyNoiseFlags({
    ...defaultLayerTune(to),
    ...pickLayerTuneFields(sourceTune),
  })
  const withTarget = normalizeStoredPreprocess({ ...stored, [targetKey]: nextTune })
  if (to === 'walls' && withTarget.wallLayer) {
    return mirrorWallTuneToRoot(withTarget, withTarget.wallLayer)
  }
  return withTarget
}

/** Alleen velden die B/W-onderlegger-preview beïnvloeden — niet OCR-scan tuning (confidence/talen/modus). */
export function underlayPreviewFingerprint(config: PreprocessConfig): string {
  const stored = normalizeStoredPreprocess(config)
  return JSON.stringify({
    rotate180: stored.rotate180 ?? false,
    rotationDeg: stored.rotationDeg ?? 0,
    autoRotationDeg: stored.autoRotationDeg ?? 0,
    wallKernelOverridePx: stored.wallKernelOverridePx,
    wallStyle: stored.wallStyle,
    wallLayer: pickLayerTuneFields(stored.wallLayer ?? WALL_LAYER_DEFAULTS),
    // ocrLayer blijft in fingerprint voor DevSession/export-stabiliteit (runtime deelt wallLayer).
    ocrLayer: pickLayerTuneFields(stored.ocrLayer ?? OCR_LAYER_DEFAULTS),
    gapsLayer: pickLayerTuneFields(stored.gapsLayer ?? GAPS_LAYER_DEFAULTS),
  })
}

/**
 * Per-laag tune-delen uit `underlayPreviewFingerprint`.
 * OCR-preview-invalidatie moet `wall` volgen — niet `ocr` (legacy storage).
 */
export function layerTuneFingerprintParts(fingerprint: string): {
  wall: string
  ocr: string
  gaps: string
} {
  try {
    const parsed = JSON.parse(fingerprint) as {
      wallLayer?: unknown
      ocrLayer?: unknown
      gapsLayer?: unknown
    }
    return {
      wall: JSON.stringify(parsed.wallLayer ?? {}),
      ocr: JSON.stringify(parsed.ocrLayer ?? {}),
      gaps: JSON.stringify(parsed.gapsLayer ?? {}),
    }
  } catch {
    return { wall: fingerprint, ocr: fingerprint, gaps: fingerprint }
  }
}

function pickSharedFields(base: PreprocessConfig): Partial<PreprocessConfig> {
  const picked: Partial<PreprocessConfig> = {}
  for (const key of SHARED_PREPROCESS_KEYS) {
    if (base[key] !== undefined) {
      ;(picked as Record<string, unknown>)[key] = base[key]
    }
  }
  return picked
}

function legacyWallTuneFromRoot(config: PreprocessConfig): PreprocessLayerTune {
  return pickLayerTuneFields(config as PreprocessLayerTune)
}

function applyLegacyNoiseFlags(tune: PreprocessLayerTune): PreprocessLayerTune {
  const next = { ...tune }
  const legacyNoise = Math.max(0, Math.round(next.noiseReduction ?? 0))
  if (legacyNoise > 0) {
    next.smoothLines = Math.max(1, Math.round(legacyNoise / 2))
    next.smoothLinesEnabled = true
    next.bridgeGaps = legacyNoise
    next.bridgeGapsEnabled = true
  }
  if (next.thresholdEnabled === false) {
    next.colorThresholdEnabled = false
  } else if (next.colorThresholdEnabled == null && next.thresholdEnabled != null) {
    next.colorThresholdEnabled = next.thresholdEnabled
  }
  return next
}

/** Eenmalige normalisatie voor opslag (UI / export) — geen defaults forceren over expliciete false. */
export function normalizeStoredPreprocess(config: PreprocessConfig): PreprocessConfig {
  const shared = pickSharedFields(config)
  const wallLayer = applyLegacyNoiseFlags({
    ...WALL_LAYER_DEFAULTS,
    ...(config.wallLayer == null ? legacyWallTuneFromRoot(config) : {}),
    ...(config.wallLayer ?? {}),
  })
  const ocrLayer = config.ocrLayer
    ? applyLegacyNoiseFlags({ ...config.ocrLayer })
    : createDefaultOcrLayerTune()
  const gapsLayer = config.gapsLayer
    ? applyLegacyNoiseFlags({ ...config.gapsLayer })
    : createDefaultGapsLayerTune()

  return {
    ...shared,
    ocrEnabled: config.ocrEnabled ?? false,
    ocrMinConfidence: config.ocrMinConfidence ?? 85,
    ocrLanguages: config.ocrLanguages ?? 'nld+eng',
    ocrMode: config.ocrMode ?? 'general',
    ocrDetectVertical: config.ocrDetectVertical ?? false,
    rotate180: config.rotate180 ?? false,
    brightness: wallLayer.brightness ?? 50,
    contrast: wallLayer.contrast ?? 1,
    threshold: wallLayer.threshold ?? 128,
    useAdaptive: wallLayer.useAdaptive ?? true,
    colorThresholdEnabled: wallLayer.colorThresholdEnabled,
    thresholdEnabled: wallLayer.thresholdEnabled,
    thresholdMode: wallLayer.thresholdMode,
    preBinarizeEnabled: wallLayer.preBinarizeEnabled ?? false,
    preBinarizeThreshold: wallLayer.preBinarizeThreshold ?? 150,
    adaptiveBlockSize: wallLayer.adaptiveBlockSize ?? 11,
    edgeAwareEdgeBoost: wallLayer.edgeAwareEdgeBoost ?? 0,
    wallLayer,
    ocrLayer,
    gapsLayer,
  }
}

export function migratePreprocessConfig(config: PreprocessConfig): PreprocessConfig {
  return normalizeStoredPreprocess(config)
}

export function isColorThresholdEnabled(config: PreprocessConfig | PreprocessLayerTune): boolean {
  if (config.colorThresholdEnabled != null) return config.colorThresholdEnabled
  if (config.thresholdEnabled != null) return config.thresholdEnabled
  return true
}

function readLayerTune(
  config: PreprocessConfig,
  layer: PreprocessLayerId,
): PreprocessLayerTune {
  const stored = normalizeStoredPreprocess(config)
  const key = layerTuneStorageKey(layer)
  return stored[key] ?? defaultLayerTune(layer)
}

/** Flat config voor OpenCV-pipeline — alleen actieve laag, geen nested tunes. */
export function resolveLayerPreprocess(
  base: PreprocessConfig,
  layer: PreprocessLayerId,
): PreprocessConfig {
  const stored = normalizeStoredPreprocess(base)
  // OCR deelt muur-B/W; `ocrLayer` blijft alleen voor legacy storage.
  const tuneLayer: PreprocessLayerId = layer === 'ocr' ? 'walls' : layer
  const tune = readLayerTune(stored, tuneLayer)
  const shared = pickSharedFields(stored)

  const resolved: PreprocessConfig = {
    rotate180: stored.rotate180 ?? false,
    rotationDeg: stored.rotationDeg ?? 0,
    autoRotationDeg: stored.autoRotationDeg ?? 0,
    brightness: tune.brightness ?? 50,
    contrast: tune.contrast ?? 1,
    threshold: tune.threshold ?? 128,
    useAdaptive: tune.useAdaptive ?? false,
    colorThresholdEnabled: tune.colorThresholdEnabled,
    thresholdEnabled: tune.thresholdEnabled,
    thresholdMode:
      tune.thresholdMode ?? (tune.useAdaptive ? 'adaptive' : 'fixed'),
    preBinarizeEnabled: tune.preBinarizeEnabled ?? false,
    preBinarizeThreshold: tune.preBinarizeThreshold ?? 150,
    adaptiveBlockSize: tune.adaptiveBlockSize ?? 11,
    edgeAwareEdgeBoost: tune.edgeAwareEdgeBoost ?? 0,
    adjustBrightnessContrastEnabled: tune.adjustBrightnessContrastEnabled ?? false,
    adjustNegativeEnabled: tune.adjustNegativeEnabled ?? false,
    smoothLinesEnabled: tune.smoothLinesEnabled ?? false,
    smoothLines: tune.smoothLines ?? 0,
    removeSpecklesEnabled: tune.removeSpecklesEnabled ?? false,
    removeHolesEnabled: tune.removeHolesEnabled ?? false,
    removeHolesMaxPx: tune.removeHolesMaxPx ?? 0,
    thickenLinesEnabled: tune.thickenLinesEnabled ?? false,
    thickenLinesPx: tune.thickenLinesPx ?? 0,
    bridgeGapsEnabled: tune.bridgeGapsEnabled ?? false,
    bridgeGaps: tune.bridgeGaps ?? 0,
    erodeLinesEnabled: tune.erodeLinesEnabled ?? false,
    erodeLinesPx: tune.erodeLinesPx ?? 0,
    finalNegativeEnabled: tune.finalNegativeEnabled ?? false,
    despeckleOpen: tune.despeckleOpen ?? 0,
    despeckleMinPx: tune.despeckleMinPx ?? 0,
    wallKernelOverridePx: stored.wallKernelOverridePx,
    ...shared,
  }

  return resolved
}

/** Actieve lijnverdikking (px) op de muren-tab — 0 als uit. */
export function resolveWallPreprocessThickenPx(preprocess: PreprocessConfig): number {
  const wall = resolveLayerPreprocess(preprocess, 'walls')
  if (!wall.thickenLinesEnabled) return 0
  return Math.max(0, Math.round(wall.thickenLinesPx ?? 0))
}
