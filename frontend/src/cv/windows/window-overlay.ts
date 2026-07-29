import { canvasToDataUrlAsync, compositeMaskOverUnderlay, createCanvas, type CanvasLike } from '@/cv/port/canvasEnv'
import { DOORFRAME_FACE_RGBA } from '@/cv/walls/rooms/room-raster'
import { resolveMergedLabel } from '@/cv/walls/rooms/room-raster-merge'
import type { WindowAxelHypothesis } from './types'
import { colorForWindowRef } from './window-ref-color'

const WINDOW_FILL_ALPHA = 170
const WINDOW_CONTOUR_THICKNESS_PX = 2
const WINDOW_STRIPE_WIDTH_PX = 9
/** Bit 31 in pixel mask = doorframe (niet een ref-index). */
const DOORFRAME_MASK_BIT = 1 << 30

type OverlayBounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

function refsFromMask(mask: number, cache: Map<number, number[]>): number[] {
  const cached = cache.get(mask)
  if (cached) return cached
  const refs: number[] = []
  for (let ref = 0; ref < 30; ref += 1) {
    if (mask & (1 << ref)) refs.push(ref)
  }
  cache.set(mask, refs)
  return refs
}

function colorForRefMask(
  mask: number,
  x: number,
  y: number,
  maskRefsCache: Map<number, number[]>,
): [number, number, number] | null {
  if (mask & DOORFRAME_MASK_BIT) {
    return [DOORFRAME_FACE_RGBA[0], DOORFRAME_FACE_RGBA[1], DOORFRAME_FACE_RGBA[2]]
  }
  const refs = refsFromMask(mask, maskRefsCache)
  if (refs.length <= 0) return null
  if (refs.length === 1) return colorForWindowRef(refs[0] ?? 0)
  const band = Math.floor((x + y) / WINDOW_STRIPE_WIDTH_PX) % refs.length
  return colorForWindowRef(refs[band] ?? 0)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function resolveHypothesisBounds(params: {
  hypotheses: WindowAxelHypothesis[]
  width: number
  height: number
}): OverlayBounds | null {
  if (params.hypotheses.length <= 0) return null
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const hypothesis of params.hypotheses) {
    const bbox = hypothesis.unionBBox
    if (bbox.width <= 0 || bbox.height <= 0) continue
    minX = Math.min(minX, Math.floor(bbox.x))
    minY = Math.min(minY, Math.floor(bbox.y))
    maxX = Math.max(maxX, Math.ceil(bbox.x + bbox.width) - 1)
    maxY = Math.max(maxY, Math.ceil(bbox.y + bbox.height) - 1)
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null
  }
  const clampedMinX = clamp(minX, 0, Math.max(0, params.width - 1))
  const clampedMinY = clamp(minY, 0, Math.max(0, params.height - 1))
  const clampedMaxX = clamp(maxX, 0, Math.max(0, params.width - 1))
  const clampedMaxY = clamp(maxY, 0, Math.max(0, params.height - 1))
  if (clampedMaxX < clampedMinX || clampedMaxY < clampedMinY) return null
  return {
    minX: clampedMinX,
    minY: clampedMinY,
    maxX: clampedMaxX,
    maxY: clampedMaxY,
  }
}

function buildPixelRefMask(params: {
  labelsData: Int32Array
  bounds: OverlayBounds
  parentMap: Map<number, number>
  hypotheses: WindowAxelHypothesis[]
  doorframeHypotheses?: WindowAxelHypothesis[]
  width: number
}): Int32Array {
  const rootToMask = new Map<number, number>()
  for (const hypothesis of params.hypotheses) {
    const refIndex = Math.max(0, hypothesis.matchedRefIndex)
    if (refIndex > 29) continue
    const bit = 1 << refIndex
    for (const faceId of hypothesis.faceIds) {
      rootToMask.set(faceId, (rootToMask.get(faceId) ?? 0) | bit)
    }
  }
  for (const hypothesis of params.doorframeHypotheses ?? []) {
    for (const faceId of hypothesis.faceIds) {
      if (!(faceId > 0)) continue
      rootToMask.set(faceId, (rootToMask.get(faceId) ?? 0) | DOORFRAME_MASK_BIT)
    }
  }
  const pixelMask = new Int32Array(params.labelsData.length)
  for (let y = params.bounds.minY; y <= params.bounds.maxY; y += 1) {
    for (let x = params.bounds.minX; x <= params.bounds.maxX; x += 1) {
      const idx = y * params.width + x
      const label = params.labelsData[idx] ?? 0
      if (label <= 0) continue
      const root = resolveMergedLabel(label, params.parentMap)
      const mask = rootToMask.get(root)
      if (mask === undefined) continue
      pixelMask[idx] = mask
    }
  }
  return pixelMask
}

function renderWindowOverlay(params: {
  width: number
  height: number
  labelsData: Int32Array
  parentMap: Map<number, number>
  hypotheses: WindowAxelHypothesis[]
  /** Doorframe-hyps: zelfde UI-kleur als muur-tab (`DOORFRAME_FACE_RGBA`). */
  doorframeHypotheses?: WindowAxelHypothesis[]
}): CanvasLike {
  const canvas = createCanvas(params.width, params.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const allHyps = [...params.hypotheses, ...(params.doorframeHypotheses ?? [])]
  const bounds = resolveHypothesisBounds({
    hypotheses: allHyps,
    width: params.width,
    height: params.height,
  })
  if (!bounds) return canvas
  const pixelMask = buildPixelRefMask({
    labelsData: params.labelsData,
    bounds,
    parentMap: params.parentMap,
    hypotheses: params.hypotheses,
    doorframeHypotheses: params.doorframeHypotheses,
    width: params.width,
  })
  const maskRefsCache = new Map<number, number[]>()
  const border = new Uint8Array(pixelMask.length)
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const idx = y * params.width + x
      const mask = pixelMask[idx]
      if (mask === 0) continue
      const up = y > 0 ? pixelMask[idx - params.width] : 0
      const down = y < params.height - 1 ? pixelMask[idx + params.width] : 0
      const left = x > 0 ? pixelMask[idx - 1] : 0
      const right = x < params.width - 1 ? pixelMask[idx + 1] : 0
      if (up !== mask || down !== mask || left !== mask || right !== mask) {
        border[idx] = 1
      }
    }
  }
  let contour = border
  for (let pass = 1; pass < WINDOW_CONTOUR_THICKNESS_PX; pass += 1) {
    const grown = contour.slice()
    for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
      for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
        const idx = y * params.width + x
        if (contour[idx]) continue
        const mask = pixelMask[idx]
        if (mask === 0) continue
        const upEdge = y > 0 && contour[idx - params.width] && pixelMask[idx - params.width] === mask
        const downEdge =
          y < params.height - 1 && contour[idx + params.width] && pixelMask[idx + params.width] === mask
        const leftEdge = x > 0 && contour[idx - 1] && pixelMask[idx - 1] === mask
        const rightEdge = x < params.width - 1 && contour[idx + 1] && pixelMask[idx + 1] === mask
        if (upEdge || downEdge || leftEdge || rightEdge) grown[idx] = 1
      }
    }
    contour = grown
  }
  const image = ctx.createImageData(params.width, params.height)
  const data = image.data
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const idx = y * params.width + x
      const mask = pixelMask[idx]
      if (mask === 0) continue
      const color = colorForRefMask(mask, x, y, maskRefsCache)
      if (!color) continue
      const offset = idx * 4
      data[offset] = color[0]
      data[offset + 1] = color[1]
      data[offset + 2] = color[2]
      data[offset + 3] = contour[idx] ? 255 : WINDOW_FILL_ALPHA
    }
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

async function loadCanvasFromUrl(url: string, width: number, height: number): Promise<CanvasLike | null> {
  if (typeof Image === 'undefined') return null
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = createCanvas(width, height)
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(null)
        return
      }
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas)
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}

/** Live canvas-overlay zonder underlay/PNG (B/W ligt al als base image). */
export function renderWindowOverlayCanvas(params: {
  width: number
  height: number
  labelsData: Int32Array
  parentMap: Map<number, number>
  hypotheses: WindowAxelHypothesis[]
  doorframeHypotheses?: WindowAxelHypothesis[]
}): CanvasLike {
  return renderWindowOverlay(params)
}

/** Export/debug: PNG (+ optionele underlay-composite). */
export async function renderWindowOverlayWithUrlUnderlay(params: {
  width: number
  height: number
  labelsData: Int32Array
  parentMap: Map<number, number>
  hypotheses: WindowAxelHypothesis[]
  doorframeHypotheses?: WindowAxelHypothesis[]
  underlayUrl?: string | null
}): Promise<string> {
  const mask = renderWindowOverlay({
    width: params.width,
    height: params.height,
    labelsData: params.labelsData,
    parentMap: params.parentMap,
    hypotheses: params.hypotheses,
    doorframeHypotheses: params.doorframeHypotheses,
  })
  if (!params.underlayUrl) return canvasToDataUrlAsync(mask)
  const underlay = await loadCanvasFromUrl(params.underlayUrl, params.width, params.height)
  if (!underlay) return canvasToDataUrlAsync(mask)
  const composited = compositeMaskOverUnderlay(underlay, mask)
  return canvasToDataUrlAsync(composited)
}
