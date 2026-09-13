import { describe, expect, it } from 'vitest'
import {
  clampElevationOpeningMove,
  clampElevationOpeningResize,
  clampOpeningMoveKeepSize,
  clampOpeningPatchKeepOppositeEdge,
  clampOpeningToStory,
  collectOpeningSnapTargets,
  openingShapeSnapEdges,
  ELEVATION_OPENING_SNAP_CM,
  elevationCollinearXBounds,
  elevationRectCenter,
  hitElevationHandle,
  pickElevationWallForOpeningX,
  resizeElevationRect,
  snapElevationRect,
  translateElevationRect,
  wallSideForElevationResize,
} from '@/core/fml/elevation-opening-edit'
import { MAX_OPENING_WIDTH_CM } from '@/ui/components/plan-canvas-openings'
import type { ElevationWallRect } from '@/core/fml/facade-elevation'
import { type Opening,
  type Wall } from '@/core/fml/types'

const windowA = { openingId: 'a', x0: 0, x1: 100, y0: -220, y1: -70 }
const windowB = { openingId: 'b', x0: 200, x1: 300, y0: -210, y1: -70 }

describe('elevation-opening-edit', () => {
  it('wisselt oost/west als muur-A rechts in het aanzicht ligt', () => {
    expect(wallSideForElevationResize('e', true)).toBe('e')
    expect(wallSideForElevationResize('w', true)).toBe('w')
    expect(wallSideForElevationResize('e', false)).toBe('w')
    expect(wallSideForElevationResize('w', false)).toBe('e')
    expect(wallSideForElevationResize('n', false)).toBe('n')
  })

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

  it('plaatst een raam in de kopgevel boven floor.height', () => {
    const host: Wall = {
      id: 'w',
      a: { x: 0, y: 0 },
      b: { x: 100, y: 0 },
      thickness: 20,
      openings: [],
      extras: { az: { z: 0, h: 400 }, bz: { z: 0, h: 400 } },
    }
    const opening: Opening = {
      type: 'window',
      id: 'win-concept',
      kind: 'window.single',
      t: 0.5,
      width: 80,
      z: 200,
      z_height: 180,
    }
    const clamped = clampOpeningToStory(opening, host, 280)
    expect(clamped.z).toBe(200)
    expect(clamped.z_height).toBe(180)
    expect(clamped.z! + clamped.z_height!).toBe(380)
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
      id: 'win-concept',
      kind: 'window.single',
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

  it('verplaatsen tegen de muurtop houdt de hoogte vast', () => {
    const host: Wall = {
      id: 'w',
      a: { x: 0, y: 0 },
      b: { x: 100, y: 0 },
      thickness: 20,
      openings: [],
    }
    const opening: Opening = {
      type: 'window',
      id: 'win-concept',
      kind: 'window.single',
      t: 0.5,
      width: 80,
      z: 200,
      z_height: 120,
    }
    const moved = clampOpeningMoveKeepSize({ ...opening, z: 220 }, host, 280)
    expect(moved.z_height).toBe(120)
    expect(moved.width).toBe(80)
    expect(moved.z).toBe(160)
    expect((moved.z ?? 0) + (moved.z_height ?? 0)).toBe(280)
  })

  it('verplaatsen mag boven de verdieping als de muur hoger is', () => {
    const host: Wall = {
      id: 'w',
      a: { x: 0, y: 0 },
      b: { x: 100, y: 0 },
      thickness: 20,
      openings: [],
      extras: { az: { z: 0, h: 400 }, bz: { z: 0, h: 400 } },
    }
    const opening: Opening = {
      type: 'window',
      id: 'win-concept',
      kind: 'window.single',
      t: 0.5,
      width: 80,
      z: 200,
      z_height: 140,
    }
    const moved = clampOpeningMoveKeepSize({ ...opening, z: 280 }, host, 280)
    expect(moved.z).toBe(260)
    expect(moved.z_height).toBe(140)
    expect((moved.z ?? 0) + (moved.z_height ?? 0)).toBe(400)
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
      id: 'win-concept',
      kind: 'window.single',
      t: 0.5,
      width: 80,
      z: 40,
      z_height: 150,
    }
    const clamped = clampOpeningToStory(opening, host, 280)
    expect(clamped.z).toBe(40)
    expect(clamped.z! + clamped.z_height!).toBeLessThanOrEqual(140)
  })

  it('oost-resize boven 4 m houdt de westkant vast', () => {
    const host: Wall = {
      id: 'w',
      a: { x: 0, y: 0 },
      b: { x: 1200, y: 0 },
      thickness: 20,
      openings: [],
    }
    const start: Opening = {
      type: 'window',
      id: 'win-concept',
      kind: 'window.single',
      t: 0.2,
      width: 100,
      z: 100,
      z_height: 120,
    }
    const startLeft = 0.2 * 1200 - 50
    const nextRight = startLeft + 600
    const patch = clampOpeningPatchKeepOppositeEdge(
      host,
      start,
      { t: (startLeft + nextRight) / 2 / 1200, width: 600, z: 100, z_height: 120 },
      'e',
      280,
    )
    expect(patch.width).toBe(600)
    expect(patch.t * 1200 - patch.width / 2).toBeCloseTo(startLeft, 5)
  })

  it('oost-resize voorbij de max-breedte verschuift niet', () => {
    const host: Wall = {
      id: 'w',
      a: { x: 0, y: 0 },
      b: { x: 3000, y: 0 },
      thickness: 20,
      openings: [],
    }
    const start: Opening = {
      type: 'window',
      id: 'win-concept',
      kind: 'window.single',
      t: 0.1,
      width: 80,
      z: 100,
      z_height: 120,
    }
    const startLeft = 0.1 * 3000 - 40
    const patch = clampOpeningPatchKeepOppositeEdge(
      host,
      start,
      { t: 0.6, width: MAX_OPENING_WIDTH_CM + 800, z: 100, z_height: 120 },
      'e',
      280,
    )
    expect(patch.width).toBe(MAX_OPENING_WIDTH_CM)
    expect(patch.t * 3000 - patch.width / 2).toBeCloseTo(startLeft, 5)
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
      id: 'win-concept',
      kind: 'window.single',
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

  it('oost-resize op een muur met A rechts houdt de westkant vast', () => {
    const host: Wall = {
      id: 'w',
      a: { x: 200, y: 0 },
      b: { x: 0, y: 0 },
      thickness: 20,
      openings: [],
    }
    const start: Opening = {
      type: 'window',
      id: 'win-concept',
      kind: 'window.single',
      t: 0.5,
      width: 80,
      z: 100,
      z_height: 120,
    }
    const worldX = (distFromA: number) => 200 - distFromA
    const startVisualLeft = worldX(0.5 * 200 + 40)
    const patch = clampOpeningPatchKeepOppositeEdge(
      host,
      start,
      { t: 0.4, width: 120, z: 100, z_height: 120 },
      'e',
      280,
      [],
      false,
    )
    const visualLeft = Math.min(
      worldX(patch.t * 200 - patch.width / 2),
      worldX(patch.t * 200 + patch.width / 2),
    )
    expect(visualLeft).toBeCloseTo(startVisualLeft, 5)
    expect(patch.width).toBe(120)
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
      id: 'win-concept',
      kind: 'window.single',
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

  it('noord-resize op een kopgevel stopt op de muurtop, niet op floor.height', () => {
    const host: Wall = {
      id: 'w',
      a: { x: 0, y: 0 },
      b: { x: 200, y: 0 },
      thickness: 20,
      openings: [],
      extras: { az: { z: 0, h: 400 }, bz: { z: 0, h: 400 } },
    }
    const start: Opening = {
      type: 'window',
      id: 'win-concept',
      kind: 'window.single',
      t: 0.5,
      width: 80,
      z: 100,
      z_height: 120,
    }
    const patch = clampOpeningPatchKeepOppositeEdge(
      host,
      start,
      { t: 0.5, width: 80, z: 100, z_height: 280 },
      'n',
      280,
    )
    expect(patch.z).toBe(100)
    expect(patch.z + patch.z_height).toBe(380)
  })

  it('verplaats-rect houdt breedte en hoogte vast tegen de muurrand', () => {
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
    const next = clampElevationOpeningMove(
      wall,
      { x0: -40, y0: -300, x1: 60, y1: -180 },
      { left: -10, right: 210 },
    )
    expect(next.x1 - next.x0).toBe(100)
    expect(next.y1 - next.y0).toBe(120)
    expect(next.x0).toBe(-10)
    expect(next.y0).toBe(-280)
  })

  it('verplaats-rect op een schuine top krimpt niet', () => {
    const wall: ElevationWallRect = {
      wallId: 'w',
      floorIndex: 0,
      depthCm: 0,
      xa: 0,
      xb: 200,
      x0: 0,
      x1: 200,
      y0: -400,
      y1: 0,
      aTop: { x: 0, y: -400 },
      aBottom: { x: 0, y: 0 },
      bTop: { x: 200, y: -200 },
      bBottom: { x: 200, y: 0 },
      innerATop: { x: 0, y: -400 },
      innerABottom: { x: 0, y: 0 },
      innerBTop: { x: 200, y: -200 },
      innerBBottom: { x: 200, y: 0 },
    }
    const next = clampElevationOpeningMove(wall, { x0: 140, y0: -360, x1: 220, y1: -240 })
    expect(next.x1 - next.x0).toBe(80)
    expect(next.y1 - next.y0).toBe(120)
    expect(next.y0).toBeGreaterThanOrEqual(-400)
    expect(next.y1).toBeLessThanOrEqual(0)
  })

  it('driehoekraam mag met lege bbox-hoek onder een schuine kopgevel', () => {
    const wall: ElevationWallRect = {
      wallId: 'w',
      floorIndex: 0,
      depthCm: 0,
      xa: 0,
      xb: 200,
      x0: 0,
      x1: 200,
      y0: -400,
      y1: 0,
      aTop: { x: 0, y: -400 },
      aBottom: { x: 0, y: 0 },
      bTop: { x: 200, y: -200 },
      bBottom: { x: 200, y: 0 },
      innerATop: { x: 0, y: -400 },
      innerABottom: { x: 0, y: 0 },
      innerBTop: { x: 200, y: -200 },
      innerBBottom: { x: 200, y: 0 },
    }
    const requested = { x0: 20, y0: -380, x1: 100, y1: -260 }
    const rect = clampElevationOpeningMove(wall, requested, undefined, {
      type: 'window',
      kind: 'window.triangle',
      startOnLeft: true,
    })
    const asBox = clampElevationOpeningMove(wall, requested)
    expect(rect.x1 - rect.x0).toBe(80)
    expect(rect.y1 - rect.y0).toBe(120)
    expect(rect.y0).toBeCloseTo(-380, 0)
    expect(asBox.y0).toBeGreaterThan(rect.y0 + 20)
  })

  it('rond raam mag met lege bbox-hoek onder een schuine kopgevel', () => {
    const wall: ElevationWallRect = {
      wallId: 'w',
      floorIndex: 0,
      depthCm: 0,
      xa: 0,
      xb: 200,
      x0: 0,
      x1: 200,
      y0: -400,
      y1: 0,
      aTop: { x: 0, y: -400 },
      aBottom: { x: 0, y: 0 },
      bTop: { x: 200, y: -200 },
      bBottom: { x: 200, y: 0 },
      innerATop: { x: 0, y: -400 },
      innerABottom: { x: 0, y: 0 },
      innerBTop: { x: 200, y: -200 },
      innerBBottom: { x: 200, y: 0 },
    }
    const requested = { x0: 20, y0: -340, x1: 100, y1: -260 }
    const next = clampElevationOpeningMove(wall, requested, undefined, {
      type: 'window',
      kind: 'window.round',
    })
    const asBox = clampElevationOpeningMove(wall, requested)
    expect(next.x1 - next.x0).toBe(80)
    expect(next.y1 - next.y0).toBe(80)
    expect(next.y0).toBeCloseTo(-340, 0)
    expect(asBox.y0).toBeGreaterThan(next.y0 + 15)
  })

  it('verplaatsen van een driehoek houdt niet de AABB onder de schuine top', () => {
    const host: Wall = {
      id: 'w',
      a: { x: 0, y: 0 },
      b: { x: 200, y: 0 },
      thickness: 20,
      openings: [],
      extras: { az: { z: 0, h: 400 }, bz: { z: 0, h: 200 } },
    }
    const opening: Opening = {
      id: 'win-triangle',
      type: 'window',
      kind: 'window.triangle',
      t: 0.3,
      width: 80,
      z: 260,
      z_height: 120,
    }
    const asBox = clampOpeningMoveKeepSize({ ...opening, kind: 'window.single' }, host, 280)
    const triangle = clampOpeningMoveKeepSize(opening, host, 280, true)
    expect(triangle.z_height).toBe(120)
    expect(triangle.z).toBe(260)
    expect((asBox.z ?? 0) + (asBox.z_height ?? 0)).toBeLessThan(380)
  })

  it('rond-snap gebruikt de cirkel, niet de lege bbox-hoek', () => {
    const edges = openingShapeSnapEdges(
      { x0: 0, y0: -50, x1: 100, y1: 0 },
      { type: 'window', kind: 'window.round' },
    )
    expect(Math.min(...edges.xs)).toBeGreaterThan(20)
    expect(Math.max(...edges.xs)).toBeLessThan(80)
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
