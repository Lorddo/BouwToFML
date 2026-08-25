import { describe, expect, it } from 'vitest'
import {
  boundDoorOpeningSpan,
  dedupeOverlappingBoundDoors,
  mergeBoundDoorFrameSwingCluster,
} from '@/cv/doors/door-wall-dedupe'
import type { BoundDoor } from '@/cv/doors/types'

function makeDoor(
  partial: Partial<BoundDoor> & Pick<BoundDoor, 'doorId' | 'segmentIndex'>,
): BoundDoor {
  const snappedBBox = partial.snappedBBox ?? { x: 100, y: 40, width: 200, height: 20 }
  return {
    t: partial.t ?? 0.5,
    openingAxis: partial.openingAxis ?? 'h',
    outwardSign: partial.outwardSign ?? 1,
    contactScore: partial.contactScore ?? 1,
    secondaryContactScore: partial.secondaryContactScore ?? 0,
    snappedBBox,
    doorframeClearOpening: partial.doorframeClearOpening,
    junctionAId: partial.junctionAId,
    junctionBId: partial.junctionBId,
    ...partial,
  }
}

describe('dedupeOverlappingBoundDoors', () => {
  it('merget frame+swing: clear van dunne hit, swing-id blijft', () => {
    const frame = makeDoor({
      doorId: 'frame',
      segmentIndex: 0,
      contactScore: 0.4,
      // Dunne strook langs muur (H): breed × dun
      snappedBBox: { x: 100, y: 40, width: 144, height: 28 },
    })
    const swing = makeDoor({
      doorId: 'swing',
      segmentIndex: 0,
      contactScore: 0.9,
      // Boog-veld (groot) — mag niet de opening bepalen
      snappedBBox: { x: 100, y: 40, width: 140, height: 120 },
    })
    const kept = dedupeOverlappingBoundDoors([frame, swing])
    expect(kept).toHaveLength(1)
    expect(kept[0]?.doorId).toBe('swing')
    expect(kept[0]?.doorframeClearOpening).toEqual({
      startPx: { x: 100, y: 54 },
      endPx: { x: 244, y: 54 },
    })
    expect(kept[0]?.snappedBBox.width).toBe(144)
    expect(kept[0]?.snappedBBox.height).toBe(28)
  })

  it('houdt beide bij geen overlap', () => {
    const kept = dedupeOverlappingBoundDoors([
      makeDoor({
        doorId: 'left',
        segmentIndex: 0,
        snappedBBox: { x: 0, y: 40, width: 80, height: 20 },
      }),
      makeDoor({
        doorId: 'right',
        segmentIndex: 0,
        snappedBBox: { x: 200, y: 40, width: 80, height: 20 },
      }),
    ])
    expect(kept.map((d) => d.doorId).sort()).toEqual(['left', 'right'])
  })

  it('dedupe’t alleen binnen hetzelfde segment', () => {
    const kept = dedupeOverlappingBoundDoors([
      makeDoor({
        doorId: 's0',
        segmentIndex: 0,
        snappedBBox: { x: 100, y: 40, width: 200, height: 20 },
      }),
      makeDoor({
        doorId: 's1',
        segmentIndex: 1,
        snappedBBox: { x: 100, y: 40, width: 200, height: 20 },
      }),
    ])
    expect(kept).toHaveLength(2)
  })

  it('boundDoorOpeningSpan gebruikt Path A clear als aanwezig', () => {
    const door = makeDoor({
      doorId: 'clear',
      segmentIndex: 0,
      doorframeClearOpening: {
        startPx: { x: 10, y: 50 },
        endPx: { x: 110, y: 50 },
      },
    })
    const span = boundDoorOpeningSpan(door)
    expect(span.widthPx).toBe(100)
    expect(span.openingStartPx).toEqual({ x: 10, y: 50 })
  })

  it('mergeBoundDoorFrameSwingCluster: V-as frame links van swing', () => {
    const frame = makeDoor({
      doorId: 'frame-v',
      segmentIndex: 0,
      openingAxis: 'v',
      snappedBBox: { x: 50, y: 100, width: 30, height: 140 },
    })
    const swing = makeDoor({
      doorId: 'swing-v',
      segmentIndex: 0,
      openingAxis: 'v',
      contactScore: 2,
      snappedBBox: { x: 50, y: 100, width: 110, height: 130 },
    })
    const merged = mergeBoundDoorFrameSwingCluster([frame, swing])
    expect(merged.doorId).toBe('swing-v')
    expect(merged.doorframeClearOpening).toBeTruthy()
    expect(merged.snappedBBox.width).toBe(30)
    expect(merged.snappedBBox.height).toBe(140)
  })
})
