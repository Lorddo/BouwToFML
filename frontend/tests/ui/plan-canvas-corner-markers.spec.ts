import { describe, expect, it } from 'vitest'
import type { Wall } from '@/core/plan/types'
import { buildJunctions } from '@/core/plan/junction-core'
import {
  CORNER_AXIS_EPS_CM,
  CORNER_MARKER_PAD_CM,
  CORNER_SQUARE_EPS_DEG,
  buildCornerMarkers,
  classifyWallAxis,
  innerCornerAnchorCm,
  listCornerSectors,
} from '@/ui/composables/plan-canvas/plan-canvas-corner-markers'

function wall(id: string, ax: number, ay: number, bx: number, by: number): Wall {
  return { id, a: { x: ax, y: ay }, b: { x: bx, y: by }, thickness: 20, openings: [] }
}

describe('classifyWallAxis', () => {
  it('H als |dy| ≤ ε, V als |dx| ≤ ε', () => {
    expect(classifyWallAxis(wall('h', 0, 10, 80, 10))).toBe('h')
    expect(classifyWallAxis(wall('v', 5, 0, 5, 80))).toBe('v')
    expect(classifyWallAxis(wall('d', 0, 0, 80, 80))).toBeNull()
  })

  it('near-H binnen ε is H, erbuiten niet', () => {
    expect(classifyWallAxis(wall('in', 0, 0, 100, CORNER_AXIS_EPS_CM))).toBe('h')
    expect(classifyWallAxis(wall('out', 0, 0, 100, CORNER_AXIS_EPS_CM + 0.01))).toBeNull()
  })
})

describe('listCornerSectors', () => {
  it('perfect L → 1 square', () => {
    const walls = [wall('h', 0, 0, 100, 0), wall('v', 0, 0, 0, 80)]
    const [junction] = buildJunctions(walls)
    const sectors = listCornerSectors(junction, walls)
    expect(sectors).toHaveLength(1)
    expect(sectors[0].kind).toBe('square')
    expect(sectors[0].x).toBeGreaterThan(10)
    expect(sectors[0].y).toBeGreaterThan(10)
  })

  it('niet-haakse L (~5°) → 1 skew', () => {
    const walls = [wall('h', 0, 0, 100, Math.tan((5 * Math.PI) / 180) * 100), wall('v', 0, 0, 0, 80)]
    const [junction] = buildJunctions(walls)
    const sectors = listCornerSectors(junction, walls)
    expect(sectors).toHaveLength(1)
    expect(sectors[0].kind).toBe('skew')
  })

  it('gedraaide haakse L (45°) → 1 square', () => {
    const walls = [wall('a', 0, 0, 80, 80), wall('b', 0, 0, -80, 80)]
    const [junction] = buildJunctions(walls)
    const sectors = listCornerSectors(junction, walls)
    expect(sectors).toHaveLength(1)
    expect(sectors[0].kind).toBe('square')
  })

  it('≤ 0,005° van 90° is square; 0,01° is skew', () => {
    expect(CORNER_SQUARE_EPS_DEG).toBe(0.005)
    const ray = (deg: number): [number, number] => {
      const rad = (deg * Math.PI) / 180
      return [Math.cos(rad) * 100, Math.sin(rad) * 100]
    }
    const exact = [wall('h', 0, 0, 100, 0), wall('v', 0, 0, 0, 100)]
    const atEps = [wall('h', 0, 0, 100, 0), wall('a', 0, 0, ...ray(90 - CORNER_SQUARE_EPS_DEG))]
    const off = [wall('h', 0, 0, 100, 0), wall('a', 0, 0, ...ray(89.99))]
    expect(listCornerSectors(buildJunctions(exact)[0], exact)[0].kind).toBe('square')
    expect(listCornerSectors(buildJunctions(atEps)[0], atEps)[0].kind).toBe('square')
    expect(listCornerSectors(buildJunctions(off)[0], off)[0].kind).toBe('skew')
  })

  it('2e-13 cm dy (atan2-ruis) is square, geen !', () => {
    const residual = 2.2737367544323206e-13
    const walls = [
      wall('h', 0, 0, 163.634, residual),
      wall('v', 163.634, residual, 163.634, 80),
      wall('cont', 163.634, residual, 220, residual),
    ]
    const junction = buildJunctions(walls).find((node) => node.refs.length === 3)
    expect(junction).toBeTruthy()
    const sectors = listCornerSectors(junction!, walls)
    expect(sectors.length).toBeGreaterThan(0)
    expect(sectors.every((sector) => sector.kind === 'square')).toBe(true)
    expect(buildCornerMarkers(walls, 'skew')).toHaveLength(0)
  })

  it('collinear doorgang → 0', () => {
    const walls = [wall('l', -80, 0, 0, 0), wall('r', 0, 0, 80, 0)]
    const [junction] = buildJunctions(walls)
    expect(listCornerSectors(junction, walls)).toHaveLength(0)
  })

  it('doodlopend → 0', () => {
    const walls = [wall('only', 0, 0, 80, 0)]
    const [junction] = buildJunctions(walls)
    expect(listCornerSectors(junction, walls)).toHaveLength(0)
  })

  it('perfect T (H-stam + V-tak) → 2 square, geen platte zijde', () => {
    const walls = [wall('l', -80, 0, 0, 0), wall('r', 0, 0, 80, 0), wall('stem', 0, 0, 0, -60)]
    const junctions = buildJunctions(walls)
    const hub = junctions.find((j) => j.refs.length === 3)
    expect(hub).toBeTruthy()
    const sectors = listCornerSectors(hub!, walls)
    expect(sectors).toHaveLength(2)
    expect(sectors.every((s) => s.kind === 'square')).toBe(true)
  })

  it('scheve T-tak → 2 skew', () => {
    const walls = [wall('l', -80, 0, 0, 0), wall('r', 0, 0, 80, 0), wall('stem', 0, 0, 8, -60)]
    const hub = buildJunctions(walls).find((j) => j.refs.length === 3)
    const sectors = listCornerSectors(hub!, walls)
    expect(sectors).toHaveLength(2)
    expect(sectors.every((s) => s.kind === 'skew')).toBe(true)
  })

  it('gedraaide haakse T (45°) → 2 square', () => {
    const walls = [
      wall('l', -80, -80, 0, 0),
      wall('r', 0, 0, 80, 80),
      wall('stem', 0, 0, -80, 80),
    ]
    const hub = buildJunctions(walls).find((j) => j.refs.length === 3)
    const sectors = listCornerSectors(hub!, walls)
    expect(sectors).toHaveLength(2)
    expect(sectors.every((s) => s.kind === 'square')).toBe(true)
  })

  it('perfect X → 4 square', () => {
    const walls = [
      wall('w', -80, 0, 0, 0),
      wall('e', 0, 0, 80, 0),
      wall('n', 0, 0, 0, -60),
      wall('s', 0, 0, 0, 60),
    ]
    const hub = buildJunctions(walls).find((j) => j.refs.length === 4)
    const sectors = listCornerSectors(hub!, walls)
    expect(sectors).toHaveLength(4)
    expect(sectors.every((s) => s.kind === 'square')).toBe(true)
  })
})

describe('innerCornerAnchorCm', () => {
  it('L t=20 balance 0.5: binnenhoek op (10,10), daarna pad de sector in', () => {
    const h = wall('h', 0, 0, 100, 0)
    const v = wall('v', 0, 0, 0, 80)
    const dirA = { x: 1, y: 0 }
    const dirB = { x: 0, y: 1 }
    const bisector = { x: Math.SQRT1_2, y: Math.SQRT1_2 }
    const face = innerCornerAnchorCm({ x: 0, y: 0 }, h, dirA, v, dirB, bisector, 0)
    expect(face.x).toBeCloseTo(10)
    expect(face.y).toBeCloseTo(10)
    const padded = innerCornerAnchorCm({ x: 0, y: 0 }, h, dirA, v, dirB, bisector)
    expect(padded.x).toBeCloseTo(10 + Math.SQRT1_2 * CORNER_MARKER_PAD_CM)
    expect(padded.y).toBeCloseTo(10 + Math.SQRT1_2 * CORNER_MARKER_PAD_CM)
  })

  it('dikte 30 + balance 0.5 schuift verder naar buiten', () => {
    const h: Wall = { ...wall('h', 0, 0, 100, 0), thickness: 30 }
    const v: Wall = { ...wall('v', 0, 0, 0, 80), thickness: 30 }
    const face = innerCornerAnchorCm(
      { x: 0, y: 0 },
      h,
      { x: 1, y: 0 },
      v,
      { x: 0, y: 1 },
      { x: Math.SQRT1_2, y: Math.SQRT1_2 },
      0,
    )
    expect(face.x).toBeCloseTo(15)
    expect(face.y).toBeCloseTo(15)
  })
})

describe('buildCornerMarkers', () => {
  const lWalls = [wall('h', 0, 0, 100, 0), wall('v', 0, 0, 0, 80)]
  const rotatedSquare = [wall('a', 0, 0, 80, 80), wall('b', 0, 0, -80, 80)]
  const skewL = [wall('h', 0, 0, 100, Math.tan((5 * Math.PI) / 180) * 100), wall('v', 0, 0, 0, 80)]

  it('off → leeg', () => {
    expect(buildCornerMarkers(lWalls, 'off')).toHaveLength(0)
  })

  it('square toont alleen exacte 90° (H/V én gedraaid)', () => {
    expect(buildCornerMarkers(lWalls, 'square')).toHaveLength(1)
    expect(buildCornerMarkers(rotatedSquare, 'square')).toHaveLength(1)
    expect(buildCornerMarkers(skewL, 'square')).toHaveLength(0)
  })

  it('skew toont alleen niet-90°', () => {
    expect(buildCornerMarkers(lWalls, 'skew')).toHaveLength(0)
    expect(buildCornerMarkers(rotatedSquare, 'skew')).toHaveLength(0)
    expect(buildCornerMarkers(skewL, 'skew')).toHaveLength(1)
  })
})
