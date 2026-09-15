import { describe, expect, it } from 'vitest'
import type { Wall } from '@/core/plan/types'
import { OPENING_MOVE_MEASURE_INSET_CM } from '@/ui/composables/canvas-kernel/plan-canvas-opening-move-measure'
import { measureDistanceCm } from '@/ui/composables/canvas-kernel/plan-canvas-measure'
import {
  buildWallInternalMeasureLines,
  buildWallsInternalMeasureLines,
  wallIdsForJunctionMove,
  wallIdsForSegmentMove,
} from '@/ui/composables/plan-canvas/plan-canvas-wall-internal-measure'

function wall(partial: Partial<Wall> & Pick<Wall, 'id' | 'a' | 'b'>): Wall {
  return {
    thickness: 20,
    openings: [],
    ...partial,
  }
}

const host = wall({
  id: 'host',
  a: { x: 0, y: 0 },
  b: { x: 400, y: 0 },
})

describe('plan-canvas-wall-internal-measure', () => {
  it('geen opening → volle binnenmaat', () => {
    const lines = buildWallInternalMeasureLines(host)
    expect(lines).toHaveLength(1)
    expect(measureDistanceCm(lines[0].a, lines[0].b)).toBeCloseTo(400, 6)
  })

  it('één opening 80 cm op t=0.5 → restmaten 160 / 160', () => {
    const lines = buildWallInternalMeasureLines({
      ...host,
      openings: [{ t: 0.5, width: 80 }],
    })
    expect(lines).toHaveLength(2)
    expect(measureDistanceCm(lines[0].a, lines[0].b)).toBeCloseTo(160, 6)
    expect(measureDistanceCm(lines[1].a, lines[1].b)).toBeCloseTo(160, 6)
  })

  it('twee openingen → keten van drie restmaten', () => {
    const lines = buildWallInternalMeasureLines({
      ...host,
      openings: [
        { t: 80 / 400, width: 80 },
        { t: 280 / 400, width: 80 },
      ],
    })
    expect(lines).toHaveLength(3)
    expect(measureDistanceCm(lines[0].a, lines[0].b)).toBeCloseTo(40, 6)
    expect(measureDistanceCm(lines[1].a, lines[1].b)).toBeCloseTo(120, 6)
    expect(measureDistanceCm(lines[2].a, lines[2].b)).toBeCloseTo(80, 6)
  })

  it('loodrechte buren korten de binnenmaat in (dikte/2)', () => {
    const west = wall({ id: 'west', a: { x: 0, y: 0 }, b: { x: 0, y: 200 } })
    const east = wall({ id: 'east', a: { x: 400, y: 0 }, b: { x: 400, y: 200 } })
    const lines = buildWallInternalMeasureLines(host, [host, west, east])
    expect(lines).toHaveLength(1)
    expect(measureDistanceCm(lines[0].a, lines[0].b)).toBeCloseTo(380, 6)
  })

  it('offset staat loodrecht op de as', () => {
    const lines = buildWallInternalMeasureLines(host)
    const expectedOffset = host.thickness / 2 + OPENING_MOVE_MEASURE_INSET_CM
    expect(lines[0].a.y).toBeCloseTo(expectedOffset, 6)
    expect(lines[0].b.y).toBeCloseTo(expectedOffset, 6)
  })

  it('degeneraat segment → geen lijnen', () => {
    expect(
      buildWallInternalMeasureLines(wall({ id: 'z', a: { x: 1, y: 1 }, b: { x: 1, y: 1 } })),
    ).toEqual([])
  })

  it('knoop-move: muren aan die knoop', () => {
    expect(
      wallIdsForJunctionMove('j1', [
        {
          id: 'j1',
          refs: [{ wallId: 'w1' }, { wallId: 'w2' }, { wallId: 'w1' }],
        },
      ]),
    ).toEqual(['w1', 'w2'])
  })

  it('segment-move: schuifmuur + buren op beide knopen', () => {
    const ids = wallIdsForSegmentMove('slide', [
      { id: 'a', refs: [{ wallId: 'slide' }, { wallId: 'north' }] },
      { id: 'b', refs: [{ wallId: 'slide' }, { wallId: 'south' }] },
      { id: 'other', refs: [{ wallId: 'west' }] },
    ])
    expect(ids).toEqual(expect.arrayContaining(['slide', 'north', 'south']))
    expect(ids).not.toContain('west')
  })

  it('bouwt lijnen voor meerdere muren', () => {
    const north = wall({ id: 'north', a: { x: 0, y: 0 }, b: { x: 200, y: 0 } })
    const lines = buildWallsInternalMeasureLines(['host', 'north'], [host, north])
    expect(lines).toHaveLength(2)
  })
})
