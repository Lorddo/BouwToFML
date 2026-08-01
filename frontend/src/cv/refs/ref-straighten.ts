import type { OpenCV } from '@/cv/loadOpenCV'
import { readRgbaMatFromCanvas, type CanvasLike } from '@/cv/port/canvasEnv'
import { matToCanvas } from '@/cv/port/preprocess'
import { rotateMatExpandBounds } from '@/cv/tools/rotateMat'
import type { RefLine } from './types'
import { bwDataToCanvas } from './ref-crop-bw'
import {
  estimateDoorWallDeskewFromInk,
  orientDoorHeaviestFaceToBottom,
  resolveDoorNeed90Cw,
  resolveDoorWallYMax,
} from './ref-door-orient'
import { classifyRawSegments, extractRawInkSegments } from './ref-ink-vectors'
import { rotateBwData90Cw, rotateCanvas180, rotateCanvas90Cw } from './ref-orient'

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

/**
 * @deprecated Gebruik `orientDoorHeaviestFaceToBottom` — behouden als alias voor callers/tests.
 * LBE-conventie: zwaarste wit-vlak (swing) onderaan.
 */
export function orientDoorBwSwingToBottom(
  bwData: Uint8Array,
  width: number,
  height: number,
): { bwData: Uint8Array; width: number; height: number; rotated180: boolean } {
  return orientDoorHeaviestFaceToBottom(bwData, width, height)
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

type StraightenState = {
  bwData: Uint8Array
  width: number
  height: number
  originalCanvas: CanvasLike
}

/**
 * Deur-canon ontdekken (hoek niet vooraf bekend):
 * muuras → eventueel 90° CW → draaivlak onder (180°) → deskew op muur-band.
 */
function straightenDoorRefLast(params: {
  cv: OpenCV
  bwData: Uint8Array
  width: number
  height: number
  originalCanvas: CanvasLike
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
  let state: StraightenState = {
    bwData: params.bwData,
    width: params.width,
    height: params.height,
    originalCanvas: params.originalCanvas,
  }

  let rotationCw90 = 0
  const need90 = resolveDoorNeed90Cw({
    bwData: state.bwData,
    width: state.width,
    height: state.height,
  })
  if (need90.need90) {
    const rotated = rotateBwData90Cw(state.bwData, state.width, state.height)
    state = {
      bwData: rotated.data,
      width: rotated.width,
      height: rotated.height,
      originalCanvas: rotateCanvas90Cw(state.originalCanvas),
    }
    rotationCw90 = 1
  }

  let rotated180 = false
  const oriented = orientDoorHeaviestFaceToBottom(state.bwData, state.width, state.height)
  if (oriented.rotated180) {
    state = {
      bwData: oriented.bwData,
      width: oriented.width,
      height: oriented.height,
      originalCanvas: rotateCanvas180(state.originalCanvas),
    }
    rotated180 = true
  }

  // Deskew ná canon: muur-band = boven het draaivlak (niet vaste 55%-crop).
  const wallYMax = resolveDoorWallYMax({
    bwData: state.bwData,
    width: state.width,
    height: state.height,
  })
  const rawSegments = extractRawInkSegments({
    cv: params.cv,
    bwData: state.bwData,
    width: state.width,
    height: state.height,
  })
  const allLines = classifyRawSegments({
    segments: rawSegments,
    orientation: 'horizontal',
    minLengthPx: 8,
  }).filter((line) => line.relation !== 'arc')
  const wallLines = allLines.filter((line) => (line.a.y + line.b.y) / 2 < wallYMax)
  let deskew = estimateDeskewCorrectionFromLines(
    wallLines.length >= 2 ? wallLines : allLines.filter((l) => (l.a.y + l.b.y) / 2 < wallYMax),
    'horizontal',
    5,
    {
      preferParallel: true,
      minAbsDeg: 0.35,
      minLengthPx: 8,
    },
  )
  // Lijnen ontbreken vaak op dikke muur-blobs → PCA op muur-inkt.
  if (Math.abs(deskew) < 0.35) {
    deskew = estimateDoorWallDeskewFromInk({
      bwData: state.bwData,
      width: state.width,
      height: state.height,
      wallYMax,
      maxAbsDeg: 8,
      minAbsDeg: 0.35,
    })
  }
  if (Math.abs(deskew) >= 0.35) {
    state = rotateByDegrees({
      cv: params.cv,
      bwData: state.bwData,
      width: state.width,
      height: state.height,
      originalCanvas: state.originalCanvas,
      correctionDeg: deskew,
    })
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
  if (params.kind === 'door') {
    return straightenDoorRefLast({
      cv: params.cv,
      bwData: params.bwData,
      width: params.width,
      height: params.height,
      originalCanvas: params.originalCanvas,
    })
  }

  // ESC:REF-03 (A)
  // Openingen: as recht houden > micro-deskew. Korte kozijnen + aliasing geven
  // vaak ~0.5–1° valse skew; PCA op asymmetrische eindstukken maakt het erger.
  const isOpening = params.kind === 'window'
  let deskew = estimateDeskewCorrectionFromLines(params.lines, params.orientation, 5, {
    preferParallel: isOpening,
    minAbsDeg: isOpening ? 0.25 : 0.15,
    minLengthPx: isOpening ? 8 : 4,
  })
  if (params.kind === 'window' && Math.abs(deskew) < 0.15) {
    // Alleen bij duidelijke scheefstand; micro-PCA (<~1°) maakt horizontale ramen schuin.
    const pcaDeskew = estimateDeskewCorrectionFromInkPca(
      params.bwData,
      params.width,
      params.height,
      params.orientation,
      8,
    )
    if (Math.abs(pcaDeskew) >= 1.0) deskew = pcaDeskew
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

  const totalCorrectionDeg = deskew + rotationCw90 * 90
  return {
    ...state,
    correctionDeg: deskew,
    rotationCw90,
    rotated180: false,
    totalCorrectionDeg,
  }
}
