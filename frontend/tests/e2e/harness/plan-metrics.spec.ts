/**
 * Unit-tests voor referentie-metrics (geen OpenCV).
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import type { Wall } from '@/core/fml/types'
import {
  coveredLengthCm,
  countMatchedOpenings,
  collectOpeningSites,
  translateWallsToOrigin,
  wallsBBox,
} from './plan-metrics'
import { assertLengthWithinQuarter, filterPositiveThicknessWalls } from './reference-report'

function wall(
  a: { x: number; y: number },
  b: { x: number; y: number },
  thickness = 10,
  openings: Wall['openings'] = [],
): Wall {
  return {
    id: `${a.x},${a.y}-${b.x},${b.y}`,
    a,
    b,
    thickness,
    openings,
  }
}

describe('plan-metrics', () => {
  it('translateWallsToOrigin zet bbox-min op (0,0)', () => {
    const walls = [wall({ x: 100, y: 50 }, { x: 200, y: 50 })]
    const moved = translateWallsToOrigin(walls)
    expect(wallsBBox(moved)).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 0 })
  })

  it('coveredLengthCm is ~100% bij identieke muren', () => {
    const walls = [wall({ x: 0, y: 0 }, { x: 100, y: 0 })]
    expect(coveredLengthCm(walls, walls, 20)).toBeCloseTo(100, 0)
  })

  it('coveredLengthCm daalt bij verschoven muur buiten match-afstand', () => {
    const ref = [wall({ x: 0, y: 0 }, { x: 100, y: 0 })]
    const det = [wall({ x: 0, y: 50 }, { x: 100, y: 50 })]
    expect(coveredLengthCm(ref, det, 20)).toBe(0)
  })

  it('countMatchedOpenings matcht zelfde type binnen afstand', () => {
    const ref = collectOpeningSites([
      wall({ x: 0, y: 0 }, { x: 100, y: 0 }, 10, [
        { refid: 'door', type: 'door', t: 0.5, width: 90, z: 0, z_height: 210 },
      ]),
    ])
    const det = collectOpeningSites([
      wall({ x: 0, y: 0 }, { x: 100, y: 0 }, 10, [
        { refid: 'door', type: 'door', t: 0.52, width: 90, z: 0, z_height: 210 },
        { refid: 'window', type: 'window', t: 0.2, width: 120, z: 90, z_height: 120 },
      ]),
    ])
    expect(countMatchedOpenings(ref, det, 20)).toEqual({
      matched: 1,
      byType: { door: 1, window: 0 },
    })
  })
})

describe('reference-report helpers', () => {
  it('filterPositiveThicknessWalls skip thickness≤0', () => {
    const { walls, filteredZeroThickness } = filterPositiveThicknessWalls([
      wall({ x: 0, y: 0 }, { x: 10, y: 0 }, 0),
      wall({ x: 0, y: 0 }, { x: 10, y: 0 }, 12),
    ])
    expect(walls).toHaveLength(1)
    expect(filteredZeroThickness).toBe(1)
  })

  it('assertLengthWithinQuarter accepteert ±25%', () => {
    expect(assertLengthWithinQuarter(100, 100).ok).toBe(true)
    expect(assertLengthWithinQuarter(75, 100).ok).toBe(true)
    expect(assertLengthWithinQuarter(125, 100).ok).toBe(true)
    expect(assertLengthWithinQuarter(74, 100).ok).toBe(false)
    expect(assertLengthWithinQuarter(126, 100).ok).toBe(false)
  })
})
