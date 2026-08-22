import { describe, expect, it } from 'vitest'
import {
  absorbJunctionBalanceStubs,
  alignWallJunctionBalance,
  buildCollinearJunctionGroups,
  JUNCTION_BALANCE_JOG_STUB_MAX_CM,
  JUNCTION_BALANCE_STUB_MAX_CM,
  quantizeBalance,
} from '@/core/fml/align-wall-junction-balance'
import type { Wall } from '@/core/fml/types'

function wall(
  id: string,
  a: { x: number; y: number },
  b: { x: number; y: number },
  thickness: number,
  balance = 0.5,
): Wall {
  return { id, a, b, thickness, balance, c: null, openings: [] }
}

describe('quantizeBalance', () => {
  it('snaps to 0/0.25/0.5/0.75/1', () => {
    expect(quantizeBalance(0.51)).toBe(0.5)
    expect(quantizeBalance(0.9)).toBe(1)
    expect(quantizeBalance(0.1)).toBe(0)
    expect(quantizeBalance(0.7)).toBe(0.75)
  })
})

describe('buildCollinearJunctionGroups', () => {
  it('groups collinear walls that share endpoints', () => {
    const joined = [
      wall('thick', { x: 0, y: 0 }, { x: 100, y: 0 }, 30),
      wall('thin', { x: 100, y: 0 }, { x: 200, y: 0 }, 10),
    ]
    const groups = buildCollinearJunctionGroups(joined)
    expect(groups).toHaveLength(1)
    expect(groups[0]?.sort()).toEqual([0, 1])
  })
})

describe('absorbJunctionBalanceStubs', () => {
  it(`absorbs stubs shorter than ${JUNCTION_BALANCE_STUB_MAX_CM}cm only at thickness-change junctions`, () => {
    const walls = [
      wall('thick', { x: 0, y: 0 }, { x: 100, y: 0 }, 30),
      wall('stub', { x: 100, y: 0 }, { x: 110, y: 0 }, 30),
      wall('thin', { x: 110, y: 0 }, { x: 200, y: 0 }, 10),
    ]
    const out = absorbJunctionBalanceStubs(walls)
    expect(out).toHaveLength(2)
    expect(out.map((item) => item.id).sort()).toEqual(['thick', 'thin'])
    const thick = out.find((item) => item.id === 'thick')!
    expect(thick.b).toEqual({ x: 110, y: 0 })
  })

  it('does not absorb short walls that are not on a thickness-change junction', () => {
    const walls = [
      wall('a', { x: 0, y: 0 }, { x: 100, y: 0 }, 30),
      wall('stub', { x: 100, y: 0 }, { x: 110, y: 0 }, 30),
      wall('b', { x: 110, y: 0 }, { x: 200, y: 0 }, 30),
    ]
    const out = absorbJunctionBalanceStubs(walls)
    expect(out).toHaveLength(3)
  })
})

describe('alignWallJunctionBalance', () => {
  it('forces measured micro-noise to 0.5 when no thickness change', () => {
    const aligned = alignWallJunctionBalance([
      wall('w0', { x: 0, y: 0 }, { x: 100, y: 0 }, 10, 0.34),
      wall('w1', { x: 100, y: 0 }, { x: 200, y: 0 }, 10, 0.62),
    ])
    expect(aligned[0]?.balance).toBe(0.5)
    expect(aligned[1]?.balance).toBe(0.5)
  })

  it('forces L-junction balances to 0.5 (not collinear thickness flush)', () => {
    const aligned = alignWallJunctionBalance([
      wall('h', { x: 0, y: 0 }, { x: 100, y: 0 }, 30, 0.72),
      wall('v', { x: 0, y: 0 }, { x: 0, y: 80 }, 10, 0.18),
    ])
    expect(aligned[0]?.balance).toBe(0.5)
    expect(aligned[1]?.balance).toBe(0.5)
  })

  it('keeps 0.5 on thickness change without face evidence', () => {
    const aligned = alignWallJunctionBalance([
      wall('mid', { x: 0, y: 0 }, { x: 0, y: 400 }, 30, 0.5),
      wall('thick', { x: 0, y: 400 }, { x: 0, y: 520 }, 47, 0.69),
    ])
    expect(aligned.find((item) => item.id === 'mid')?.balance).toBe(0.5)
    expect(aligned.find((item) => item.id === 'thick')?.balance).toBe(0.5)
  })

  it('flushes when face evidence confirms flush_minus', () => {
    // Δt=17; thick centered; thick-side flush uses asymmetric thick extents
    const evidence = new Map([
      ['mid', { plusCm: 15, minusCm: 15 }],
      ['thick', { plusCm: 32, minusCm: 15 }],
    ])
    const aligned = alignWallJunctionBalance(
      [
        wall('mid', { x: 0, y: 0 }, { x: 0, y: 400 }, 30, 0.5),
        wall('thick', { x: 0, y: 400 }, { x: 0, y: 520 }, 47, 0.69),
      ],
      evidence,
    )
    expect(aligned.find((item) => item.id === 'mid')?.balance).toBe(0.5)
    const thickB = aligned.find((item) => item.id === 'thick')?.balance ?? 0
    expect(thickB).not.toBe(0.5)
    expect([0, 0.25, 0.5, 0.75, 1]).toContain(thickB)
  })

  it('world-flush: opposite a→b still share one façade face with evidence', () => {
    const evidence = new Map([
      ['thick-top', { plusCm: 32, minusCm: 15 }],
      ['mid', { plusCm: 15, minusCm: 15 }],
      ['thick-bot', { plusCm: 32, minusCm: 15 }],
    ])
    const aligned = alignWallJunctionBalance(
      [
        wall('thick-top', { x: 0, y: 200 }, { x: 0, y: 0 }, 47, 0.34),
        wall('mid', { x: 0, y: 200 }, { x: 0, y: 600 }, 30, 0.5),
        wall('thick-bot', { x: 0, y: 600 }, { x: 0, y: 720 }, 47, 0.69),
      ],
      evidence,
    )
    expect(aligned.find((item) => item.id === 'mid')?.balance).toBe(0.5)
    const top = aligned.find((item) => item.id === 'thick-top')!
    const bot = aligned.find((item) => item.id === 'thick-bot')!
    expect(top.balance).not.toBe(0.5)
    expect(bot.balance).not.toBe(0.5)
    // Opposite directions → complementary balances for the same world face.
    expect(Math.abs(top.balance! + bot.balance! - 1)).toBeLessThan(0.26)
  })

  it('absorbs junction stub then keeps 0.5 without evidence', () => {
    const aligned = alignWallJunctionBalance([
      wall('mid', { x: 0, y: 0 }, { x: 200, y: 0 }, 30, 0.5),
      wall('stub', { x: 200, y: 0 }, { x: 208, y: 0 }, 30, 0.6),
      wall('thin', { x: 208, y: 0 }, { x: 280, y: 0 }, 10, 0.5),
    ])
    expect(aligned).toHaveLength(2)
    expect(aligned.find((item) => item.id === 'stub')).toBeUndefined()
    expect(aligned.every((item) => item.balance === 0.5)).toBe(true)
  })

  it('jog stub: snaps shorter chain onto longer hartlijn (not thick-wins)', () => {
    const aligned = alignWallJunctionBalance([
      wall('mid-long', { x: 10, y: 0 }, { x: 10, y: 500 }, 30, 0.5),
      wall('stub', { x: 0, y: 500 }, { x: 10, y: 500 }, 47, 0.5),
      wall('thick-short', { x: 0, y: 500 }, { x: 0, y: 620 }, 47, 0.69),
    ])
    expect(aligned.find((item) => item.id === 'stub')).toBeUndefined()
    const mid = aligned.find((item) => item.id === 'mid-long')!
    const thick = aligned.find((item) => item.id === 'thick-short')!
    expect(mid.a.x).toBe(10)
    expect(thick.a.x).toBe(10)
    // Without evidence → no flush
    expect(mid.balance).toBe(0.5)
    expect(thick.balance).toBe(0.5)
  })

  it(`absorbs jog stubs up to ${JUNCTION_BALANCE_JOG_STUB_MAX_CM}cm (top offset ~19)`, () => {
    const aligned = absorbJunctionBalanceStubs([
      wall('mid', { x: 10, y: 200 }, { x: 10, y: 400 }, 30),
      wall('stub', { x: 10, y: 200 }, { x: 29, y: 200 }, 47),
      wall('thick', { x: 29, y: 0 }, { x: 29, y: 200 }, 47),
    ])
    expect(aligned.find((item) => item.id === 'stub')).toBeUndefined()
    expect(aligned.find((item) => item.id === 'thick')?.a.x).toBe(10)
  })

  it('does not merge long collinear same-thickness walls when absorbing a jog stub', () => {
    const aligned = absorbJunctionBalanceStubs([
      wall('mid-a', { x: 10, y: 0 }, { x: 10, y: 100 }, 30),
      wall('mid-b', { x: 10, y: 100 }, { x: 10, y: 200 }, 30),
      wall('stub', { x: 0, y: 200 }, { x: 10, y: 200 }, 47),
      wall('thick', { x: 0, y: 200 }, { x: 0, y: 300 }, 47),
    ])
    expect(aligned.map((item) => item.id).sort()).toEqual(['mid-a', 'mid-b', 'thick'])
  })

  it('keeps continuation at 0.5 without evidence', () => {
    const aligned = alignWallJunctionBalance([
      wall('mid', { x: 0, y: 0 }, { x: 200, y: 0 }, 30, 0.5),
      wall('thin', { x: 200, y: 0 }, { x: 260, y: 0 }, 10, 0.5),
      wall('thin2', { x: 260, y: 0 }, { x: 320, y: 0 }, 10, 0.33),
    ])
    expect(aligned.every((item) => item.balance === 0.5)).toBe(true)
  })

  it('does not invent jog-stub thickness from topology when measurement is thin', () => {
    const aligned = absorbJunctionBalanceStubs([
      wall('mid', { x: 10, y: 0 }, { x: 10, y: 200 }, 30),
      wall('stub', { x: 10, y: 200 }, { x: 40, y: 200 }, 10),
      wall('thick', { x: 40, y: 200 }, { x: 40, y: 320 }, 47),
    ])
    expect(aligned.find((item) => item.id === 'stub')?.thickness).toBe(10)
  })

  it('bumps jog-stub thickness only when measurement is already near max arm', () => {
    const aligned = absorbJunctionBalanceStubs([
      wall('mid', { x: 10, y: 0 }, { x: 10, y: 200 }, 30),
      wall('stub', { x: 10, y: 200 }, { x: 40, y: 200 }, 44),
      wall('thick', { x: 40, y: 200 }, { x: 40, y: 320 }, 47),
    ])
    expect(aligned.find((item) => item.id === 'stub')?.thickness).toBe(47)
  })

  it('keeps a ~54° chamfer between offset H walls (not a near-ortho jog)', () => {
    // Diagnose-hoek: twee T's + 20 cm schuine connector, Δy ≈ 16 cm, bands 10 vs 33.
    const aligned = absorbJunctionBalanceStubs([
      wall('west-h', { x: 1279.75, y: 513.59 }, { x: 1489.3, y: 513.59 }, 10),
      wall('south-v', { x: 1489.3, y: 513.59 }, { x: 1489.3, y: 802.6 }, 10),
      wall('chamfer', { x: 1489.3, y: 513.59 }, { x: 1501.08, y: 497.31 }, 10),
      wall('east-h', { x: 1501.08, y: 497.31 }, { x: 1836.48, y: 497.31 }, 33),
      wall('north-v', { x: 1501.08, y: 497.31 }, { x: 1501.08, y: 295.54 }, 10),
    ])
    expect(aligned.map((item) => item.id).sort()).toEqual([
      'chamfer',
      'east-h',
      'north-v',
      'south-v',
      'west-h',
    ])
    expect(aligned.find((item) => item.id === 'west-h')?.a.y).toBeCloseTo(513.59, 2)
    expect(aligned.find((item) => item.id === 'east-h')?.a.y).toBeCloseTo(497.31, 2)
  })
})
