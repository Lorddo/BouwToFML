import type { PreprocessConfig } from '@/core/extraction/types'
import type { OpenCV } from '@/cv/loadOpenCV'
import { runPreprocessLayer, runPreprocessLayerFromGrayscale } from '@/cv/layers/preprocess-layer'
import { thickenLines } from '@/cv/port/cleanBinary'
import { matToCanvas } from '@/cv/port/preprocess'
import { resolveLayerPreprocess } from '@/cv/preprocess/layer-preprocess'
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
  removeSpeckles: 80,
  removeHolesEnabled: false,
  removeHolesMaxPx: 15,
  thickenLinesEnabled: false,
  thickenLinesPx: 10,
  /** Topologie via resolveInkBetweenFaces — niet bridgeGaps op referentielaag. */
  bridgeGapsEnabled: true,
  bridgeGaps: 8,
  erodeLinesEnabled: false,
  erodeLinesPx: 1,
  despeckleOpen: 0,
  despeckleMinPx: 0,
} satisfies Partial<PreprocessConfig>

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

function resolveReferencePrefilterThickenPx(
  referenceWallThicknessPx?: number,
  wallStyle?: 'solid' | 'open',
): number {
  if (!referenceWallThicknessPx || referenceWallThicknessPx <= 0) return 2
  const factor = wallStyle === 'open' ? 0.08 : 0.1
  const min = 2
  const max = wallStyle === 'open' ? 6 : 7
  return Math.min(max, Math.max(min, Math.round(referenceWallThicknessPx * factor)))
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
  }
}

/** Otsu + gatenvullen + lichte lijnverdikking vóór finale thicken. */
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
  const layerCtx = {
    cv: params.cv,
    image: params.image,
    examples: [] as unknown[],
    eraserMask: params.eraserMask,
    preprocess: {
      ...buildRoomReferencePreprocess(
        params.preprocess,
        params.referenceWallThicknessPx,
        params.wallStyle,
      ),
      thickenLinesEnabled: true,
      thickenLinesPx: resolveReferencePrefilterThickenPx(
        params.referenceWallThicknessPx,
        params.wallStyle,
      ),
    },
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
