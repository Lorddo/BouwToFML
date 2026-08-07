import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computeDoorHingeFromFaces, computeDoorHingeFromMask } from '@/cv/doors'
import { approxContoursFromMask } from '@/cv/refs/ref-face-contour'
import type { RefPoint } from '@/cv/refs/types'

vi.mock('@/cv/refs/ref-face-contour', () => ({
  approxContoursFromMask: vi.fn(),
}))

function buildQuarterSectorPolygon(params: { hinge: RefPoint; radius: number }): RefPoint[] {
  const points: RefPoint[] = []
  points.push(params.hinge)
  points.push({ x: params.hinge.x + params.radius, y: params.hinge.y })
  for (let deg = 10; deg <= 90; deg += 10) {
    const rad = (deg * Math.PI) / 180
    points.push({
      x: Math.round(params.hinge.x + params.radius * Math.cos(rad)),
      y: Math.round(params.hinge.y + params.radius * Math.sin(rad)),
    })
  }
  points.push({ x: params.hinge.x, y: params.hinge.y + params.radius })
  return points
}

function paintQuarterSector(
  mask: Uint8Array,
  width: number,
  height: number,
  hinge: RefPoint,
  radius: number,
): void {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x < hinge.x || y < hinge.y) continue
      const dx = x - hinge.x
      const dy = y - hinge.y
      if (dx * dx + dy * dy > radius * radius) continue
      mask[y * width + x] = 255
    }
  }
}

describe('door-swing-hinge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('vindt scharnier + span op mask met offset', () => {
    const width = 80
    const height = 80
    const hingeLocal = { x: 16, y: 14 }
    const radius = 28
    const mask = new Uint8Array(width * height)
    paintQuarterSector(mask, width, height, hingeLocal, radius)
    vi.mocked(approxContoursFromMask).mockReturnValue([
      buildQuarterSectorPolygon({ hinge: hingeLocal, radius }),
    ])
    const result = computeDoorHingeFromMask({
      cv: {} as never,
      maskData: mask,
      width,
      height,
      offsetX: 100,
      offsetY: 200,
    })
    expect(result).not.toBeNull()
    expect(result!.hingePx.x).toBeCloseTo(hingeLocal.x + 100, 0)
    expect(result!.hingePx.y).toBeCloseTo(hingeLocal.y + 200, 0)
    expect(result!.swingSpanPx).toBeGreaterThan(radius - 2)
    expect(result!.axes).toHaveLength(2)
  })

  it('resolveRoot + faceIds werkt in computeDoorHingeFromFaces', () => {
    const width = 90
    const height = 90
    const labels = new Int32Array(width * height)
    for (let y = 20; y < 60; y += 1) {
      for (let x = 24; x < 64; x += 1) {
        labels[y * width + x] = 5
      }
    }
    const hingeLocal = { x: 8, y: 10 }
    const radius = 20
    vi.mocked(approxContoursFromMask).mockReturnValue([
      buildQuarterSectorPolygon({ hinge: hingeLocal, radius }),
    ])
    const result = computeDoorHingeFromFaces({
      cv: {} as never,
      labelsData: labels,
      parentMap: new Map([
        [5, 3],
        [3, 2],
      ]),
      width,
      height,
      faceIds: [2],
      bbox: { x: 20, y: 18, width: 48, height: 48 },
    })
    expect(result).not.toBeNull()
    // Offset crop (20,18) + lokale scharnier (8,10) → ~ (28,28).
    // Mag niet op de vrije tip (48,28) landen.
    expect(result!.hingePx.x).toBeCloseTo(20 + hingeLocal.x, 0)
    expect(result!.hingePx.y).toBeCloseTo(18 + hingeLocal.y, 0)
  })

  it('geeft null terug zonder mask-pixels', () => {
    const result = computeDoorHingeFromFaces({
      cv: {} as never,
      labelsData: new Int32Array(40 * 40),
      parentMap: new Map(),
      width: 40,
      height: 40,
      faceIds: [9],
      bbox: { x: 5, y: 5, width: 20, height: 20 },
    })
    expect(result).toBeNull()
  })

  it('meet swing-span uit face-AABB, niet uit hinge-diagonaal', () => {
    // Vol gevuld vierkant: hinge-Euclidean vanaf hoek = diagonaal (~1.41×zijde).
    // Face-AABB max(w,h) blijft de zijde — maatvoering niet opgeblazen.
    const width = 100
    const height = 100
    const mask = new Uint8Array(width * height)
    mask.fill(255)
    const hingeLocal = { x: 0, y: 0 }
    const radius = 100
    vi.mocked(approxContoursFromMask).mockReturnValue([
      buildQuarterSectorPolygon({ hinge: hingeLocal, radius }),
    ])
    const result = computeDoorHingeFromMask({
      cv: {} as never,
      maskData: mask,
      width,
      height,
    })
    expect(result).not.toBeNull()
    expect(result!.swingSpanPx).toBe(100)
    expect(result!.swingSpanPx).toBeLessThan(Math.hypot(100, 100) * 0.95)
  })

  it('meet swing-span op face-AABB ook met padding rond de sector', () => {
    const width = 80
    const height = 80
    const hingeLocal = { x: 16, y: 14 }
    const radius = 28
    const mask = new Uint8Array(width * height)
    paintQuarterSector(mask, width, height, hingeLocal, radius)
    vi.mocked(approxContoursFromMask).mockReturnValue([
      buildQuarterSectorPolygon({ hinge: hingeLocal, radius }),
    ])
    const result = computeDoorHingeFromMask({
      cv: {} as never,
      maskData: mask,
      width,
      height,
    })
    expect(result).not.toBeNull()
    // Strakke face van sector ≈ radius+1, niet de volle crop 80.
    expect(result!.swingSpanPx).toBeGreaterThanOrEqual(radius)
    expect(result!.swingSpanPx).toBeLessThanOrEqual(radius + 2)
    expect(result!.swingSpanPx).toBeLessThan(width * 0.6)
  })

  it('weigert bijna-parallelle assen of houdt hoek ≥8°', () => {
    const width = 80
    const height = 80
    const mask = new Uint8Array(width * height)
    mask.fill(255)
    // Twee bijna-verticale "radii" — geen echte kwart-sector.
    vi.mocked(approxContoursFromMask).mockReturnValue([
      [
        { x: 10, y: 10 },
        { x: 12, y: 10 },
        { x: 12, y: 70 },
        { x: 40, y: 68 },
        { x: 42, y: 40 },
        { x: 40, y: 12 },
        { x: 10, y: 10 },
      ],
    ])
    const result = computeDoorHingeFromMask({
      cv: {} as never,
      maskData: mask,
      width,
      height,
    })
    if (result) {
      expect(result.swingAngleDeg).toBeGreaterThanOrEqual(8)
    } else {
      expect(result).toBeNull()
    }
  })
})
