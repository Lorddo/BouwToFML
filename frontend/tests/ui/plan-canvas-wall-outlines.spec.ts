import { describe, expect, it } from 'vitest'
import { buildWallOutlinePolylines } from '@/ui/components/plan-canvas-wall-polygons'

function polylineCoversY(
  polylines: { x: number; y: number }[][],
  x: number,
  yLo: number,
  yHi: number,
  eps = 0.5,
): boolean {
  for (const poly of polylines) {
    for (let i = 0; i < poly.length - 1; i += 1) {
      const a = poly[i]
      const b = poly[i + 1]
      if (Math.abs(a.x - x) > eps || Math.abs(b.x - x) > eps) continue
      const lo = Math.min(a.y, b.y)
      const hi = Math.max(a.y, b.y)
      if (lo <= yLo + eps && hi >= yHi - eps) return true
    }
  }
  return false
}

function polylineCoversX(
  polylines: { x: number; y: number }[][],
  y: number,
  xLo: number,
  xHi: number,
  eps = 0.5,
): boolean {
  for (const poly of polylines) {
    for (let i = 0; i < poly.length - 1; i += 1) {
      const a = poly[i]
      const b = poly[i + 1]
      if (Math.abs(a.y - y) > eps || Math.abs(b.y - y) > eps) continue
      const lo = Math.min(a.x, b.x)
      const hi = Math.max(a.x, b.x)
      if (lo <= xLo + eps && hi >= xHi - eps) return true
    }
  }
  return false
}

function edgeNearPoint(
  polylines: { x: number; y: number }[][],
  point: { x: number; y: number },
  eps = 0.3,
): boolean {
  for (const poly of polylines) {
    for (let i = 0; i < poly.length - 1; i += 1) {
      const a = poly[i]
      const b = poly[i + 1]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len2 = dx * dx + dy * dy
      let t = len2 < 1e-18 ? 0 : ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2
      t = Math.max(0, Math.min(1, t))
      const px = a.x + dx * t
      const py = a.y + dy * t
      if (Math.hypot(point.x - px, point.y - py) <= eps) return true
    }
  }
  return false
}

describe('buildWallOutlinePolylines', () => {
  it('L-hoek: gemiterde buitenlijnen, geen square-oor ver voorbij dikte', () => {
    const walls = [
      { id: 'h', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thickness: 20 },
      { id: 'v', a: { x: 0, y: 0 }, b: { x: 0, y: 80 }, thickness: 20 },
    ]
    const outlines = buildWallOutlinePolylines(walls)
    expect(outlines.length).toBeGreaterThan(0)

    // Outer corner around (-10,-10) is on the mitered silhouette.
    expect(edgeNearPoint(outlines, { x: -10, y: -10 }, 1.5)).toBe(true)
    // Square-oor far outside thickness must not appear.
    expect(edgeNearPoint(outlines, { x: -20, y: -20 }, 2)).toBe(false)

    // Outer faces present (horizontal wall top face y=-10; vertical wall left face x=-10).
    expect(polylineCoversX(outlines, -10, 5, 90, 2)).toBe(true)
    expect(polylineCoversY(outlines, -10, 5, 70, 2)).toBe(true)
  })

  it('deur in rechte muur: faces hebben gat; geen sill-span over de opening', () => {
    const walls = [{ id: 'w', a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, thickness: 20 }]
    const openings = [{ wallId: 'w', t: 0.5, width: 90, type: 'door' as const }]
    const outlines = buildWallOutlinePolylines(walls, openings)
    expect(outlines.length).toBeGreaterThan(0)

    // Faces at y=±10. Opening spans x=55..145 (center 100, width 90).
    // Continuous sill across the gap must not exist.
    expect(polylineCoversX(outlines, -10, 60, 140, 1)).toBe(false)
    expect(polylineCoversX(outlines, 10, 60, 140, 1)).toBe(false)

    // Wall stubs remain left and right of the opening.
    expect(polylineCoversX(outlines, -10, 5, 40, 1.5)).toBe(true)
    expect(polylineCoversX(outlines, -10, 160, 195, 1.5)).toBe(true)

    // Deur: jamb edges dropped — glyph heeft end-caps.
    expect(polylineCoversY(outlines, 55, -9, 9, 1)).toBe(false)
    expect(polylineCoversY(outlines, 145, -9, 9, 1)).toBe(false)
  })

  it('raam in rechte muur: sill weg, jambs blijven (muur-afsluiting)', () => {
    const walls = [{ id: 'w', a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, thickness: 20 }]
    const openings = [{ wallId: 'w', t: 0.5, width: 90, type: 'window' as const }]
    const outlines = buildWallOutlinePolylines(walls, openings)
    expect(outlines.length).toBeGreaterThan(0)

    expect(polylineCoversX(outlines, -10, 60, 140, 1)).toBe(false)
    expect(polylineCoversX(outlines, 10, 60, 140, 1)).toBe(false)

    // Raam: volle-dikte jambs blijven in muur-outline.
    expect(polylineCoversY(outlines, 55, -9, 9, 1)).toBe(true)
    expect(polylineCoversY(outlines, 145, -9, 9, 1)).toBe(true)
  })

  it('T-junction: geen extra stub/spike voorbij host-buitenface', () => {
    const walls = [
      { id: 'host', a: { x: 0, y: -80 }, b: { x: 0, y: 80 }, thickness: 30 },
      { id: 'branch', a: { x: 0, y: 0 }, b: { x: 80, y: 0 }, thickness: 20 },
    ]
    const outlines = buildWallOutlinePolylines(walls)
    expect(outlines.length).toBeGreaterThan(0)
    // Host left face at x=-15; outline must not poke past.
    expect(edgeNearPoint(outlines, { x: -20, y: 0 }, 1.5)).toBe(false)
    expect(edgeNearPoint(outlines, { x: -15, y: 40 }, 2)).toBe(true)
  })
})
