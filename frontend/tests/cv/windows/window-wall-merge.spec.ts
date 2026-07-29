import { describe, expect, it } from 'vitest'
import { CONCEPT_WINDOW_REFID, WINDOW_DOUBLE_REFID, WINDOW_TRIPLE_REFID } from '@/core/fml/types'
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

describe('mergeAdjacentBoundWindows', () => {
  it('maakt van 6 aanliggende gelijke ramen 2 triples (voor→achter)', () => {
    const windows = [0, 1, 2, 3, 4, 5].map((i) =>
      makeBound({
        windowId: `w${i}`,
        t: 0.1 + i * 0.12,
        openingBBox: { x: 10 + i * 40, y: 40, width: 40, height: 20 },
        widthPx: 40,
        widthCm: 80,
        faceIds: [i + 1],
      }),
    )

    const merged = mergeAdjacentBoundWindows(windows)
    expect(merged).toHaveLength(2)
    expect(merged[0]!.fmlRefId).toBe(WINDOW_TRIPLE_REFID)
    expect(merged[1]!.fmlRefId).toBe(WINDOW_TRIPLE_REFID)
    expect(merged[0]!.windowId).toBe('w0__w1__w2')
    expect(merged[1]!.windowId).toBe('w3__w4__w5')
    expect(merged[0]!.openingBBox.width).toBeCloseTo(120, 1)
    expect(merged[1]!.openingBBox.x).toBeCloseTo(130, 1)
  })

  it('maakt double van 2 aanliggende gelijke ramen', () => {
    const merged = mergeAdjacentBoundWindows([
      makeBound({
        windowId: 'a',
        t: 0.2,
        openingBBox: { x: 10, y: 40, width: 40, height: 20 },
        widthPx: 40,
      }),
      makeBound({
        windowId: 'b',
        t: 0.4,
        openingBBox: { x: 50, y: 40, width: 40, height: 20 },
        widthPx: 40,
      }),
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0]!.fmlRefId).toBe(WINDOW_DOUBLE_REFID)
    expect(merged[0]!.windowId).toBe('a__b')
  })

  it('houdt losse ramen bij >5% maatverschil', () => {
    const merged = mergeAdjacentBoundWindows([
      makeBound({
        windowId: 'small',
        t: 0.2,
        openingBBox: { x: 10, y: 40, width: 40, height: 20 },
        widthPx: 40,
      }),
      makeBound({
        windowId: 'large',
        t: 0.4,
        openingBBox: { x: 50, y: 40, width: 60, height: 20 },
        widthPx: 60, // 50% groter
      }),
    ])
    expect(merged).toHaveLength(2)
    expect(merged.every((w) => w.fmlRefId === CONCEPT_WINDOW_REFID)).toBe(true)
  })

  it('merge niet bij klein maar >5% maatverschil', () => {
    const merged = mergeAdjacentBoundWindows([
      makeBound({
        windowId: 'base',
        t: 0.2,
        openingBBox: { x: 10, y: 40, width: 100, height: 20 },
        widthPx: 100,
      }),
      makeBound({
        windowId: 'near',
        t: 0.4,
        openingBBox: { x: 110, y: 40, width: 106, height: 20 },
        widthPx: 106, // 6% groter
      }),
    ])
    expect(merged).toHaveLength(2)
    expect(merged.every((w) => w.fmlRefId === CONCEPT_WINDOW_REFID)).toBe(true)
  })

  it('houdt losse ramen als bbox niet raakt', () => {
    const merged = mergeAdjacentBoundWindows([
      makeBound({
        windowId: 'a',
        t: 0.2,
        openingBBox: { x: 10, y: 40, width: 40, height: 20 },
        widthPx: 40,
      }),
      makeBound({
        windowId: 'b',
        t: 0.6,
        openingBBox: { x: 80, y: 40, width: 40, height: 20 },
        widthPx: 40,
      }),
    ])
    expect(merged).toHaveLength(2)
  })

  it('merge bij bbox die precies raakt (±eps)', () => {
    const merged = mergeAdjacentBoundWindows([
      makeBound({
        windowId: 'a',
        t: 0.2,
        openingBBox: { x: 10, y: 40, width: 40, height: 20 },
        widthPx: 40,
      }),
      makeBound({
        windowId: 'b',
        t: 0.4,
        openingBBox: { x: 50.5, y: 40, width: 40, height: 20 },
        widthPx: 40,
      }),
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0]!.fmlRefId).toBe(WINDOW_DOUBLE_REFID)
  })

  it('merge alleen binnen hetzelfde segment', () => {
    const merged = mergeAdjacentBoundWindows([
      makeBound({
        windowId: 'a',
        segmentIndex: 0,
        t: 0.2,
        openingBBox: { x: 10, y: 40, width: 40, height: 20 },
        widthPx: 40,
      }),
      makeBound({
        windowId: 'b',
        segmentIndex: 1,
        t: 0.2,
        openingBBox: { x: 50, y: 40, width: 40, height: 20 },
        widthPx: 40,
      }),
    ])
    expect(merged).toHaveLength(2)
  })

  it('4 ramen: 1 triple + 1 single als 4e niet past; of triple+single bij aaneengesloten', () => {
    // 4 gelijke aanliggend → greedy: triple + single
    const windows = [0, 1, 2, 3].map((i) =>
      makeBound({
        windowId: `w${i}`,
        t: 0.1 + i * 0.1,
        openingBBox: { x: 10 + i * 40, y: 40, width: 40, height: 20 },
        widthPx: 40,
      }),
    )
    const merged = mergeAdjacentBoundWindows(windows)
    expect(merged).toHaveLength(2)
    expect(merged[0]!.fmlRefId).toBe(WINDOW_TRIPLE_REFID)
    expect(merged[1]!.fmlRefId).toBe(CONCEPT_WINDOW_REFID)
  })

  it('houdt volle opening-span bij reverse t-volgorde (segment rechts→links)', () => {
    // Zoals 2D_3E ondergevel: framing-bboxes overlappen; t van rechts-raam kleiner.
    const merged = mergeAdjacentBoundWindows([
      makeBound({
        windowId: 'right',
        t: 0.3,
        openingBBox: { x: 1137, y: 2390, width: 163, height: 21 },
        openingStartPx: { x: 1300, y: 2400 },
        openingEndPx: { x: 1137, y: 2400 },
        widthPx: 163,
        widthCm: 77,
      }),
      makeBound({
        windowId: 'left',
        t: 0.5,
        openingBBox: { x: 987, y: 2391, width: 163, height: 22 },
        openingStartPx: { x: 1150, y: 2401 },
        openingEndPx: { x: 987, y: 2401 },
        widthPx: 163,
        widthCm: 77,
      }),
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0]!.fmlRefId).toBe(WINDOW_DOUBLE_REFID)
    expect(merged[0]!.widthPx).toBeGreaterThan(250)
    expect(merged[0]!.openingStartPx.x).toBeLessThan(merged[0]!.openingEndPx.x)
  })
})
