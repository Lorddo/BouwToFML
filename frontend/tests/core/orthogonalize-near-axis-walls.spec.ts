import { describe, expect, it } from 'vitest'
import {
  classifyNearAxisWall,
  NEAR_ORTHO_MAX_DEG,
  offAxisDeg,
  orthogonalizeNearAxisWalls,
} from '@/core/fml/orthogonalize-near-axis-walls'
import { harmonizeFmlWallThickness } from '@/core/fml/harmonize-fml-wall-thickness'
import type { FloorPlan, Wall } from '@/core/fml/types'

function wall(
  id: string,
  a: { x: number; y: number },
  b: { x: number; y: number },
  thickness = 10,
  openings: Wall['openings'] = [],
): Wall {
  return { id, a, b, thickness, balance: 0.5, c: null, openings }
}

function planWithWalls(walls: Wall[]): FloorPlan {
  return {
    name: 'Test',
    floors: [{ name: 'F0', level: 0, height: 280, walls }],
  }
}

describe('classifyNearAxisWall / offAxisDeg', () => {
  it(`classificeert dominant H onder ${NEAR_ORTHO_MAX_DEG}°`, () => {
    expect(classifyNearAxisWall(wall('h', { x: 0, y: 0 }, { x: 100, y: 0.5 }))).toBe('H')
    expect(offAxisDeg(Math.atan2(0.5, 100) * (180 / Math.PI))).toBeLessThan(NEAR_ORTHO_MAX_DEG)
  })

  it('laat 5,6° schuine gevel met rust', () => {
    const dy = Math.tan((5.6 * Math.PI) / 180) * 100
    expect(classifyNearAxisWall(wall('ob', { x: 0, y: 0 }, { x: 100, y: dy }))).toBeNull()
  })
})

describe('orthogonalizeNearAxisWalls', () => {
  it('recht een 0,4° H-muur in een rechthoek; L-hoek blijft gedeeld', () => {
    // ~0.4°: dy/dx = tan(0.4°) ≈ 0.007
    const skewY = 100 * Math.tan((0.4 * Math.PI) / 180)
    const walls = [
      wall('bottom', { x: 0, y: 0 }, { x: 100, y: skewY }),
      wall('right', { x: 100, y: skewY }, { x: 100, y: 80 }),
      wall('top', { x: 100, y: 80 }, { x: 0, y: 80 }),
      wall('left', { x: 0, y: 80 }, { x: 0, y: 0 }),
    ]
    const out = orthogonalizeNearAxisWalls(walls)
    const bottom = out.find((w) => w.id === 'bottom')!
    const right = out.find((w) => w.id === 'right')!
    expect(bottom.a.y).toBe(bottom.b.y)
    expect(right.a.x).toBe(right.b.x)
    expect(bottom.b).toEqual(right.a)
  })

  it('snapt lange muur met 0,3° / ~10 cm offset (geen cm-cap)', () => {
    // 0.3° over ~1910 cm → Δy ≈ 10 cm
    const length = 1910
    const dy = length * Math.tan((0.3 * Math.PI) / 180)
    expect(dy).toBeGreaterThan(9)
    const out = orthogonalizeNearAxisWalls([wall('long', { x: 0, y: 0 }, { x: length, y: dy })])
    expect(out[0].a.y).toBe(out[0].b.y)
  })

  it('laat 5,6° muur ongewijzigd', () => {
    const length = 200
    const dy = length * Math.tan((5.6 * Math.PI) / 180)
    const input = wall('oblique', { x: 0, y: 0 }, { x: length, y: dy })
    const out = orthogonalizeNearAxisWalls([input])
    expect(out[0].a).toEqual(input.a)
    expect(out[0].b).toEqual(input.b)
  })

  it('houdt parallelle H’s met korte V-jog op verschillende Y', () => {
    const walls = [
      wall('h1', { x: 0, y: 0 }, { x: 100, y: 0.2 }),
      wall('jog', { x: 100, y: 0.2 }, { x: 100.2, y: 12 }),
      wall('h2', { x: 100.2, y: 12 }, { x: 200, y: 12.3 }),
    ]
    const out = orthogonalizeNearAxisWalls(walls)
    const h1 = out.find((w) => w.id === 'h1')!
    const h2 = out.find((w) => w.id === 'h2')!
    expect(h1.a.y).toBe(h1.b.y)
    expect(h2.a.y).toBe(h2.b.y)
    expect(Math.abs(h1.a.y - h2.a.y)).toBeGreaterThan(5)
  })

  it('herprojecteert opening-t naar wereldpositie na de shift', () => {
    const walls = [
      wall('h', { x: 0, y: 0 }, { x: 100, y: 2 }, 10, [
        { refid: 'door', t: 0.5, width: 90, type: 'door' },
      ]),
    ]
    const before = {
      x: 50,
      y: 1,
    }
    const out = orthogonalizeNearAxisWalls(walls)
    const h = out[0]
    expect(h.a.y).toBe(h.b.y)
    const after = {
      x: h.a.x + h.openings[0].t * (h.b.x - h.a.x),
      y: h.a.y + h.openings[0].t * (h.b.y - h.a.y),
    }
    // Wereld-x blijft ~50; y schuift mee met de as (niet t=0.5 op scheve lijn).
    expect(after.x).toBeCloseTo(before.x, 5)
    expect(after.y).toBe(h.a.y)
  })

  it('H aansluitend op schuine gevel: vrije eind naar bevroren Y', () => {
    const obliqueDy = 100 * Math.tan((5.6 * Math.PI) / 180)
    const walls = [
      wall('oblique', { x: 100, y: 10 }, { x: 200, y: 10 + obliqueDy }),
      wall('h', { x: 0, y: 10.4 }, { x: 100, y: 10 }),
    ]
    const out = orthogonalizeNearAxisWalls(walls)
    const h = out.find((w) => w.id === 'h')!
    const oblique = out.find((w) => w.id === 'oblique')!
    expect(oblique.a).toEqual(walls[0].a)
    expect(oblique.b).toEqual(walls[0].b)
    expect(h.a.y).toBe(h.b.y)
    expect(h.b).toEqual(oblique.a)
    expect(h.a.y).toBe(10)
  })

  it('conflicterende bevroren ankers: geen half-snap die een rechte H schever maakt', () => {
    const obliqueA = 100 * Math.tan((5.6 * Math.PI) / 180)
    const obliqueB = 80 * Math.tan((6 * Math.PI) / 180)
    const walls = [
      wall('obL', { x: 0, y: 50 }, { x: 100, y: 50 + obliqueA }),
      // Exact H tussen twee oblique-ankers op verschillende Y — niet half-snappen.
      wall('h1', { x: 100, y: 50 + obliqueA }, { x: 200, y: 50 + obliqueA }),
      wall('h2', { x: 200, y: 50 + obliqueA }, { x: 300, y: 60 }),
      wall('obR', { x: 300, y: 60 }, { x: 400, y: 60 + obliqueB }),
    ]
    const out = orthogonalizeNearAxisWalls(walls)
    const h1 = out.find((w) => w.id === 'h1')!
    expect(h1.a.y).toBe(h1.b.y)
    expect(h1.a.y).toBe(walls[1].a.y)
  })
})

describe('harmonizeFmlWallThickness + near-ortho', () => {
  it('eindigt met exacte H/V op near-ortho input', () => {
    const skew = 80 * Math.tan((0.5 * Math.PI) / 180)
    const plan = planWithWalls([
      wall('bottom', { x: 0, y: 0 }, { x: 120, y: skew }),
      wall('right', { x: 120, y: skew }, { x: 120 + skew * 0.1, y: 90 }),
      wall('top', { x: 120, y: 90 }, { x: 0, y: 90 }),
      wall('left', { x: 0, y: 90 }, { x: 0, y: 0 }),
    ])
    const out = harmonizeFmlWallThickness(plan, { minCm: 10, midCm: 20, maxCm: 30 })
    for (const w of out.floors[0].walls) {
      const kind = classifyNearAxisWall(w)
      // Na snap: exact H of V (off-axis ≈ 0).
      expect(kind).not.toBeNull()
      if (kind === 'H') expect(w.a.y).toBe(w.b.y)
      if (kind === 'V') expect(w.a.x).toBe(w.b.x)
    }
  })
})
