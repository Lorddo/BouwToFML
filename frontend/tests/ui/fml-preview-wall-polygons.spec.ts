import { describe, expect, it } from 'vitest'
import {
  buildWallRenderGeometry,
  offsetPointByWallBalance,
  pointInFillComponents,
  maxFillVertexDistanceFromWallEnds,
  resolveWallExtents,
  wallBalanceMidOffsetCm,
} from '@/ui/components/fml-preview-wall-polygons'

function hasVertex(
  points: { x: number; y: number }[],
  expected: { x: number; y: number },
  eps = 1e-6,
): boolean {
  return points.some(
    (point) => Math.abs(point.x - expected.x) < eps && Math.abs(point.y - expected.y) < eps,
  )
}

function allFillPoints(
  geometry: ReturnType<typeof buildWallRenderGeometry>,
): { x: number; y: number }[] {
  return geometry.fillComponents.flatMap((component) => component.rings.flat())
}

describe('wall balance extents', () => {
  it('centers at 0.5 and shifts mid-line with balance', () => {
    expect(resolveWallExtents({ thickness: 20, balance: 0.5 })).toEqual({ plus: 10, minus: 10 })
    expect(wallBalanceMidOffsetCm(20, 0.5)).toBeCloseTo(0, 6)
    expect(wallBalanceMidOffsetCm(20, 0.8)).toBeCloseTo(6, 6)
    expect(wallBalanceMidOffsetCm(20, 0.25)).toBeCloseTo(-5, 6)

    const wallUnit = { x: 1, y: 0 }
    const mid = offsetPointByWallBalance({ x: 50, y: 0 }, wallUnit, 20, 0.8)
    // a→b naar rechts: links = −Y (Y-down). balance 0.8 → midden verschuift omhoog.
    expect(mid.x).toBeCloseTo(50, 6)
    expect(mid.y).toBeCloseTo(-6, 6)
  })

  it('opening mid-offset follows wall balance (viewer doors/windows use this)', () => {
    const wallUnit = { x: 1, y: 0 }
    const hinge = { x: 40, y: 0 }
    const offset = offsetPointByWallBalance(hinge, wallUnit, 30, 0.8)
    // mid = (plus-minus)/2 = (24-6)/2 = 9 along left normal (−Y)
    expect(offset).toEqual({ x: 40, y: -9 })
    expect(offsetPointByWallBalance(hinge, wallUnit, 30, 0.5)).toEqual({ x: 40, y: 0 })
  })

  it('renders overshoot balance outside 0–1', () => {
    expect(resolveWallExtents({ thickness: 20, balance: -2.5 })).toEqual({ plus: -50, minus: 70 })
    expect(resolveWallExtents({ thickness: 20, balance: 10 })).toEqual({ plus: 200, minus: -180 })
  })
})

describe('buildWallRenderGeometry', () => {
  it('equal-thickness L merges to a single union component', () => {
    const geometry = buildWallRenderGeometry([
      { id: 'h', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thickness: 20 },
      { id: 'v', a: { x: 0, y: 0 }, b: { x: 0, y: 80 }, thickness: 20 },
    ])
    expect(geometry.fillComponents.length).toBe(1)
    expect(geometry.fillComponents[0].rings.length).toBe(1)
  })

  it('equal-thickness L fills outer corner via extend+union (no internal seam)', () => {
    const geometry = buildWallRenderGeometry([
      { id: 'h', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thickness: 20 },
      { id: 'v', a: { x: 0, y: 0 }, b: { x: 0, y: 80 }, thickness: 20 },
    ])

    expect(pointInFillComponents({ x: -9, y: -9 }, geometry.fillComponents)).toBe(true)
    expect(pointInFillComponents({ x: 50, y: 0 }, geometry.fillComponents)).toBe(true)
    expect(pointInFillComponents({ x: 0, y: 40 }, geometry.fillComponents)).toBe(true)
    expect(pointInFillComponents({ x: 40, y: 40 }, geometry.fillComponents)).toBe(false)
    expect(pointInFillComponents({ x: -15, y: -15 }, geometry.fillComponents)).toBe(false)
  })

  it('C-shape three walls merge to one silhouette', () => {
    const geometry = buildWallRenderGeometry([
      { id: 'v', a: { x: 0, y: 0 }, b: { x: 0, y: 100 }, thickness: 20 },
      { id: 'top', a: { x: 0, y: 0 }, b: { x: 80, y: 0 }, thickness: 20 },
      { id: 'bot', a: { x: 0, y: 100 }, b: { x: 80, y: 100 }, thickness: 20 },
    ])
    expect(geometry.fillComponents.length).toBe(1)
    expect(pointInFillComponents({ x: 0, y: 50 }, geometry.fillComponents)).toBe(true)
    expect(pointInFillComponents({ x: 40, y: 0 }, geometry.fillComponents)).toBe(true)
    expect(pointInFillComponents({ x: 40, y: 100 }, geometry.fillComponents)).toBe(true)
    // Interior of the C stays empty
    expect(pointInFillComponents({ x: 40, y: 50 }, geometry.fillComponents)).toBe(false)
  })

  it('unequal-thickness L merges to one fill', () => {
    const geometry = buildWallRenderGeometry([
      { id: 'w1', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thickness: 20 },
      { id: 'w2', a: { x: 0, y: 0 }, b: { x: 0, y: 80 }, thickness: 30 },
    ])

    expect(geometry.fillComponents.length).toBe(1)
    expect(pointInFillComponents({ x: 14, y: 40 }, geometry.fillComponents)).toBe(true)
    expect(pointInFillComponents({ x: -14, y: 40 }, geometry.fillComponents)).toBe(true)
    expect(pointInFillComponents({ x: 50, y: 0 }, geometry.fillComponents)).toBe(true)
    expect(pointInFillComponents({ x: -14, y: -9 }, geometry.fillComponents)).toBe(true)
  })

  it('unequal-thickness T mid-span merges to one fill', () => {
    const geometryT = buildWallRenderGeometry([
      { id: 'host', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thickness: 30 },
      { id: 'branch', a: { x: 50, y: 0 }, b: { x: 50, y: 60 }, thickness: 12 },
    ])
    expect(geometryT.fillComponents.length).toBe(1)
    expect(pointInFillComponents({ x: 50, y: 30 }, geometryT.fillComponents)).toBe(true)
    expect(pointInFillComponents({ x: 50, y: -10 }, geometryT.fillComponents)).toBe(true)
  })

  it('T-branch does not poke past the host outer face', () => {
    const geometry = buildWallRenderGeometry([
      { id: 'host', a: { x: 0, y: -80 }, b: { x: 0, y: 80 }, thickness: 30 },
      { id: 'branch', a: { x: 0, y: 0 }, b: { x: 80, y: 0 }, thickness: 20 },
    ])
    expect(geometry.fillComponents.length).toBe(1)
    // Host left face at x=-15; cap+inflate must not step past that façade.
    expect(pointInFillComponents({ x: -16.2, y: 0 }, geometry.fillComponents)).toBe(false)
    expect(pointInFillComponents({ x: -14, y: 0 }, geometry.fillComponents)).toBe(true)
    expect(pointInFillComponents({ x: 40, y: 0 }, geometry.fillComponents)).toBe(true)
  })

  it('U-shape merges without corner ears beyond thickness', () => {
    const walls = [
      { id: 'top', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thickness: 20 },
      { id: 'left', a: { x: 0, y: 0 }, b: { x: 0, y: 80 }, thickness: 20 },
      { id: 'right', a: { x: 100, y: 0 }, b: { x: 100, y: 80 }, thickness: 20 },
    ]
    const geometry = buildWallRenderGeometry(walls)
    expect(geometry.fillComponents.length).toBe(1)
    expect(pointInFillComponents({ x: -18, y: -18 }, geometry.fillComponents)).toBe(false)
    expect(pointInFillComponents({ x: 118, y: -18 }, geometry.fillComponents)).toBe(false)
    expect(maxFillVertexDistanceFromWallEnds(geometry.fillComponents, walls)).toBeLessThan(25)
  })

  it('unequal U: thick top flushes with thin legs (no overhang steps)', () => {
    const geometry = buildWallRenderGeometry([
      { id: 'top', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thickness: 30 },
      { id: 'left', a: { x: 0, y: 0 }, b: { x: 0, y: 80 }, thickness: 10 },
      { id: 'right', a: { x: 100, y: 0 }, b: { x: 100, y: 80 }, thickness: 10 },
    ])
    expect(geometry.fillComponents.length).toBe(1)
    // Wrong self-extend on thick top would fill x≈-15; flush with thin leg stops near x=-5
    expect(pointInFillComponents({ x: -12, y: 0 }, geometry.fillComponents)).toBe(false)
    expect(pointInFillComponents({ x: 112, y: 0 }, geometry.fillComponents)).toBe(false)
    expect(pointInFillComponents({ x: -4, y: 0 }, geometry.fillComponents)).toBe(true)
    expect(pointInFillComponents({ x: 104, y: 0 }, geometry.fillComponents)).toBe(true)
    // Thin legs still penetrate thick top so the join is solid
    expect(pointInFillComponents({ x: 0, y: -10 }, geometry.fillComponents)).toBe(true)
  })

  it('rectangle room keeps hollow interior (even-odd hole)', () => {
    const geometry = buildWallRenderGeometry([
      { id: 'top', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thickness: 20 },
      { id: 'right', a: { x: 100, y: 0 }, b: { x: 100, y: 80 }, thickness: 20 },
      { id: 'bottom', a: { x: 100, y: 80 }, b: { x: 0, y: 80 }, thickness: 20 },
      { id: 'left', a: { x: 0, y: 80 }, b: { x: 0, y: 0 }, thickness: 20 },
    ])

    expect(pointInFillComponents({ x: 50, y: -5 }, geometry.fillComponents)).toBe(true)
    expect(pointInFillComponents({ x: 50, y: 40 }, geometry.fillComponents)).toBe(false)
  })

  it('uses square caps on free ends (extended by half thickness)', () => {
    const geometry = buildWallRenderGeometry([
      { id: 'w1', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thickness: 20 },
    ])

    const w1 = geometry.wallPolygons.find((polygon) => polygon.id === 'w1')!
    // Ends extend ±10 past a/b
    expect(hasVertex(w1.points, { x: 110, y: 10 })).toBe(true)
    expect(hasVertex(w1.points, { x: 110, y: -10 })).toBe(true)
    expect(hasVertex(w1.points, { x: -10, y: 10 })).toBe(true)
    expect(hasVertex(w1.points, { x: -10, y: -10 })).toBe(true)
  })

  it('uses asymmetric balance on free ends', () => {
    const geometry = buildWallRenderGeometry([
      {
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        thickness: 20,
        balance: 0.75,
      },
    ])

    const w1 = geometry.wallPolygons.find((polygon) => polygon.id === 'w1')!
    // a→b +X: plus (balance 0.75) = links = −Y; minus = +Y
    expect(hasVertex(w1.points, { x: 110, y: -15 })).toBe(true)
    expect(hasVertex(w1.points, { x: 110, y: 5 })).toBe(true)
  })

  it('flush balance=0 L has no false exterior ear beyond the join', () => {
    // balance=0 = alles rechts van a→b: H naar +Y, V naar −X → buitenhoek (−x,−y) leeg.
    const geometry = buildWallRenderGeometry([
      { id: 'h', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thickness: 20, balance: 0 },
      { id: 'v', a: { x: 0, y: 0 }, b: { x: 0, y: 80 }, thickness: 20, balance: 0 },
    ])
    expect(geometry.fillComponents.length).toBe(1)
    expect(pointInFillComponents({ x: -8, y: -8 }, geometry.fillComponents)).toBe(false)
    expect(pointInFillComponents({ x: 50, y: 8 }, geometry.fillComponents)).toBe(true)
    expect(pointInFillComponents({ x: -8, y: 40 }, geometry.fillComponents)).toBe(true)
  })

  it('centered balance L still fills the outer corner', () => {
    const geometry = buildWallRenderGeometry([
      { id: 'h', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thickness: 20, balance: 0.5 },
      { id: 'v', a: { x: 0, y: 0 }, b: { x: 0, y: 80 }, thickness: 20, balance: 0.5 },
    ])
    expect(pointInFillComponents({ x: -8, y: -8 }, geometry.fillComponents)).toBe(true)
    expect(pointInFillComponents({ x: -15, y: -15 }, geometry.fillComponents)).toBe(false)
  })

  it('shifting one wall balance removes overhang on the emptied side', () => {
    // Thick V a→b omlaag: balance 0.1 = bijna alles rechts = −X. H mag geen +X-oor houden.
    const geometry = buildWallRenderGeometry([
      { id: 'h', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thickness: 20, balance: 0.5 },
      { id: 'v', a: { x: 0, y: 0 }, b: { x: 0, y: 80 }, thickness: 30, balance: 0.1 },
    ])
    expect(geometry.fillComponents.length).toBe(1)
    expect(pointInFillComponents({ x: 12, y: -12 }, geometry.fillComponents)).toBe(false)
    expect(pointInFillComponents({ x: 12, y: 40 }, geometry.fillComponents)).toBe(false)
    expect(pointInFillComponents({ x: -12, y: 40 }, geometry.fillComponents)).toBe(true)
    expect(pointInFillComponents({ x: 50, y: 0 }, geometry.fillComponents)).toBe(true)
  })

  it('balance=0 follows a→b: opposite directions flush the same world face (Mooiland gevels)', () => {
    // Bovengevel: a rechts→b links, balance 0 = alles visueel-rechts = −Y (naar buiten).
    const top = buildWallRenderGeometry([
      {
        id: 'top',
        a: { x: 250, y: 100 },
        b: { x: 0, y: 100 },
        thickness: 30,
        balance: 0,
      },
    ])
    expect(pointInFillComponents({ x: 125, y: 85 }, top.fillComponents)).toBe(true)
    expect(pointInFillComponents({ x: 125, y: 115 }, top.fillComponents)).toBe(false)

    // Ondergevel: a links→b rechts, balance 0 = alles visueel-rechts = +Y (naar buiten).
    const bot = buildWallRenderGeometry([
      {
        id: 'bot',
        a: { x: 0, y: 850 },
        b: { x: 250, y: 850 },
        thickness: 30,
        balance: 0,
      },
    ])
    expect(pointInFillComponents({ x: 125, y: 865 }, bot.fillComponents)).toBe(true)
    expect(pointInFillComponents({ x: 125, y: 835 }, bot.fillComponents)).toBe(false)
  })

  it('reversing a→b with complementary balance keeps the same world body', () => {
    const forward = buildWallRenderGeometry([
      { id: 'w', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thickness: 20, balance: 0 },
    ])
    const reversed = buildWallRenderGeometry([
      { id: 'w', a: { x: 100, y: 0 }, b: { x: 0, y: 0 }, thickness: 20, balance: 1 },
    ])
    expect(pointInFillComponents({ x: 50, y: 8 }, forward.fillComponents)).toBe(true)
    expect(pointInFillComponents({ x: 50, y: -8 }, forward.fillComponents)).toBe(false)
    expect(pointInFillComponents({ x: 50, y: 8 }, reversed.fillComponents)).toBe(true)
    expect(pointInFillComponents({ x: 50, y: -8 }, reversed.fillComponents)).toBe(false)
  })

  it('does not produce extreme spikes on nearly collinear joins', () => {
    const walls = [
      { id: 'w1', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thickness: 20 },
      { id: 'w2', a: { x: 100, y: 0 }, b: { x: 200, y: 4 }, thickness: 20 },
    ]
    const geometry = buildWallRenderGeometry(walls)

    for (const point of allFillPoints(geometry)) {
      expect(Math.abs(point.x)).toBeLessThan(220)
      expect(Math.abs(point.y)).toBeLessThan(80)
    }
    expect(maxFillVertexDistanceFromWallEnds(geometry.fillComponents, walls)).toBeLessThan(55)
  })

  it('keeps vertices local when junction endpoints are slightly offset', () => {
    const walls = [
      { id: 'h', a: { x: 0, y: 0 }, b: { x: 120, y: 0 }, thickness: 30 },
      { id: 'v', a: { x: 1.5, y: 1 }, b: { x: 1.5, y: 90 }, thickness: 10 },
    ]
    const geometry = buildWallRenderGeometry(walls)
    expect(geometry.fillComponents.length).toBe(1)
    expect(maxFillVertexDistanceFromWallEnds(geometry.fillComponents, walls)).toBeLessThan(40)
  })

  it('per-wall overlay polygons stay simple quads', () => {
    const geometry = buildWallRenderGeometry([
      { id: 'h', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thickness: 20 },
      { id: 'v', a: { x: 0, y: 0 }, b: { x: 0, y: 80 }, thickness: 20 },
    ])
    for (const polygon of geometry.wallPolygons) {
      expect(polygon.points.length).toBe(4)
    }
  })

  it('long thin wall stays a solid strip (no bowtie X)', () => {
    const geometry = buildWallRenderGeometry([
      { id: 'left', a: { x: 0, y: 0 }, b: { x: 0, y: 100 }, thickness: 20 },
      { id: 'mid', a: { x: 0, y: 50 }, b: { x: 200, y: 50 }, thickness: 12 },
      { id: 'right', a: { x: 200, y: 0 }, b: { x: 200, y: 100 }, thickness: 20 },
    ])
    expect(geometry.fillComponents.length).toBe(1)
    expect(pointInFillComponents({ x: 100, y: 50 }, geometry.fillComponents)).toBe(true)
    expect(pointInFillComponents({ x: 50, y: 50 }, geometry.fillComponents)).toBe(true)
    expect(pointInFillComponents({ x: 150, y: 50 }, geometry.fillComponents)).toBe(true)
    expect(pointInFillComponents({ x: 100, y: 70 }, geometry.fillComponents)).toBe(false)
  })

  it('pairwise union merges many connected walls (L10-scale)', () => {
    const walls = []
    for (let i = 0; i < 40; i += 1) {
      walls.push({
        id: `h${i}`,
        a: { x: i * 50, y: 0 },
        b: { x: (i + 1) * 50, y: 0 },
        thickness: 20,
      })
      walls.push({
        id: `v${i}`,
        a: { x: (i + 1) * 50, y: 0 },
        b: { x: (i + 1) * 50, y: 40 },
        thickness: 20,
      })
    }
    const geometry = buildWallRenderGeometry(walls)
    expect(geometry.fillComponents.length).toBeLessThan(walls.length / 2)
    expect(pointInFillComponents({ x: 25, y: 0 }, geometry.fillComponents)).toBe(true)
    expect(pointInFillComponents({ x: 500, y: 0 }, geometry.fillComponents)).toBe(true)
  })
})
