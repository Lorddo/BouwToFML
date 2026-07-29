import type { RoomWallMaskRle } from '@/core/extraction/types'
import { createCanvas } from '@/cv/port/canvasEnv'

function normalizeMaskValue(value: number): number {
  return value >= 128 ? 1 : 0
}

export function encodeMaskRle(
  data: ArrayLike<number>,
  width: number,
  height: number,
): RoomWallMaskRle {
  const total = Math.max(0, width * height)
  const runs: number[] = []
  if (total === 0) {
    return { width, height, runs }
  }

  let current = normalizeMaskValue(data[0] ?? 0)
  let count = 1
  for (let i = 1; i < total; i += 1) {
    const value = normalizeMaskValue(data[i] ?? 0)
    if (value === current) {
      count += 1
      continue
    }
    runs.push(current, count)
    current = value
    count = 1
  }
  runs.push(current, count)
  return { width, height, runs }
}

export function decodeMaskRle(mask: RoomWallMaskRle): Uint8Array {
  const total = Math.max(0, mask.width * mask.height)
  const decoded = new Uint8Array(total)
  let offset = 0
  for (let i = 0; i + 1 < mask.runs.length && offset < total; i += 2) {
    const value = (mask.runs[i] ?? 0) >= 1 ? 255 : 0
    const count = Math.max(0, Math.round(mask.runs[i + 1] ?? 0))
    for (let c = 0; c < count && offset < total; c += 1) {
      decoded[offset] = value
      offset += 1
    }
  }
  return decoded
}

export function scaleMaskRleNearest(
  mask: RoomWallMaskRle,
  targetWidth: number,
  targetHeight: number,
): RoomWallMaskRle {
  const tw = Math.max(1, Math.round(targetWidth))
  const th = Math.max(1, Math.round(targetHeight))
  if (tw === mask.width && th === mask.height) return mask

  const src = decodeMaskRle(mask)
  const out = new Uint8Array(tw * th)
  for (let y = 0; y < th; y += 1) {
    const sy = Math.min(mask.height - 1, Math.round((y / th) * mask.height))
    for (let x = 0; x < tw; x += 1) {
      const sx = Math.min(mask.width - 1, Math.round((x / tw) * mask.width))
      out[y * tw + x] = src[sy * mask.width + sx] ?? 0
    }
  }
  return encodeMaskRle(out, tw, th)
}

/** Zwart op wit — het behouden muurmasker na blob-filter (skeleton-input). */
export function renderBinaryMaskRleCanvas(mask: RoomWallMaskRle): HTMLCanvasElement {
  const data = decodeMaskRle(mask)
  const canvas = createCanvas(mask.width, mask.height) as HTMLCanvasElement
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const image = ctx.createImageData(mask.width, mask.height)
  for (let i = 0; i < data.length; i += 1) {
    const v = (data[i] ?? 0) >= 128 ? 0 : 255
    const o = i * 4
    image.data[o] = v
    image.data[o + 1] = v
    image.data[o + 2] = v
    image.data[o + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}
