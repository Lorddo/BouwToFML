import { describe, expect, it } from 'vitest'
import {
  buildFmlThicknessChains,
  harmonizeFmlWallThickness,
  roundFmlThicknessCm,
} from '@/core/fml/harmonize-fml-wall-thickness'
import { classifyFmlThicknessBand } from '@/core/fml/fml-wall-thickness-tiers'
import type { FloorPlan, Wall } from '@/core/fml/types'

function wall(id: string, a: { x: number; y: number }, b: { x: number; y: number }, thickness: number): Wall {
  return { id, a, b, thickness, balance: 0.5, c: null, openings: [] }
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

  it('splitst bij andere meetband op knooppunt', () => {
    const walls = [
      wall('w0', { x: 0, y: 0 }, { x: 100, y: 0 }, 10),
      wall('w1', { x: 100, y: 0 }, { x: 200, y: 0 }, 20),
    ]
    const chains = buildFmlThicknessChains(walls)
    expect(chains).toHaveLength(2)
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

  it('houdt dik-dun gescheiden als er geen tweede dikke arm is', () => {
    const walls = [
      wall('w0', { x: 0, y: 0 }, { x: 120, y: 0 }, 24),
      wall('w1', { x: 120, y: 0 }, { x: 130, y: 0 }, 10),
    ]
    const chains = buildFmlThicknessChains(walls)
    expect(chains).toHaveLength(2)
  })

  it('splitst dik en dun op T-kruising', () => {
    const walls = [
      wall('h', { x: 0, y: 0 }, { x: 100, y: 0 }, 24),
      wall('v', { x: 0, y: 0 }, { x: 0, y: 80 }, 10),
    ]
    const chains = buildFmlThicknessChains(walls)
    expect(chains).toHaveLength(2)
  })
})

describe('harmonizeFmlWallThickness', () => {
  it('harmoniseert naar absolute tier-waarde (min)', () => {
    const plan = planWithWalls([
      wall('w0', { x: 0, y: 0 }, { x: 100, y: 0 }, 10),
      wall('w1', { x: 100, y: 0 }, { x: 200, y: 0 }, 11),
      wall('w2', { x: 200, y: 0 }, { x: 300, y: 0 }, 10),
      wall('w3', { x: 300, y: 0 }, { x: 400, y: 0 }, 11.5),
    ])
    const harmonized = harmonizeFmlWallThickness(plan, defaultLimits)
    const thicknesses = harmonized.floors[0]?.walls.map((item) => item.thickness) ?? []
    expect(thicknesses).toEqual([10, 10, 10, 10])
    expect(harmonized.floors[0]?.walls.every((item) => item.balance === 0.5)).toBe(true)
  })

  it('splitst 10–12 en 20 op verschillende banden en mapt naar min/mid', () => {
    const plan = planWithWalls([
      wall('w0', { x: 0, y: 0 }, { x: 100, y: 0 }, 10),
      wall('w1', { x: 100, y: 0 }, { x: 200, y: 0 }, 12),
      wall('w2', { x: 200, y: 0 }, { x: 300, y: 0 }, 20),
    ])
    const harmonized = harmonizeFmlWallThickness(plan, defaultLimits)
    const thicknesses = harmonized.floors[0]?.walls.map((item) => item.thickness) ?? []
    expect(thicknesses[0]).toBe(10)
    expect(thicknesses[1]).toBe(20)
    expect(thicknesses[2]).toBe(20)
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
})

describe('roundFmlThicknessCm', () => {
  it('rondt op 1 decimaal', () => {
    expect(roundFmlThicknessCm(10.75)).toBe(10.8)
    expect(roundFmlThicknessCm(11)).toBe(11)
  })
})
