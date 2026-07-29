import { scaleMaskToSize, mergeMaskOr } from '@/cv/tools/polygon'

export interface PreprocessMaskInput {
  eraserMask?: Uint8Array | null
  ocrMask?: Uint8Array | null
  /** Al gecomposeerde muur-B/W (originele resolutie); skip OCR-merge + wall-rethreshold. */
  precomposedWallBw?: Uint8Array | null
}

export function preparePreprocessMasks(params: {
  eraserMask?: Uint8Array | null
  ocrMask?: Uint8Array | null
  /** Alleen voor detectie — previews gebruiken nooit OCR-mask. */
  includeOcrMask?: boolean
  srcWidth: number
  srcHeight: number
  dstWidth: number
  dstHeight: number
}): { eraserMask?: Uint8Array } {
  const { srcWidth, srcHeight, dstWidth, dstHeight } = params
  const sameSize = srcWidth === dstWidth && srcHeight === dstHeight

  let eraserMask = params.eraserMask ?? undefined
  let ocrMask = params.includeOcrMask ? (params.ocrMask ?? undefined) : undefined

  if (eraserMask && !sameSize) {
    eraserMask = scaleMaskToSize(eraserMask, srcWidth, srcHeight, dstWidth, dstHeight)
  }
  if (ocrMask && !sameSize) {
    ocrMask = scaleMaskToSize(ocrMask, srcWidth, srcHeight, dstWidth, dstHeight)
  }

  if (eraserMask && ocrMask) {
    const merged = new Uint8Array(eraserMask.length)
    merged.set(eraserMask)
    mergeMaskOr(merged, ocrMask)
    return { eraserMask: merged }
  }

  return { eraserMask: eraserMask ?? ocrMask }
}
