import type { WindowSizeRange2d } from './types'

const DEFAULT_MARGIN_RATIO = 0.4

function clampNonNegative(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, value)
}

/** ±marge op absolute px-maten; output blijft absolute tot `normalizeSizeRange`. */
export function expandSizeRange(
  minWidthPx: number,
  minHeightPx: number,
  maxWidthPx: number,
  maxHeightPx: number,
  marginRatio = DEFAULT_MARGIN_RATIO,
): WindowSizeRange2d {
  const clampedMargin = Math.max(0, marginRatio)
  const minW = Math.min(minWidthPx, maxWidthPx)
  const maxW = Math.max(minWidthPx, maxWidthPx)
  const minH = Math.min(minHeightPx, maxHeightPx)
  const maxH = Math.max(minHeightPx, maxHeightPx)
  return {
    minWidth: clampNonNegative(minW * (1 - clampedMargin)),
    minHeight: clampNonNegative(minH * (1 - clampedMargin)),
    maxWidth: clampNonNegative(maxW * (1 + clampedMargin)),
    maxHeight: clampNonNegative(maxH * (1 + clampedMargin)),
  }
}

/** Deel absolute px-range door as-band → schaal-invariante ref-ratios. */
export function normalizeSizeRange(
  range: WindowSizeRange2d,
  axisBandHeightPx: number,
): WindowSizeRange2d {
  const denom = Math.max(1, axisBandHeightPx)
  return {
    minWidth: range.minWidth / denom,
    minHeight: range.minHeight / denom,
    maxWidth: range.maxWidth / denom,
    maxHeight: range.maxHeight / denom,
  }
}

/** Ratio-range × lokale as-band → px-band voor matching op plan-faces. */
export function denormalizeSizeRange(
  range: WindowSizeRange2d,
  localAxisBandPx: number,
): WindowSizeRange2d {
  const scale = Math.max(1, localAxisBandPx)
  return {
    minWidth: range.minWidth * scale,
    minHeight: range.minHeight * scale,
    maxWidth: range.maxWidth * scale,
    maxHeight: range.maxHeight * scale,
  }
}

/**
 * Framing size vs ref: hoogte blijft op ref-marge; breedte mag tot
 * `minWidthRatio` × ref-min (dunne middenstijlen tussen aaneengesloten ramen).
 * Na band-check is minHeight soepeler — band dekt de hoogte-plaatsing.
 */
export function fitsFramingSizeRange(params: {
  widthPx: number
  heightPx: number
  range: WindowSizeRange2d | null
  /** Default 0.5 — 50% van gepoolde ref minWidth. */
  minWidthRatio?: number
  /** Face zat al fully-inside framing-band → minHeight niet hard afdwingen. */
  bandValidated?: boolean
}): boolean {
  const { range } = params
  if (!range) return false
  const minWidthRatio =
    typeof params.minWidthRatio === 'number' && params.minWidthRatio > 0
      ? params.minWidthRatio
      : 0.5
  const minW = range.minWidth * minWidthRatio
  // +0.5px tolerantie: 1px opening-wit CCs vs fractional denorm-min.
  if (params.widthPx + 0.5 < minW || params.widthPx > range.maxWidth) return false
  if (params.heightPx > range.maxHeight) return false
  // ESC:R-19 (A)
  if (params.bandValidated) {
    // Band dekt plaatsing; blokkeer alleen stof (<25% ref-minH).
    const softMinH = Math.max(1, range.minHeight * 0.25)
    return params.heightPx >= softMinH
  }
  return params.heightPx >= range.minHeight
}
