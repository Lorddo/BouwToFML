import type { BoundingBox, ExampleSample } from '@/core/extraction'
import type { WallOrientation } from './wallGraph'
import { median } from '@/cv/util/stats'
import { sampleScanLines } from '@/cv/util/scanLines'

type CvMat = { cols: number; rows: number; ucharPtr: (y: number, x: number) => Uint8Array }

const DEFAULT_DARK_THRESHOLD = 245

export interface InkBandMeasure {
  thicknessPx: number
  /** Start inktband loodrecht op muur (beeldcoördinaat). */
  bandMin: number
  /** Einde inktband loodrecht op muur (inclusief). */
  bandMax: number
}

function isDark(mat: CvMat, x: number, y: number, threshold = DEFAULT_DARK_THRESHOLD): boolean {
  if (x < 0 || y < 0 || x >= mat.cols || y >= mat.rows) return false
  return mat.ucharPtr(y, x)[0] < threshold
}

/**
 * Combineer per-scanlijn metingen: mediaan dikte + mediaan center.
 * Voorkomt dat één scanlijn (maatlijn, arcering) de envelop opblaast.
 */
function aggregateLineBands(
  bands: Array<{ bandMin: number; bandMax: number; thicknessPx: number }>,
): InkBandMeasure | null {
  if (bands.length === 0) return null

  const roughMed = median(bands.map((b) => b.thicknessPx))
  const filtered =
    bands.length >= 3
      ? bands.filter(
          (b) => b.thicknessPx >= roughMed * 0.45 && b.thicknessPx <= roughMed * 2.2,
        )
      : bands
  const pool = filtered.length > 0 ? filtered : bands

  const thicknessPx = Math.max(1, Math.round(median(pool.map((b) => b.thicknessPx))))
  const center = median(pool.map((b) => (b.bandMin + b.bandMax) / 2))
  const half = (thicknessPx - 1) / 2
  const bandMin = Math.round(center - half)
  const bandMax = bandMin + thicknessPx - 1

  return { thicknessPx, bandMin, bandMax }
}

/**
 * Meet muurdikte in LBE-vak: buitenste zwart van links→rechts (of boven→onder).
 * Arcering (wit-zwart-wit-zwart) telt als één band — geen langste run.
 *
 * Op 5 scanlijnen (20–80% van de box-as), daarna mediaan dikte — geen union over lijnen.
 */
export function measureInkBandInBox(
  mat: CvMat,
  bbox: BoundingBox,
  orientation: WallOrientation,
  threshold = DEFAULT_DARK_THRESHOLD,
): InkBandMeasure | null {
  const x0 = Math.max(0, Math.floor(bbox.x))
  const y0 = Math.max(0, Math.floor(bbox.y))
  const x1 = Math.min(mat.cols, Math.ceil(bbox.x + bbox.width))
  const y1 = Math.min(mat.rows, Math.ceil(bbox.y + bbox.height))
  if (x1 <= x0 || y1 <= y0) return null

  const scanCount = 5

  if (orientation === 'vertical') {
    const yStart = y0 + Math.floor((y1 - y0) * 0.2)
    const yEnd = y1 - Math.floor((y1 - y0) * 0.2)
    const lines = sampleScanLines(yStart, yEnd, scanCount)
    const lineBands: Array<{ bandMin: number; bandMax: number; thicknessPx: number }> = []

    for (const y of lines) {
      let left: number | null = null
      let right: number | null = null
      for (let x = x0; x < x1; x += 1) {
        if (isDark(mat, x, y, threshold)) {
          left = x
          break
        }
      }
      for (let x = x1 - 1; x >= x0; x -= 1) {
        if (isDark(mat, x, y, threshold)) {
          right = x
          break
        }
      }
      if (left === null || right === null || right < left) continue
      lineBands.push({
        bandMin: left,
        bandMax: right,
        thicknessPx: right - left + 1,
      })
    }

    return aggregateLineBands(lineBands)
  }

  const xStart = x0 + Math.floor((x1 - x0) * 0.2)
  const xEnd = x1 - Math.floor((x1 - x0) * 0.2)
  const lines = sampleScanLines(xStart, xEnd, scanCount)
  const lineBands: Array<{ bandMin: number; bandMax: number; thicknessPx: number }> = []

  for (const x of lines) {
    let top: number | null = null
    let bottom: number | null = null
    for (let y = y0; y < y1; y += 1) {
      if (isDark(mat, x, y, threshold)) {
        top = y
        break
      }
    }
    for (let y = y1 - 1; y >= y0; y -= 1) {
      if (isDark(mat, x, y, threshold)) {
        bottom = y
        break
      }
    }
    if (top === null || bottom === null || bottom < top) continue
    lineBands.push({
      bandMin: top,
      bandMax: bottom,
      thicknessPx: bottom - top + 1,
    })
  }

  return aggregateLineBands(lineBands)
}

function longestDarkRunsOnScan(
  mat: CvMat,
  fixed: number,
  from: number,
  to: number,
  verticalScan: boolean,
  threshold: number,
): Array<{ start: number; end: number; length: number }> {
  const runs: Array<{ start: number; end: number; length: number }> = []
  let runStart: number | null = null

  for (let i = from; i <= to; i += 1) {
    const x = verticalScan ? fixed : i
    const y = verticalScan ? i : fixed
    const dark = isDark(mat, x, y, threshold)
    if (dark && runStart === null) {
      runStart = i
      continue
    }
    if (!dark && runStart !== null) {
      const end = i - 1
      runs.push({ start: runStart, end, length: end - runStart + 1 })
      runStart = null
    }
  }
  if (runStart !== null) {
    runs.push({ start: runStart, end: to, length: to - runStart + 1 })
  }
  return runs
}

export function measureParallelSpacingInBox(
  mat: CvMat,
  bbox: BoundingBox,
  orientation: WallOrientation,
  threshold = DEFAULT_DARK_THRESHOLD,
): number | null {
  const x0 = Math.max(0, Math.floor(bbox.x))
  const y0 = Math.max(0, Math.floor(bbox.y))
  const x1 = Math.min(mat.cols, Math.ceil(bbox.x + bbox.width))
  const y1 = Math.min(mat.rows, Math.ceil(bbox.y + bbox.height))
  if (x1 <= x0 || y1 <= y0) return null

  const scanCount = 7
  const spacings: number[] = []
  if (orientation === 'vertical') {
    const lines = sampleScanLines(
      y0 + Math.floor((y1 - y0) * 0.15),
      y1 - Math.floor((y1 - y0) * 0.15),
      scanCount,
    )
    for (const y of lines) {
      const runs = longestDarkRunsOnScan(mat, y, x0, x1 - 1, false, threshold)
        .filter((r) => r.length >= 2)
        .sort((a, b) => b.length - a.length)
      if (runs.length < 2) continue
      const a = runs[0]
      const b = runs[1]
      const centerA = (a.start + a.end) / 2
      const centerB = (b.start + b.end) / 2
      spacings.push(Math.abs(centerA - centerB))
    }
  } else {
    const lines = sampleScanLines(
      x0 + Math.floor((x1 - x0) * 0.15),
      x1 - Math.floor((x1 - x0) * 0.15),
      scanCount,
    )
    for (const x of lines) {
      const runs = longestDarkRunsOnScan(mat, x, y0, y1 - 1, true, threshold)
        .filter((r) => r.length >= 2)
        .sort((a, b) => b.length - a.length)
      if (runs.length < 2) continue
      const a = runs[0]
      const b = runs[1]
      const centerA = (a.start + a.end) / 2
      const centerB = (b.start + b.end) / 2
      spacings.push(Math.abs(centerA - centerB))
    }
  }

  if (spacings.length === 0) return null
  return Math.max(2, Math.round(median(spacings)))
}

export function bboxOrientation(sample: ExampleSample): WallOrientation {
  return sample.bbox.width >= sample.bbox.height ? 'horizontal' : 'vertical'
}

/** 2D inkt-envelop voor deuren/ramen — alle donkere pixels in LBE-vak. */
export function measureInkBBoxInBox(
  mat: CvMat,
  bbox: BoundingBox,
  threshold = DEFAULT_DARK_THRESHOLD,
): BoundingBox | null {
  const x0 = Math.max(0, Math.floor(bbox.x))
  const y0 = Math.max(0, Math.floor(bbox.y))
  const x1 = Math.min(mat.cols, Math.ceil(bbox.x + bbox.width))
  const y1 = Math.min(mat.rows, Math.ceil(bbox.y + bbox.height))
  if (x1 <= x0 || y1 <= y0) return null

  let minX = x1
  let maxX = x0
  let minY = y1
  let maxY = y0
  let found = false

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      if (!isDark(mat, x, y, threshold)) continue
      found = true
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
  }

  if (!found || maxX < minX || maxY < minY) return null
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}
