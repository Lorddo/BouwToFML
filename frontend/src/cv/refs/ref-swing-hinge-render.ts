import { renderFaceOverlayRgba } from './ref-face-profile'
import type { SwingHingeResult } from './ref-swing-hinge'
import { pointInPolygon, polygonBounds } from './ref-swing-hinge-geom'
import type { RefPoint } from './types'

const H_AXIS_RGB: [number, number, number] = [6, 182, 212]
const L_AXIS_RGB: [number, number, number] = [245, 158, 11]
const HINGE_RGB: [number, number, number] = [34, 197, 94]
const SECTOR_FILL_RGB: [number, number, number] = [148, 163, 184]
const SECTOR_STROKE_RGB: [number, number, number] = [100, 116, 139]

function cloneRgba(data: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data.length)
  out.set(data)
  return out
}

function blendChannel(base: number, next: number, alpha: number): number {
  return Math.round(base * (1 - alpha) + next * alpha)
}

function paintPixel(
  out: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  rgb: [number, number, number],
  alpha = 1,
) {
  if (x < 0 || y < 0 || x >= width || y >= height) return
  const offset = (y * width + x) * 4
  if (alpha >= 1) {
    out[offset] = rgb[0]
    out[offset + 1] = rgb[1]
    out[offset + 2] = rgb[2]
    out[offset + 3] = 255
    return
  }
  out[offset] = blendChannel(out[offset] ?? 255, rgb[0], alpha)
  out[offset + 1] = blendChannel(out[offset + 1] ?? 255, rgb[1], alpha)
  out[offset + 2] = blendChannel(out[offset + 2] ?? 255, rgb[2], alpha)
  out[offset + 3] = 255
}

function drawLine(
  out: Uint8ClampedArray,
  width: number,
  height: number,
  a: RefPoint,
  b: RefPoint,
  rgb: [number, number, number],
  thickness: number,
) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy)))
  const radius = Math.max(0, Math.floor(thickness / 2))
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    const x = Math.round(a.x + dx * t)
    const y = Math.round(a.y + dy * t)
    for (let yy = y - radius; yy <= y + radius; yy += 1) {
      for (let xx = x - radius; xx <= x + radius; xx += 1) {
        paintPixel(out, width, height, xx, yy, rgb, 1)
      }
    }
  }
}

function drawClosedPolygon(
  out: Uint8ClampedArray,
  width: number,
  height: number,
  polygon: RefPoint[],
  rgb: [number, number, number],
  thickness: number,
) {
  if (polygon.length < 2) return
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    drawLine(out, width, height, a, b, rgb, thickness)
  }
}

function fillPolygonAlpha(
  out: Uint8ClampedArray,
  width: number,
  height: number,
  polygon: RefPoint[],
  rgb: [number, number, number],
  alpha: number,
) {
  if (polygon.length < 3) return
  const bounds = polygonBounds(polygon)
  const x0 = Math.max(0, Math.floor(bounds.x))
  const y0 = Math.max(0, Math.floor(bounds.y))
  const x1 = Math.min(width - 1, Math.ceil(bounds.x + bounds.width))
  const y1 = Math.min(height - 1, Math.ceil(bounds.y + bounds.height))
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (!pointInPolygon({ x: x + 0.5, y: y + 0.5 }, polygon)) continue
      paintPixel(out, width, height, x, y, rgb, alpha)
    }
  }
}

function drawFilledCircle(
  out: Uint8ClampedArray,
  width: number,
  height: number,
  center: RefPoint,
  radius: number,
  rgb: [number, number, number],
) {
  const r = Math.max(1, Math.round(radius))
  const cx = Math.round(center.x)
  const cy = Math.round(center.y)
  for (let y = cy - r; y <= cy + r; y += 1) {
    for (let x = cx - r; x <= cx + r; x += 1) {
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) > r * r) continue
      paintPixel(out, width, height, x, y, rgb, 1)
    }
  }
}

export function renderSwingHingeOverlayRgba(params: {
  data: Uint8Array
  width: number
  height: number
  hinges: SwingHingeResult[]
}): Uint8ClampedArray {
  const base = renderFaceOverlayRgba(params.data, params.width, params.height, undefined, {
    shadeOutside: false,
  })
  const out = cloneRgba(base)
  for (const hinge of params.hinges) {
    fillPolygonAlpha(out, params.width, params.height, hinge.sectorPolygon, SECTOR_FILL_RGB, 0.18)
    drawClosedPolygon(out, params.width, params.height, hinge.sectorPolygon, SECTOR_STROKE_RGB, 1)
    drawLine(out, params.width, params.height, hinge.axes[0].a, hinge.axes[0].b, H_AXIS_RGB, 2)
    drawLine(out, params.width, params.height, hinge.axes[1].a, hinge.axes[1].b, L_AXIS_RGB, 2)
    drawFilledCircle(out, params.width, params.height, hinge.hinge, 4, HINGE_RGB)
  }
  return out
}
