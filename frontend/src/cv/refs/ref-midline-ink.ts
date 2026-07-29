import { findKozijnPostsAlongX } from './ref-blob'
import type { RefBBox } from './types'

function isInk(value: number): boolean {
  return value < 128
}

export type MidlineInkResult = {
  hasMidline: boolean
  spanPx: number
  y: number
  xStart: number
  xEnd: number
  /** 1 = beschermde inktpixel (middenlijn) */
  mask: Uint8Array
}

const emptyResult = (width: number, height: number): MidlineInkResult => ({
  hasMidline: false,
  spanPx: 0,
  y: 0,
  xStart: 0,
  xEnd: 0,
  mask: new Uint8Array(width * height),
})

/**
 * Horizontale inktlijn in het midden van een opening (bestek / passage-deur).
 * Alleen bedoeld voor deuren zonder draaicirkel.
 */
export function detectMidlineInk(params: {
  data: Uint8Array
  width: number
  height: number
  bbox: RefBBox
  orientation?: 'horizontal' | 'vertical'
}): MidlineInkResult {
  const { data, width, height, bbox } = params
  const orientation = params.orientation ?? 'horizontal'
  if (orientation !== 'horizontal') return emptyResult(width, height)

  const posts = findKozijnPostsAlongX(data, width, height, bbox)
  let innerLeft: number
  let innerRight: number

  if (posts.length >= 2) {
    innerLeft = posts[0]!.end + 1
    innerRight = posts[posts.length - 1]!.start - 1
  } else {
    const x0 = Math.max(0, Math.floor(bbox.x))
    const x1 = Math.min(width, Math.ceil(bbox.x + bbox.width))
    const margin = Math.max(2, Math.round((x1 - x0) * 0.12))
    innerLeft = x0 + margin
    innerRight = x1 - margin - 1
  }

  const gap = innerRight - innerLeft + 1
  if (gap < 6) return emptyResult(width, height)

  const y0 = Math.max(0, Math.floor(bbox.y))
  const y1 = Math.min(height, Math.ceil(bbox.y + bbox.height))
  const scanY0 = y0 + 1
  const scanY1 = y1 - 2
  if (scanY1 < scanY0) return emptyResult(width, height)

  let bestSpan = 0
  let bestY = scanY0
  let bestX0 = 0
  let bestX1 = 0

  const considerRun = (y: number, runStart: number, runEnd: number) => {
    const span = runEnd - runStart + 1
    if (span > bestSpan) {
      bestSpan = span
      bestY = y
      bestX0 = runStart
      bestX1 = runEnd
    }
  }

  for (let y = scanY0; y <= scanY1; y += 1) {
    let runStart: number | null = null
    for (let x = innerLeft; x <= innerRight; x += 1) {
      if (isInk(data[y * width + x] ?? 255)) {
        if (runStart === null) runStart = x
      } else if (runStart !== null) {
        considerRun(y, runStart, x - 1)
        runStart = null
      }
    }
    if (runStart !== null) considerRun(y, runStart, innerRight)
  }

  const minSpan = Math.max(4, Math.round(gap * 0.28))
  if (bestSpan < minSpan) return emptyResult(width, height)

  const mask = new Uint8Array(width * height)
  const thick = 1
  for (let dy = -thick; dy <= thick; dy += 1) {
    const yy = bestY + dy
    if (yy < 0 || yy >= height) continue
    for (let x = bestX0; x <= bestX1; x += 1) {
      if (isInk(data[yy * width + x] ?? 255)) mask[yy * width + x] = 1
    }
  }

  return {
    hasMidline: true,
    spanPx: bestSpan,
    y: bestY,
    xStart: bestX0,
    xEnd: bestX1,
    mask,
  }
}
