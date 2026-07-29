import {
  canvasToDataUrlAsync,
  compositeMaskOverUnderlay,
  createCanvas,
  type CanvasLike,
} from '@/cv/port/canvasEnv'
import { resolveMergedLabel } from '@/cv/walls/rooms/room-raster-merge'
import type { DoorSwingHypothesis } from './types'

/** Vulling-alpha voor hypothese-faces. */
const DOOR_SWING_FILL_ALPHA = 170

/** Contourdikte per hypothese (px). */
const DOOR_SWING_CONTOUR_THICKNESS_PX = 2

/** Breedte (px) van één diagonale streep bij faces die door meerdere refs gedeeld worden. */
const DOOR_SWING_STRIPE_WIDTH_PX = 9

/** Extra marge (px) rond hypothese-bbox voor contourverdikking. */
const DOOR_SWING_SCAN_MARGIN_PX = 1

/** Golden-angle hue-stap per ref-index (°). */
const DOOR_SWING_REF_HUE_STEP_DEG = 137.508

/** Hue-offset (°). */
const DOOR_SWING_REF_HUE_OFFSET_DEG = 15

const DOOR_SWING_REF_SATURATION = 0.72
const DOOR_SWING_REF_LIGHTNESS = 0.5

/** Max bit-index bij ref-mask decode (bit 0..30). */
const DOOR_SWING_REF_MASK_BIT_LIMIT = 31

type OverlayBounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/**
 * Vaste, goed onderscheidbare kleur PER REFERENTIE-index (golden-angle hue).
 * Schaalt naar 3+ referenties: ref0/ref1/ref2/... krijgen elk een eigen tint.
 */
function colorForRef(refIndex: number): [number, number, number] {
  const hue = (refIndex * DOOR_SWING_REF_HUE_STEP_DEG + DOOR_SWING_REF_HUE_OFFSET_DEG) % 360
  return hslToRgb(hue / 360, DOOR_SWING_REF_SATURATION, DOOR_SWING_REF_LIGHTNESS)
}

/** Zet een ref-bitmask om naar een oplopende lijst ref-indices (bit i = ref i aanwezig). */
function refsFromMask(mask: number, cache: Map<number, number[]>): number[] {
  const cached = cache.get(mask)
  if (cached) return cached
  const refs: number[] = []
  for (let ref = 0; ref < DOOR_SWING_REF_MASK_BIT_LIMIT; ref += 1) {
    if (mask & (1 << ref)) refs.push(ref)
  }
  cache.set(mask, refs)
  return refs
}

/**
 * Kleur voor een pixel op basis van de set referenties die dit vlak gebruiken.
 * Eén ref → die refkleur. Meerdere refs → diagonaal gestreept in alle refkleuren
 * (streepindex uit x+y), zodat gedeelde velden alle betrokken kleuren tonen.
 */
function colorForRefMask(
  mask: number,
  x: number,
  y: number,
  maskRefsCache: Map<number, number[]>,
): [number, number, number] | null {
  const refs = refsFromMask(mask, maskRefsCache)
  if (refs.length === 0) return null
  if (refs.length === 1) return colorForRef(refs[0])
  const band = Math.floor((x + y) / DOOR_SWING_STRIPE_WIDTH_PX) % refs.length
  return colorForRef(refs[band])
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function resolveHypothesisBounds(params: {
  hypotheses: DoorSwingHypothesis[]
  width: number
  height: number
}): OverlayBounds | null {
  if (params.hypotheses.length === 0) return null
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const hypothesis of params.hypotheses) {
    const bbox = hypothesis.unionBBox
    if (bbox.width <= 0 || bbox.height <= 0) continue
    const localMinX = Math.floor(bbox.x) - DOOR_SWING_SCAN_MARGIN_PX
    const localMinY = Math.floor(bbox.y) - DOOR_SWING_SCAN_MARGIN_PX
    const localMaxX = Math.ceil(bbox.x + bbox.width) - 1 + DOOR_SWING_SCAN_MARGIN_PX
    const localMaxY = Math.ceil(bbox.y + bbox.height) - 1 + DOOR_SWING_SCAN_MARGIN_PX
    minX = Math.min(minX, localMinX)
    minY = Math.min(minY, localMinY)
    maxX = Math.max(maxX, localMaxX)
    maxY = Math.max(maxY, localMaxY)
  }
  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(maxY)
  ) {
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

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255)
    return [v, v, v]
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const r = hueToChannel(p, q, h + 1 / 3)
  const g = hueToChannel(p, q, h)
  const b = hueToChannel(p, q, h - 1 / 3)
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
}

function hueToChannel(p: number, q: number, t: number): number {
  let tt = t
  if (tt < 0) tt += 1
  if (tt > 1) tt -= 1
  if (tt < 1 / 6) return p + (q - p) * 6 * tt
  if (tt < 1 / 2) return q
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
  return p
}

/**
 * Wijst elk pixel een ref-bitmask toe (bit i = referentie i gebruikt dit vlak),
 * op basis van het gemergede face-label. Een vlak dat door hypothesen van
 * meerdere referenties gebruikt wordt, krijgt meerdere bits gezet.
 */
function buildPixelRefMask(params: {
  labelsData: Int32Array
  bounds: OverlayBounds
  parentMap: Map<number, number>
  hypotheses: DoorSwingHypothesis[]
  width: number
}): Int32Array {
  const rootToMask = new Map<number, number>()
  for (const hypothesis of params.hypotheses) {
    const refIndex = Math.max(0, hypothesis.matchedRefIndex)
    if (refIndex > 30) continue
    const bit = 1 << refIndex
    for (const faceId of hypothesis.faceIds) {
      if (faceId <= 0) continue
      // Zelfde merge als pixel-lookup — anders kleurt hyp.faceId niet als parentMap root≠id.
      const root = resolveMergedLabel(faceId, params.parentMap)
      rootToMask.set(root, (rootToMask.get(root) ?? 0) | bit)
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

function renderDoorSwingOverlay(params: {
  width: number
  height: number
  labelsData: Int32Array
  parentMap: Map<number, number>
  hypotheses: DoorSwingHypothesis[]
}): CanvasLike {
  const canvas = createCanvas(params.width, params.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const { width, height } = params
  const bounds = resolveHypothesisBounds({
    hypotheses: params.hypotheses,
    width,
    height,
  })
  if (!bounds) return canvas
  const pixelMask = buildPixelRefMask({
    labelsData: params.labelsData,
    bounds,
    parentMap: params.parentMap,
    hypotheses: params.hypotheses,
    width,
  })
  const maskRefsCache = new Map<number, number[]>()

  // Randpixels: een pixel hoort bij de contour als een 4-buur (of beeldrand)
  // een andere ref-set heeft. Grenzen tussen ref-sets worden zo opake omlijnd.
  const border = new Uint8Array(pixelMask.length)
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const idx = y * width + x
      const mask = pixelMask[idx]
      if (mask === 0) continue
      const up = y > 0 ? pixelMask[idx - width] : 0
      const down = y < height - 1 ? pixelMask[idx + width] : 0
      const left = x > 0 ? pixelMask[idx - 1] : 0
      const right = x < width - 1 ? pixelMask[idx + 1] : 0
      if (up !== mask || down !== mask || left !== mask || right !== mask) {
        border[idx] = 1
      }
    }
  }

  // Verdik de contour naar binnen tot de gewenste dikte (extra pixels van
  // dezelfde ref-set die aan een randpixel grenzen).
  let contour = border
  for (let pass = 1; pass < DOOR_SWING_CONTOUR_THICKNESS_PX; pass += 1) {
    const grown = contour.slice()
    for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
      for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
        const idx = y * width + x
        if (contour[idx]) continue
        const mask = pixelMask[idx]
        if (mask === 0) continue
        const upEdge = y > 0 && contour[idx - width] && pixelMask[idx - width] === mask
        const downEdge = y < height - 1 && contour[idx + width] && pixelMask[idx + width] === mask
        const leftEdge = x > 0 && contour[idx - 1] && pixelMask[idx - 1] === mask
        const rightEdge = x < width - 1 && contour[idx + 1] && pixelMask[idx + 1] === mask
        if (upEdge || downEdge || leftEdge || rightEdge) grown[idx] = 1
      }
    }
    contour = grown
  }

  const image = ctx.createImageData(width, height)
  const data = image.data
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const idx = y * width + x
      const mask = pixelMask[idx]
      if (mask === 0) continue
      const color = colorForRefMask(mask, x, y, maskRefsCache)
      if (!color) continue
      const offset = idx * 4
      data[offset] = color[0]
      data[offset + 1] = color[1]
      data[offset + 2] = color[2]
      // Contour opaak, vulling semi-transparant. Bij gedeelde velden loopt de
      // gestreepte kleuring door de contour heen (alle refkleuren zichtbaar).
      data[offset + 3] = contour[idx] ? 255 : DOOR_SWING_FILL_ALPHA
    }
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

async function loadCanvasFromUrl(
  url: string,
  width: number,
  height: number,
): Promise<CanvasLike | null> {
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
export function renderDoorSwingOverlayCanvas(params: {
  width: number
  height: number
  labelsData: Int32Array
  parentMap: Map<number, number>
  hypotheses: DoorSwingHypothesis[]
}): CanvasLike {
  return renderDoorSwingOverlay(params)
}

/** Export/debug: PNG (+ optionele underlay-composite). */
export async function renderDoorSwingOverlayWithUrlUnderlay(params: {
  width: number
  height: number
  labelsData: Int32Array
  parentMap: Map<number, number>
  hypotheses: DoorSwingHypothesis[]
  underlayUrl?: string | null
}): Promise<string> {
  const mask = renderDoorSwingOverlay({
    width: params.width,
    height: params.height,
    labelsData: params.labelsData,
    parentMap: params.parentMap,
    hypotheses: params.hypotheses,
  })
  if (!params.underlayUrl) return canvasToDataUrlAsync(mask)
  const underlay = await loadCanvasFromUrl(params.underlayUrl, params.width, params.height)
  if (!underlay) return canvasToDataUrlAsync(mask)
  const composited = compositeMaskOverUnderlay(underlay, mask)
  return canvasToDataUrlAsync(composited)
}
