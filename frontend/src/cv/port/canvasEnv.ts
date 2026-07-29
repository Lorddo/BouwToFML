import type { OpenCV } from '../loadOpenCV'

export type CanvasLike = HTMLCanvasElement | OffscreenCanvas

function isDomAvailable(): boolean {
  return typeof document !== 'undefined'
}

export function hasHtmlImageElement(): boolean {
  return typeof HTMLImageElement !== 'undefined'
}

function hasHtmlCanvasElement(): boolean {
  return typeof HTMLCanvasElement !== 'undefined'
}

/** Worker-safe canvas — OffscreenCanvas als `document` ontbreekt. */
export function createCanvas(width: number, height: number): CanvasLike {
  if (isDomAvailable()) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
  }
  return new OffscreenCanvas(width, height)
}

function getCanvas2dContext(
  canvas: CanvasLike,
): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context niet beschikbaar')
  return ctx
}

/** Lees RGBA-pixels zonder cv.imread (geen HTMLImageElement nodig). */
export function readRgbaMatFromCanvas(cv: OpenCV, canvas: CanvasLike): OpenCV['Mat'] {
  const ctx = getCanvas2dContext(canvas)
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return cv.matFromImageData(imageData)
}

export function isCanvasLike(source: unknown): source is CanvasLike {
  if (!source || typeof source !== 'object') return false
  const candidate = source as { width?: number; height?: number; getContext?: unknown }
  return (
    typeof candidate.width === 'number' &&
    typeof candidate.height === 'number' &&
    typeof candidate.getContext === 'function'
  )
}

/**
 * OpenCV.js verwacht soms `instanceof HTMLImageElement` — in workers bestaat die class niet.
 * OffscreenCanvas als HTMLCanvasElement-stub maakt imshow/imread-compat mogelijk.
 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  return `data:${blob.type || 'image/png'};base64,${bytesToBase64(new Uint8Array(buffer))}`
}

/** Worker-safe — OffscreenCanvas via convertToBlob, anders toDataURL. */
export async function canvasToDataUrlAsync(
  canvas: CanvasLike,
  mimeType = 'image/png',
): Promise<string> {
  if ('toDataURL' in canvas && typeof canvas.toDataURL === 'function') {
    return canvas.toDataURL(mimeType)
  }
  if ('convertToBlob' in canvas && typeof canvas.convertToBlob === 'function') {
    const blob = await canvas.convertToBlob({ type: mimeType })
    return blobToDataUrl(blob)
  }
  return ''
}

/** Classificatie-mask (transparante inkt) over B/W-onderlegger — inkt blijft zwart. */
export function compositeMaskOverUnderlay(underlay: CanvasLike, mask: CanvasLike): CanvasLike {
  const canvas = createCanvas(mask.width, mask.height)
  const ctx = getCanvas2dContext(canvas)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(underlay, 0, 0, mask.width, mask.height)
  ctx.drawImage(mask, 0, 0)
  return canvas
}

export function installWorkerDomPolyfills(): void {
  if (!hasHtmlImageElement()) {
    ;(globalThis as unknown as { HTMLImageElement: typeof HTMLImageElement }).HTMLImageElement =
      class HTMLImageElement {} as typeof HTMLImageElement
  }
  if (!hasHtmlCanvasElement() && typeof OffscreenCanvas !== 'undefined') {
    ;(globalThis as unknown as { HTMLCanvasElement: typeof HTMLCanvasElement }).HTMLCanvasElement =
      OffscreenCanvas as unknown as typeof HTMLCanvasElement
  }
}
