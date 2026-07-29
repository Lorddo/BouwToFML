import { describe, expect, it } from 'vitest'
import {
  DOOR_FACE_RGBA,
  WALL_FACE_RGBA,
  WINDOW_FACE_RGBA,
  colorForLabel,
} from '@/cv/walls/rooms/room-raster'

function hueDistanceDeg(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

function rgbToHueDeg(r: number, g: number, b: number): number | null {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min
  if (delta < 1e-6) return null
  let hue = 0
  if (max === rn) hue = ((gn - bn) / delta) % 6
  else if (max === gn) hue = (bn - rn) / delta + 2
  else hue = (rn - gn) / delta + 4
  hue *= 60
  if (hue < 0) hue += 360
  return hue
}

function perceivedLightness(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

function rgbChroma(r: number, g: number, b: number): number {
  return Math.max(r, g, b) - Math.min(r, g, b)
}

const DOOR_HUE = rgbToHueDeg(DOOR_FACE_RGBA[0], DOOR_FACE_RGBA[1], DOOR_FACE_RGBA[2])!
const WINDOW_HUE = rgbToHueDeg(WINDOW_FACE_RGBA[0], WINDOW_FACE_RGBA[1], WINDOW_FACE_RGBA[2])!
const HALF_WIDTH = 28
const MIN_SURFACE_LIGHTNESS = 110
const MIN_SURFACE_CHROMA = 40
const MAX_WALL_LIKE_GRAY_LIGHTNESS = 150
const WALL_LIGHTNESS = perceivedLightness(
  WALL_FACE_RGBA[0],
  WALL_FACE_RGBA[1],
  WALL_FACE_RGBA[2],
)

describe('colorForLabel', () => {
  it('houdt surface-pastels buiten deur-amber en raam-cyaan hue-bands', () => {
    for (let label = 1; label <= 256; label += 1) {
      const [r, g, b] = colorForLabel(label)
      const hue = rgbToHueDeg(r, g, b)
      if (hue == null) continue
      expect(hueDistanceDeg(hue, DOOR_HUE)).toBeGreaterThan(HALF_WIDTH)
      expect(hueDistanceDeg(hue, WINDOW_HUE)).toBeGreaterThan(HALF_WIDTH)
    }
  })

  it('houdt surface-pastels buiten muur-donkergrijs (lightness/chroma)', () => {
    expect(WALL_LIGHTNESS).toBeLessThan(MIN_SURFACE_LIGHTNESS)
    for (let label = 1; label <= 500; label += 1) {
      const [r, g, b] = colorForLabel(label)
      const lightness = perceivedLightness(r, g, b)
      const chroma = rgbChroma(r, g, b)
      expect(lightness).toBeGreaterThanOrEqual(MIN_SURFACE_LIGHTNESS)
      if (lightness < MAX_WALL_LIKE_GRAY_LIGHTNESS) {
        expect(chroma).toBeGreaterThanOrEqual(MIN_SURFACE_CHROMA)
      }
    }
  })

  it('blijft deterministisch per label', () => {
    expect(colorForLabel(42)).toEqual(colorForLabel(42))
    expect(colorForLabel(7)).not.toEqual(colorForLabel(8))
  })
})
