import { describe, expect, it } from 'vitest'
import { classifyNearAxisWall } from '@/core/fml/orthogonalize-near-axis-walls'
import { sanitizeFmlWalls, wallsSanitizeChanged } from '@/core/fml/sanitize-fml-walls'
import { classifyWallAxis } from '@/ui/composables/fml-preview/fml-preview-corner-markers'
import type { Wall } from '@/core/fml/types'

function wall(
  id: string,
  a: { x: number; y: number },
  b: { x: number; y: number },
  thickness = 10,
  extras?: Wall['openings'] | { balance?: number; openings?: Wall['openings'] },
): Wall {
  const options = Array.isArray(extras) ? { openings: extras } : (extras ?? {})
  return {
    id,
    a,
    b,
    thickness,
    balance: options.balance ?? 0.5,
    openings: options.openings ?? [],
  }
}

describe('sanitizeFmlWalls', () => {
  it('recht een 0,4° L; balance ≠ 0,5 blijft', () => {
    const skewY = 100 * Math.tan((0.4 * Math.PI) / 180)
    const walls = [
      wall('h', { x: 0, y: 0 }, { x: 100, y: skewY }, 12, { balance: 0.2 }),
      wall('v', { x: 100, y: skewY }, { x: 100, y: 80 }, 12, { balance: 0.2 }),
    ]
    const out = sanitizeFmlWalls(walls)
    const h = out.find((item) => item.id === 'h')!
    const v = out.find((item) => item.id === 'v')!
    expect(h.a.y).toBe(h.b.y)
    expect(v.a.x).toBe(v.b.x)
    expect(h.balance).toBe(0.2)
    expect(v.balance).toBe(0.2)
    expect(classifyWallAxis(h)).toBe('h')
    expect(classifyWallAxis(v)).toBe('v')
  })

  it('korte H volledig onder lange H → slachtoffer weg, opening verhuist', () => {
    const walls = [
      wall('long', { x: 0, y: 0 }, { x: 100, y: 0 }, 10, {
        openings: [{ refid: 'keep', t: 0.1, width: 80, type: 'door' }],
      }),
      wall('short', { x: 20, y: 0.08 }, { x: 80, y: 0.12 }, 10, {
        balance: 0.35,
        openings: [{ refid: 'moved', t: 0.5, width: 90, type: 'window' }],
      }),
    ]
    const out = sanitizeFmlWalls(walls)
    expect(out.some((item) => item.id === 'short')).toBe(false)
    expect(out.some((item) => item.id === 'long')).toBe(true)
    const hosts = out.filter((item) => classifyNearAxisWall(item) === 'H')
    const moved = hosts
      .flatMap((item) => item.openings)
      .find((opening) => opening.refid === 'moved')
    expect(moved).toBeTruthy()
    const keep = hosts.flatMap((item) => item.openings).find((opening) => opening.refid === 'keep')
    expect(keep).toBeTruthy()
    const survivor = out.find((item) => item.id === 'long')
    expect(survivor?.balance).toBe(0.5)
  })

  it('twee H’s 15 cm uit elkaar blijven (gang, geen cover)', () => {
    const walls = [
      wall('a', { x: 0, y: 0 }, { x: 80, y: 0 }),
      wall('b', { x: 0, y: 15 }, { x: 80, y: 15 }),
    ]
    const out = sanitizeFmlWalls(walls)
    expect(out).toHaveLength(2)
    expect(out.map((item) => item.id).sort()).toEqual(['a', 'b'])
  })

  it('5,6° gevel ongewijzigd', () => {
    const dy = 100 * Math.tan((5.6 * Math.PI) / 180)
    const input = wall('oblique', { x: 0, y: 0 }, { x: 100, y: dy }, 20, { balance: 0.7 })
    const out = sanitizeFmlWalls([input])
    expect(out).toHaveLength(1)
    expect(out[0].a).toEqual(input.a)
    expect(out[0].b).toEqual(input.b)
    expect(out[0].balance).toBe(0.7)
    expect(classifyNearAxisWall(out[0])).toBeNull()
  })

  it('tweede run is idempotent (geen nieuwe splits)', () => {
    const walls = [
      wall('h', { x: 0, y: 0 }, { x: 80, y: 0.2 }),
      wall('v', { x: 80, y: 0.2 }, { x: 80.1, y: 60 }),
    ]
    const once = sanitizeFmlWalls(walls)
    const twice = sanitizeFmlWalls(once)
    expect(twice).toHaveLength(once.length)
    expect(wallsSanitizeChanged(once, twice)).toBe(false)
    for (let i = 0; i < once.length; i += 1) {
      expect(twice[i].id).toBe(once[i].id)
      expect(twice[i].a.x).toBeCloseTo(once[i].a.x, 9)
      expect(twice[i].a.y).toBeCloseTo(once[i].a.y, 9)
      expect(twice[i].b.x).toBeCloseTo(once[i].b.x, 9)
      expect(twice[i].b.y).toBeCloseTo(once[i].b.y, 9)
    }
  })
})
