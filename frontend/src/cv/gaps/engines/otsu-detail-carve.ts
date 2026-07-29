/**
 * Detail-mode: Otsu-wit alleen in gaten-zwart carveën.
 * Wit op de gaten-laag blijft wit — Otsu mag geen zwart bijschilderen.
 */

import type { OpenCV } from '@/cv/loadOpenCV'

const WHITE = 255
const DEFAULT_INK_MAX = 127

export type GapsInkMode = 'solid' | 'detail'

/**
 * Pure: waar gaps zwart (inkt) is en Otsu wit, wordt gaps wit.
 * Andere pixels ongewijzigd (inclusief wit op gaps).
 */
export function carveOtsuWhiteIntoGapsBlack(
  gapsData: Uint8Array,
  otsuData: Uint8Array,
  inkMaxValue: number = DEFAULT_INK_MAX,
): Uint8Array {
  if (gapsData.length !== otsuData.length) {
    throw new Error('carveOtsuWhiteIntoGapsBlack: length mismatch')
  }
  const out = new Uint8Array(gapsData)
  for (let i = 0; i < out.length; i += 1) {
    if (out[i] <= inkMaxValue && otsuData[i] > inkMaxValue) {
      out[i] = WHITE
    }
  }
  return out
}

/** In-place op gapsMat (CV_8UC1); otsuMat blijft onaangetast. */
export function carveOtsuWhiteIntoGapsMat(
  gapsMat: OpenCV['Mat'],
  otsuMat: OpenCV['Mat'],
  inkMaxValue: number = DEFAULT_INK_MAX,
): void {
  if (gapsMat.rows !== otsuMat.rows || gapsMat.cols !== otsuMat.cols) {
    throw new Error('carveOtsuWhiteIntoGapsMat: size mismatch')
  }
  if (gapsMat.channels() !== 1 || otsuMat.channels() !== 1) {
    throw new Error('carveOtsuWhiteIntoGapsMat: both mats must be single-channel')
  }
  const carved = carveOtsuWhiteIntoGapsBlack(
    gapsMat.data as Uint8Array,
    otsuMat.data as Uint8Array,
    inkMaxValue,
  )
  ;(gapsMat.data as Uint8Array).set(carved)
}
