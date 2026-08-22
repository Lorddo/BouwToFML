import { describe, expect, it } from 'vitest'
import {
  clampElevationOpeningResize,
  clampOpeningPatchKeepOppositeEdge,
  clampOpeningToStory,
  collectOpeningSnapTargets,
  ELEVATION_OPENING_SNAP_CM,
  elevationCollinearXBounds,
  elevationRectCenter,
  hitElevationHandle,
  pickElevationWallForOpeningX,
  resizeElevationRect,
  snapElevationRect,
  translateElevationRect,
} from '@/core/fml/elevation-opening-edit'
import type { ElevationWallRect } from '@/core/fml/facade-elevation'
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
    expect(clamped.z).toBe(100)
    expect(clamped.z_height).toBe(180)
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
    expect(clamped.z).toBe(40)
    expect(clamped.z! + clamped.z_height!).toBeLessThanOrEqual(140)
  })

  it('oost-resize voorbij de muur laat de westkant staan', () => {
    const host: Wall = {
      id: 'w',
      a: { x: 0, y: 0 },
      b: { x: 200, y: 0 },
      thickness: 20,
      openings: [],
    }
    const start: Opening = {
      type: 'window',
      refid: 'concept-window',
      t: 0.7,
      width: 80,
      z: 100,
      z_height: 120,
    }
    const startLeft = 0.7 * 200 - 40
    const patch = clampOpeningPatchKeepOppositeEdge(
      host,
      start,
      { t: 0.85, width: 160, z: 100, z_height: 120 },
      'e',
      280,
    )
    const left = patch.t * 200 - patch.width / 2
    expect(left).toBeCloseTo(startLeft, 5)
    expect(patch.t * 200 + patch.width / 2).toBeLessThanOrEqual(210)
  })

  it('noord-resize voorbij de verdieping laat de dorpel staan', () => {
    const host: Wall = {
      id: 'w',
      a: { x: 0, y: 0 },
      b: { x: 200, y: 0 },
      thickness: 20,
      openings: [],
    }
    const start: Opening = {
      type: 'window',
      refid: 'concept-window',
      t: 0.5,
      width: 80,
      z: 100,
      z_height: 120,
    }
    const patch = clampOpeningPatchKeepOppositeEdge(
      host,
      start,
      { t: 0.5, width: 80, z: 40, z_height: 280 },
      'n',
      280,
    )
    expect(patch.z).toBe(100)
    expect(patch.z + patch.z_height).toBeLessThanOrEqual(280)
  })

  it('elevatie-rect oost-resize stopt op de baksteen, west blijft', () => {
    const wall: ElevationWallRect = {
      wallId: 'w',
      floorIndex: 0,
      depthCm: 0,
      xa: 0,
      xb: 200,
      x0: -10,
      x1: 210,
      y0: -280,
      y1: 0,
      aTop: { x: -10, y: -280 },
      aBottom: { x: -10, y: 0 },
      bTop: { x: 210, y: -280 },
      bBottom: { x: 210, y: 0 },
      innerATop: { x: 10, y: -280 },
      innerABottom: { x: 10, y: 0 },
      innerBTop: { x: 190, y: -280 },
      innerBBottom: { x: 190, y: 0 },
    }
    const next = clampElevationOpeningResize(wall, { x0: 100, y0: -220, x1: 400, y1: -70 }, 'e')
    expect(next.x0).toBe(100)
    expect(next.x1).toBe(210)
    expect(next.y0).toBe(-220)
    expect(next.y1).toBe(-70)
  })

  it('midden van het rect is het verplaats-punt', () => {
    expect(elevationRectCenter(windowA)).toEqual({ x: 50, y: -145 })
  })

  it('hit-test vindt de bovenrand', () => {
    expect(hitElevationHandle(windowA, { x: 50, y: -220 }, 10)).toBe('n')
    expect(hitElevationHandle(windowA, { x: 50, y: -140 }, 10)).toBeNull()
  })

  it('kiest de collineaire buurmuur als het raam over de naad valt', () => {
    const left: ElevationWallRect = {
      wallId: 'gevel-l',
      floorIndex: 0,
      depthCm: 0,
      xa: 0,
      xb: 200,
      x0: -10,
      x1: 200,
      y0: -280,
      y1: 0,
      aTop: { x: -10, y: -280 },
      aBottom: { x: -10, y: 0 },
      bTop: { x: 200, y: -280 },
      bBottom: { x: 200, y: 0 },
      innerATop: { x: 10, y: -280 },
      innerABottom: { x: 10, y: 0 },
      innerBTop: { x: 190, y: -280 },
      innerBBottom: { x: 190, y: 0 },
    }
    const right: ElevationWallRect = {
      ...left,
      wallId: 'gevel-r',
      xa: 200,
      xb: 400,
      x0: 200,
      x1: 410,
      aTop: { x: 200, y: -280 },
      aBottom: { x: 200, y: 0 },
      bTop: { x: 410, y: -280 },
      bBottom: { x: 410, y: 0 },
      innerATop: { x: 210, y: -280 },
      innerABottom: { x: 210, y: 0 },
      innerBTop: { x: 390, y: -280 },
      innerBBottom: { x: 390, y: 0 },
    }
    const planWalls: Wall[] = [
      { id: 'gevel-l', a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, thickness: 20, openings: [] },
      { id: 'gevel-r', a: { x: 200, y: 0 }, b: { x: 400, y: 0 }, thickness: 20, openings: [] },
    ]
    expect(pickElevationWallForOpeningX([left, right], left, 220, planWalls).wallId).toBe('gevel-r')
    const bounds = elevationCollinearXBounds([left, right], left, planWalls)
    expect(bounds.left).toBe(-10)
    expect(bounds.right).toBe(410)
  })
})
