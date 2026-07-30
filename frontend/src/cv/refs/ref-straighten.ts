import type { OpenCV } from '@/cv/loadOpenCV'
import { readRgbaMatFromCanvas, type CanvasLike } from '@/cv/port/canvasEnv'
import { matToCanvas } from '@/cv/port/preprocess'
import { rotateMatExpandBounds } from '@/cv/tools/rotateMat'
import type { RefLine } from './types'
import { bwDataToCanvas } from './ref-crop-bw'
import { rotateBwData90Cw, rotateBwData180, rotateCanvas180, rotateCanvas90Cw } from './ref-orient'

type Orientation = 'horizontal' | 'vertical'

function foldToSigned90(angleDeg: number): number {
  let angle = angleDeg
  while (angle <= -90) angle += 180
  while (angle > 90) angle -= 180
  return angle
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
}

function weightedMedian(values: Array<{ value: number; weight: number }>): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a.value - b.value)
  const totalWeight = sorted.reduce((sum, item) => sum + Math.max(0, item.weight), 0)
  if (!(totalWeight > 0)) return median(sorted.map((item) => item.value))
  let acc = 0
  const half = totalWeight / 2
  for (const item of sorted) {
    acc += Math.max(0, item.weight)
    if (acc >= half) return item.value
  }
  return sorted[sorted.length - 1]?.value ?? 0
}

export type DeskewFromLinesOptions = {
  /** Correcties onder deze drempel → 0 (pixel-aliasing). Default 0.15. */
  minAbsDeg?: number
  /**
   * Alleen `relation === 'parallel'` meenemen als er ≥2 zijn.
   * Voorkomt dat korte kozijn-stijlen de as scheef trekken.
   */
  preferParallel?: boolean
  /** Minimale lijnlengte in px. Default 4. */
  minLengthPx?: number
}

export function estimateDeskewCorrectionFromLines(
  lines: RefLine[],
  orientation: Orientation,
  maxAbsDeg = 5,
  options?: DeskewFromLinesOptions,
): number {
  const minAbsDeg = options?.minAbsDeg ?? 0.15
  const minLengthPx = options?.minLengthPx ?? 4
  const axisDeg = orientation === 'horizontal' ? 0 : 90
  const samples: Array<{ value: number; weight: number }> = []
  let pool = lines
    .filter((line) => line.lengthPx >= minLengthPx)
    .sort((a, b) => b.lengthPx - a.lengthPx)
  if (options?.preferParallel) {
    const parallel = pool.filter((line) => line.relation === 'parallel')
    if (parallel.length >= 2) pool = parallel
  }
  const candidates = pool.slice(0, 64)

  for (const line of candidates) {
    const deltaMain = foldToSigned90(line.angleDeg - axisDeg)
    // Openingen (preferParallel): alleen afwijking t.o.v. de hoofdas.
    // Muren: dichtstbijzijnde as (H of V), zodat lange loodrechte randen meehelpen.
    let bestDelta = deltaMain
    if (!options?.preferParallel || line.relation !== 'parallel') {
      const deltaPerp = foldToSigned90(line.angleDeg - (axisDeg + 90))
      bestDelta = Math.abs(deltaMain) <= Math.abs(deltaPerp) ? deltaMain : deltaPerp
    }
    if (Math.abs(bestDelta) > 35) continue
    samples.push({
      value: bestDelta,
      weight: Math.max(1, line.lengthPx),
    })
  }

  if (samples.length < 2) return 0
  const correction = -weightedMedian(samples)
  if (!Number.isFinite(correction)) return 0
  const clamped = Math.max(-maxAbsDeg, Math.min(maxAbsDeg, correction))
  return Math.abs(clamped) < minAbsDeg ? 0 : clamped
}

function estimateDeskewCorrectionFromInkPca(
  data: Uint8Array,
  width: number,
  height: number,
  orientation: Orientation,
  maxAbsDeg = 8,
): number {
  let count = 0
  let sumX = 0
  let sumY = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((data[y * width + x] ?? 255) >= 128) continue
      count += 1
      sumX += x
      sumY += y
    }
  }
  if (count < 25) return 0

  const meanX = sumX / count
  const meanY = sumY / count
  let cxx = 0
  let cxy = 0
  let cyy = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((data[y * width + x] ?? 255) >= 128) continue
      const dx = x - meanX
      const dy = y - meanY
      cxx += dx * dx
      cxy += dx * dy
      cyy += dy * dy
    }
  }
  if (cxx <= 0 && cyy <= 0) return 0

  const axisDeg = orientation === 'horizontal' ? 0 : 90
  const pcaAxisDeg = (0.5 * Math.atan2(2 * cxy, cxx - cyy) * 180) / Math.PI
  const residual = foldToSigned90(pcaAxisDeg - axisDeg)
  if (Math.abs(residual) > 12) return 0
  const correction = -residual
  if (!Number.isFinite(correction)) return 0
  const clamped = Math.max(-maxAbsDeg, Math.min(maxAbsDeg, correction))
  return Math.abs(clamped) < 0.2 ? 0 : clamped
}

function inkSpan(
  data: Uint8Array,
  width: number,
  height: number,
): { horizontal: number; vertical: number } {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((data[y * width + x] ?? 255) >= 128) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < minX || maxY < minY) return { horizontal: width, vertical: height }
  return { horizontal: maxX - minX + 1, vertical: maxY - minY + 1 }
}

function bandInk(data: Uint8Array, width: number, y0: number, y1: number): number {
  const ya = Math.max(0, Math.floor(y0))
  const yb = Math.max(ya, Math.floor(y1))
  let count = 0
  for (let y = ya; y < yb; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((data[y * width + x] ?? 255) < 128) count += 1
    }
  }
  return count
}

/**
 * LBE-conventie: swing-inkt onderaan de crop (anders 180°).
 * Gebruikt door `straightenRefLast` (deur) — Stage-1 bands gaan via
 * `runRefStages` → deze straighten, daarna pas swing-pick.
 */
export function orientDoorBwSwingToBottom(
  bwData: Uint8Array,
  width: number,
  height: number,
): { bwData: Uint8Array; width: number; height: number; rotated180: boolean } {
  if (height < 8 || width < 8) {
    return { bwData, width, height, rotated180: false }
  }
  const topInk = bandInk(bwData, width, 0, height * 0.45)
  const bottomInk = bandInk(bwData, width, height * 0.55, height)
  if (bottomInk > topInk * 1.08) {
    const rotated = rotateBwData180(bwData, width, height)
    return { bwData: rotated.data, width: rotated.width, height: rotated.height, rotated180: true }
  }
  return { bwData, width, height, rotated180: false }
}

function rotateByDegrees(params: {
  cv: OpenCV
  bwData: Uint8Array
  width: number
  height: number
  originalCanvas: CanvasLike
  correctionDeg: number
}): {
  bwData: Uint8Array
  width: number
  height: number
  originalCanvas: CanvasLike
} {
  if (Math.abs(params.correctionDeg) < 0.01) {
    return {
      bwData: params.bwData,
      width: params.width,
      height: params.height,
      originalCanvas: params.originalCanvas,
    }
  }

  const bwCanvas = bwDataToCanvas(params.bwData, params.width, params.height)
  const bwRgba = readRgbaMatFromCanvas(params.cv, bwCanvas)
  const bwMat = new params.cv.Mat()
  params.cv.cvtColor(bwRgba, bwMat, params.cv.COLOR_RGBA2GRAY, 0)
  bwRgba.delete()
  const rotatedBw = rotateMatExpandBounds(params.cv, bwMat, params.correctionDeg)
  params.cv.threshold(rotatedBw, rotatedBw, 127, 255, params.cv.THRESH_BINARY)
  const rotatedBwData = new Uint8Array(rotatedBw.rows * rotatedBw.cols)
  rotatedBwData.set(rotatedBw.data as Uint8Array)
  rotatedBw.delete()

  const originalRgba = readRgbaMatFromCanvas(params.cv, params.originalCanvas)
  const rotatedOriginal = rotateMatExpandBounds(params.cv, originalRgba, params.correctionDeg)
  const canvas = matToCanvas(params.cv, rotatedOriginal)
  rotatedOriginal.delete()

  return {
    bwData: rotatedBwData,
    width: canvas.width,
    height: canvas.height,
    originalCanvas: canvas,
  }
}

export function straightenRefLast(params: {
  cv: OpenCV
  kind: 'wall' | 'door' | 'window'
  bwData: Uint8Array
  width: number
  height: number
  originalCanvas: CanvasLike
  lines: RefLine[]
  orientation: Orientation
}): {
  bwData: Uint8Array
  width: number
  height: number
  originalCanvas: CanvasLike
  correctionDeg: number
  rotationCw90: number
  rotated180: boolean
  totalCorrectionDeg: number
} {
  // ESC:REF-03 (A)
  // Openingen: as recht houden > micro-deskew. Korte kozijnen + aliasing geven
  // vaak ~0.5–1° valse skew; PCA op asymmetrische eindstukken maakt het erger.
  const isOpening = params.kind === 'door' || params.kind === 'window'
  let deskew = estimateDeskewCorrectionFromLines(params.lines, params.orientation, 5, {
    preferParallel: isOpening,
    minAbsDeg: isOpening ? 1.25 : 0.15,
    minLengthPx: isOpening ? 8 : 4,
  })
  if (params.kind === 'window' && Math.abs(deskew) < 0.15) {
    // Alleen bij duidelijke scheefstand; micro-PCA (<~2°) maakt horizontale ramen schuin.
    const pcaDeskew = estimateDeskewCorrectionFromInkPca(
      params.bwData,
      params.width,
      params.height,
      params.orientation,
      8,
    )
    if (Math.abs(pcaDeskew) >= 2.5) deskew = pcaDeskew
  }
  let state = rotateByDegrees({
    cv: params.cv,
    bwData: params.bwData,
    width: params.width,
    height: params.height,
    originalCanvas: params.originalCanvas,
    correctionDeg: deskew,
  })

  let rotationCw90 = 0
  let rotated180 = false
  const span = inkSpan(state.bwData, state.width, state.height)
  if (span.vertical > span.horizontal * 1.12) {
    const rotated = rotateBwData90Cw(state.bwData, state.width, state.height)
    state = {
      bwData: rotated.data,
      width: rotated.width,
      height: rotated.height,
      originalCanvas: rotateCanvas90Cw(state.originalCanvas),
    }
    rotationCw90 = 1
  }

  if (params.kind === 'door') {
    const oriented = orientDoorBwSwingToBottom(state.bwData, state.width, state.height)
    if (oriented.rotated180) {
      state = {
        bwData: oriented.bwData,
        width: oriented.width,
        height: oriented.height,
        originalCanvas: rotateCanvas180(state.originalCanvas),
      }
      rotated180 = true
    }
  }

  const totalCorrectionDeg = deskew + rotationCw90 * 90 + (rotated180 ? 180 : 0)
  return {
    ...state,
    correctionDeg: deskew,
    rotationCw90,
    rotated180,
    totalCorrectionDeg,
  }
}
