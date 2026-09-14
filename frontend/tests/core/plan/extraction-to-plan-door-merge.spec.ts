import { describe, expect, it } from 'vitest'
import { mapLayer12DoorsToOpenings } from '@/core/plan/extraction-to-plan-doors'
import type { Layer12DoorForPlan } from '@/core/plan/extraction-to-plan-types'

function makeDoor(
  partial: Partial<Layer12DoorForPlan> &
    Pick<Layer12DoorForPlan, 'doorId' | 'openingStartPx' | 'openingEndPx'>,
): Layer12DoorForPlan {
  return {
    segmentIndex: 0,
    fmlRefId: 'door.single',
    mirrored: [0, 0],
    ...partial,
  }
}

describe('mapLayer12DoorsToOpenings mergeDoubleDoors', () => {
  const edgeSegment = { a: { x: 0, y: 0 }, b: { x: 200, y: 0 } }
  const pair = [
    makeDoor({
      doorId: 'left',
      openingStartPx: { x: 40, y: 0 },
      openingEndPx: { x: 70, y: 0 },
    }),
    makeDoor({
      doorId: 'right',
      openingStartPx: { x: 75, y: 0 },
      openingEndPx: { x: 105, y: 0 },
    }),
  ]

  it('merges adjacent standard doors by default (X-10)', () => {
    const openings = mapLayer12DoorsToOpenings({
      layer12Doors: pair,
      semanticSegmentIndex: 0,
      fallbackEdgeIndex: 0,
      edgeSegment,
      pxPerMmX: 2,
      pxPerMmY: 2,
      defaultDoorHeightCm: 220,
      consumedDoorIds: new Set(),
    })
    expect(openings).toHaveLength(1)
    expect(openings[0].kind).toBe('door.double')
  })

  it('keeps singles when mergeDoubleDoors is false', () => {
    const openings = mapLayer12DoorsToOpenings({
      layer12Doors: pair,
      semanticSegmentIndex: 0,
      fallbackEdgeIndex: 0,
      edgeSegment,
      pxPerMmX: 2,
      pxPerMmY: 2,
      defaultDoorHeightCm: 220,
      consumedDoorIds: new Set(),
      mergeDoubleDoors: false,
    })
    expect(openings).toHaveLength(2)
    expect(openings.every((o) => o.kind === 'door.single')).toBe(true)
  })
})
