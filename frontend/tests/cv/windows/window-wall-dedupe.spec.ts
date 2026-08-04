import { describe, expect, it } from 'vitest'
import { CONCEPT_WINDOW_REFID, WINDOW_DOUBLE_REFID } from '@/core/fml/types'
import {
  dedupeOverlappingBoundWindows,
  suppressWindowsNearDoors,
  type WallOpeningSpan,
} from '@/cv/windows/window-wall-dedupe'
import { mergeAdjacentBoundWindows } from '@/cv/windows/window-wall-merge'
import type { BoundWindow } from '@/cv/windows/types'

function makeBound(
  partial: Partial<BoundWindow> & Pick<BoundWindow, 'windowId' | 't' | 'openingBBox'>,
): BoundWindow {
  const bbox = partial.openingBBox
  return {
    segmentIndex: partial.segmentIndex ?? 0,
    openingAxis: partial.openingAxis ?? 'h',
    openingStartPx: partial.openingStartPx ?? { x: bbox.x, y: bbox.y + bbox.height / 2 },
    openingEndPx: partial.openingEndPx ?? { x: bbox.x + bbox.width, y: bbox.y + bbox.height / 2 },
    widthPx: partial.widthPx ?? bbox.width,
    widthCm: partial.widthCm ?? bbox.width / 5,
    fmlRefId: partial.fmlRefId ?? CONCEPT_WINDOW_REFID,
    evidence: partial.evidence ?? 'framing',
    faceIds: partial.faceIds ?? [1],
    ...partial,
  }
}

function makeDoor(partial: WallOpeningSpan): WallOpeningSpan {
  return partial
}

describe('dedupeOverlappingBoundWindows', () => {
  it('houdt één van twee exacte dubbels op dezelfde span', () => {
    const kept = dedupeOverlappingBoundWindows([
      makeBound({
        windowId: 'stack:43',
        t: 0.4,
        openingBBox: { x: 100, y: 40, width: 488, height: 20 },
        widthPx: 488,
        faceIds: [43],
      }),
      makeBound({
        windowId: 'stack:45',
        t: 0.4,
        openingBBox: { x: 100, y: 40, width: 488, height: 20 },
        widthPx: 488,
        faceIds: [45],
      }),
    ])
    expect(kept).toHaveLength(1)
    expect(kept[0].windowId).toBe('stack:43')
  })

  it('houdt de kleinere bij near-dubbel met hoog overlap', () => {
    const kept = dedupeOverlappingBoundWindows([
      makeBound({
        windowId: 'wide',
        t: 0.31,
        openingBBox: { x: 100, y: 40, width: 215, height: 20 },
        widthPx: 215,
      }),
      makeBound({
        windowId: 'narrow',
        t: 0.315,
        openingBBox: { x: 102, y: 40, width: 202, height: 20 },
        widthPx: 202,
      }),
    ])
    expect(kept).toHaveLength(1)
    expect(kept[0].windowId).toBe('narrow')
  })

  it('houdt 4 kleine ramen en drop de giant die hen dekt', () => {
    const small = [0, 1, 2, 3].map((i) =>
      makeBound({
        windowId: `s${i}`,
        t: 0.1 + i * 0.1,
        openingBBox: { x: 100 + i * 100, y: 40, width: 100, height: 20 },
        widthPx: 100,
        faceIds: [i + 1],
      }),
    )
    const giant = makeBound({
      windowId: 'giant',
      t: 0.25,
      openingBBox: { x: 100, y: 40, width: 400, height: 20 },
      widthPx: 400,
      faceIds: [99],
    })
    const kept = dedupeOverlappingBoundWindows([...small, giant])
    expect(kept.map((w) => w.windowId).sort()).toEqual(['s0', 's1', 's2', 's3'])
  })

  it('laat adjacent gelijke ramen staan voor R-27 merge', () => {
    const windows = [0, 1].map((i) =>
      makeBound({
        windowId: `w${i}`,
        t: 0.1 + i * 0.12,
        openingBBox: { x: 10 + i * 40, y: 40, width: 40, height: 20 },
        widthPx: 40,
        faceIds: [i + 1],
      }),
    )
    const deduped = dedupeOverlappingBoundWindows(windows)
    expect(deduped).toHaveLength(2)
    const merged = mergeAdjacentBoundWindows(deduped)
    expect(merged).toHaveLength(1)
    expect(merged[0].fmlRefId).toBe(WINDOW_DOUBLE_REFID)
  })

  it('raakt andere segmenten niet', () => {
    const kept = dedupeOverlappingBoundWindows([
      makeBound({
        windowId: 'a',
        segmentIndex: 0,
        t: 0.5,
        openingBBox: { x: 100, y: 40, width: 200, height: 20 },
        widthPx: 200,
      }),
      makeBound({
        windowId: 'b',
        segmentIndex: 1,
        t: 0.5,
        openingBBox: { x: 100, y: 40, width: 200, height: 20 },
        widthPx: 200,
      }),
    ])
    expect(kept).toHaveLength(2)
  })
})

describe('suppressWindowsNearDoors', () => {
  it('drop raam bij bijna-coïncidente deur (hoog IoU)', () => {
    const windows = [
      makeBound({
        windowId: 'w',
        t: 0.5,
        openingBBox: { x: 100, y: 40, width: 90, height: 20 },
        widthPx: 90,
      }),
    ]
    const doors = [
      makeDoor({
        segmentIndex: 0,
        openingAxis: 'h',
        openingStartPx: { x: 102, y: 50 },
        openingEndPx: { x: 188, y: 50 },
        widthPx: 86,
      }),
    ]
    expect(suppressWindowsNearDoors(windows, doors)).toHaveLength(0)
  })

  it('houdt raam naast deur (lage IoU)', () => {
    const windows = [
      makeBound({
        windowId: 'w',
        t: 0.2,
        openingBBox: { x: 100, y: 40, width: 80, height: 20 },
        widthPx: 80,
      }),
    ]
    const doors = [
      makeDoor({
        segmentIndex: 0,
        openingAxis: 'h',
        openingStartPx: { x: 220, y: 50 },
        openingEndPx: { x: 310, y: 50 },
        widthPx: 90,
      }),
    ]
    expect(suppressWindowsNearDoors(windows, doors)).toHaveLength(1)
  })

  it('negeert deuren op ander segment of andere as', () => {
    const windows = [
      makeBound({
        windowId: 'w',
        t: 0.5,
        openingBBox: { x: 100, y: 40, width: 90, height: 20 },
        widthPx: 90,
      }),
    ]
    expect(
      suppressWindowsNearDoors(windows, [
        makeDoor({
          segmentIndex: 1,
          openingAxis: 'h',
          openingStartPx: { x: 100, y: 50 },
          openingEndPx: { x: 190, y: 50 },
        }),
      ]),
    ).toHaveLength(1)
    expect(
      suppressWindowsNearDoors(windows, [
        makeDoor({
          segmentIndex: 0,
          openingAxis: 'v',
          openingStartPx: { x: 100, y: 50 },
          openingEndPx: { x: 190, y: 50 },
        }),
      ]),
    ).toHaveLength(1)
  })
})
