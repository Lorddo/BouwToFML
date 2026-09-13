import { describe, expect, it } from 'vitest'
import { compareElevationPaintStackItems } from '@/core/fml/elevation-paint'
import { ELEVATION_SAME_PLANE_CM } from '@/core/fml/facade-elevation'

describe('compareElevationPaintStackItems', () => {
  it('verder weg (lagere depth) eerst', () => {
    const far = { kind: 'roof' as const, depthCm: 0 }
    const near = { kind: 'plane' as const, depthCm: 200 }
    expect(compareElevationPaintStackItems(far, near)).toBeLessThan(0)
    expect(compareElevationPaintStackItems(near, far)).toBeGreaterThan(0)
  })

  it('zelfde gevelvlak: dak onder baksteen (voorkant kapel blijft zichtbaar)', () => {
    const roof = { kind: 'roof' as const, depthCm: 100 }
    const wall = { kind: 'plane' as const, depthCm: 100 }
    expect(compareElevationPaintStackItems(roof, wall)).toBeLessThan(0)
    expect(compareElevationPaintStackItems(wall, roof)).toBeGreaterThan(0)
    const almost = { kind: 'plane' as const, depthCm: 100 + ELEVATION_SAME_PLANE_CM }
    expect(compareElevationPaintStackItems(roof, almost)).toBeLessThan(0)
  })

  it('dakvlak dichterbij dan de kapel-muur: dak ná de muur (zijgevel doorlopend)', () => {
    const wang = { kind: 'plane' as const, depthCm: 0 }
    const parentRoof = { kind: 'roof' as const, depthCm: 80 }
    expect(compareElevationPaintStackItems(wang, parentRoof)).toBeLessThan(0)
    expect(compareElevationPaintStackItems(parentRoof, wang)).toBeGreaterThan(0)
  })

  it('dakkapel-dak ná ouderdak op hetzelfde vlak', () => {
    const parent = { kind: 'roof' as const, depthCm: 50, dormer: false }
    const child = { kind: 'roof' as const, depthCm: 50, dormer: true }
    expect(compareElevationPaintStackItems(parent, child)).toBeLessThan(0)
    expect(compareElevationPaintStackItems(child, parent)).toBeGreaterThan(0)
  })
})
