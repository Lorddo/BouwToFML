import type { WallRenderStyle } from '@/core/extraction/geometric-signature'
import { cropBwBytesFromRect } from './ref-crop-bw'
import { buildFaceProfile } from './ref-face-profile'
import {
  classifyWallRenderStyleFromFaceCount,
  wallRenderStyleToGapsInkMode,
} from './ref-wall-render-style'
import type { GapsInkMode } from '@/cv/gaps'
import type { RefRect } from './types'

export type WallRefStyleClassification = {
  faceCount: number
  renderStyle: WallRenderStyle
  gapsInkMode: GapsInkMode
  confidence: number
}

function classifyFromCropBw(
  bwData: Uint8Array,
  width: number,
  height: number,
): WallRefStyleClassification {
  const faceProfile = buildFaceProfile(bwData, width, height, undefined, {
    sealBorders: true,
    minAreaPx: 4,
  })
  const inference = classifyWallRenderStyleFromFaceCount(faceProfile.faceCount)
  return {
    faceCount: faceProfile.faceCount,
    renderStyle: inference.renderStyle,
    gapsInkMode: wallRenderStyleToGapsInkMode(inference.renderStyle),
    confidence: inference.confidence,
  }
}

/**
 * Muurstijl uit face-count op post-bake `baseBw` (gebakken inkt mee; geen OCR).
 */
export function classifyWallRefStyleFromBw(params: {
  bw: Uint8Array
  width: number
  height: number
  rect: RefRect
}): WallRefStyleClassification {
  const crop = cropBwBytesFromRect({
    bw: params.bw,
    width: params.width,
    height: params.height,
    rect: params.rect,
  })
  return classifyFromCropBw(crop.data, crop.width, crop.height)
}
