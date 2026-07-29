import { maskHasInk } from './polygon'

export function cloneMask(mask: Uint8Array): Uint8Array {
  return new Uint8Array(mask)
}

/** Wit waar mask > 0 — crop/gum visueel en voor downstream CV. */
export function bakeMaskIntoCanvas(
  source: HTMLImageElement | HTMLCanvasElement,
  mask: Uint8Array,
): HTMLCanvasElement {
  const width = 'naturalWidth' in source ? source.naturalWidth : source.width
  const height = 'naturalHeight' in source ? source.naturalHeight : source.height
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  ctx.drawImage(source, 0, 0)
  if (!maskHasInk(mask) || mask.length !== width * height) return canvas

  const imageData = ctx.getImageData(0, 0, width, height)
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i] <= 0) continue
    const offset = i * 4
    imageData.data[offset] = 255
    imageData.data[offset + 1] = 255
    imageData.data[offset + 2] = 255
    imageData.data[offset + 3] = 255
  }
  ctx.putImageData(imageData, 0, 0)
  return canvas
}

export function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png')
}
