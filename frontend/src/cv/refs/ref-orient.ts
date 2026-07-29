import { createCanvas, type CanvasLike } from '@/cv/port/canvasEnv'

/** 90° clockwise: (x,y) → (h-1-y, x), size (h,w). */
export function rotateBwData90Cw(
  data: Uint8Array,
  width: number,
  height: number,
): { data: Uint8Array; width: number; height: number } {
  const outW = height
  const outH = width
  const out = new Uint8Array(outW * outH)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = height - 1 - y
      const ny = x
      out[ny * outW + nx] = data[y * width + x] ?? 255
    }
  }
  return { data: out, width: outW, height: outH }
}

/** 180°: (x,y) → (w-1-x, h-1-y). */
export function rotateBwData180(
  data: Uint8Array,
  width: number,
  height: number,
): { data: Uint8Array; width: number; height: number } {
  const out = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = width - 1 - x
      const ny = height - 1 - y
      out[ny * width + nx] = data[y * width + x] ?? 255
    }
  }
  return { data: out, width, height }
}

export function rotateCanvas90Cw(source: CanvasLike): CanvasLike {
  const out = createCanvas(source.height, source.width)
  const ctx = out.getContext('2d')
  if (!ctx) return out
  ctx.translate(out.width, 0)
  ctx.rotate(Math.PI / 2)
  ctx.drawImage(source as CanvasImageSource, 0, 0)
  return out
}

export function rotateCanvas180(source: CanvasLike): CanvasLike {
  const out = createCanvas(source.width, source.height)
  const ctx = out.getContext('2d')
  if (!ctx) return out
  ctx.translate(out.width, out.height)
  ctx.rotate(Math.PI)
  ctx.drawImage(source as CanvasImageSource, 0, 0)
  return out
}
