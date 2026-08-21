import { describe, expect, it } from 'vitest'
import {
  clampOpeningToStory,
  collectOpeningSnapTargets,
  ELEVATION_OPENING_SNAP_CM,
  hitElevationHandle,
  resizeElevationRect,
  snapElevationRect,
  translateElevationRect,
} from '@/core/fml/elevation-opening-edit'
import type { Opening, Wall } from '@/core/fml/types'

const windowA = { openingId: 'a', x0: 0, x1: 100, y0: -220, y1: -70 }
const windowB = { openingId: 'b', x0: 200, x1: 300, y0: -210, y1: -70 }

describe('elevation-opening-edit', () => {
  it('noord-rand houdt dorpel vast en verandert alleen de top', () => {
    const next = resizeElevationRect(windowA, 'n', { x: 50, y: -250 })
    expect(next.y1).toBe(-70)
    expect(next.y0).toBe(-250)
    expect(next.x0).toBe(0)
    expect(next.x1).toBe(100)
  })

  it('zuid-rand houdt latei vast', () => {
    const next = resizeElevationRect(windowA, 's', { x: 50, y: -40 })
    expect(next.y0).toBe(-220)
    expect(next.y1).toBe(-40)
  })

  it('snapt bij verplaatsen de dichtstbijzijnde dorpel of latei', () => {
    const moved = translateElevationRect(windowA, 0, 2)
    const targets = collectOpeningSnapTargets([windowA, windowB], 'a')
    const snapped = snapElevationRect(moved, 'move', targets, ELEVATION_OPENING_SNAP_CM)
    expect(snapped.rect.y1).toBeCloseTo(windowB.y1, 5)
    expect(snapped.guide.y).toBe(windowB.y1)
  })

  it('snapt latei bij noord-resize binnen slack', () => {
    const resized = resizeElevationRect(windowA, 'n', { x: 50, y: -206 })
    const targets = collectOpeningSnapTargets([windowA, windowB], 'a')
    const snapped = snapElevationRect(resized, 'n', targets)
    expect(snapped.rect.y0).toBeCloseTo(windowB.y0, 5)
    expect(snapped.rect.y1).toBe(-70)
    expect(snapped.guide.y).toBe(windowB.y0)
  })

  it('houdt raam onder de verdiepingshoogte', () => {
    const host: Wall = {
      id: 'w',
      a: { x: 0, y: 0 },
      b: { x: 100, y: 0 },
      thickness: 20,
      openings: [],
    }
    const opening: Opening = {
      type: 'window',
      refid: 'concept-window',
      t: 0.5,
      width: 100,
      z: 100,
      z_height: 220,
    }
    const clamped = clampOpeningToStory(opening, host, 280)
    expect((clamped.z ?? 0) + (clamped.z_height ?? 0)).toBeLessThanOrEqual(280)
    expect(clamped.z_height).toBe(220)
    expect(clamped.z).toBe(60)
  })

  it('houdt raam onder een schuine muurtop', () => {
    const host: Wall = {
      id: 'w',
      a: { x: 0, y: 0 },
      b: { x: 100, y: 0 },
      thickness: 20,
      openings: [],
      extras: { az: { z: 0, h: 280 }, bz: { z: 0, h: 0 } },
    }
    const opening: Opening = {
      type: 'window',
      refid: 'concept-window',
      t: 0.5,
      width: 80,
      z: 40,
      z_height: 150,
    }
    const clamped = clampOpeningToStory(opening, host, 280)
    expect(clamped.z! + clamped.z_height!).toBeLessThanOrEqual(140)
  })

  it('hit-test vindt de bovenrand', () => {
    expect(hitElevationHandle(windowA, { x: 50, y: -220 }, 10)).toBe('n')
    expect(hitElevationHandle(windowA, { x: 50, y: -140 }, 10)).toBeNull()
  })
})
