import type { PreprocessConfig } from '@/core/extraction/types'
import type { OpenCV } from '@/cv/loadOpenCV'
import { runPreprocessLayer, runPreprocessLayerFromGrayscale } from '@/cv/layers/preprocess-layer'
import { thickenLines } from '@/cv/port/cleanBinary'
import { matToCanvas } from '@/cv/port/preprocess'
import type { LayerContext } from '@/cv/layers/types'
import type { CanvasLike } from '@/cv/port/canvasEnv'

/**
 * Eigen Otsu-recept vanaf kleur-origineel — deelt geen wallLayer preBinarize/adaptive.
 * Rotatie/eraser komen van de caller; hole-fill/thicken/bridge schalen op REF.
 */
const ROOM_REFERENCE_LAYER_TUNE = {
  adjustBrightnessContrastEnabled: true,
  brightness: 50,
  contrast: 1,
  thresholdEnabled: true,
  colorThresholdEnabled: true,
  thresholdMode: 'otsu' as const,
  useAdaptive: false,
  preBinarizeEnabled: false,
  edgeAwareEdgeBoost: 0,
  smoothLinesEnabled: false,
  smoothLines: 1,
  removeSpecklesEnabled: true,
  removeHolesEnabled: true,
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

export const ROOM_REFERENCE_THICKEN_FACTOR = { solid: 0.1, open: 0.1 } as const
export const ROOM_REFERENCE_BRIDGE_FACTOR = { solid: 0.15, open: 0.2 } as const
export const ROOM_REFERENCE_HOLE_FILL_FACTOR = { solid: 0.2, open: 0.3 } as const

function resolveWallStyle(wallStyle?: 'solid' | 'open'): 'solid' | 'open' {
  return wallStyle === 'solid' ? 'solid' : 'open'
}

/** Solid/open 0.1×REF — geen cap. Fallback zonder REF = 2. */
export function resolveReferencePrefilterThickenPx(
  referenceWallThicknessPx?: number,
  wallStyle?: 'solid' | 'open',
): number {
  if (!referenceWallThicknessPx || referenceWallThicknessPx <= 0) {
    return ROOM_REFERENCE_LAYER_TUNE.thickenLinesPx ?? 2
  }
  const factor = ROOM_REFERENCE_THICKEN_FACTOR[resolveWallStyle(wallStyle)]
  return Math.max(0, Math.round(referenceWallThicknessPx * factor))
}

/** Solid 0.15×REF / open 0.2×REF — geen cap. Fallback zonder REF = 8. */
export function resolveReferenceBridgeGapsPx(
  referenceWallThicknessPx?: number,
  wallStyle?: 'solid' | 'open',
): number {
  if (!referenceWallThicknessPx || referenceWallThicknessPx <= 0) {
    return ROOM_REFERENCE_LAYER_TUNE.bridgeGaps ?? 8
  }
  const factor = ROOM_REFERENCE_BRIDGE_FACTOR[resolveWallStyle(wallStyle)]
  return Math.max(0, Math.round(referenceWallThicknessPx * factor))
}

/** Solid 0.2×REF / open 0.3×REF — ruwe px, geen cap. Fallback zonder REF = 15. */
export function resolveReferenceRemoveHolesPx(
  referenceWallThicknessPx?: number,
  wallStyle?: 'solid' | 'open',
): number {
  if (!referenceWallThicknessPx || referenceWallThicknessPx <= 0) {
    return ROOM_REFERENCE_LAYER_TUNE.removeHolesMaxPx ?? 15
  }
  const factor = ROOM_REFERENCE_HOLE_FILL_FACTOR[resolveWallStyle(wallStyle)]
  return Math.max(0, Math.round(referenceWallThicknessPx * factor))
}

/** UI + engine: zelfde px als `buildRoomReferenceMat`. */
export function describeRoomReferenceTune(params: {
  referenceWallThicknessPx?: number | null
  wallStyle?: 'solid' | 'open'
}): {
  style: 'solid' | 'open'
  hasRef: boolean
  refPx: number | null
  brightness: number
  contrast: number
  thickenPx: number
  thickenFactor: number
  bridgePx: number
  bridgeFactor: number
  holeFillPx: number
  holeFillFactor: number
} {
  const style = resolveWallStyle(params.wallStyle)
  const ref =
    params.referenceWallThicknessPx != null && params.referenceWallThicknessPx > 0
      ? params.referenceWallThicknessPx
      : undefined
  return {
    style,
    hasRef: ref != null,
    refPx: ref != null ? Math.round(ref) : null,
    brightness: ROOM_REFERENCE_LAYER_TUNE.brightness ?? 50,
    contrast: ROOM_REFERENCE_LAYER_TUNE.contrast ?? 1,
    thickenPx: resolveReferencePrefilterThickenPx(ref, style),
    thickenFactor: ROOM_REFERENCE_THICKEN_FACTOR[style],
    bridgePx: resolveReferenceBridgeGapsPx(ref, style),
    bridgeFactor: ROOM_REFERENCE_BRIDGE_FACTOR[style],
    holeFillPx: resolveReferenceRemoveHolesPx(ref, style),
    holeFillFactor: ROOM_REFERENCE_HOLE_FILL_FACTOR[style],
  }
}

function buildRoomReferencePreprocess(
  preprocess: PreprocessConfig,
  referenceWallThicknessPx?: number,
  wallStyle?: 'solid' | 'open',
): PreprocessConfig {
  // Eigen flow: geen wallLayer-preBinarize/adaptive — alleen rotatie + Otsu-tune.
  return {
    ...preprocess,
    ...ROOM_REFERENCE_LAYER_TUNE,
    preBinarizeEnabled: false,
    useAdaptive: false,
    thresholdMode: 'otsu',
    removeHolesEnabled: true,
    removeHolesMaxPx: resolveReferenceRemoveHolesPx(referenceWallThicknessPx, wallStyle),
    thickenLinesEnabled: true,
    thickenLinesPx: resolveReferencePrefilterThickenPx(referenceWallThicknessPx, wallStyle),
    bridgeGapsEnabled: true,
    bridgeGaps: resolveReferenceBridgeGapsPx(referenceWallThicknessPx, wallStyle),
    wallStyle: wallStyle ?? preprocess.wallStyle,
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
