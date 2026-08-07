import type { PreprocessConfig } from '@/core/extraction/types'
import type { OpenCV } from '@/cv/loadOpenCV'
import { runPreprocessLayer, runPreprocessLayerFromGrayscale } from '@/cv/layers/preprocess-layer'
import { thickenLines } from '@/cv/port/cleanBinary'
import { matToCanvas } from '@/cv/port/preprocess'
import { resolveLayerPreprocess } from '@/cv/preprocess/layer-preprocess'
import type { LayerContext } from '@/cv/layers/types'
import type { CanvasLike } from '@/cv/port/canvasEnv'

const ROOM_REFERENCE_LAYER_TUNE = {
  adjustBrightnessContrastEnabled: true,
  brightness: 50,
  contrast: 1,
  thresholdEnabled: true,
  colorThresholdEnabled: true,
  thresholdMode: 'otsu' as const,
  useAdaptive: false,
  edgeAwareEdgeBoost: 0,
  smoothLinesEnabled: false,
  smoothLines: 1,
  removeSpecklesEnabled: true,
  removeHolesEnabled: false,
  removeHolesMaxPx: 15,
  /**
   * Prefilter thicken staat in buildRoomReferencePreprocess op true (REF × factor).
   * Hier false zodat finalizeRoomReferenceMat niet dubbel verdikt.
   */
  thickenLinesEnabled: false,
  thickenLinesPx: 2,
  /** Morph-close: aan; px via resolveReferenceBridgeGapsPx (REF × factor). */
  bridgeGapsEnabled: true,
  bridgeGaps: 8,
  erodeLinesEnabled: false,
  erodeLinesPx: 1,
  despeckleOpen: 0,
  /**
   * Despeckle staat aan maar op 0 px: effectief een no-op. Stond hier eerder als
   * `removeSpeckles: 80`, een veldnaam die niet in PreprocessConfig bestaat en dus
   * nooit is toegepast. Ophogen verandert de detectie-uitkomst en hoort pas te
   * gebeuren als er E2E-fixtures zijn om dat te meten.
   */
  despeckleMinPx: 0,
} satisfies Partial<PreprocessConfig>

/** Solid 0.15×REF / open 0.25×REF — geen cap. Fallback zonder REF = 2. */
export function resolveReferencePrefilterThickenPx(
  referenceWallThicknessPx?: number,
  wallStyle?: 'solid' | 'open',
): number {
  if (!referenceWallThicknessPx || referenceWallThicknessPx <= 0) {
    return ROOM_REFERENCE_LAYER_TUNE.thickenLinesPx ?? 2
  }
  const factor = wallStyle === 'open' ? 0.25 : 0.15
  return Math.max(0, Math.round(referenceWallThicknessPx * factor))
}

/** Solid 0.2×REF / open 0.3×REF — geen cap. Fallback zonder REF = 8. */
export function resolveReferenceBridgeGapsPx(
  referenceWallThicknessPx?: number,
  wallStyle?: 'solid' | 'open',
): number {
  if (!referenceWallThicknessPx || referenceWallThicknessPx <= 0) {
    return ROOM_REFERENCE_LAYER_TUNE.bridgeGaps ?? 8
  }
  const factor = wallStyle === 'open' ? 0.3 : 0.2
  return Math.max(0, Math.round(referenceWallThicknessPx * factor))
}

export function resolveReferenceRemoveHolesPx(
  referenceWallThicknessPx?: number,
  wallStyle?: 'solid' | 'open',
): number {
  if (!referenceWallThicknessPx || referenceWallThicknessPx <= 0) {
    return ROOM_REFERENCE_LAYER_TUNE.removeHolesMaxPx ?? 15
  }
  // Open walls hebben dunnere lijnstructuren; te hoge hole-fill trekt vloerpartijen
  // de muurclassificatie in. Solid walls mogen iets ruimer dichten.
  const factor = wallStyle === 'open' ? 0.5 : 0.45
  const min = 16
  const max = wallStyle === 'open' ? 42 : 44
  const scaled = Math.round(referenceWallThicknessPx * factor)
  return Math.min(max, Math.max(min, scaled))
}

function buildRoomReferencePreprocess(
  preprocess: PreprocessConfig,
  referenceWallThicknessPx?: number,
  wallStyle?: 'solid' | 'open',
): PreprocessConfig {
  const wallPreprocess = resolveLayerPreprocess(preprocess, 'walls')
  return {
    ...wallPreprocess,
    ...ROOM_REFERENCE_LAYER_TUNE,
    removeHolesMaxPx: resolveReferenceRemoveHolesPx(referenceWallThicknessPx, wallStyle),
    thickenLinesEnabled: true,
    thickenLinesPx: resolveReferencePrefilterThickenPx(referenceWallThicknessPx, wallStyle),
    bridgeGapsEnabled: true,
    bridgeGaps: resolveReferenceBridgeGapsPx(referenceWallThicknessPx, wallStyle),
  }
}

/** Otsu + REF-geschaalde bridge/thicken voor ink-coverage classify. */
export function buildRoomReferenceMat(params: {
  cv: OpenCV
  image: HTMLCanvasElement | HTMLImageElement | OffscreenCanvas
  eraserMask?: Uint8Array
  preprocess: PreprocessConfig
  referenceWallThicknessPx?: number
  wallStyle?: 'solid' | 'open'
  /** Hergebruik grijswaarden uit classify (scheelt volledige image→gray pass). */
  sharedGrayscale?: OpenCV['Mat']
}) {
  const layerCtx: LayerContext = {
    cv: params.cv,
    image: params.image,
    examples: [],
    eraserMask: params.eraserMask,
    preprocess: buildRoomReferencePreprocess(
      params.preprocess,
      params.referenceWallThicknessPx,
      params.wallStyle,
    ),
  }
  if (params.sharedGrayscale) {
    return runPreprocessLayerFromGrayscale(layerCtx, params.sharedGrayscale)
  }
  return runPreprocessLayer(layerCtx)
}

/** Finale lijnverdikking + preview-canvas. */
export function finalizeRoomReferenceMat(cv: OpenCV, mat: OpenCV['Mat']): CanvasLike {
  if (ROOM_REFERENCE_LAYER_TUNE.thickenLinesEnabled) {
    thickenLines(cv, mat, ROOM_REFERENCE_LAYER_TUNE.thickenLinesPx)
  }
  return matToCanvas(cv, mat)
}
