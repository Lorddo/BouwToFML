import { describe, expect, it } from 'vitest'
import {
  mergeStraightLJunctions,
  mergeStraightLSegments,
} from '@/core/plan/merge-straight-l-junctions'
import { sanitizePlanWalls } from '@/core/plan/sanitize-plan-walls'
import type { Wall } from '@/core/plan/types'

function wall(
  id: string,
  a: { x: number; y: number },
  b: { x: number; y: number },
  extras?: Partial<Wall>,
): Wall {
  return {
    id,
    a,
    b,
    thickness: extras?.thickness ?? 20,
    balance: extras?.balance ?? 0.5,
    openings: extras?.openings ?? [],
    ...extras,
  }
}

describe('mergeStraightLJunctions', () => {
  it('last twee collineaire H-stukken op een 180°-L tot één muur', () => {
    const out = mergeStraightLJunctions([
      wall('west', { x: 0, y: 0 }, { x: 400, y: 0 }),
      wall('east', { x: 400, y: 0 }, { x: 800, y: 0 }),
    ])
    expect(out.mergedCount).toBe(1)
    expect(out.walls).toHaveLength(1)
    const span = [
      Math.min(out.walls[0].a.x, out.walls[0].b.x),
      Math.max(out.walls[0].a.x, out.walls[0].b.x),
    ]
    expect(span).toEqual([0, 800])
    expect(out.walls[0].a.y).toBe(0)
    expect(out.walls[0].b.y).toBe(0)
  })

  it('houdt een echte 90°-L (twee muren)', () => {
    const out = mergeStraightLJunctions([
      wall('h', { x: 0, y: 0 }, { x: 400, y: 0 }),
      wall('v', { x: 400, y: 0 }, { x: 400, y: 300 }),
    ])
    expect(out.mergedCount).toBe(0)
    expect(out.walls).toHaveLength(2)
  })

  it('houdt een T (host blijft geknipt)', () => {
    const out = mergeStraightLJunctions([
      wall('north', { x: 0, y: 0 }, { x: 400, y: 0 }),
      wall('south', { x: 400, y: 0 }, { x: 800, y: 0 }),
      wall('arm', { x: 400, y: 0 }, { x: 400, y: 250 }),
    ])
    expect(out.mergedCount).toBe(0)
    expect(out.walls).toHaveLength(3)
  })

  it('houdt een echte diktestap (10 vs 30)', () => {
    const out = mergeStraightLJunctions([
      wall('thin', { x: 0, y: 0 }, { x: 400, y: 0 }, { thickness: 10 }),
      wall('thick', { x: 400, y: 0 }, { x: 800, y: 0 }, { thickness: 30 }),
    ])
    expect(out.mergedCount).toBe(0)
    expect(out.walls).toHaveLength(2)
  })

  it('verhuist openingen naar de overlever op wereldpositie', () => {
    const out = mergeStraightLJunctions([
      wall('west', { x: 0, y: 0 }, { x: 400, y: 0 }, {
        openings: [{ id: 'd1', kind: 'door.single', t: 0.5, width: 80, type: 'door' }],
      }),
      wall('east', { x: 400, y: 0 }, { x: 800, y: 0 }, {
        openings: [{ id: 'w1', kind: 'window.single', t: 0.5, width: 90, type: 'window' }],
      }),
    ])
    expect(out.walls).toHaveLength(1)
    const host = out.walls[0]
    expect(host.openings.map((opening) => opening.id).sort()).toEqual(['d1', 'w1'])
    const door = host.openings.find((opening) => opening.id === 'd1')!
    const window = host.openings.find((opening) => opening.id === 'w1')!
    const doorX = host.a.x + door.t * (host.b.x - host.a.x)
    const windowX = host.a.x + window.t * (host.b.x - host.a.x)
    expect(doorX).toBeCloseTo(200, 5)
    expect(windowX).toBeCloseTo(600, 5)
  })

  it('last een keten van drie restant-T-naden', () => {
    const out = mergeStraightLJunctions([
      wall('a', { x: 0, y: 10 }, { x: 200, y: 10 }),
      wall('b', { x: 200, y: 10 }, { x: 500, y: 10 }),
      wall('c', { x: 500, y: 10 }, { x: 900, y: 10 }),
    ])
    expect(out.walls).toHaveLength(1)
    const xs = [out.walls[0].a.x, out.walls[0].b.x].sort((l, r) => l - r)
    expect(xs).toEqual([0, 900])
  })

  it('stampOwned-stuk wint van detectie bij dezelfde as', () => {
    const out = mergeStraightLJunctions([
      wall('det', { x: 0, y: 0 }, { x: 300, y: 0 }, { thickness: 20 }),
      wall('stamp', { x: 300, y: 0 }, { x: 800, y: 0 }, { thickness: 20, stampOwned: true }),
    ])
    expect(out.walls).toHaveLength(1)
    expect(out.walls[0].id).toBe('stamp')
    expect(out.walls[0].stampOwned).toBe(true)
    expect(out.remaps).toEqual([{ fromId: 'det', intoIds: ['stamp'] }])
  })
})

describe('mergeStraightLSegments', () => {
  it('last stempel-rasterstukken zonder ids', () => {
    const out = mergeStraightLSegments([
      { a: { x: 0, y: 0 }, b: { x: 120, y: 0 }, thickness: 22 },
      { a: { x: 120, y: 0 }, b: { x: 240, y: 0 }, thickness: 22 },
    ])
    expect(out).toHaveLength(1)
    const xs = [out[0].a.x, out[0].b.x].sort((l, r) => l - r)
    expect(xs).toEqual([0, 240])
    expect(out[0].thickness).toBe(22)
  })
})

describe('sanitizePlanWalls + 180°-L', () => {
  it('na T-materiaal blijft de T; zonder arm last sanitize de gevel', () => {
    const withArm = sanitizePlanWalls([
      wall('west', { x: 0, y: 0 }, { x: 400, y: 0 }),
      wall('east', { x: 400, y: 0 }, { x: 800, y: 0 }),
      wall('arm', { x: 400, y: 0 }, { x: 400, y: 200 }),
    ])
    const facade = withArm.filter((item) => Math.abs(item.a.y) < 0.01 && Math.abs(item.b.y) < 0.01)
    expect(facade.length).toBeGreaterThanOrEqual(2)

    const withoutArm = sanitizePlanWalls([
      wall('west', { x: 0, y: 0 }, { x: 400, y: 0 }),
      wall('east', { x: 400, y: 0 }, { x: 800, y: 0 }),
    ])
    const merged = withoutArm.filter(
      (item) => Math.abs(item.a.y) < 0.01 && Math.abs(item.b.y) < 0.01,
    )
    expect(merged).toHaveLength(1)
    const xs = [merged[0].a.x, merged[0].b.x].sort((l, r) => l - r)
    expect(xs[0]).toBeCloseTo(0, 5)
    expect(xs[1]).toBeCloseTo(800, 5)
  })

  it('tweede sanitize is idempotent na 180°-L', () => {
    const once = sanitizePlanWalls([
      wall('a', { x: 0, y: 50 }, { x: 300, y: 50 }),
      wall('b', { x: 300, y: 50 }, { x: 600, y: 50 }),
    ])
    const twice = sanitizePlanWalls(once)
    expect(twice).toHaveLength(1)
    expect(twice[0].id).toBe(once[0].id)
    expect(twice[0].a).toEqual(once[0].a)
    expect(twice[0].b).toEqual(once[0].b)
  })
})
