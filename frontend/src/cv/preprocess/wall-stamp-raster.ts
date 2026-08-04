/**
 * FML-muurstempel: filter → cm→px → bbox-transform → solid mask + gray raster.
 * Adaptive B/W (OpenCV) gebeurt in de caller via buildWallLayerBwMat op gray-canvas.
 */
import type { Wall, Point2D } from '@/core/fml/types'
import {
  classifyFmlThicknessBand,
  type FmlThicknessBand,
  type FmlThicknessBandBoundaries,
  DEFAULT_FML_BAND_BOUNDARIES,
} from '@/core/fml/fml-wall-thickness-tiers'
import { cmPointToImagePx } from '@/core/fml/measure-underlay-wall-thickness'
import { createCanvas, type CanvasLike } from '@/cv/port/canvasEnv'
import { WALL_BW_INK, WALL_BW_WHITE } from '@/cv/preprocess/compose-wall-bw'

export type StampBounds = { x: number; y: number; width: number; height: number }

export type StampBands = { min: boolean; mid: boolean; max: boolean }

export type StampWallPx = {
  a: Point2D
  b: Point2D
  thicknessPx: number
}

export type StampWallCm = {
  a: Point2D
  b: Point2D
  thickness: number
}

export const DEFAULT_STAMP_BANDS: StampBands = { min: false, mid: true, max: true }

/** Donkergrijs op wit — genoeg contrast voor adaptive wall-layer threshold. */
export const STAMP_GRAY_INK = 32

export function filterWallsByBands(
  walls: readonly Wall[] | readonly StampWallCm[],
  bands: StampBands,
  boundaries: FmlThicknessBandBoundaries = DEFAULT_FML_BAND_BOUNDARIES,
): StampWallCm[] {
  const out: StampWallCm[] = []
  for (const wall of walls) {
    const band: FmlThicknessBand = classifyFmlThicknessBand(wall.thickness, boundaries)
    if (!bands[band]) continue
    out.push({ a: { ...wall.a }, b: { ...wall.b }, thickness: wall.thickness })
  }
  return out
}

export function wallsCmToPx(params: {
  walls: readonly StampWallCm[]
  origin: Point2D
  pxPerMmX: number
  pxPerMmY: number
}): StampWallPx[] {
  const { walls, origin, pxPerMmX, pxPerMmY } = params
  const avg = averagePxPerMm(pxPerMmX, pxPerMmY)
  return walls.map((wall) => {
    const a = cmPointToImagePx(wall.a, origin, pxPerMmX, pxPerMmY)
    const b = cmPointToImagePx(wall.b, origin, pxPerMmX, pxPerMmY)
    const thicknessPx = Math.max(1, Math.round(wall.thickness * 10 * avg))
    return { a, b, thicknessPx }
  })
}

export function computeWallsBBox(walls: readonly StampWallPx[]): StampBounds | null {
  if (walls.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const wall of walls) {
    const half = wall.thicknessPx * 0.5
    for (const p of [wall.a, wall.b]) {
      minX = Math.min(minX, p.x - half)
      minY = Math.min(minY, p.y - half)
      maxX = Math.max(maxX, p.x + half)
      maxY = Math.max(maxY, p.y + half)
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null
  const width = Math.max(1, maxX - minX)
  const height = Math.max(1, maxY - minY)
  return { x: minX, y: minY, width, height }
}

/** Plaats source-bbox gecentreerd op target canvas. */
export function centerAlignBounds(
  source: StampBounds,
  targetWidth: number,
  targetHeight: number,
): StampBounds {
  const cx = source.x + source.width / 2
  const cy = source.y + source.height / 2
  const tx = targetWidth / 2
  const ty = targetHeight / 2
  return {
    x: source.x + (tx - cx),
    y: source.y + (ty - cy),
    width: source.width,
    height: source.height,
  }
}

export function transformPointByBounds(
  point: Point2D,
  baseBounds: StampBounds,
  bounds: StampBounds,
): Point2D {
  const sx = baseBounds.width > 1e-6 ? bounds.width / baseBounds.width : 1
  const sy = baseBounds.height > 1e-6 ? bounds.height / baseBounds.height : 1
  return {
    x: bounds.x + (point.x - baseBounds.x) * sx,
    y: bounds.y + (point.y - baseBounds.y) * sy,
  }
}

export function transformWallsByBounds(
  walls: readonly StampWallPx[],
  baseBounds: StampBounds,
  bounds: StampBounds,
): StampWallPx[] {
  const sx = baseBounds.width > 1e-6 ? bounds.width / baseBounds.width : 1
  const sy = baseBounds.height > 1e-6 ? bounds.height / baseBounds.height : 1
  const thicknessScale = (Math.abs(sx) + Math.abs(sy)) / 2
  return walls.map((wall) => ({
    a: transformPointByBounds(wall.a, baseBounds, bounds),
    b: transformPointByBounds(wall.b, baseBounds, bounds),
    thicknessPx: Math.max(1, Math.round(wall.thicknessPx * thicknessScale)),
  }))
}

/**
 * Pure zwarte mask (0 = inkt, 255 = wit) — voor Otsu OR.
 * eraseMask: >0 wist stempel (wit).
 */
export function rasterizeStampSolid(params: {
  walls: readonly StampWallPx[]
  width: number
  height: number
  eraseMask?: Uint8Array | null
}): Uint8Array {
  const { width, height } = params
  const out = new Uint8Array(width * height)
  out.fill(WALL_BW_WHITE)
  paintWallsOnCanvas(params.walls, width, height, '#000000', (alpha, i) => {
    if (alpha > 0) out[i] = WALL_BW_INK
  })
  applyEraseToBw(out, params.eraseMask)
  return out
}

/**
 * Gray strokes op wit als single-channel bytes (STAMP_GRAY_INK / 255).
 * Voor preview of als input naar canvas → adaptive B/W.
 */
export function rasterizeStampGrayBytes(params: {
  walls: readonly StampWallPx[]
  width: number
  height: number
  eraseMask?: Uint8Array | null
  inkGray?: number
}): Uint8Array {
  const { width, height } = params
  const ink = params.inkGray ?? STAMP_GRAY_INK
  const out = new Uint8Array(width * height)
  out.fill(WALL_BW_WHITE)
  paintWallsOnCanvas(params.walls, width, height, `rgb(${ink},${ink},${ink})`, (alpha, i) => {
    if (alpha > 0) out[i] = ink
  })
  applyEraseToBw(out, params.eraseMask)
  return out
}

/** Gray bytes → RGBA canvas voor buildWallLayerBwMat. */
export function stampGrayBytesToCanvas(
  data: Uint8Array,
  width: number,
  height: number,
): CanvasLike {
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const image = ctx.createImageData(width, height)
  for (let i = 0; i < data.length; i += 1) {
    const v = data[i] ?? WALL_BW_WHITE
    const o = i * 4
    image.data[o] = v
    image.data[o + 1] = v
    image.data[o + 2] = v
    image.data[o + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

/** OR stamp-inkt (0) in target B/W. */
export function orStampBwInto(target: Uint8Array, stampBw: Uint8Array | null | undefined): void {
  if (!stampBw || stampBw.length !== target.length) return
  for (let i = 0; i < target.length; i += 1) {
    if ((stampBw[i] ?? WALL_BW_WHITE) < 128) target[i] = WALL_BW_INK
  }
}

/** Pure zwarte OR in Otsu reference (0 = inkt). */
export function orStampMaskIntoReference(
  reference: Uint8Array,
  stampMask: Uint8Array | null | undefined,
): void {
  if (!stampMask || stampMask.length !== reference.length) return
  for (let i = 0; i < reference.length; i += 1) {
    if ((stampMask[i] ?? WALL_BW_WHITE) < 128) reference[i] = WALL_BW_INK
  }
}

export function applyEraseToBw(bw: Uint8Array, eraseMask?: Uint8Array | null): void {
  if (!eraseMask || eraseMask.length !== bw.length) return
  for (let i = 0; i < bw.length; i += 1) {
    if ((eraseMask[i] ?? 0) > 0) bw[i] = WALL_BW_WHITE
  }
}

export function stampMaskHasInk(mask: Uint8Array | null | undefined): boolean {
  if (!mask || mask.length === 0) return false
  for (let i = 0; i < mask.length; i += 1) {
    if ((mask[i] ?? WALL_BW_WHITE) < 128) return true
  }
  return false
}

/**
 * Goedkope ghost-PNG voor live align: muren in baseBounds-coords, semi-transparant oranje.
 * Caller stretcht dit met Konva naar live bounds — geen OpenCV / geen full-compose.
 */
export function buildStampGhostDataUrl(params: {
  walls: readonly StampWallPx[]
  baseBounds: StampBounds
  imageWidth: number
  imageHeight: number
  eraseMask?: Uint8Array | null
  color?: { r: number; g: number; b: number; a: number }
}): string | null {
  const { walls, baseBounds: box, imageWidth, imageHeight, eraseMask } = params
  if (walls.length === 0 || imageWidth <= 0 || imageHeight <= 0) return null
  if (!(box.width > 0) || !(box.height > 0)) return null
  const w = Math.max(1, Math.round(box.width))
  const h = Math.max(1, Math.round(box.height))
  const canvas = createCanvas(w, h)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.clearRect(0, 0, w, h)
  const c = params.color ?? { r: 234, g: 88, b: 12, a: 0.55 }
  ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},${c.a})`
  ctx.fillStyle = ctx.strokeStyle
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.imageSmoothingEnabled = false
  for (const wall of walls) {
    ctx.lineWidth = Math.max(1, Math.round(wall.thicknessPx))
    ctx.beginPath()
    ctx.moveTo(wall.a.x - box.x, wall.a.y - box.y)
    ctx.lineTo(wall.b.x - box.x, wall.b.y - box.y)
    ctx.stroke()
  }
  if (eraseMask && eraseMask.length === imageWidth * imageHeight) {
    const image = ctx.getImageData(0, 0, w, h)
    const data = image.data
    const x0 = Math.floor(box.x)
    const y0 = Math.floor(box.y)
    for (let ly = 0; ly < h; ly += 1) {
      const iy = y0 + ly
      if (iy < 0 || iy >= imageHeight) continue
      for (let lx = 0; lx < w; lx += 1) {
        const ix = x0 + lx
        if (ix < 0 || ix >= imageWidth) continue
        if ((eraseMask[iy * imageWidth + ix] ?? 0) <= 0) continue
        const o = (ly * w + lx) * 4
        data[o + 3] = 0
      }
    }
    ctx.putImageData(image, 0, 0)
  }
  if ('toDataURL' in canvas && typeof canvas.toDataURL === 'function') {
    return canvas.toDataURL('image/png')
  }
  return null
}

function averagePxPerMm(pxPerMmX: number, pxPerMmY: number): number {
  if (pxPerMmX > 0 && pxPerMmY > 0) return (pxPerMmX + pxPerMmY) / 2
  return pxPerMmX > 0 ? pxPerMmX : pxPerMmY > 0 ? pxPerMmY : 1
}

function paintWallsOnCanvas(
  walls: readonly StampWallPx[],
  width: number,
  height: number,
  strokeStyle: string,
  onPixel: (alpha: number, index: number) => void,
): void {
  if (walls.length === 0 || width <= 0 || height <= 0) return
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, width, height)
  ctx.imageSmoothingEnabled = false
  ctx.strokeStyle = strokeStyle
  ctx.fillStyle = strokeStyle
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const wall of walls) {
    const lineWidth = Math.max(1, Math.round(wall.thicknessPx))
    ctx.lineWidth = lineWidth
    ctx.beginPath()
    ctx.moveTo(wall.a.x, wall.a.y)
    ctx.lineTo(wall.b.x, wall.b.y)
    ctx.stroke()
  }
  const image = ctx.getImageData(0, 0, width, height)
  const px = image.data
  for (let i = 0, p = 0; i < width * height; i += 1, p += 4) {
    onPixel(px[p + 3] ?? 0, i)
  }
}
