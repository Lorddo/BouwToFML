import { colorForLabel } from '@/cv/walls/rooms/room-raster'
import { renderFaceOverlayRgba } from './ref-face-profile'
import type { CombinedFacePolygonPart, CombinedFacePolygonZone, RefPoint } from './types'

const ZONE_RGB: Record<CombinedFacePolygonZone, [number, number, number]> = {
  on_axis: [6, 182, 212],
  above: [245, 158, 11],
  below: [236, 72, 153],
}

type LabeledPolygon = { label: number; points: RefPoint[] }

function cloneRgba(data: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data.length)
  out.set(data)
  return out
}

function drawPoint(
  out: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  rgb: [number, number, number],
  thickness: number,
) {
  const radius = Math.max(0, Math.floor(thickness / 2))
  for (let yy = y - radius; yy <= y + radius; yy += 1) {
    for (let xx = x - radius; xx <= x + radius; xx += 1) {
      if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue
      const o = (yy * width + xx) * 4
      out[o] = rgb[0]
      out[o + 1] = rgb[1]
      out[o + 2] = rgb[2]
      out[o + 3] = 255
    }
  }
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
  for (let s = 0; s <= steps; s += 1) {
    const t = s / steps
    const x = Math.round(a.x + dx * t)
    const y = Math.round(a.y + dy * t)
    drawPoint(out, width, height, x, y, rgb, thickness)
  }
}

function drawClosedPolygon(
  out: Uint8ClampedArray,
  width: number,
  height: number,
  points: RefPoint[],
  rgb: [number, number, number],
  thickness: number,
) {
  if (points.length < 2) return
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    if (!a || !b) continue
    drawLine(out, width, height, a, b, rgb, thickness)
  }
}

export function renderFacePolygonOverlayRgba(params: {
  data: Uint8Array
  width: number
  height: number
  polygons: LabeledPolygon[]
}): Uint8ClampedArray {
  const base = renderFaceOverlayRgba(params.data, params.width, params.height, undefined, {
    shadeOutside: false,
  })
  const out = cloneRgba(base)
  for (const polygon of params.polygons) {
    if (polygon.points.length < 3) continue
    const [r, g, b] = colorForLabel(polygon.label)
    drawClosedPolygon(out, params.width, params.height, polygon.points, [r, g, b], 1)
  }
  return out
}

function createWhiteRgba(width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4)
  out.fill(255)
  return out
}

export function renderCombinedFacePolygonOverlayRgba(params: {
  data: Uint8Array
  width: number
  height: number
  polygons: RefPoint[][]
  parts?: CombinedFacePolygonPart[]
}): Uint8ClampedArray {
  const base = renderFaceOverlayRgba(params.data, params.width, params.height, undefined, {
    shadeOutside: false,
  })
  const out = cloneRgba(base)
  if (params.parts && params.parts.length > 0) {
    for (const part of params.parts) {
      if (part.polygon.length < 3) continue
      drawClosedPolygon(out, params.width, params.height, part.polygon, ZONE_RGB[part.zone], 1)
    }
    return out
  }
  for (const polygon of params.polygons) {
    if (polygon.length < 3) continue
    drawClosedPolygon(out, params.width, params.height, polygon, ZONE_RGB.on_axis, 1)
  }
  return out
}

/** Gegroepeerde kopeinde-as-contouren op wit — zelfde leesbaarheid als losse face-SVG. */
export function renderGroupedFacePolygonsCleanRgba(params: {
  width: number
  height: number
  parts: CombinedFacePolygonPart[]
  thickness?: number
}): Uint8ClampedArray {
  const out = createWhiteRgba(params.width, params.height)
  const thickness = params.thickness ?? 2
  for (const part of params.parts) {
    if (part.polygon.length < 3) continue
    drawClosedPolygon(out, params.width, params.height, part.polygon, ZONE_RGB[part.zone], thickness)
  }
  return out
}
