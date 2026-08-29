import { describe, expect, it } from 'vitest'
import {
  buildFmlThicknessChains,
  harmonizeFmlWallThickness,
  roundFmlThicknessCm,
} from '@/core/fml/harmonize-fml-wall-thickness'
import { classifyFmlThicknessBand } from '@/core/fml/fml-wall-thickness-tiers'
import type { FloorPlan, Wall } from '@/core/fml/types'

function wall(
  id: string,
  a: { x: number; y: number },
  b: { x: number; y: number },
  thickness: number,
  balance = 0.5,
): Wall {
  return { id, a, b, thickness, balance, c: null, openings: [] }
}

function planWithWalls(walls: Wall[]): FloorPlan {
  return {
    name: 'Test',
    floors: [{ name: 'F0', level: 0, height: 280, walls }],
  }
}

const defaultLimits = { minCm: 10, midCm: 20, maxCm: 30 }

describe('classifyFmlThicknessBand', () => {
  it('classificeert vaste banden', () => {
    expect(classifyFmlThicknessBand(11)).toBe('min')
    expect(classifyFmlThicknessBand(12)).toBe('mid')
    expect(classifyFmlThicknessBand(12.1)).toBe('mid')
    expect(classifyFmlThicknessBand(22)).toBe('mid')
    expect(classifyFmlThicknessBand(23)).toBe('mid')
    expect(classifyFmlThicknessBand(23.1)).toBe('max')
  })

  it('respecteert aangepaste bandgrenzen', () => {
    const boundaries = { midBoundaryCm: 15, maxBoundaryCm: 25 }
    expect(classifyFmlThicknessBand(14.9, boundaries)).toBe('min')
    expect(classifyFmlThicknessBand(15, boundaries)).toBe('mid')
    expect(classifyFmlThicknessBand(20, boundaries)).toBe('mid')
    expect(classifyFmlThicknessBand(25, boundaries)).toBe('mid')
    expect(classifyFmlThicknessBand(25.1, boundaries)).toBe('max')
  })
})

describe('buildFmlThicknessChains', () => {
  it('verbindt collineaire segmenten op één lijn', () => {
    const walls = [
      wall('w0', { x: 0, y: 0 }, { x: 100, y: 0 }, 10),
      wall('w1', { x: 100, y: 0 }, { x: 200, y: 0 }, 11),
      wall('w2', { x: 200, y: 0 }, { x: 300, y: 0 }, 10),
    ]
    const chains = buildFmlThicknessChains(walls)
    expect(chains).toHaveLength(1)
    expect(chains[0]).toEqual([0, 1, 2])
  })

  it('houdt collineaire 10/20 als één keten door het knooppunt', () => {
    const walls = [
      wall('w0', { x: 0, y: 0 }, { x: 100, y: 0 }, 10),
      wall('w1', { x: 100, y: 0 }, { x: 200, y: 0 }, 20),
    ]
    const chains = buildFmlThicknessChains(walls)
    expect(chains).toHaveLength(1)
    expect(chains[0]?.sort()).toEqual([0, 1])
  })

  it('houdt collineaire 15/10/15 als één keten door T-kruisingen', () => {
    const walls = [
      wall('left', { x: 0, y: 0 }, { x: 100, y: 0 }, 15),
      wall('mid', { x: 100, y: 0 }, { x: 200, y: 0 }, 10),
      wall('right', { x: 200, y: 0 }, { x: 360, y: 0 }, 15),
      wall('stem', { x: 100, y: 0 }, { x: 100, y: 80 }, 10),
    ]
    const chains = buildFmlThicknessChains(walls, undefined, [10, 15, 25, 30])
    expect(chains).toHaveLength(2)
    const through = chains.find(
      (chain) => chain.includes(0) && chain.includes(1) && chain.includes(2),
    )
    expect(through?.sort()).toEqual([0, 1, 2])
  })

  it('verbindt T-armen met dezelfde band', () => {
    const walls = [
      wall('h', { x: 0, y: 0 }, { x: 100, y: 0 }, 15),
      wall('v', { x: 0, y: 0 }, { x: 0, y: 80 }, 16),
    ]
    const chains = buildFmlThicknessChains(walls)
    expect(chains).toHaveLength(1)
    expect(chains[0]?.sort()).toEqual([0, 1])
  })

  it('merge dik-dun-dik als één keten via korte brug', () => {
    const walls = [
      wall('w0', { x: 0, y: 0 }, { x: 120, y: 0 }, 24),
      wall('w1', { x: 120, y: 0 }, { x: 130, y: 0 }, 10),
      wall('w2', { x: 130, y: 0 }, { x: 250, y: 0 }, 24),
    ]
    const chains = buildFmlThicknessChains(walls)
    expect(chains).toHaveLength(1)
    expect(chains[0]?.sort()).toEqual([0, 1, 2])
  })

  it('houdt collineair dik-dun als één keten ook zonder tweede dikke arm', () => {
    const walls = [
      wall('w0', { x: 0, y: 0 }, { x: 120, y: 0 }, 24),
      wall('w1', { x: 120, y: 0 }, { x: 130, y: 0 }, 10),
    ]
    const chains = buildFmlThicknessChains(walls)
    expect(chains).toHaveLength(1)
    expect(chains[0]?.sort()).toEqual([0, 1])
  })

  it('splitst dik en dun op T-kruising', () => {
    const walls = [
      wall('h', { x: 0, y: 0 }, { x: 100, y: 0 }, 24),
      wall('v', { x: 0, y: 0 }, { x: 0, y: 80 }, 10),
    ]
    const chains = buildFmlThicknessChains(walls)
    expect(chains).toHaveLength(2)
  })

  it('houdt keten heel bij meetruis rond bandgrens (hysterese)', () => {
    // midBoundary=23 → 22=mid, 24=max; relatief Δ≈8% ≤ 15% → één keten.
    const walls = [
      wall('w0', { x: 0, y: 0 }, { x: 100, y: 0 }, 22),
      wall('w1', { x: 100, y: 0 }, { x: 200, y: 0 }, 24),
    ]
    const chains = buildFmlThicknessChains(walls)
    expect(chains).toHaveLength(1)
    expect(chains[0]?.sort()).toEqual([0, 1])
  })
})

describe('harmonizeFmlWallThickness', () => {
  it('harmoniseert naar absolute tier-waarde (min) en forceert balance 0.5 zonder diktewissel', () => {
    const plan = planWithWalls([
      wall('w0', { x: 0, y: 0 }, { x: 100, y: 0 }, 10, 0.34),
      wall('w1', { x: 100, y: 0 }, { x: 200, y: 0 }, 11, 0.62),
      wall('w2', { x: 200, y: 0 }, { x: 300, y: 0 }, 10, 0.41),
      wall('w3', { x: 300, y: 0 }, { x: 400, y: 0 }, 11.5, 0.55),
    ])
    const harmonized = harmonizeFmlWallThickness(plan, defaultLimits)
    const thicknesses = harmonized.floors[0]?.walls.map((item) => item.thickness) ?? []
    expect(thicknesses).toEqual([10, 10, 10, 10])
    expect(harmonized.floors[0]?.walls.every((item) => item.balance === 0.5)).toBe(true)
  })

  it('geeft collineair 26/10 één band-dikte (geen flush-stap meer)', () => {
    const plan = planWithWalls([
      wall('thick', { x: 0, y: 0 }, { x: 150, y: 0 }, 26, 0.5),
      wall('thin', { x: 150, y: 0 }, { x: 250, y: 0 }, 10, 0.5),
    ])
    const harmonized = harmonizeFmlWallThickness(plan, defaultLimits)
    const walls = harmonized.floors[0]?.walls ?? []
    expect(walls.map((item) => item.thickness)).toEqual([30, 30])
    expect(walls.every((item) => item.balance === 0.5)).toBe(true)
  })

  it('geeft de langste collineaire band de export-dikte', () => {
    const plan = planWithWalls([
      wall('thick', { x: 0, y: 0 }, { x: 120, y: 0 }, 47, 0.34),
      wall('thin', { x: 120, y: 0 }, { x: 220, y: 0 }, 11, 0.41),
    ])
    const harmonized = harmonizeFmlWallThickness(plan, defaultLimits)
    const walls = harmonized.floors[0]?.walls ?? []
    expect(walls.map((item) => item.thickness)).toEqual([30, 30])
    expect(walls.every((item) => item.balance === 0.5)).toBe(true)
  })

  it('geeft een collineaire 10–12–20-lijn één band-dikte', () => {
    const plan = planWithWalls([
      wall('w0', { x: 0, y: 0 }, { x: 100, y: 0 }, 10),
      wall('w1', { x: 100, y: 0 }, { x: 200, y: 0 }, 12),
      wall('w2', { x: 200, y: 0 }, { x: 300, y: 0 }, 20),
    ])
    const harmonized = harmonizeFmlWallThickness(plan, defaultLimits)
    const thicknesses = harmonized.floors[0]?.walls.map((item) => item.thickness) ?? []
    expect(thicknesses).toEqual([20, 20, 20])
  })

  it('catalogus: collineaire 15/10/15 door T → één cm, geen flush-balance', () => {
    const plan = planWithWalls([
      wall('left', { x: 0, y: 0 }, { x: 112, y: 0 }, 15),
      wall('mid', { x: 112, y: 0 }, { x: 222, y: 0 }, 10, 0.75),
      wall('right', { x: 222, y: 0 }, { x: 479, y: 0 }, 15),
      wall('stem', { x: 112, y: 0 }, { x: 112, y: 128 }, 10),
    ])
    const catalog = [7, 10, 15, 25, 30]
    const harmonized = harmonizeFmlWallThickness(
      plan,
      { minCm: 7, midCm: 15, maxCm: 30, thicknessCms: catalog },
      undefined,
      undefined,
      undefined,
      catalog,
    )
    const byId = new Map(harmonized.floors[0]?.walls.map((w) => [w.id, w]))
    expect(byId.get('left')?.thickness).toBe(15)
    expect(byId.get('mid')?.thickness).toBe(15)
    expect(byId.get('right')?.thickness).toBe(15)
    expect(byId.get('left')?.balance).toBe(0.5)
    expect(byId.get('mid')?.balance).toBe(0.5)
    expect(byId.get('right')?.balance).toBe(0.5)
    expect(byId.get('stem')?.thickness).toBe(10)
  })

  it('mapt hoge band naar absolute max-waarde', () => {
    const plan = planWithWalls([
      wall('w0', { x: 0, y: 0 }, { x: 100, y: 0 }, 26),
      wall('w1', { x: 100, y: 0 }, { x: 200, y: 0 }, 30),
    ])
    const harmonized = harmonizeFmlWallThickness(plan, defaultLimits)
    expect(harmonized.floors[0]?.walls[0]?.thickness).toBe(30)
    expect(harmonized.floors[0]?.walls[1]?.thickness).toBe(30)
  })

  it('geeft dik-dun-dik keten de dikke export-tier', () => {
    const plan = planWithWalls([
      wall('w0', { x: 0, y: 0 }, { x: 120, y: 0 }, 24),
      wall('w1', { x: 120, y: 0 }, { x: 130, y: 0 }, 10),
      wall('w2', { x: 130, y: 0 }, { x: 250, y: 0 }, 24),
    ])
    const harmonized = harmonizeFmlWallThickness(plan, defaultLimits)
    const thicknesses = harmonized.floors[0]?.walls.map((item) => item.thickness) ?? []
    expect(thicknesses).toEqual([30, 30, 30])
  })

  it('flusht geharmoniseerde dikte terug naar designs[0]', () => {
    const raw = wall('e0', { x: 0, y: 0 }, { x: 100, y: 0 }, 19.12)
    const plan: FloorPlan = {
      name: 'Test',
      floors: [
        {
          name: 'F0',
          level: 0,
          height: 280,
          walls: [raw],
          designs: [{ name: 'F0', walls: [{ ...raw }] }],
          activeDesignIndex: 0,
        },
      ],
    }
    const harmonized = harmonizeFmlWallThickness(plan, defaultLimits)
    expect(harmonized.floors[0]?.walls[0]?.thickness).toBe(20)
    expect(harmonized.floors[0]?.designs?.[0].walls[0]?.thickness).toBe(20)
  })

  it('slaat pinned wall ids over (dikte + keten-vote)', () => {
    const plan = planWithWalls([
      wall('pinned', { x: 0, y: 0 }, { x: 100, y: 0 }, 35),
      wall('free', { x: 100, y: 0 }, { x: 200, y: 0 }, 11),
    ])
    const harmonized = harmonizeFmlWallThickness(plan, defaultLimits, undefined, undefined, [
      'pinned',
    ])
    const byId = new Map(harmonized.floors[0]?.walls.map((w) => [w.id, w.thickness]))
    expect(byId.get('pinned')).toBe(35)
    expect(byId.get('free')).toBe(10)
  })

  it('catalogus [15,20] op een T → twee diktes', () => {
    const plan = planWithWalls([
      wall('h', { x: 0, y: 0 }, { x: 100, y: 0 }, 15),
      wall('v', { x: 0, y: 0 }, { x: 0, y: 80 }, 20),
    ])
    const catalog = [15, 20, 30]
    const harmonized = harmonizeFmlWallThickness(
      plan,
      { minCm: 15, midCm: 20, maxCm: 30, thicknessCms: catalog },
      undefined,
      undefined,
      undefined,
      catalog,
    )
    const byId = new Map(harmonized.floors[0]?.walls.map((w) => [w.id, w.thickness]))
    expect(byId.get('h')).toBe(15)
    expect(byId.get('v')).toBe(20)
  })

  it('lege catalogus → 10/20/30 via limits', () => {
    const plan = planWithWalls([
      wall('thin', { x: 0, y: 0 }, { x: 100, y: 0 }, 11),
      wall('mid', { x: 0, y: 0 }, { x: 0, y: 80 }, 19),
    ])
    const harmonized = harmonizeFmlWallThickness(
      plan,
      defaultLimits,
      undefined,
      undefined,
      undefined,
      [],
    )
    const thicknesses = harmonized.floors[0]?.walls.map((w) => w.thickness) ?? []
    expect(thicknesses).toEqual([10, 20])
  })

  it('pinned stamp blijft ongewijzigd met catalogus', () => {
    const plan = planWithWalls([
      wall('stamp', { x: 0, y: 0 }, { x: 100, y: 0 }, 35),
      wall('free', { x: 100, y: 0 }, { x: 200, y: 0 }, 16),
    ])
    const catalog = [10, 20, 30]
    const harmonized = harmonizeFmlWallThickness(
      plan,
      { minCm: 10, midCm: 20, maxCm: 30, thicknessCms: catalog },
      undefined,
      undefined,
      ['stamp'],
      catalog,
    )
    const byId = new Map(harmonized.floors[0]?.walls.map((w) => [w.id, w.thickness]))
    expect(byId.get('stamp')).toBe(35)
    expect(byId.get('free')).toBe(20)
  })
})

describe('roundFmlThicknessCm', () => {
  it('rondt op 1 decimaal', () => {
    expect(roundFmlThicknessCm(10.75)).toBe(10.8)
    expect(roundFmlThicknessCm(11)).toBe(11)
  })
})
