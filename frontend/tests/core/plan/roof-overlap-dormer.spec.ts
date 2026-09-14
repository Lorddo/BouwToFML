import { describe, expect, it } from 'vitest'
import { resolveDormerParent } from '@/core/plan/roof-planes'
import { validateRoofOverlap } from '@/core/plan/roof-overlap'
import type { FloorSurface } from '@/core/plan/types'

function plane(id: string, poly: Array<{ x: number; y: number }>): FloorSurface {
  return {
    id,
    poly,
    color: '#c4a36a',
    isRoof: true,
    roofKind: 'plane',
    showAreaLabel: false,
  }
}

function dormer(
  id: string,
  poly: Array<{ x: number; y: number }>,
  parentId?: string,
): FloorSurface {
  return {
    id,
    poly,
    color: '#a67c52',
    isRoof: true,
    roofKind: 'dormer',
    roofParentId: parentId,
    showAreaLabel: false,
  }
}

describe('dakkapel overlap + ouder', () => {
  const main = plane('main', [
    { x: 0, y: 0 },
    { x: 400, y: 0 },
    { x: 400, y: 300 },
    { x: 0, y: 300 },
  ])

  it('resolveDormerParent: centroid in hoofddak', () => {
    const child = dormer('d1', [
      { x: 40, y: 40 },
      { x: 120, y: 40 },
      { x: 120, y: 100 },
      { x: 40, y: 100 },
    ])
    expect(resolveDormerParent(child, [main])?.id).toBe('main')
  })

  it('resolveDormerParent: vertices in hoofddak ook zonder centroid-hit edge case', () => {
    // Centroid near edge but all verts inside
    const child = dormer('d2', [
      { x: 10, y: 10 },
      { x: 50, y: 10 },
      { x: 50, y: 40 },
      { x: 10, y: 40 },
    ])
    expect(resolveDormerParent(child, [main])?.id).toBe('main')
  })

  it('validateRoofOverlap: dakkapel mag overlappen met ouder', () => {
    const child = dormer(
      'd1',
      [
        { x: 40, y: 40 },
        { x: 120, y: 40 },
        { x: 120, y: 100 },
        { x: 40, y: 100 },
      ],
      'main',
    )
    expect(validateRoofOverlap(child, [main])).toBeNull()
  })

  it('validateRoofOverlap: twee hoofddaken mogen niet overlappen', () => {
    const other = plane('other', [
      { x: 200, y: 0 },
      { x: 500, y: 0 },
      { x: 500, y: 300 },
      { x: 200, y: 300 },
    ])
    expect(validateRoofOverlap(other, [main])?.code).toBe('plane_plane')
  })

  it('validateRoofOverlap: dakkapel zonder ouder wordt geweigerd', () => {
    const child = dormer('d1', [
      { x: 40, y: 40 },
      { x: 120, y: 40 },
      { x: 120, y: 100 },
      { x: 40, y: 100 },
    ])
    expect(validateRoofOverlap(child, [main])?.code).toBe('dormer_no_parent')
  })
})
