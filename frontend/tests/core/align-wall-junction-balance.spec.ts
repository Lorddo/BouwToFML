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

  it('keeps longest thickness band at 0.5 and flushes thicker/thinner to it', () => {
    // Hand-FML left façade: long mid 30 @0.5, thick 47 flushes to half of 30 (=15).
    const aligned = alignWallJunctionBalance([
      wall('mid', { x: 0, y: 0 }, { x: 0, y: 400 }, 30, 0.5),
      wall('thick', { x: 0, y: 400 }, { x: 0, y: 520 }, 47, 0.69),
    ])
    expect(aligned.find((item) => item.id === 'mid')?.balance).toBe(0.5)
    // Wall up → left normal −x; default/min face → B≈0.32 or 0.68 depending on hint vote.
    const thickB = aligned.find((item) => item.id === 'thick')?.balance ?? 0
    expect([0.32, 0.68]).toContain(thickB)
  })

  it('world-flush: opposite a→b still share one façade face', () => {
    // Same CL, mid centered; top thick drawn down, bottom thick drawn up.
    const aligned = alignWallJunctionBalance([
      wall('thick-top', { x: 0, y: 200 }, { x: 0, y: 0 }, 47, 0.34),
      wall('mid', { x: 0, y: 200 }, { x: 0, y: 600 }, 30, 0.5),
      wall('thick-bot', { x: 0, y: 600 }, { x: 0, y: 720 }, 47, 0.69),
    ])
    expect(aligned.find((item) => item.id === 'mid')?.balance).toBe(0.5)
    const top = aligned.find((item) => item.id === 'thick-top')!
    const bot = aligned.find((item) => item.id === 'thick-bot')!
    // Opposite directions → complementary balances for the same world face.
    expect(Math.abs(top.balance! + bot.balance! - 1)).toBeLessThan(0.02)
  })

  it('absorbs junction stub then length-anchors flush', () => {
    const aligned = alignWallJunctionBalance([
      wall('mid', { x: 0, y: 0 }, { x: 200, y: 0 }, 30, 0.5),
      wall('stub', { x: 200, y: 0 }, { x: 208, y: 0 }, 30, 0.6),
      wall('thin', { x: 208, y: 0 }, { x: 280, y: 0 }, 10, 0.5),
    ])
    expect(aligned).toHaveLength(2)
    expect(aligned.find((item) => item.id === 'stub')).toBeUndefined()
    expect(aligned.find((item) => item.id === 'mid')?.balance).toBe(0.5)
    // World-face flush (default faceLo): thin 10 → B=0 against mid half 15
    expect(aligned.find((item) => item.id === 'thin')?.balance).toBe(0)
  })

  it('jog stub: snaps shorter chain onto longer hartlijn (not thick-wins)', () => {
    // test(16) failure mode: long 30 must stay, short 47 jogs onto it.
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
    expect(mid.balance).toBe(0.5)
    const thickB = thick.balance ?? 0
    expect([0.32, 0.68]).toContain(Math.round(thickB * 100) / 100)
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

  it('applies the same flush to same-thickness continuation in the chain', () => {
    const aligned = alignWallJunctionBalance([
      wall('mid', { x: 0, y: 0 }, { x: 200, y: 0 }, 30, 0.5),
      wall('thin', { x: 200, y: 0 }, { x: 260, y: 0 }, 10, 0.5),
      wall('thin2', { x: 260, y: 0 }, { x: 320, y: 0 }, 10, 0.33),
    ])
    expect(aligned[0]?.balance).toBe(0.5)
    // Same world face for both thin continuations (not directed plus)
    expect(aligned[1]?.balance).toBe(0)
    expect(aligned[2]?.balance).toBe(0)
  })

  it('remaining jog stub inherits max arm thickness', () => {
    // Stub longer than absorb cap → stays, but T = max(30, 47)
    const aligned = absorbJunctionBalanceStubs([
      wall('mid', { x: 10, y: 0 }, { x: 10, y: 200 }, 30),
      wall('stub', { x: 10, y: 200 }, { x: 40, y: 200 }, 10),
      wall('thick', { x: 40, y: 200 }, { x: 40, y: 320 }, 47),
    ])
    expect(aligned.find((item) => item.id === 'stub')?.thickness).toBe(47)
  })
})
