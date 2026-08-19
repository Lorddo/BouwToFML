import { describe, expect, it } from 'vitest'
import type { Wall } from '@/core/fml/types'
import { buildJunctions } from '@/ui/components/fml-preview-junction-core'
import {
  CORNER_AXIS_EPS_CM,
  CORNER_MARKER_PAD_CM,
  buildCornerMarkers,
  classifyWallAxis,
  innerCornerAnchorCm,
  listCornerSectors,
} from '@/ui/composables/fml-preview/fml-preview-corner-markers'

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

  it('1 mm-scheve L → 1 skew', () => {
    const walls = [wall('h', 0, 0, 100, 0.15), wall('v', 0, 0, 0, 80)]
    const [junction] = buildJunctions(walls)
    const sectors = listCornerSectors(junction, walls)
    expect(sectors).toHaveLength(1)
    expect(sectors[0].kind).toBe('skew')
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
    const walls = [wall('l', -80, 0, 0, 0), wall('r', 0, 0, 80, 0), wall('stem', 0, 0, 2, -60)]
    const hub = buildJunctions(walls).find((j) => j.refs.length === 3)
    const sectors = listCornerSectors(hub!, walls)
    expect(sectors).toHaveLength(2)
    expect(sectors.every((s) => s.kind === 'skew')).toBe(true)
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
  const skewL = [wall('h', 0, 0, 100, 0.15), wall('v', 0, 0, 0, 80)]

  it('off → leeg', () => {
    expect(buildCornerMarkers(lWalls, 'off')).toHaveLength(0)
  })

  it('square toont alleen exacte H+V', () => {
    expect(buildCornerMarkers(lWalls, 'square')).toHaveLength(1)
    expect(buildCornerMarkers(skewL, 'square')).toHaveLength(0)
  })

  it('skew toont alleen niet-H+V', () => {
    expect(buildCornerMarkers(lWalls, 'skew')).toHaveLength(0)
    expect(buildCornerMarkers(skewL, 'skew')).toHaveLength(1)
  })
})
