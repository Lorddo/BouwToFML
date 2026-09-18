import { describe, expect, it } from 'vitest'
import {
  clampElevationTransomRect,
  transomPatchFromElevationRect,
} from '@/core/plan/elevation-transom-edit'
import type { ElevationWallRect } from '@/core/plan/facade-elevation'
import type { Opening } from '@/core/plan/types'

const wall: ElevationWallRect = {
  x0: 0,
  x1: 200,
  y0: -280,
  y1: 0,
  wallId: 'w1',
  floorIndex: 0,
  xa: 0,
  xb: 200,
  aTop: { x: 0, y: -280 },
  aBottom: { x: 0, y: 0 },
  bTop: { x: 200, y: -280 },
  bBottom: { x: 200, y: 0 },
  innerATop: { x: 0, y: -280 },
  innerABottom: { x: 0, y: 0 },
  innerBTop: { x: 200, y: -280 },
  innerBBottom: { x: 200, y: 0 },
  depthCm: 0,
}

const parent = { x0: 0, x1: 90, y0: -220, y1: 0 }
const start = { x0: 0, x1: 90, y0: -270, y1: -230 }

const door: Pick<Opening, 'z' | 'z_height' | 'type'> = {
  type: 'door',
  z: 0,
  z_height: 220,
}

describe('elevation-transom-edit', () => {
  it('move houdt hoogte en X vast; alleen de dorpel (gap) schuift', () => {
    const next = clampElevationTransomRect(
      start,
      parent,
      wall,
      { x0: 40, x1: 130, y0: -265, y1: -225 },
      'move',
    )
    expect(next.x0).toBe(0)
    expect(next.x1).toBe(90)
    expect(next.y1 - next.y0).toBeCloseTo(40, 5)
    expect(next.y1).toBeCloseTo(-225, 5)
  })

  it('move stopt op de ouder-latei (gap 0)', () => {
    const next = clampElevationTransomRect(
      start,
      parent,
      wall,
      { ...start, y0: -240, y1: -200 },
      'move',
    )
    expect(next.y1).toBeCloseTo(-220, 5)
    expect(next.y0).toBeCloseTo(-260, 5)
  })

  it('move stopt op de muurtop', () => {
    const next = clampElevationTransomRect(
      start,
      parent,
      wall,
      { ...start, y0: -300, y1: -260 },
      'move',
    )
    expect(next.y0).toBeCloseTo(-280, 5)
    expect(next.y1).toBeCloseTo(-240, 5)
  })

  it('noord-greep verandert alleen de hoogte; dorpel blijft', () => {
    const next = clampElevationTransomRect(
      start,
      parent,
      wall,
      { ...start, y0: -280 },
      'n',
    )
    expect(next.y1).toBeCloseTo(-230, 5)
    expect(next.y0).toBeCloseTo(-280, 5)
    expect(next.x0).toBe(0)
    expect(next.x1).toBe(90)
  })

  it('zuid-greep verandert de dorpel met latei vast', () => {
    const next = clampElevationTransomRect(
      start,
      parent,
      wall,
      { ...start, y1: -220 },
      's',
    )
    expect(next.y0).toBeCloseTo(-270, 5)
    expect(next.y1).toBeCloseTo(-220, 5)
  })

  it('patch: Z-rect → bovenlichtHeight + gap t.o.v. ouder-top', () => {
    const patch = transomPatchFromElevationRect(door, wall, start, 0)
    expect(patch.bovenlichtHeightCm).toBe(40)
    expect(patch.bovenlichtGapCm).toBe(10)
  })

  it('patch: flush op de latei is gap 0', () => {
    const patch = transomPatchFromElevationRect(
      door,
      wall,
      { x0: 0, x1: 90, y0: -260, y1: -220 },
      0,
    )
    expect(patch.bovenlichtGapCm).toBe(0)
    expect(patch.bovenlichtHeightCm).toBe(40)
  })
})
