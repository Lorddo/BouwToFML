import { describe, expect, it } from 'vitest'
import { areLinkedViaWallInkBridge, enumerateLinkedTuples } from '@/cv/windows/window-axel-cluster'
import type { RootFace } from '@/cv/windows/window-axel-strip-geometry'

function face(
  root: number,
  bbox: { x: number; y: number; width: number; height: number },
  areaPx?: number,
): RootFace {
  return {
    root,
    areaPx: areaPx ?? bbox.width * bbox.height,
    bbox,
    className: 'unknown',
  }
}

describe('window cluster over ink (axisBand + wall bridge)', () => {
  it('areLinkedViaWallInkBridge: wit–wall–wit', () => {
    const wallInkAdjacency = new Map<number, Set<number>>([
      [10, new Set([99])],
      [99, new Set([10, 11])],
      [11, new Set([99])],
    ])
    const classificationByLabel = new Map([
      [10, 'unknown' as const],
      [11, 'unknown' as const],
      [99, 'wall' as const],
    ])
    expect(
      areLinkedViaWallInkBridge({
        rootA: 10,
        rootB: 11,
        wallInkAdjacency,
        classificationByLabel,
      }),
    ).toBe(true)
    expect(
      areLinkedViaWallInkBridge({
        rootA: 10,
        rootB: 12,
        wallInkAdjacency,
        classificationByLabel,
      }),
    ).toBe(false)
  })

  it('enumerateLinkedTuples: geometric link uses axisBandHeight (ref gap 7px)', () => {
    const a = face(4, { x: 14, y: 17, width: 76, height: 2 }, 152)
    const b = face(6, { x: 15, y: 24, width: 74, height: 2 }, 145)
    const withStripTarget = enumerateLinkedTuples({
      candidates: [a, b],
      orientation: 'horizontal',
      targetStripHeightPx: 2,
      axisBandHeightPx: 2, // te smal → geen geometric
      expectedStripCount: 2,
    })
    expect(withStripTarget).toHaveLength(0)

    const withAxisBand = enumerateLinkedTuples({
      candidates: [a, b],
      orientation: 'horizontal',
      targetStripHeightPx: 2,
      axisBandHeightPx: 10,
      expectedStripCount: 2,
    })
    expect(withAxisBand).toHaveLength(1)
    expect(withAxisBand[0]?.map((f) => f.root).sort()).toEqual([4, 6])
  })

  it('enumerateLinkedTuples: wall-ink bridge zonder geometric (grote center-gap)', () => {
    const a = face(10, { x: 0, y: 0, width: 80, height: 4 }, 320)
    const b = face(11, { x: 0, y: 40, width: 80, height: 4 }, 320)
    const wallInkAdjacency = new Map<number, Set<number>>([
      [10, new Set([99])],
      [99, new Set([10, 11])],
      [11, new Set([99])],
    ])
    const tuples = enumerateLinkedTuples({
      candidates: [a, b],
      orientation: 'horizontal',
      targetStripHeightPx: 4,
      axisBandHeightPx: 10, // centerDelta 40 > 10 → geen geometric
      expectedStripCount: 2,
      wallInkAdjacency,
      wallInkClassificationByLabel: new Map([
        [10, 'unknown'],
        [11, 'unknown'],
        [99, 'wall'],
      ]),
    })
    expect(tuples).toHaveLength(1)
    expect(tuples[0]?.map((f) => f.root).sort()).toEqual([10, 11])
  })

  it('enumerateLinkedTuples: rail+glas+glas — alle adjacent paren, niet exclusive', () => {
    // Verticaal raam: links rail 10px, twee glasstrips 2+5px, rechts rail 10px.
    const leftRail = face(354, { x: 848, y: 1483, width: 10, height: 69 })
    const glassA = face(359, { x: 863, y: 1493, width: 2, height: 50 })
    const glassB = face(360, { x: 867, y: 1492, width: 5, height: 54 })
    const rightRail = face(356, { x: 875, y: 1483, width: 10, height: 69 })
    const wallInkAdjacency = new Map<number, Set<number>>([
      [354, new Set([359])],
      [359, new Set([354, 360])],
      [360, new Set([359, 356])],
      [356, new Set([360])],
    ])
    const tuples = enumerateLinkedTuples({
      candidates: [leftRail, glassA, glassB, rightRail],
      orientation: 'vertical',
      targetStripHeightPx: 2,
      axisBandHeightPx: 9,
      expectedStripCount: 2,
      wallInkAdjacency,
      wallInkClassificationByLabel: new Map([
        [354, 'wall'],
        [359, 'wall'],
        [360, 'wall'],
        [356, 'wall'],
      ]),
    })
    const keys = tuples
      .map((t) =>
        t
          .map((f) => f.root)
          .sort((a, b) => a - b)
          .join('_'),
      )
      .sort()
    // Goede glas-paar én rail+glas-paren — Stage 2/3 filtert.
    expect(keys).toContain('359_360')
    expect(keys).toContain('354_359')
    expect(keys).toContain('356_360')
    expect(keys.length).toBeGreaterThanOrEqual(3)
  })
})
